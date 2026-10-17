// Connects to a CDP target, collects console output and runtime errors, then
// reports whether React actually mounted. Used to tell a broken Vite build
// apart from a Wails/WebView2 problem.
const WS = process.argv[2];
const WAIT_MS = Number(process.argv[3] || 9000);

const http = require("http");

function rpc(ws, id, method, params) {
  ws.send(JSON.stringify({ id, method, params: params || {} }));
}

(async () => {
  let WebSocket;
  try {
    WebSocket = require("ws");
  } catch {
    // Fall back to a tiny raw implementation if `ws` is unavailable.
    console.log(JSON.stringify({ error: "module 'ws' not installed" }));
    process.exit(2);
  }

  const ws = new WebSocket(WS, { perMessageDeflate: false });
  const logs = [];
  const errors = [];
  let nextId = 1;
  const pending = new Map();

  function call(method, params) {
    return new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      rpc(ws, id, method, params);
    });
  }

  ws.on("open", async () => {
    await call("Runtime.enable");
    await call("Log.enable");
    await call("Page.enable");
  });

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
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(" ");
      logs.push(`[${msg.params.type}] ${text}`);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      errors.push(
        (d.exception && (d.exception.description || d.exception.value)) ||
          d.text ||
          "unknown exception"
      );
    }
    if (msg.method === "Log.entryAdded") {
      const e = msg.params.entry;
      if (e.level === "error") {
        errors.push(`[${e.source}] ${e.text} ${e.url || ""}`);
      }
    }
  });

  setTimeout(async () => {
    const res = await call("Runtime.evaluate", {
      expression: `JSON.stringify({
        url: location.href,
        title: document.title,
        rootExists: !!document.getElementById('root'),
        rootChildren: document.getElementById('root') ? document.getElementById('root').childElementCount : -1,
        bodyTextLen: (document.body.innerText||'').length,
        bodySnippet: (document.body.innerText||'').slice(0,200)
      })`,
      returnByValue: true,
    });
    const state = res && res.result ? res.result.value : null;
    console.log(
      JSON.stringify(
        { state: state ? JSON.parse(state) : null, errors, logs: logs.slice(0, 40) },
        null,
        2
      )
    );
    process.exit(0);
  }, WAIT_MS);
})();
