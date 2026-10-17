// Tiny logging server: the instrumented frontend POSTs timing markers here
// via fetch/sendBeacon as it executes. If the main thread later hangs, the
// CDP channel stops responding too (confirmed: Runtime.enable itself times
// out), so we can't read anything back through DevTools at that point. This
// server captures each marker as it fires, so whatever was logged before the
// freeze survives independently of the frozen page.
const http = require("http");
const fs = require("fs");

const logFile = process.argv[2] || "C:/tmp/dice-trace.log";
fs.writeFileSync(logFile, "");

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const line = `[${new Date().toISOString()}] ${body}`;
    fs.appendFileSync(logFile, line + "\n");
    console.log(line);
    res.writeHead(200);
    res.end("ok");
  });
});

server.listen(8765, "127.0.0.1", () => {
  console.log("logging server on http://127.0.0.1:8765, writing to " + logFile);
});
