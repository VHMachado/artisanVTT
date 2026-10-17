import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Matrix } from "@babylonjs/core/Maths/math";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";

import { attachCC0DiceFaceLocators, CC0_DICE, cc0FaceValues } from "./cc0";

const expectedFaceCounts = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 10,
} as const;

describe("CC0 PolyhedralDice mappings", () => {
  it("contains every supported die and every validated physical result exactly once", () => {
    expect(Object.keys(CC0_DICE).sort()).toEqual(Object.keys(expectedFaceCounts).sort());

    for (const [type, count] of Object.entries(expectedFaceCounts)) {
      const values = cc0FaceValues(type as keyof typeof expectedFaceCounts);
      expect(values).toHaveLength(count);
      expect(new Set(values).size).toBe(count);
    }

    expect(cc0FaceValues("d10").sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(cc0FaceValues("d100").sort((a, b) => a - b)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  it("creates numbered locators from the validated mappings instead of face-label planes", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const mesh = MeshBuilder.CreateBox("source", { size: 2 }, scene);

    attachCC0DiceFaceLocators(mesh, "d6", Matrix.Identity(), scene);

    const locatorNames = mesh
      .getChildTransformNodes()
      .map((locator) => locator.name)
      .filter((name) => name.startsWith("dice_locator_"))
      .sort();
    expect(locatorNames).toEqual(
      cc0FaceValues("d6")
        .map((value) => `dice_locator_${value}`)
        .sort()
    );
    expect(mesh.getChildMeshes(true).filter((child) => child.name.startsWith("dice_label_")).length).toBe(0);

    scene.dispose();
    engine.dispose();
  });
});
