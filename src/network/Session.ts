import { encode, decode } from "@msgpack/msgpack";
import shortid from "shortid";

import EventEmitter from "../helpers/EventEmitter";
import WsClient from "../helpers/WsClient";

import { brokerUrl } from "../helpers/broker";

export type PeerData = any;

export type PeerReply = (id: string, data: PeerData, chunkId?: string) => void;

// Split a payload into pieces below this size before sending. WebSocket has
// no message-size limit like the old WebRTC data channel did, so this is no
// longer required for correctness — it is kept only to feed the load
// progress bar (see DataProgressEvent / MapLoadingContext) so a large map
// image still reports incremental progress instead of jumping from 0% to
// 100% once the whole transfer lands.
const MAX_CHUNK_SIZE = 16000;

interface NetworkChunk {
  __chunked: true;
  data: Uint8Array;
  id: string;
  index: number;
  total: number;
}

interface LocalChunk {
  data: Uint8Array[];
  count: number;
  total: number;
}

export interface DataProgressEvent {
  id: string;
  count: number;
  total: number;
}

function sliceIntoChunks(data: Uint8Array): Array<Omit<NetworkChunk, "__chunked" | "id">> {
  const slices: Array<Omit<NetworkChunk, "__chunked" | "id">> = [];
  const total = Math.ceil(data.byteLength / MAX_CHUNK_SIZE);

  for (let index = 0, start = 0; start < data.byteLength; index += 1) {
    const end = Math.min(data.byteLength, start + MAX_CHUNK_SIZE);
    slices.push({ data: data.slice(start, end), index, total });
    start = end;
  }

  return slices;
}

function chunkPayload(data: Uint8Array, chunkId?: string): NetworkChunk[] {
  const id = chunkId || shortid.generate();
  return sliceIntoChunks(data).map((slice) => ({ __chunked: true, id, ...slice }));
}

function concatChunks(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return merged;
}

type BrokerEventName =
  | "player_joined"
  | "player_left"
  | "joined_game"
  | "peer_message"
  | "game_expired"
  | "disconnect"
  | "force_update";

/**
 *
 * Handles the connection to the broker and relaying of peer-to-peer style
 * messages (map/token images, asset requests) between players.
 *
 * Prior to a previous rewrite this class also owned one WebRTC (simple-peer)
 * `Connection` per remote player, used to send data directly browser-to-
 * browser and to stream microphone audio between players. Both were
 * removed: image/asset bytes now travel as `peer_message` frames relayed
 * through the same broker WebSocket connection used for everything else
 * (see broker-go/internal/game/hub.go's handlePeerMessage), and the
 * experimental audio-sharing feature was dropped rather than rebuilt on a
 * new transport (a real-time voice channel needs P2P/WebRTC to be usable —
 * relaying live audio through the broker is not viable for a chatty
 * connection at the same fidelity).
 */
class Session extends EventEmitter {
  /**
   * The websocket connection to the broker
   */
  socket?: WsClient;

  get id() {
    return this.socket?.id;
  }

  // Store game id for reconnect
  _gameId: string = "";

  // In-flight chunk reassembly, keyed by "<fromSessionId>:<chunkId>" so
  // concurrent transfers from different senders can't collide.
  _currentChunks: Record<string, LocalChunk> = {};

  private brokerEventHandlers(): Record<BrokerEventName, (...args: any[]) => void> {
    return {
      player_joined: this._handlePlayerJoined.bind(this),
      player_left: this._handlePlayerLeft.bind(this),
      joined_game: this._handleJoinedGame.bind(this),
      peer_message: this._handlePeerMessage.bind(this),
      game_expired: this._handleGameExpired.bind(this),
      disconnect: this._handleSocketDisconnect.bind(this),
      force_update: this._handleForceUpdate.bind(this),
    };
  }

  /**
   * Connect to the websocket
   */
  async connect(token?: string) {
    try {
      if (!brokerUrl || import.meta.env.VITE_MAINTENANCE === "true") {
        this.emit("status", "offline");
        return;
      }

      let wsUrl = brokerUrl.replace(/^http/, "ws") + "/socket";
      // Identify the connection's account so the broker can
      // enforce "jogador move só o próprio personagem" (see
      // broker-go/internal/httpapi/ws.go's RegisterGameSocket and
      // internal/game/hub.go's authorizeMapStateUpdate). The WebSocket API
      // has no way to set a header, so this is the only place the token
      // can travel — same trust boundary as every other broker route
      // (tailnet-only).
      if (token) {
        wsUrl += `?token=${encodeURIComponent(token)}`;
      }

      this.socket = new WsClient(wsUrl);
      this.socket.connect();

      for (const [eventName, handler] of Object.entries(this.brokerEventHandlers())) {
        this.socket.on(eventName, handler);
      }
      this.socket.io.on("reconnect", this._handleSocketReconnect.bind(this));
      this.emit("status", "ready");
    } catch {
      this.emit("status", "offline");
    }
  }

  /** Tear down the broker connection. */
  disconnect() {
    this.socket?.disconnect();
  }

  /**
   * Relays a payload to a single peer through the broker, splitting it
   * into chunks first so progress can be reported incrementally.
   *
   * @param sessionId - The socket id of the player to send to
   * @param eventId - The id of the event to send
   */
  sendTo(sessionId: string, eventId: string, data: PeerData, chunkId?: string) {
    const packed = encode({ id: eventId, data });
    const pieces = chunkPayload(packed, chunkId);
    pieces.forEach((chunk) => this.socket?.emit("peer_message", { to: sessionId, payload: chunk }));
  }

  /**
   * Join a party
   *
   * @param {string} gameId - the id of the party to join
   */
  async joinGame(gameId: string) {
    if (typeof gameId !== "string") {
      console.error("Unable to join game: invalid game ID", gameId);
      return;
    }

    this._gameId = gameId;
    this.socket?.emit("join_game", gameId, import.meta.env.VITE_VERSION);
    this.emit("status", "joining");
  }

  _handleJoinedGame() {
    this.emit("status", "joined");
  }

  _handleGameExpired() {
    this.emit("gameExpired");
  }

  _handlePlayerJoined(sessionId: string) {
    this.emit("playerJoined", sessionId);
  }

  _handlePlayerLeft(sessionId: string) {
    this.emit("playerLeft", sessionId);
  }

  private reassembleChunk(from: string, payload: NetworkChunk): { key: string; chunk: LocalChunk } {
    const key = `${from}:${payload.id}`;
    const chunk: LocalChunk = this._currentChunks[key] || {
      data: [],
      count: 0,
      total: payload.total,
    };
    chunk.data[payload.index] = payload.data;
    chunk.count += 1;
    this._currentChunks[key] = chunk;
    return { key, chunk };
  }

  /**
   * Reassemble a chunked peer_message relayed by the broker and, once a
   * transfer is fully received, decode it back into the original
   * `{ id: eventId, data }` envelope and emit it as `peerData`.
   */
  _handlePeerMessage({ from, payload }: { from: string; payload: NetworkChunk }) {
    const { key, chunk } = this.reassembleChunk(from, payload);

    const reply: PeerReply = (id, data, chunkId) => {
      this.sendTo(from, id, data, chunkId);
    };

    this.emit("peerDataProgress", {
      id: payload.id,
      count: chunk.count,
      total: chunk.total,
    } as DataProgressEvent);

    if (chunk.count !== chunk.total) return;

    delete this._currentChunks[key];
    const envelope = decode(concatChunks(chunk.data)) as { id: string; data: PeerData };
    this.emit("peerData", { id: envelope.id, data: envelope.data, reply } as PeerDataEvent);
  }

  _handleSocketDisconnect() {
    this.emit("status", "reconnecting");
  }

  _handleSocketReconnect() {
    if (this.socket) this.socket.sendBuffer = [];
    if (this._gameId) {
      this.joinGame(this._gameId);
    }
  }

  _handleForceUpdate() {
    this.socket?.disconnect();
    this.emit("status", "needs_update");
  }
}

export interface PeerDataEvent {
  reply: PeerReply;
  id: string;
  data: PeerData;
}
export type PeerDataEventHandler = (received: PeerDataEvent) => void;

export type PeerDataProgressEventHandler = (progress: DataProgressEvent) => void;

export type SessionStatus = "ready" | "joining" | "joined" | "offline" | "reconnecting" | "needs_update";
export type SessionStatusHandler = (nextStatus: SessionStatus) => void;

export type PlayerJoinedHandler = (sessionId: string) => void;
export type PlayerLeftHandler = (sessionId: string) => void;
export type GameExpiredHandler = () => void;

// Typed overloads for EventEmitter#on, one per broker-relayed event this
// Session can emit, so callers get listener-signature checking instead
// of the untyped `(...args: any[]) => void` the base class exposes.
declare interface Session {
  on(event: "peerData", listener: PeerDataEventHandler): this;
  on(event: "peerDataProgress", listener: PeerDataProgressEventHandler): this;
  on(event: "status", listener: SessionStatusHandler): this;
  on(event: "playerJoined", listener: PlayerJoinedHandler): this;
  on(event: "playerLeft", listener: PlayerLeftHandler): this;
  on(event: "gameExpired", listener: GameExpiredHandler): this;
}

export default Session;
