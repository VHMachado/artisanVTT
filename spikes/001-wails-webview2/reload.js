const WebSocket = require("ws");
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();
function cdp(method, params = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${method}`)); }, timeoutMs);
    pending.set(id, (result, error) => { clearTimeout(timer); if (error) reject(new Error(error.message||method)); else resolve(result); });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
ws.on("message", (raw) => {
  let m; try { m = JSON.parse(raw.toString()); } catch { return; }
  if (m.id && pending.has(m.id)) { const r = pending.get(m.id); pending.delete(m.id); r(m.result || {}, m.error); }
});
ws.on("open", async () => {
  try {
    await cdp("Page.enable");
    await cdp("Page.reload", { ignoreCache: true });
    console.log("reloaded");
    process.exit(0);
  } catch (e) { console.log("FAILED", e.message); process.exit(1); }
});
