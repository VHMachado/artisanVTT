const WebSocket = require("ws");
const wsUrl = process.argv[2];
const targetUrl = process.argv[3] || "http://127.0.0.1:4176/";
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 10000);
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
  const response = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || JSON.stringify(response.exceptionDetails));
  }
  return response.result?.value;
}

ws.on("open", async () => {
  try {
    console.log("STEP: enable");
    await cdp("Runtime.enable");
    await cdp("Page.enable");

    console.log("STEP: navigate");
    await cdp("Page.navigate", { url: targetUrl });
    await sleep(1000);

    console.log("STEP: wait for load");
    // poll readyState instead of blind sleep
    for (let i = 0; i < 15; i++) {
      try {
        const ready = await evaluate("document.readyState");
        console.log("readyState:", ready);
        if (ready === "complete") break;
      } catch (e) {
        console.log("poll error:", e.message);
      }
      await sleep(1000);
    }

    console.log("STEP: check root mounted");
    const rootState = await evaluate(`JSON.stringify({href: location.href, rootChildren: document.getElementById('root')?.childElementCount || 0})`);
    console.log("root:", rootState);

    console.log("DONE-OK");
    ws.close();
    process.exit(0);
  } catch (error) {
    console.error("FAILED:", error.message);
    ws.close();
    process.exit(1);
  }
});

ws.on("error", (e) => { console.error("WS ERROR", e.message); process.exit(1); });
