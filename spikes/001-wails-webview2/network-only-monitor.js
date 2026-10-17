const WebSocket = require("ws");
const fs = require("fs");
const wsUrl = process.argv[2];
const outFile = process.argv[3];
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();
const requests = new Map();
function log(line) { fs.appendFileSync(outFile, line + "\n"); }
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
  if (m.id && pending.has(m.id)) { const r = pending.get(m.id); pending.delete(m.id); r(m.result || {}, m.error); return; }
  if (m.method === "Network.requestWillBeSent") {
    const { requestId, request } = m.params;
    requests.set(requestId, { url: request.url, sentAt: Date.now() });
    if (/\.(glb|jpg|dds)(\?|$)/i.test(request.url)) log(`REQ: ${request.url}`);
  } else if (m.method === "Network.responseReceived") {
    const r = requests.get(m.params.requestId);
    if (r && /\.(glb|jpg|dds)(\?|$)/i.test(r.url)) log(`RESP ${m.params.response.status}: ${r.url}`);
  } else if (m.method === "Network.loadingFinished") {
    const r = requests.get(m.params.requestId);
    if (r && /\.(glb|jpg|dds)(\?|$)/i.test(r.url)) log(`FINISHED (${Date.now()-r.sentAt}ms): ${r.url}`);
  } else if (m.method === "Network.loadingFailed") {
    const r = requests.get(m.params.requestId);
    if (r) log(`NETFAIL: ${r.url} -- ${m.params.errorText}`);
  }
});
ws.on("open", async () => {
  fs.writeFileSync(outFile, "");
  await cdp("Network.enable");
  log("network monitoring active");
  setTimeout(() => process.exit(0), 60000);
});
ws.on("error", e => { log("WS ERR " + e.message); process.exit(1); });
