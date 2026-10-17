// Fresh world-space visual validation for PolyhedralDice D4.
// Usage: node validate-d4-worldspace.cjs <CDP-port> <output-directory>
// Requires viewer.html served from the current spike directory over localhost.
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const [port, outputDir] = process.argv.slice(2);
if (!port || !outputDir) {
  throw new Error("Usage: node validate-d4-worldspace.cjs <CDP-port> <output-directory>");
}

const FACE_GROUPS = [
  { face: "A", normal: [-1, 1, -1], glyphComponents: [5, 9, 12] },
  { face: "B", normal: [1, -1, -1], glyphComponents: [8, 11, 14] },
  { face: "C", normal: [1, 1, 1], glyphComponents: [6, 10, 15] },
  { face: "D", normal: [-1, -1, 1], glyphComponents: [7, 13, 16] },
];
const GLYPH_CAMERA_DISTANCE = 1.2;
const GLYPH_CAMERA_FOV = 0.45;

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.on("message", (data) => {
    const message = JSON.parse(data.toString());
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
  });
  const open = new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return {
    ws,
    open,
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const target = targets.find((item) => item.type === "page");
  if (!target) throw new Error("No page target found on the requested CDP port");

  const client = cdp(target.webSocketDebuggerUrl);
  await client.open;
  await client.call("Runtime.enable");
  await client.call("Page.enable");

  await client.call("Page.navigate", { url: "http://127.0.0.1:8764/viewer.html" });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await evaluate(client, "document.readyState") === "complete") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (await evaluate(client, "document.readyState") !== "complete") {
    throw new Error("viewer.html did not finish loading");
  }
  await evaluate(client, `window.__diceSpike.load('vendor/PolyhedralDice/D4.gltf')`);

  const rawComponents = await evaluate(client, `JSON.stringify(window.__diceSpike.connectedComponents('D4_Corrected_primitive1', 1e-5))`);
  const components = JSON.parse(rawComponents);
  const evidence = { mesh: "D4_Corrected_primitive1", components, faces: [], worldMatrix: null };

  for (const group of FACE_GROUPS) {
    const faceEvidence = { ...group, glyphs: [] };
    for (const componentId of group.glyphComponents) {
      const payload = await evaluate(client, `(() => {
        const spike = window.__diceSpike;
        const mesh = spike.allMeshes.find((candidate) => candidate.name === 'D4_Corrected_primitive1');
        const component = spike.connectedComponents('D4_Corrected_primitive1', 1e-5)
          .find((candidate) => candidate.component === ${componentId});
        mesh.computeWorldMatrix(true);
        const centroidLocal = new BABYLON.Vector3(...component.centroid);
        const normalLocal = new BABYLON.Vector3(${group.normal.join(",")}).normalize();
        const centroidWorld = BABYLON.Vector3.TransformCoordinates(centroidLocal, mesh.getWorldMatrix());
        const normalWorld = BABYLON.Vector3.TransformNormal(normalLocal, mesh.getWorldMatrix()).normalize();
        spike.camera.fov = ${GLYPH_CAMERA_FOV};
        spike.camera.setPosition(centroidWorld.add(normalWorld.scale(${GLYPH_CAMERA_DISTANCE})));
        spike.camera.setTarget(centroidWorld);
        spike.scene.render();
        const viewport = spike.camera.viewport.toGlobal(spike.engine.getRenderWidth(), spike.engine.getRenderHeight());
        const projected = BABYLON.Vector3.Project(centroidWorld, BABYLON.Matrix.Identity(), spike.scene.getTransformMatrix(), viewport);
        return JSON.stringify({
          component: component.component,
          centroidLocal: centroidLocal.asArray(),
          normalLocal: normalLocal.asArray(),
          normalWorld: normalWorld.asArray(),
          screen: [projected.x, projected.y, projected.z],
          worldMatrix: Array.from(mesh.getWorldMatrix().m),
          renderSize: [spike.engine.getRenderWidth(), spike.engine.getRenderHeight()],
          viewport: [window.innerWidth, window.innerHeight],
        });
      })()`);
      const info = JSON.parse(payload);
      if (Math.abs(info.screen[0] - 320) > 8 || Math.abs(info.screen[1] - 320) > 8) {
        throw new Error(`Glyph ${componentId} was not centered after camera aim`);
      }
      evidence.worldMatrix ||= info.worldMatrix;
      await new Promise((resolve) => setTimeout(resolve, 200));
      const capture = await client.call("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 640, height: 640, scale: 1 },
      });
      const filename = `face-${group.face}-component-${componentId}.png`;
      fs.writeFileSync(path.join(outputDir, filename), Buffer.from(capture.data, "base64"));
      faceEvidence.glyphs.push({ ...info, image: filename });
    }
    evidence.faces.push(faceEvidence);
  }

  fs.writeFileSync(path.join(outputDir, "evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  client.ws.close();
  console.log(JSON.stringify({ outputDir, faces: evidence.faces.length, glyphs: evidence.faces.reduce((count, face) => count + face.glyphs.length, 0) }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
