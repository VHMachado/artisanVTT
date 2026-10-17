const WebSocket = require("ws");
const http = require("http");
const url = process.argv[2];
console.log("connecting", url);
const ws = new WebSocket(url, { perMessageDeflate: false });
const timer = setTimeout(() => { console.error("overall timeout"); process.exit(2); }, 15000);
ws.on("open", () => {
  console.log("open");
  ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
  ws.send(JSON.stringify({ id: 2, method: "Runtime.evaluate", params: { expression: "JSON.stringify({href:location.href,title:document.title,ready:document.readyState})", returnByValue: true } }));
});
ws.on("message", raw => {
  const text = raw.toString();
  console.log(text.slice(0, 2000));
  try {
    const m = JSON.parse(text);
    if (m.id === 2) { clearTimeout(timer); ws.close(); }
  } catch {}
});
ws.on("error", err => { console.error("error", err.stack || err); clearTimeout(timer); process.exit(1); });
ws.on("close", () => { clearTimeout(timer); console.log("closed"); });
