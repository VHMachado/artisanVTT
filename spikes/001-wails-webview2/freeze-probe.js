// Reproduces the dice tray freeze step-by-step, checking CDP responsiveness
// after each action to pinpoint the exact moment the page becomes unresponsive.
const WebSocket = require("ws");
const wsUrl = process.argv[2];
const targetUrl = process.argv[3] || "http://127.0.0.1:4176/";
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();
const consoleLog = [];

function cdp(method, params = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, timeoutMs);
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
    return;
  }
  if (message.method === "Runtime.consoleAPICalled") {
    const text = (message.params.args || []).map(a => a.value ?? a.description ?? a.type).join(" ");
    consoleLog.push(`[${message.params.type}] ${text}`);
  }
  if (message.method === "Runtime.exceptionThrown") {
    const d = message.params.exceptionDetails;
    consoleLog.push(`[exception] ${d.exception?.description || d.text}`);
  }
});

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function evaluate(expression, timeoutMs) {
  const response = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, timeoutMs);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || JSON.stringify(response.exceptionDetails));
  }
  return response.result?.value;
}

async function checkAlive(label) {
  try {
    const start = Date.now();
    await evaluate("1+1", 3000);
    console.log(`[ALIVE ${Date.now()-start}ms] ${label}`);
    return true;
  } catch (e) {
    console.log(`[DEAD] ${label} -- ${e.message}`);
    return false;
  }
}

ws.on("open", async () => {
  try {
    await cdp("Runtime.enable");
    await cdp("Page.enable");
    await cdp("Page.navigate", { url: targetUrl });
    await sleep(5000);
    await checkAlive("after navigate");

    await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /start game/i.test(x.textContent || ''));
      b.click();
    })()`);
    await sleep(1000);
    await checkAlive("after Start Game click");

    await evaluate(`(() => {
      const cb = document.querySelector('input[type="checkbox"]');
      if (cb?.checked) cb.click();
      const b = [...document.querySelectorAll('button')].find(x => /^start$/i.test((x.textContent || '').trim()));
      b.click();
    })()`);
    await sleep(8000);
    await checkAlive("after session Start, before dice tray");

    console.log(">>> clicking Show Dice Tray <<<");
    await evaluate(`(() => {
      const b = document.querySelector('[aria-label="Show Dice Tray"]');
      if (!b) throw new Error('button not found');
      b.click();
    })()`);

    // Check alive every 1s for 15s to see exactly when it dies
    for (let i = 1; i <= 15; i++) {
      await sleep(1000);
      const alive = await checkAlive(`t+${i}s after dice tray click`);
      if (!alive) {
        console.log("STOPPING - page became unresponsive");
        break;
      }
    }

    console.log("CONSOLE LOG:", JSON.stringify(consoleLog, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("SCRIPT ERROR:", error.message);
    console.log("CONSOLE LOG SO FAR:", JSON.stringify(consoleLog, null, 2));
    process.exit(1);
  }
});

ws.on("error", (e) => { console.error("WS ERROR", e.message); process.exit(1); });
