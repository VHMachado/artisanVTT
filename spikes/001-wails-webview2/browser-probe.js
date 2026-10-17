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
  if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
    events.push({
      type: message.params.type,
      text: message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(" "),
    });
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
    await cdp("Page.navigate", { url: "http://127.0.0.1:4175/" });
    await sleep(6000);

    const home = await evaluate(`(() => ({
      href: location.href,
      title: document.title,
      root: document.getElementById('root')?.childElementCount || 0,
      start: !![...document.querySelectorAll('button')].find(b => /start game/i.test(b.textContent || ''))
    }))()`);

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

    const session = await evaluate(`(() => ({
      href: location.href,
      root: document.getElementById('root')?.childElementCount || 0,
      showDice: !!document.querySelector('[aria-label="Show Dice Tray"]'),
      hideDice: !!document.querySelector('[aria-label="Hide Dice Tray"]'),
      body: (document.body.innerText || '').slice(0, 700),
      errors: (document.body.innerText || '').match(/Error:[^\\n]*/g) || []
    }))()`);

    const click = await evaluate(`(() => {
      const b = document.querySelector('[aria-label="Show Dice Tray"]');
      if (!b) return { ok: false };
      b.click();
      return { ok: true };
    })()`);
    await sleep(15000);

    const dice = await evaluate(`(() => ({
      href: location.href,
      showDice: !!document.querySelector('[aria-label="Show Dice Tray"]'),
      hideDice: !!document.querySelector('[aria-label="Hide Dice Tray"]'),
      canvases: document.querySelectorAll('canvas').length,
      body: (document.body.innerText || '').slice(0, 900),
      errors: (document.body.innerText || '').match(/Error:[^\\n]*/g) || [],
      diceControls: [...document.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.title || b.textContent).filter(x => /d[0-9]+|dice|reroll|clear/i.test(x || ''))
    }))()`);

    console.log(JSON.stringify({ home, session, click, dice, events }, null, 2));
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
