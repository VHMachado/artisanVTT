const WebSocket = require("ws");
const wsUrl = process.argv[2];
const targetUrl = process.argv[3];
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
    await cdp("Page.navigate", { url: targetUrl });
    await sleep(4000);

    console.log("Starting game session...");
    await evaluate(`(() => { [...document.querySelectorAll('button')].find(x=>/start game/i.test(x.textContent||'')).click(); })()`);
    await sleep(1000);
    await evaluate(`(() => { const cb=document.querySelector('input[type="checkbox"]'); if(cb?.checked) cb.click(); [...document.querySelectorAll('button')].find(x=>/^start$/i.test((x.textContent||'').trim())).click(); })()`);
    await sleep(6000);
    console.log("Session ready.");

    // Open/close the dice tray 5 times, checking responsiveness each time.
    for (let cycle = 1; cycle <= 5; cycle++) {
      console.log(`--- cycle ${cycle}: opening tray ---`);
      await evaluate(`(() => { document.querySelector('[aria-label="Show Dice Tray"]').click(); })()`);
      await sleep(3000);

      const aliveAfterOpen = await evaluate(`JSON.stringify({
        hideDice: !!document.querySelector('[aria-label="Hide Dice Tray"]'),
        canvases: document.querySelectorAll('canvas').length
      })`, 5000).catch(e => `DEAD: ${e.message}`);
      console.log(`cycle ${cycle} after open:`, aliveAfterOpen);

      console.log(`--- cycle ${cycle}: closing tray ---`);
      await evaluate(`(() => { document.querySelector('[aria-label="Hide Dice Tray"]').click(); })()`);
      await sleep(1500);

      const aliveAfterClose = await evaluate(`JSON.stringify({
        showDice: !!document.querySelector('[aria-label="Show Dice Tray"]'),
        canvases: document.querySelectorAll('canvas').length
      })`, 5000).catch(e => `DEAD: ${e.message}`);
      console.log(`cycle ${cycle} after close:`, aliveAfterClose);
    }

    console.log("ALL CYCLES COMPLETE - page still responsive");
    process.exit(0);
  } catch (e) {
    console.error("FAILED:", e.message);
    process.exit(1);
  }
});
ws.on("error", e => { console.log("WS ERR", e.message); process.exit(1); });
