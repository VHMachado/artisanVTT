const WebSocket = require("ws");
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 8000);
    pending.set(id, (result, error) => {
      clearTimeout(timer);
      if (error) reject(new Error(error.message || method));
      else resolve(result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.on("message", (raw) => {
  let message;
  try { message = JSON.parse(raw.toString()); } catch { return; }
  console.error("MSG:", raw.toString().slice(0, 200));
  if (message.id && pending.has(message.id)) {
    const resolve = pending.get(message.id);
    pending.delete(message.id);
    resolve(message.result || {}, message.error);
  }
});

ws.on("open", async () => {
  console.error("WS OPEN");
  try {
    const r1 = await cdp("Runtime.enable");
    console.error("Runtime.enable ok", r1);
    const r2 = await cdp("Runtime.evaluate", { expression: "1+1", returnByValue: true });
    console.error("evaluate ok", JSON.stringify(r2));
  } catch (e) {
    console.error("FAILED:", e.message);
  }
  ws.close();
  process.exit(0);
});

ws.on("error", (e) => console.error("WS ERROR", e.message));
