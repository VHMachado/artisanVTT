const WebSocket = require("ws");
const fs = require("fs");
const wsUrl = process.argv[2];
const targetUrl = process.argv[3];
const outFile = process.argv[4];
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();
const requests = new Map(); // requestId -> {url, sentAt, status}

function log(line) { fs.appendFileSync(outFile, line + "\n"); }

function cdp(method, params = {}, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout ${method}`)); }, timeoutMs);
    pending.set(id, (result, error) => {
      clearTimeout(timer);
      if (error) reject(new Error(error.message || method));
      else resolve(result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.on("message", (raw) => {
  let m; try { m = JSON.parse(raw.toString()); } catch { return; }
  if (m.id && pending.has(m.id)) {
    const r = pending.get(m.id); pending.delete(m.id); r(m.result || {}, m.error);
    return;
  }
  if (m.method === "Network.requestWillBeSent") {
    const { requestId, request } = m.params;
    requests.set(requestId, { url: request.url, sentAt: Date.now(), status: "PENDING" });
    if (/\.(glb|jpg|dds)(\?|$)/i.test(request.url)) {
      log(`REQ SENT: ${request.url}`);
    }
  } else if (m.method === "Network.responseReceived") {
    const r = requests.get(m.params.requestId);
    if (r) {
      r.status = "RESPONSE_RECEIVED:" + m.params.response.status;
      if (/\.(glb|jpg|dds)(\?|$)/i.test(r.url)) {
        log(`RESPONSE: ${r.url} -> ${m.params.response.status}`);
      }
    }
  } else if (m.method === "Network.loadingFinished") {
    const r = requests.get(m.params.requestId);
    if (r) {
      r.status = "FINISHED";
      if (/\.(glb|jpg|dds)(\?|$)/i.test(r.url)) {
        log(`FINISHED: ${r.url} (took ${Date.now() - r.sentAt}ms)`);
      }
    }
  } else if (m.method === "Network.loadingFailed") {
    const r = requests.get(m.params.requestId);
    if (r) {
      r.status = "FAILED:" + m.params.errorText;
      log(`FAILED: ${r.url} -- ${m.params.errorText}`);
    }
  }
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function evaluate(expr, timeoutMs = 4000) {
  const res = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result?.value;
}

ws.on("open", async () => {
  fs.writeFileSync(outFile, "");
  try {
    log("connecting");
    await cdp("Network.enable");
    await cdp("Runtime.enable");
    await cdp("Page.enable");
    log("navigating to " + targetUrl);
    await cdp("Page.navigate", { url: targetUrl });
    await sleep(4000);
    log("starting session");
    await evaluate(`(() => { [...document.querySelectorAll('button')].find(x=>/start game/i.test(x.textContent||'')).click(); })()`);
    await sleep(1000);
    await evaluate(`(() => { const cb=document.querySelector('input[type="checkbox"]'); if(cb?.checked) cb.click(); [...document.querySelectorAll('button')].find(x=>/^start$/i.test((x.textContent||'').trim())).click(); })()`);
    await sleep(6000);
    log("session ready, opening dice tray");
    await evaluate(`(() => { document.querySelector('[aria-label="Show Dice Tray"]').click(); })()`);
    log("dice tray clicked, monitoring network for 30s via CDP push events (no more evaluate calls)");

    await sleep(30000);
    log("=== 30s elapsed, dumping all requests with status ===");
    for (const [id, r] of requests) {
      if (/\.(glb|jpg|dds)(\?|$)/i.test(r.url)) {
        log(`FINAL STATE: ${r.url} -> ${r.status} (age: ${Date.now() - r.sentAt}ms)`);
      }
    }
    process.exit(0);
  } catch (e) {
    log("SCRIPT ERROR (but network log may still be useful): " + e.message);
    await sleep(20000);
    log("=== after error, dumping all requests with status ===");
    for (const [id, r] of requests) {
      if (/\.(glb|jpg|dds)(\?|$)/i.test(r.url)) {
        log(`FINAL STATE: ${r.url} -> ${r.status} (age: ${Date.now() - r.sentAt}ms)`);
      }
    }
    process.exit(1);
  }
});
ws.on("error", e => { log("WS ERR " + e.message); process.exit(1); });
