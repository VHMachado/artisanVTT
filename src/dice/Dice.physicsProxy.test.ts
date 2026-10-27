import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { describe, expect, test, vi } from "vitest";

vi.mock("@babylonjs/core/Physics/physicsImpostor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@babylonjs/core/Physics/physicsImpostor")
  >();
  class FakePhysicsImpostor {
    object: unknown;
    type: unknown;
    options: unknown;
    static ConvexHullImpostor = actual.PhysicsImpostor.ConvexHullImpostor;
    constructor(object: unknown, type: unknown, options: unknown) {
      this.object = object;
      this.type = type;
      this.options = options;
    }
  }
  return { ...actual, PhysicsImpostor: FakePhysicsImpostor };
});

import Dice, { physicsInstanceOf } from "./Dice";

/**
 * `createInstanceFromMesh`'s hull-parenting branch is the dice-roll-freeze
 * fix (PLAN.md): the physics body moves to an invisible low-poly proxy
 * (physicsHull.ts) PARENTED below the rendered instance, instead of living
 * on the detailed mesh itself. `PhysicsImpostor` is mocked here (its real
 * constructor needs `scene.enablePhysics` + a real engine plugin, exercised
 * for real in `physicsLoadBenchmark.bench.test.ts`) — this test is only
 * about the STRUCTURE Dice.ts builds: which object ends up parented to
 * which, and which one `physicsInstanceOf` resolves to.
 */
describe("Dice.createInstanceFromMesh", () => {
  test("without a hull mesh, physics stays on the rendered instance itself (legacy path)", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const source = MeshBuilder.CreateBox("source", { size: 2 }, scene);

    const instance = Dice.createInstanceFromMesh(
      source,
      "legacy",
      { mass: 1, friction: 1 },
      scene
    );

    expect(instance.parent).toBeNull();
    expect(instance.physicsImpostor).toBeDefined();
    expect(physicsInstanceOf(instance)).toBe(instance);

    scene.dispose();
    engine.dispose();
  });

  test("with a hull mesh, the rendered instance is parented to an invisible physics proxy", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const source = MeshBuilder.CreateBox("source", { size: 2 }, scene);
    const hull = MeshBuilder.CreateBox("hull", { size: 1 }, scene);
    hull.isVisible = false;

    const instance = Dice.createInstanceFromMesh(
      source,
      "proxied",
      { mass: 8, friction: 4 },
      scene,
      hull
    );

    // Physics never touches the rendered instance directly...
    expect(instance.physicsImpostor).toBeUndefined();
    expect(instance.position.equals(instance.position.scale(0))).toBe(true);

    // ...it lives on the parent proxy, which physicsInstanceOf resolves to.
    const physicsInstance = physicsInstanceOf(instance);
    expect(physicsInstance).not.toBe(instance);
    expect(physicsInstance).toBe(instance.parent);
    expect(physicsInstance.physicsImpostor).toBeDefined();
    expect((physicsInstance.physicsImpostor as unknown as { options: unknown })?.options).toEqual({
      mass: 8,
      friction: 4,
    });
    expect((physicsInstance as unknown as { sourceMesh?: unknown }).sourceMesh).toBe(
      hull
    );

    scene.dispose();
    engine.dispose();
  });
});
