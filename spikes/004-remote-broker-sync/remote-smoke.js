// Quick smoke test: connect to a deployed broker over Tailscale (or any
// reachable host), join a throwaway game, push a map_state, read it back.
// Not part of the test suite — ad hoc verification for the remote broker
// sync path.
const WebSocket = require("ws");
const { encode, decode } = require("@msgpack/msgpack");

const url = process.argv[2] || "ws://localhost:9420/socket";
const gameId = "remote-smoke-" + Date.now();

const ws = new WebSocket(url, { perMessageDeflate: false });
let ok = true;

function send(event, ...args) {
  ws.send(encode([event, ...args]));
}

const timeout = setTimeout(() => {
  console.error("TIMEOUT waiting for broker responses");
  process.exit(1);
}, 8000);

ws.on("open", () => {
  console.log("WS open to", url);
  send("join_game", gameId, "", "1.10.2");
});

// Solo client: the broker only broadcasts the full map_state to *other*
// room members (see hub.go's handleMapState/broadcastToRoom), so with one
// client the ack that proves the push landed is the `map_state_version`
// event, not a second `map_state`. Re-joining below is what actually
// reads the value back, as a real second client/reconnect would.
ws.on("message", (raw) => {
  const frame = decode(new Uint8Array(raw));
  const [event, ...args] = frame;
  if (event === "connected") {
    console.log("connected, session id =", args[0]);
    return;
  }
  if (event === "party_state") {
    console.log("party_state received");
    send("map_state", { mapId: "smoke-map", tokens: {}, fogs: {}, editFlags: [] });
  }
  if (event === "map_state_version") {
    console.log("map_state_version ack:", args[0]);
    // Re-join with a second client to read the state back the way a real
    // reconnecting client would.
    connectSecond();
  }
});

let ws2;
function send2(event, ...args) {
  ws2.send(encode([event, ...args]));
}
function connectSecond() {
  ws2 = new WebSocket(url, { perMessageDeflate: false });
  ws2.on("open", () => send2("join_game", gameId, "", "1.10.2"));
  ws2.on("message", (raw) => {
    const frame = decode(new Uint8Array(raw));
    const [event, ...args] = frame;
    if (event === "map_state") {
      const payload = args[0];
      console.log("map_state read back:", JSON.stringify(payload));
      if (payload.state && payload.state.mapId === "smoke-map") {
        console.log("SMOKE_TEST_PASSED");
      } else {
        ok = false;
        console.error("Unexpected map_state payload");
      }
      clearTimeout(timeout);
      ws.close();
      ws2.close();
      process.exit(ok ? 0 : 1);
    }
  });
  ws2.on("error", (e) => {
    console.error("WS2 ERROR", e.message);
    process.exit(1);
  });
}

ws.on("error", (e) => {
  console.error("WS ERROR", e.message);
  process.exit(1);
});
