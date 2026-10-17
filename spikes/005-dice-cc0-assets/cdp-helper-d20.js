// CDP helper for D20 spike. CommonJS, requires `ws`.
// Usage: node cdp-helper-d20.js '<ws-url>' eval '<js-expression-string>'
//        node cdp-helper-d20.js '<ws-url>' screenshot '<filename>' [clipJson]
const WebSocket = require('ws');

const WS_URL = process.argv[2]; // full ws url
const MODE = process.argv[3]; // 'eval' or 'screenshot'
const PAYLOAD = process.argv[4]; // js expr (for eval) or filename (for screenshot)
const CLIP = process.argv[5]; // optional JSON clip rect for screenshot

function send(ws, id, method, params) {
  ws.send(JSON.stringify({ id, method, params }));
}

async function main() {
  const ws = new WebSocket(WS_URL);
  let idCounter = 1;
  const pending = new Map();

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });

  function call(method, params) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      send(ws, id, method, params);
    });
  }

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  await call('Runtime.enable', {});
  await call('Page.enable', {});

  if (MODE === 'eval') {
    const result = await call('Runtime.evaluate', {
      expression: PAYLOAD,
      awaitPromise: true,
      returnByValue: true,
    });
    const outfile = process.argv[5];
    if (outfile && result && result.result && typeof result.result.value === 'string') {
      require('fs').writeFileSync(outfile, result.result.value);
      console.log('wrote', outfile, result.result.value.length, 'chars');
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } else if (MODE === 'screenshot') {
    const params = { format: 'png' };
    if (CLIP) {
      params.captureBeyondViewport = true;
      params.clip = JSON.parse(CLIP);
    }
    const result = await call('Page.captureScreenshot', params);
    const fs = require('fs');
    const buf = Buffer.from(result.data, 'base64');
    fs.writeFileSync(PAYLOAD, buf);
    console.log('wrote', PAYLOAD, buf.length, 'bytes');
  }

  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
