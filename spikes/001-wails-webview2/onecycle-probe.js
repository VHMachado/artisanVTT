const WebSocket = require("ws");
const wsUrl = process.argv[2];
const targetUrl = process.argv[3];
const outFile = process.argv[4];
const fs = require("fs");
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();

function log(line) {
  fs.appendFileSync(outFile, line + "\n");
}

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
    await cdp("Runtime.enable");
    await cdp("Page.enable");
    log("navigating");
    await cdp("Page.navigate", { url: targetUrl });
    await sleep(4000);
    log("starting session");
    await evaluate(`(() => { [...document.querySelectorAll('button')].find(x=>/start game/i.test(x.textContent||'')).click(); })()`);
    await sleep(1000);
    await evaluate(`(() => { const cb=document.querySelector('input[type="checkbox"]'); if(cb?.checked) cb.click(); [...document.querySelectorAll('button')].find(x=>/^start$/i.test((x.textContent||'').trim())).click(); })()`);
    await sleep(6000);
    log("session ready, opening dice tray ONCE");
    await evaluate(`(() => { document.querySelector('[aria-label="Show Dice Tray"]').click(); })()`);
    log("dice tray click sent, monitoring every 1s for 60s");

    for (let i = 1; i <= 60; i++) {
      await sleep(1000);
      try {
        const state = await evaluate(`JSON.stringify({canvases: document.querySelectorAll('canvas').length, hideDice: !!document.querySelector('[aria-label="Hide Dice Tray"]')})`, 2500);
        log(`t+${i}s ALIVE ${state}`);
      } catch (e) {
        log(`t+${i}s DEAD -- ${e.message}`);
        log("STOPPING - became unresponsive at t+" + i + "s");
        process.exit(0);
      }
    }
    log("survived 60s without freezing");
    process.exit(0);
  } catch (e) {
    log("SCRIPT ERROR: " + e.message);
    process.exit(1);
  }
});
ws.on("error", e => { log("WS ERR " + e.message); process.exit(1); });
