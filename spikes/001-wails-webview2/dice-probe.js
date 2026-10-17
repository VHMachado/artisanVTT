// Drives the app to the dice tray over CDP and reports the real exception,
// so ammo.js failures are diagnosed from the actual stack instead of guesses.
const WS = process.argv[2];
const WebSocket = require("ws");

const ws = new WebSocket(WS, { perMessageDeflate: false });
const errors = [];
const logs = [];
let nextId = 1;
const pending = new Map();

function call(method, params) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

async function evaluate(expression) {
  const res = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res && res.exceptionDetails) {
    const d = res.exceptionDetails;
    return {
      error:
        (d.exception && (d.exception.description || d.exception.value)) || d.text,
    };
  }
  return res && res.result ? res.result.value : null;
}

ws.on("message", (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    errors.push(
      (d.exception && (d.exception.description || d.exception.value)) ||
        d.text ||
        "unknown"
    );
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    logs.push(
      (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(" ")
    );
  }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ws.on("open", async () => {
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.navigate", { url: "http://127.0.0.1:4174/" });
  await sleep(6000);

  // Start a game without a password: uncheck the box, then submit.
  const started = await evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const start = btns.find(b => /start game/i.test(b.textContent || ''));
    if (!start) return 'no start button';
    start.click();
    return 'clicked start';
  })()`);
  await sleep(1500);

  const submitted = await evaluate(`(() => {
    const cb = document.querySelector('input[type=checkbox]');
    if (cb && cb.checked) cb.click();
    const btns = Array.from(document.querySelectorAll('button'));
    const go = btns.find(b => /^start$/i.test((b.textContent || '').trim()));
    if (!go) return 'no submit button';
    go.click();
    return 'submitted';
  })()`);
  await sleep(9000);

  const state = await evaluate(`(() => ({
    url: location.href,
    hasCanvas: !!document.querySelector('canvas'),
    canvasCount: document.querySelectorAll('canvas').length,
    bodyLen: (document.body.innerText||'').length,
    toast: (document.body.innerText||'').match(/Error:[^\\n]*/g) || []
  }))()`);

  console.log(
    JSON.stringify({ started, submitted, state, errors, logs }, null, 2)
  );
  process.exit(0);
});
