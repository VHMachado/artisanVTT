import { describe, expect, it } from "vitest";

import Session from "./Session";
import type { PeerDataEvent, DataProgressEvent } from "./Session";

/**
 * This project replaced an earlier WebRTC data channel with `peer_message`
 * frames relayed through the broker's WebSocket (see broker-go/internal/game/hub.go
 * handlePeerMessage). These tests exercise Session's send/receive halves of
 * that path without a real socket or broker: sendTo's emitted frames are fed
 * straight back into _handlePeerMessage, simulating the broker echoing them
 * to a recipient, matching the size/shape it would forward.
 */

type EmittedFrame = { to: string; payload: any };

function makeSessionWithFakeSocket() {
  const session = new Session();
  const emitted: EmittedFrame[] = [];
  // sendTo only ever touches this.socket.emit("peer_message", {to, payload})
  session.socket = {
    emit: (_event: string, frame: EmittedFrame) => {
      emitted.push(frame);
    },
  } as any;
  return { session, emitted };
}

describe("Session peer_message relay", () => {
  it("round-trips a small payload through a single chunk", () => {
    const { session, emitted } = makeSessionWithFakeSocket();

    const received: PeerDataEvent[] = [];
    session.on("peerData", (event: PeerDataEvent) => received.push(event));

    session.sendTo("player-2", "assetRequest", { id: "asset-1" });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].to).toBe("player-2");

    // Simulate the broker relaying that frame back to the recipient, who
    // sees it arrive as { from, payload } (see Hub.handlePeerMessage).
    session._handlePeerMessage({ from: "player-1", payload: emitted[0].payload });

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe("assetRequest");
    expect(received[0].data).toEqual({ id: "asset-1" });
  });

  it("reassembles a payload split across multiple chunks, in order", () => {
    const { session, emitted } = makeSessionWithFakeSocket();

    // Force a payload bigger than the internal chunk size so sendTo has to
    // split it — a large fake token/map image, roughly.
    const bigData = { id: "asset-big", bytes: "x".repeat(40000) };

    const received: PeerDataEvent[] = [];
    session.on("peerData", (event: PeerDataEvent) => received.push(event));
    const progress: DataProgressEvent[] = [];
    session.on("peerDataProgress", (event: DataProgressEvent) =>
      progress.push(event)
    );

    session.sendTo("player-2", "assetResponseSuccess", bigData);

    expect(emitted.length).toBeGreaterThan(1);

    // Deliver out of order to prove reassembly doesn't depend on arrival
    // order, only on each chunk's own index.
    const shuffled = [...emitted].reverse();
    for (const frame of shuffled) {
      session._handlePeerMessage({ from: "player-1", payload: frame.payload });
    }

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe("assetResponseSuccess");
    expect(received[0].data).toEqual(bigData);

    expect(progress.length).toBe(emitted.length);
    expect(progress[progress.length - 1].count).toBe(emitted.length);
    expect(progress[progress.length - 1].total).toBe(emitted.length);
  });

  it("keeps transfers from different senders independent", () => {
    const { session, emitted: emittedTo2 } = makeSessionWithFakeSocket();
    session.sendTo("player-2", "assetRequest", { id: "from-a" });

    // A second, unrelated sender's chunk lands with the same chunk id
    // shortid could plausibly reuse (simulated here with an identical id)
    // — reassembly must key by sender too, not just chunk id.
    const otherChunk = {
      ...emittedTo2[0].payload,
    };

    const received: PeerDataEvent[] = [];
    session.on("peerData", (event: PeerDataEvent) => received.push(event));

    session._handlePeerMessage({ from: "player-3", payload: otherChunk });
    session._handlePeerMessage({ from: "player-1", payload: emittedTo2[0].payload });

    expect(received).toHaveLength(2);
    expect(received.every((r) => r.id === "assetRequest")).toBe(true);
  });

  it("reply() on a received message sends back to the original sender", () => {
    const { session, emitted } = makeSessionWithFakeSocket();
    session.sendTo("player-2", "assetRequest", { id: "asset-1" });

    let reply: PeerDataEvent["reply"] | undefined;
    session.on("peerData", (event: PeerDataEvent) => {
      reply = event.reply;
    });
    session._handlePeerMessage({ from: "player-1", payload: emitted[0].payload });

    emitted.length = 0; // reset to observe only the reply
    reply!("assetResponseSuccess", { id: "asset-1", ok: true });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].to).toBe("player-1");
  });
});
