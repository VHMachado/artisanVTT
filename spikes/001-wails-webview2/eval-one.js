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
async function evaluate(expr, timeoutMs = 5000) {
  const res = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result?.value;
}
ws.on("open", async () => {
  try {
    await cdp("Runtime.enable");
    const expr = process.argv[3];
    const result = await evaluate(expr);
    console.log("RESULT:", JSON.stringify(result));
    process.exit(0);
  } catch (e) {
    console.log("FAILED:", e.message);
    process.exit(1);
  }
});
ws.on("error", e => { console.log("WS ERR", e.message); process.exit(1); });
