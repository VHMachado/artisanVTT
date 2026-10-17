const WebSocket = require("ws");
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, (result, error) => {
      clearTimeout(timer);
      if (error) reject(new Error(error.message || method));
      else resolve(result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.on("message", (raw) => {
  let message;
  try { message = JSON.parse(raw.toString()); } catch { return; }
  if (message.id && pending.has(message.id)) {
    const resolve = pending.get(message.id);
    pending.delete(message.id);
    resolve(message.result || {}, message.error);
  }
});

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result ? result.result.value : undefined;
}

ws.on("open", async () => {
  try {
    await cdp("Runtime.enable");
    const before = await evaluate(`(() => ({
      url: location.href,
      title: document.title,
      showButton: !!document.querySelector('[aria-label="Show Dice Tray"]'),
      hideButton: !!document.querySelector('[aria-label="Hide Dice Tray"]'),
      canvasCount: document.querySelectorAll('canvas').length,
      bodyText: (document.body.innerText || '').slice(0, 300)
    }))()`);

    const click = await evaluate(`(() => {
      const button = document.querySelector('[aria-label="Show Dice Tray"]');
      if (!button) return { ok: false, reason: 'button not found' };
      button.click();
      return { ok: true, label: button.getAttribute('aria-label') };
    })()`);

    await sleep(12000);
    const after = await evaluate(`(() => ({
      url: location.href,
      showButton: !!document.querySelector('[aria-label="Show Dice Tray"]'),
      hideButton: !!document.querySelector('[aria-label="Hide Dice Tray"]'),
      canvasCount: document.querySelectorAll('canvas').length,
      bodyText: (document.body.innerText || '').slice(0, 500),
      errorText: (document.body.innerText || '').match(/Error:[^\\n]*/g) || [],
      diceResources: performance.getEntriesByType('resource').map(e => e.name)
        .filter(n => /ammo|DiceTray|diceTray|babylon/i.test(n))
    }))()`);

    console.log(JSON.stringify({ before, click, after }, null, 2));
    ws.close();
  } catch (error) {
    console.error(error.stack || String(error));
    process.exitCode = 1;
    ws.close();
  }
});

ws.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
