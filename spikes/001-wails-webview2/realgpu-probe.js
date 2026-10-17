const WebSocket = require("ws");
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();

function cdp(method, params = {}, timeoutMs = 5000) {
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

async function evaluate(expr, timeoutMs = 5000) {
  const res = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
  return res.result?.value;
}

ws.on("open", async () => {
  try {
    await cdp("Runtime.enable");
    await cdp("Page.enable");

    console.log("clicking Start Game...");
    await evaluate(`(() => { [...document.querySelectorAll('button')].find(x=>/start game/i.test(x.textContent||'')).click(); })()`);
    await sleep(1000);

    console.log("submitting session...");
    await evaluate(`(() => { const cb=document.querySelector('input[type="checkbox"]'); if(cb?.checked) cb.click(); [...document.querySelectorAll('button')].find(x=>/^start$/i.test((x.textContent||'').trim())).click(); })()`);
    await sleep(6000);

    console.log("clicking Show Dice Tray...");
    await evaluate(`(() => { document.querySelector('[aria-label="Show Dice Tray"]').click(); })()`);

    for (let i = 1; i <= 30; i++) {
      await sleep(1000);
      try {
        const state = await evaluate(`JSON.stringify({
          hideDice: !!document.querySelector('[aria-label="Hide Dice Tray"]'),
          canvases: document.querySelectorAll('canvas').length,
          loadingText: (document.body.innerText||'').includes('Loading')
        })`, 3000);
        console.log(`[t+${i}s] ALIVE`, state);
      } catch (e) {
        console.log(`[t+${i}s] DEAD -- ${e.message}`);
        break;
      }
    }
    process.exit(0);
  } catch (e) {
    console.error("ERROR:", e.message);
    process.exit(1);
  }
});
ws.on("error", e => { console.log("WS ERR", e.message); process.exit(1); });
