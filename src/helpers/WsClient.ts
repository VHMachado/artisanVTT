import { encode, decode } from "@msgpack/msgpack";

import EventEmitter from "./EventEmitter";

/**
 * Minimal socket.io-client-compatible wrapper over a raw WebSocket, talking
 * to the Go broker's wire protocol (see broker-go/main.go): every frame is
 * a msgpack-encoded [event, ...args] array sent as a binary message.
 *
 * Session.ts only ever touches `emit`, `on`/`off`, `id`, `disconnect`,
 * `volatile.emit`, `io.on("reconnect")` and `sendBuffer = []` — this
 * implements exactly that surface so Session.ts (and everything built on
 * top of it: useNetworkedState, NetworkedMapPointer, NetworkedMapCamera...)
 * needed no changes when the transport swapped from Socket.IO to this.
 */
class WsClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private explicitlyClosed = false;
  private reconnectAttempt = 0;
  private reconnectTimer: number | undefined;

  /** Queue of frames buffered while the socket isn't open yet. socket.io
   * calls this sendBuffer; Session.ts clears it on reconnect the same way. */
  sendBuffer: unknown[] = [];

  id: string | undefined;

  /** Mimics socket.io-client's `socket.volatile`: same emit, dropped
   * silently instead of queued if the socket isn't currently open. Used for
   * high-frequency, latest-value-wins events (pointer/camera position). */
  volatile = {
    emit: (event: string, ...args: unknown[]) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this._send(event, args);
      }
    },
  };

  /** Mimics socket.io-client's `socket.io` sub-emitter, only for the one
   * event Session.ts and PlayerContext.tsx listen to. */
  io = {
    on: (event: "reconnect", listener: () => void) => {
      this.on(`io_${event}`, listener);
    },
    off: (event: "reconnect", listener: () => void) => {
      this.off(`io_${event}`, listener);
    },
  };

  constructor(url: string) {
    super();
    this.url = url;
  }

  connect() {
    this.explicitlyClosed = false;
    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.addEventListener("open", () => {
      // Flush anything queued while disconnected, in wire order.
      const pending = this.sendBuffer;
      this.sendBuffer = [];
      for (const frame of pending) {
        const [event, args] = frame as [string, unknown[]];
        this._send(event, args);
      }
    });

    ws.addEventListener("message", (ev) => {
      let frame: unknown[];
      try {
        frame = decode(new Uint8Array(ev.data as ArrayBuffer)) as unknown[];
      } catch (error) {
        console.error("WS_DECODE_ERROR", error);
        return;
      }
      const [event, ...args] = frame;
      if (typeof event !== "string") {
        return;
      }
      if (event === "connected") {
        this.id = args[0] as string;
        // socket.io-client fires a bare "connect" once the handshake
        // finishes; PlayerContext.tsx listens for it directly on the
        // socket (separately from Session's own "status" event).
        super.emit("connect");
        return;
      }
      // Dispatch to local listeners (super.emit, not this.emit — `emit` is
      // overridden below to mean "send to the server", matching
      // socket.io-client's socket.emit; incoming events must go through the
      // base EventEmitter's local dispatch instead, or this would try to
      // send every received event straight back over the wire).
      super.emit(event, ...args);
    });

    ws.addEventListener("close", () => {
      if (this.ws !== ws) {
        // A newer socket already replaced this one (fast reconnect race).
        return;
      }
      super.emit("disconnect");
      if (!this.explicitlyClosed) {
        this._scheduleReconnect();
      }
    });

    ws.addEventListener("error", () => {
      // The browser also fires "close" right after "error" on a failed
      // connection attempt, so reconnect scheduling happens there.
    });
  }

  private _scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    // Exponential backoff capped at 5s, roughly matching socket.io-client's
    // defaults closely enough for a GM's LAN/Tailscale connection.
    const delay = Math.min(5000, 500 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt++;
    this.reconnectTimer = window.setTimeout(() => {
      if (this.explicitlyClosed) {
        return;
      }
      this.connect();
      // Fire io_reconnect once this attempt actually opens.
      this.ws?.addEventListener(
        "open",
        () => {
          this.reconnectAttempt = 0;
          super.emit("io_reconnect");
        },
        { once: true }
      );
    }, delay);
  }

  disconnect() {
    this.explicitlyClosed = true;
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  private _send(event: string, args: unknown[]) {
    const frame = [event, ...args];
    this.ws?.send(encode(frame));
  }

  emit(event: string, ...args: unknown[]): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this._send(event, args);
    } else if (!this.explicitlyClosed) {
      // socket.io-client buffers writes made before the connection is
      // ready (or while reconnecting) and flushes them on connect.
      this.sendBuffer.push([event, args]);
    }
    return true;
  }
}

export default WsClient;
