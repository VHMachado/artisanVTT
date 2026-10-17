import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";

import { normalizeCC0DiceMeshes, LEGACY_DICE_DIAMETER } from "./CC0Dice";

describe("normalizeCC0DiceMeshes", () => {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;

  afterEach(() => {
    scene?.dispose();
    engine?.dispose();
  });

  it("scales the CC0 source and every engraved child to the legacy two-unit die diameter", () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const source = MeshBuilder.CreateBox("recess", { size: 0.8 }, scene);
    const engraved = MeshBuilder.CreateBox("gold", { size: 0.6 }, scene);

    normalizeCC0DiceMeshes([source, engraved], source, 2);

    const dimensions = source.getBoundingInfo().boundingBox.extendSize.scale(2);
    expect(Math.max(...dimensions.asArray())).toBeCloseTo(2, 6);

    const instance = source.createInstance("d20_instance");
    expect(Math.max(...instance.getBoundingInfo().boundingBox.extendSizeWorld.scale(2).asArray())).toBeCloseTo(2, 6);
  });

  it("defaults to the current LEGACY_DICE_DIAMETER when no target is given", () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const source = MeshBuilder.CreateBox("recess", { size: 0.8 }, scene);

    normalizeCC0DiceMeshes([source], source);

    const dimensions = source.getBoundingInfo().boundingBox.extendSize.scale(2);
    expect(Math.max(...dimensions.asArray())).toBeCloseTo(LEGACY_DICE_DIAMETER, 6);
  });
});
