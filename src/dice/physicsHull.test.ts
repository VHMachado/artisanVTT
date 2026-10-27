import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, test } from "vitest";

import { createPhysicsHullMesh } from "./physicsHull";
import type { DiceType } from "../types/Dice";

/**
 * `createPhysicsHullMesh` is the fix for the dice-roll freeze investigated
 * in PLAN.md: Ammo's ConvexHullImpostor construction cost scales
 * super-linearly with input vertex count
 * (`physicsLoadBenchmark.bench.test.ts` measured ~270x between a ~60- and
 * a ~6000-vertex hull at the same body count), so every die type gets an
 * invisible low-poly proxy here instead of building physics straight from
 * the detailed CC0 mesh. These assertions don't need real Ammo — they're
 * pure Babylon geometry, kept in the normal fast suite on purpose.
 */
describe("createPhysicsHullMesh", () => {
  const types: DiceType[] = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

  test("every die type gets a low-poly, invisible, unpickable proxy sized to the target diameter", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    for (const type of types) {
      const mesh = createPhysicsHullMesh(type, 3, scene);

      expect(mesh.isVisible, type).toBe(false);
      expect(mesh.isPickable, type).toBe(false);

      // "Low-poly" is the whole point of this proxy — well under the
      // thousands of vertices a detailed CC0/bevelled mesh carries.
      expect(mesh.getTotalVertices(), type).toBeGreaterThan(0);
      expect(mesh.getTotalVertices(), type).toBeLessThan(100);

      mesh.computeWorldMatrix(true);
      const extents = mesh.getBoundingInfo().boundingBox.extendSizeWorld.scale(2);
      const maxDimension = Math.max(extents.x, extents.y, extents.z);
      expect(maxDimension, type).toBeGreaterThan(2.9);
      expect(maxDimension, type).toBeLessThan(3.1);
    }

    scene.dispose();
    engine.dispose();
  });

  test("d10 and d100 share the same shape family (a real d10's own body)", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const d10 = createPhysicsHullMesh("d10", 3, scene);
    const d100 = createPhysicsHullMesh("d100", 3, scene);

    expect(d100.getTotalVertices()).toBe(d10.getTotalVertices());

    scene.dispose();
    engine.dispose();
  });

  test("d6's proxy is an exact box, not an approximation", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const mesh = createPhysicsHullMesh("d6", 3, scene);
    // A Babylon box has 8 corners; CreateBox's default sideOrientation
    // duplicates verts per face (24), but never approaches the hundreds a
    // polyhedron/icosphere would.
    expect(mesh.getTotalVertices()).toBeLessThanOrEqual(24);

    scene.dispose();
    engine.dispose();
  });
});
