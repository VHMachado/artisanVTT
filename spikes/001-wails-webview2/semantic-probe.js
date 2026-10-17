// Validates the dice tray through its semantic button, not screen coordinates.
// This avoids the map's "move" cursor and proves the React click path directly.
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
  const response = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response && response.exceptionDetails) {
    const d = response.exceptionDetails;
    return {
      error:
        (d.exception && (d.exception.description || d.exception.value)) ||
        d.text ||
        "evaluation failed",
    };
  }
  return response && response.result ? response.result.value : null;
}

function captureRuntimeEvents(message) {
  if (message.method === "Runtime.exceptionThrown") {
    const details = message.params.exceptionDetails;
    errors.push(
      (details.exception &&
        (details.exception.description || details.exception.value)) ||
        details.text ||
        "unknown exception"
    );
  }
  if (message.method === "Runtime.consoleAPICalled") {
    const type = message.params.type;
    const text = (message.params.args || [])
      .map((arg) => arg.value ?? arg.description ?? arg.type)
      .join(" ");
    if (type === "error" || type === "warning") logs.push(`[${type}] ${text}`);
  }
}

ws.on("message", (raw) => {
  let message;
  try {
    message = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result || {});
    pending.delete(message.id);
    return;
  }
  captureRuntimeEvents(message);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

ws.on("open", async () => {
  await call("Runtime.enable");
  await call("Page.enable");
  await call("Page.navigate", { url: "http://127.0.0.1:4174/" });
  await sleep(5000);

  const startGame = await evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((item) => /start game/i.test(item.textContent || ''));
    if (!button) return 'start button not found';
    button.click();
    return 'start button clicked';
  })()`);
  await sleep(1200);

  const submitGame = await evaluate(`(() => {
    const checkbox = document.querySelector('input[type="checkbox"]');
    if (checkbox && checkbox.checked) checkbox.click();
    const button = [...document.querySelectorAll('button')]
      .find((item) => /^start$/i.test((item.textContent || '').trim()));
    if (!button) return 'game submit button not found';
    button.click();
    return 'game submitted';
  })()`);
  await sleep(8000);

  const before = await evaluate(`(() => ({
    url: location.href,
    button: !!document.querySelector('[aria-label="Show Dice Tray"]'),
    canvases: document.querySelectorAll('canvas').length,
    errors: (document.body.innerText || '').match(/Error:[^\\n]*/g) || []
  }))()`);

  const trayClick = await evaluate(`(() => {
    const button = document.querySelector('[aria-label="Show Dice Tray"]');
    if (!button) return 'dice tray button not found';
    button.click();
    return 'dice tray button clicked';
  })()`);
  await sleep(12000);

  const after = await evaluate(`(() => ({
    url: location.href,
    opened: !!document.querySelector('[aria-label="Hide Dice Tray"]'),
    canvases: document.querySelectorAll('canvas').length,
    bodyErrors: (document.body.innerText || '').match(/Error:[^\\n]*/g) || [],
    resources: performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /ammo|DiceTray|tensorflow|group1-shard|model/i.test(name))
  }))()`);

  console.log(JSON.stringify({ startGame, submitGame, before, trayClick, after, errors, logs }, null, 2));
  process.exit(0);
});
