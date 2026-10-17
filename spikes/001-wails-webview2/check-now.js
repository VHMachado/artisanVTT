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

ws.on("open", async () => {
  try {
    console.log("connecting...");
    await cdp("Runtime.enable");
    console.log("Runtime.enable OK - page is responsive");
    const r = await cdp("Runtime.evaluate", {
      expression: `JSON.stringify({
        href: location.href,
        showDice: !!document.querySelector('[aria-label="Show Dice Tray"]'),
        hideDice: !!document.querySelector('[aria-label="Hide Dice Tray"]'),
        canvases: document.querySelectorAll('canvas').length,
        bodyText: (document.body.innerText||'').slice(0,500),
        errors: (document.body.innerText||'').match(/Error:[^\\n]*/g) || []
      })`,
      returnByValue: true,
    }, 5000);
    console.log("STATE:", r.result?.value);
  } catch (e) {
    console.log("FAILED / UNRESPONSIVE:", e.message);
  }
  process.exit(0);
});
ws.on("error", e => { console.log("WS ERROR", e.message); process.exit(1); });
