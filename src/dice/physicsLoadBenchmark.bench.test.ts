// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PhysicsImpostor } from "@babylonjs/core/Physics/physicsImpostor";
import { AmmoJSPlugin } from "@babylonjs/core/Physics/Plugins/ammoJSPlugin";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Physics/physicsEngineComponent";
// eslint-disable-next-line import/no-extraneous-dependencies
import AmmoFactory from "ammo.js/builds/ammo.wasm.js";

import Dice from "./Dice";
import type { DiceType } from "../types/Dice";

/**
 * Gated, opt-in benchmark for the "lançar muitos dados trava o app por
 * segundos" report (ver PLAN.md, "Dados 3D — investigação para decisão
 * futura"). Skipped in the normal `yarn test` run, same convention as
 * `CC0Dice.integration.test.ts`'s `CC0_ASSET_INTEGRATION` gate — this
 * creates real Ammo WASM physics bodies and steps them for real, which
 * is slow and not something every `yarn test --run` should pay for.
 *
 * Scope/what this measures and does NOT measure:
 * - It measures Ammo WASM `ConvexHullImpostor` CREATION cost and PHYSICS
 *   STEP cost on the main thread via Babylon's NullEngine — the actual
 *   synchronous work that blocks input/render during a big roll, per the
 *   code-reading investigation (DiceRollLayer.throwRequest creates every
 *   instance+impostor synchronously in one React event, and Ammo has no
 *   worker offload in this codebase).
 * - It does NOT measure real GPU shadow-map rasterization cost: NullEngine
 *   has no real WebGL context, so ShadowGenerator's CPU-side bookkeeping
 *   runs but the GPU draw calls are stubbed. That's a SEPARATE, smaller
 *   lever already identified in PLAN.md (1024px → 512px shadow map).
 * - It uses a representative convex hull (an icosphere at a vertex count
 *   in the same order of magnitude as the real CC0 d20 hull, ~13.5k
 *   vertices — see PLAN.md's dice investigation) rather than the actual
 *   vendored glTF meshes, because loading those isn't needed to measure
 *   where the cost scales from (hull complexity × body count), and
 *   keeps this benchmark runnable without the asset pipeline.
 *
 * Run with: DICE_PHYSICS_BENCHMARK=1 yarn test src/dice/physicsLoadBenchmark.bench.test.ts --run
 */
const runBenchmark = process.env.DICE_PHYSICS_BENCHMARK === "1";
const benchmarkIt = runBenchmark ? it : it.skip;

const HERE = dirname(fileURLToPath(import.meta.url));
const AMMO_WASM_BINARY_PATH = join(
  HERE,
  "..",
  "..",
  "node_modules",
  "ammo.js",
  "builds",
  "ammo.wasm.wasm"
);

/** Mirrors helpers/ammo.ts's `preloadAmmo`, but reads the WASM binary from
 * disk instead of `fetch`ing a Vite-served asset URL — there is no dev
 * server running inside a benchmark test. */
function loadAmmoForBenchmark(): Promise<unknown> {
  const wasmBinary = readFileSync(AMMO_WASM_BINARY_PATH);
  return new Promise((resolve, reject) => {
    const receiver: Record<string, unknown> = {};
    const config: Record<string, unknown> = {
      wasmBinary: new Uint8Array(wasmBinary),
      instantiateWasm(
        imports: WebAssembly.Imports,
        success: (instance: WebAssembly.Instance) => void
      ) {
        WebAssembly.instantiate(wasmBinary, imports).then(
          (result) => success(result.instance),
          (error) => reject(error)
        );
        return {};
      },
      onRuntimeInitialized() {
        delete (config as { then?: unknown }).then;
        resolve(config);
      },
    };
    (AmmoFactory as (this: unknown, config?: unknown) => unknown).call(
      receiver,
      config
    );
  });
}

type BenchmarkRow = {
  bodyCount: number;
  creationMs: number;
  stepCount: number;
  totalStepMs: number;
  avgStepMs: number;
  worstStepMs: number;
};

/** Convex hull complexity in the same order of magnitude as the real CC0
 * d20 hull (~13.5k vertices, per PLAN.md's dice investigation). A regular
 * icosphere is a reasonable stand-in: it is a single convex mesh with a
 * controllable, realistic vertex count, with no asset-pipeline dependency. */
function createHullMesh(scene: Scene, name: string) {
  return MeshBuilder.CreateIcoSphere(
    name,
    { radius: 1, subdivisions: 10 },
    scene
  );
}

async function benchmarkBodyCount(
  ammo: unknown,
  bodyCount: number
): Promise<BenchmarkRow> {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.enablePhysics(new Vector3(0, -98, 0), new AmmoJSPlugin(false, ammo));
  const camera = new TargetCamera("benchmark_camera", new Vector3(0, 50, 0), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;

  const sourceHull = createHullMesh(scene, "benchmark_hull_source");
  sourceHull.isVisible = false;

  const creationStart = performance.now();
  const instances = [];
  for (let i = 0; i < bodyCount; i += 1) {
    const instance = sourceHull.createInstance(`benchmark_hull_${i}`);
    // Spread them out like a real throw (DiceArena.areaFor's jitter), not
    // stacked at the exact same point — Ammo's broadphase cost depends on
    // how many pairs are actually near each other.
    instance.position = new Vector3(
      (Math.random() * 2 - 1) * 6,
      5 + Math.random() * 3,
      (Math.random() * 2 - 1) * 6
    );
    instance.physicsImpostor = new PhysicsImpostor(
      instance,
      PhysicsImpostor.ConvexHullImpostor,
      { mass: 8, friction: 4 },
      scene
    );
    instance.physicsImpostor.applyImpulse(
      new Vector3(
        (Math.random() * 2 - 1) * 250,
        -50,
        (Math.random() * 2 - 1) * 250
      ),
      instance.physicsImpostor.getObjectCenter()
    );
    instances.push(instance);
  }
  const creationMs = performance.now() - creationStart;

  // Step while the dice are actively in flight/impacting — the worst-case
  // window for the freeze, not the settled-and-asleep steady state.
  const stepCount = 60;
  let totalStepMs = 0;
  let worstStepMs = 0;
  for (let i = 0; i < stepCount; i += 1) {
    const stepStart = performance.now();
    scene.render();
    const stepMs = performance.now() - stepStart;
    totalStepMs += stepMs;
    worstStepMs = Math.max(worstStepMs, stepMs);
  }

  scene.dispose();
  engine.dispose();

  return {
    bodyCount,
    creationMs,
    stepCount,
    totalStepMs,
    avgStepMs: totalStepMs / stepCount,
    worstStepMs,
  };
}

describe("3D dice physics load (gated benchmark)", () => {
  benchmarkIt(
    "measures Ammo WASM creation + step cost scaling with simultaneous bodies",
    async () => {
      const ammo = await loadAmmoForBenchmark();

      // Mirrors the real budget boundary found by reading the code: up to
      // 60 logical dice, up to 80 physical bodies once d100's companion
      // d10 is counted (see PLAN.md). 100 is included past that boundary
      // to show where the curve goes if the cap were raised.
      const bodyCounts = [1, 10, 20, 40, 60, 80, 100];
      const rows: BenchmarkRow[] = [];
      for (const bodyCount of bodyCounts) {
        rows.push(await benchmarkBodyCount(ammo, bodyCount));
      }

      // eslint-disable-next-line no-console
      console.table(
        rows.map((row) => ({
          corpos: row.bodyCount,
          "criação (ms)": row.creationMs.toFixed(2),
          "passo médio (ms)": row.avgStepMs.toFixed(3),
          "passo pior (ms)": row.worstStepMs.toFixed(3),
          "60 passos total (ms)": row.totalStepMs.toFixed(1),
        }))
      );

      // Sanity, not a hardware-specific pass/fail threshold: cost must
      // scale UP with body count, not be flat/noise — if it were flat,
      // the benchmark itself would be wrong (e.g. physics silently
      // disabled), not the app.
      const first = rows[0];
      const last = rows[rows.length - 1];
      expect(last.avgStepMs).toBeGreaterThan(first.avgStepMs);
    },
    120_000
  );

  /**
   * Confirms WHICH factor the creation cost above actually scales with:
   * the number of bodies, or the vertex count of the convex hull each
   * body is built from. Fixes body count at 20 (a third of the real
   * budget) and varies ONLY the hull's vertex count — this is what
   * decided the fix: Ammo's ConvexHullImpostor construction cost scales
   * with hull vertices, not meaningfully with anything else about the
   * mesh, so a simplified physics-only proxy (same body count, far fewer
   * hull vertices) is the safe lever, not reducing how many dice a
   * player may throw.
   */
  benchmarkIt(
    "measures creation cost scaling with hull vertex count at a fixed body count",
    async () => {
      const ammo = await loadAmmoForBenchmark();
      const fixedBodyCount = 20;
      const subdivisionsToTry = [1, 2, 4, 6, 10];
      const rows: { subdivisions: number; vertices: number; creationMs: number }[] = [];

      for (const subdivisions of subdivisionsToTry) {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        scene.enablePhysics(new Vector3(0, -98, 0), new AmmoJSPlugin(false, ammo));
        const camera = new TargetCamera(
          "benchmark_camera",
          new Vector3(0, 50, 0),
          scene
        );
        camera.setTarget(Vector3.Zero());
        scene.activeCamera = camera;

        const sourceHull = MeshBuilder.CreateIcoSphere(
          "benchmark_hull_source",
          { radius: 1, subdivisions },
          scene
        );
        sourceHull.isVisible = false;
        const vertices = sourceHull.getTotalVertices();

        const creationStart = performance.now();
        for (let i = 0; i < fixedBodyCount; i += 1) {
          const instance = sourceHull.createInstance(`benchmark_hull_${i}`);
          instance.position = new Vector3(
            (Math.random() * 2 - 1) * 6,
            5 + Math.random() * 3,
            (Math.random() * 2 - 1) * 6
          );
          instance.physicsImpostor = new PhysicsImpostor(
            instance,
            PhysicsImpostor.ConvexHullImpostor,
            { mass: 8, friction: 4 },
            scene
          );
        }
        const creationMs = performance.now() - creationStart;
        rows.push({ subdivisions, vertices, creationMs });

        scene.dispose();
        engine.dispose();
      }

      // eslint-disable-next-line no-console
      console.table(
        rows.map((row) => ({
          subdivisions: row.subdivisions,
          "vértices do hull": row.vertices,
          [`criação de ${fixedBodyCount} corpos (ms)`]: row.creationMs.toFixed(2),
        }))
      );

      const lowPoly = rows[0];
      const highPoly = rows[rows.length - 1];
      expect(highPoly.creationMs).toBeGreaterThan(lowPoly.creationMs);
    },
    120_000
  );

  /**
   * End-to-end confirmation of the SHIPPED fix, through the real
   * production code path (`createCC0DiceStyle`/`CC0Dice.load`/
   * `CC0Dice.createInstance`), not a synthetic analogy — real vendored
   * glTF dice assets (`public/dice/`), real low-poly physics proxies
   * (`physicsHull.ts`), real Ammo WASM. Compares the worst realistic
   * roll (20d12 + 20d20 + 20d100, the combination that reaches 80
   * physical bodies once d100's companion d10 is counted, per PLAN.md's
   * "60 lógicos / 80 corpos" boundary) built from the FULL detail meshes
   * (the pre-fix behavior) against the same roll built through
   * `CC0Dice.createInstance` (the shipped, post-fix behavior).
   */
  benchmarkIt(
    "confirms the shipped fix end-to-end against the real CC0 dice assets",
    async () => {
      const ammo = await loadAmmoForBenchmark();
      const { createCC0DiceStyle } = await import("./CC0Dice");
      const worstCaseRoll: { type: DiceType; count: number }[] = [
        { type: "d12", count: 20 },
        { type: "d20", count: 20 },
        { type: "d100", count: 20 },
      ];

      const engine = new NullEngine();
      const scene = new Scene(engine);
      scene.enablePhysics(new Vector3(0, -98, 0), new AmmoJSPlugin(false, ammo));
      const camera = new TargetCamera(
        "benchmark_camera",
        new Vector3(0, 50, 0),
        scene
      );
      camera.setTarget(Vector3.Zero());
      scene.activeCamera = camera;

      const style = createCC0DiceStyle({
        color: "#3B82F6",
        key: "benchmark",
        metallic: 0.4,
        roughness: 0.35,
      });
      await style.load(scene);

      const beforeStart = performance.now();
      for (const { type, count } of worstCaseRoll) {
        for (let i = 0; i < count; i += 1) {
          // Pre-fix behavior: build the ConvexHullImpostor straight from
          // the DETAILED render mesh (no hullMesh argument) — exactly
          // what `createInstance` did before this fix.
          Dice.createInstanceMesh(
            style.meshes[type],
            Dice.getDicePhysicalProperties(type),
            scene
          );
          if (type === "d100") {
            Dice.createInstanceMesh(
              style.meshes.d10,
              Dice.getDicePhysicalProperties("d10"),
              scene
            );
          }
        }
      }
      const beforeMs = performance.now() - beforeStart;

      const afterStart = performance.now();
      for (const { type, count } of worstCaseRoll) {
        for (let i = 0; i < count; i += 1) {
          // Post-fix behavior: the real shipped call, which now threads
          // style.hulls[type] through automatically.
          style.createInstance(type, scene);
          if (type === "d100") {
            style.createInstance("d10", scene);
          }
        }
      }
      const afterMs = performance.now() - afterStart;

      // eslint-disable-next-line no-console
      console.table([
        {
          cenário: "20d12 + 20d20 + 20d100 (80 corpos físicos)",
          "antes (ms)": beforeMs.toFixed(1),
          "depois (ms)": afterMs.toFixed(1),
          "fator de melhora": (beforeMs / afterMs).toFixed(1) + "x",
        },
      ]);

      scene.dispose();
      engine.dispose();

      expect(afterMs).toBeLessThan(beforeMs);
    },
    120_000
  );
});
