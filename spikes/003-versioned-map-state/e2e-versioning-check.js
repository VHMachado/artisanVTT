// Real WebSocket + msgpack E2E check for the versioned map_state flow,
// run against the actual broker.exe binary (not the Go unit tests):
// proves the wire encoding round-trips through a real net/http server and
// gorilla/websocket, not just in-process Go structs.
const WebSocket = require("ws");
const { encode, decode } = require("@msgpack/msgpack");

const URL = process.env.BROKER_URL || "ws://localhost:19422/socket";

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.binaryType = "arraybuffer";
    // Every inbound frame is buffered here immediately as it arrives, so
    // waitFor can never race a message that showed up before the caller
    // got around to registering interest in it (a real risk here: several
    // awaits happen between actions and the first waitFor for their
    // resulting event).
    const queue = [];
    let id = null;
    ws.on("error", reject);
    ws.on("message", (data) => {
      const frame = decode(new Uint8Array(data));
      const [event, ...args] = frame;
      if (event === "connected") {
        id = args[0];
        resolve(client);
        return;
      }
      queue.push([event, args]);
    });
    const client = {
      get id() {
        return id;
      },
      emit(event, ...args) {
        ws.send(encode([event, ...args]));
      },
      allEvents() {
        return queue.map(([e, a]) => [e, a]);
      },
      drain() {
        queue.length = 0;
      },
      waitFor(event, timeoutMs = 3000) {
        return new Promise((res, rej) => {
          const deadline = Date.now() + timeoutMs;
          const tick = () => {
            const idx = queue.findIndex(([e]) => e === event);
            if (idx >= 0) {
              const [, args] = queue.splice(idx, 1)[0];
              res(args);
              return;
            }
            if (Date.now() > deadline) {
              rej(new Error(`timeout waiting for ${event}, saw: ${queue.map((q) => q[0]).join(",")}`));
              return;
            }
            setTimeout(tick, 10);
          };
          tick();
        });
      },
      close() {
        ws.close();
      },
      name,
    };
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
}

async function main() {
  const a = await connect("A");
  const b = await connect("B");

  const gameId = "e2e-game-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  a.emit("join_game", gameId, "pw");
  await a.waitFor("joined_game");
  b.emit("join_game", gameId, "pw");
  await b.waitFor("joined_game");
  // Let the join fan-out (party_state/map_state/map/manifest to the
  // joiner, player_joined/joined_game to the room) fully settle, then
  // drain everything so the assertions below only see what happens next.
  await new Promise((r) => setTimeout(r, 300));
  a.drain();
  b.drain();

  // A pushes the initial full map state.
  a.emit("map_state", { mapId: "m1", x: 0 });
  const [ackVersion] = await a.waitFor("map_state_version");
  assert(ackVersion === 1, `expected ack version 1, got ${ackVersion}`);
  const [bFull] = await b.waitFor("map_state");
  assert(bFull.version === 1, `B should see version 1, got ${JSON.stringify(bFull)}`);
  assert(bFull.state.x === 0, "B should see x=0");

  // B applies a partial update against version 1.
  b.emit("map_state_update", {
    id: "m1",
    baseVersion: 1,
    changes: [{ kind: "E", path: ["x"], rhs: 10 }],
  });
  const [bAckVersion] = await b.waitFor("map_state_version");
  assert(bAckVersion === 2, `expected B ack version 2, got ${bAckVersion}`);
  const [aUpdate] = await a.waitFor("map_state_update");
  assert(aUpdate.version === 2, `A should see broadcast version 2, got ${JSON.stringify(aUpdate)}`);

  // A's stale undo (still baseVersion 1) must be rejected with a resync,
  // and must NOT reach B at all.
  a.emit("map_state_update", {
    id: "m1",
    baseVersion: 1,
    changes: [{ kind: "E", path: ["x"], rhs: 0 }],
  });
  const [resync] = await a.waitFor("map_state");
  assert(resync.version === 2, `resync should carry version 2, got ${JSON.stringify(resync)}`);
  assert(resync.state.x === 10, `B's edit must survive, got x=${resync.state.x}`);

  await new Promise((r) => setTimeout(r, 300));
  const bLeaked = b.allEvents().filter(([e]) => e === "map_state_update" || e === "map_state");
  assert(bLeaked.length === 0, `B must not receive anything from A's rejected update, got: ${JSON.stringify(bLeaked)}`);

  console.log("E2E VERSIONING TEST PASSED");
  a.close();
  b.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("E2E VERSIONING TEST FAILED:", err);
  process.exit(1);
});
