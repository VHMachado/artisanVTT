const WebSocket = require("ws");
const wsUrl = process.argv[2];
const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
let nextId = 1;
const pending = new Map();
const events = [];

function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 20000);
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
  if (message.method === "Runtime.exceptionThrown") {
    const d = message.params.exceptionDetails;
    events.push({ type: "exception", text: d.exception?.description || d.text });
  }
  if (message.method === "Runtime.consoleAPICalled" && ["error", "warning", "log"].includes(message.params.type)) {
    events.push({
      type: message.params.type,
      text: message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" "),
    });
  }
  if (message.method === "Network.loadingFailed") {
    events.push({ type: "network-fail", url: message.params.requestId, error: message.params.errorText });
  }
});

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function evaluate(expression) {
  const response = await cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "evaluation failed");
  }
  return response.result?.value;
}

ws.on("open", async () => {
  try {
    await cdp("Runtime.enable");
    await cdp("Page.enable");
    await cdp("Network.enable");
    await cdp("Page.navigate", { url: process.argv[3] || "http://127.0.0.1:4176/" });
    await sleep(6000);

    await evaluate(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /start game/i.test(x.textContent || ''));
      if (!b) throw new Error('Start Game not found');
      b.click();
      return true;
    })()`);
    await sleep(1500);
    await evaluate(`(() => {
      const cb = document.querySelector('input[type="checkbox"]');
      if (cb?.checked) cb.click();
      const b = [...document.querySelectorAll('button')].find(x => /^start$/i.test((x.textContent || '').trim()));
      if (!b) throw new Error('session Start not found');
      b.click();
      return true;
    })()`);
    await sleep(10000);

    const click = await evaluate(`(() => {
      const b = document.querySelector('[aria-label="Show Dice Tray"]');
      if (!b) return { ok: false };
      b.click();
      return { ok: true };
    })()`);

    // Poll for 20 seconds, checking loading state every 2s
    for (let i = 0; i < 10; i++) {
      await sleep(2000);
      const state = await evaluate(`(() => {
        const spinner = document.querySelector('[class*="Spinner"], svg[class*="spinner"]');
        const canvases = document.querySelectorAll('canvas').length;
        const bodyText = (document.body.innerText || '');
        return {
          canvases,
          hasLoadingText: bodyText.includes('Loading'),
          spinnerPresent: !!spinner,
          errors: bodyText.match(/Error:[^\\n]*/g) || []
        };
      })()`);
      console.log(`[t+${(i+1)*2}s]`, JSON.stringify(state));
    }

    console.log("EVENTS:", JSON.stringify(events.slice(-30), null, 2));
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
