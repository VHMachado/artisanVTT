import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { afterEach, describe, expect, it } from "vitest";

import { createCC0DiceStyle } from "./CC0Dice";
import { CC0_DICE } from "./cc0";
import Dice from "./Dice";

const runAssetIntegration = process.env.CC0_ASSET_INTEGRATION === "1";
const assetIt = runAssetIntegration ? it : it.skip;

describe("CC0 dice asset integration", () => {
  let engine: NullEngine | undefined;
  let scene: Scene | undefined;

  afterEach(() => {
    scene?.dispose();
    engine?.dispose();
  });

  assetIt("loads every public glTF, bakes its transform, and attaches the validated locators", async () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    const style = createCC0DiceStyle({
      color: "#3B82F6",
      key: "integration",
      metallic: 0.4,
      roughness: 0.35,
    });

    await style.load(scene);

    for (const [type, definition] of Object.entries(CC0_DICE)) {
      const source = style.meshes[type as keyof typeof CC0_DICE];
      expect(source.getTotalVertices(), type).toBeGreaterThan(0);
      expect(source.parent, type).toBeNull();
      expect(
        source
          .getChildTransformNodes()
          .map((node) => node.name)
          .filter((name) => name.startsWith("dice_locator_"))
          .sort(),
        type
      ).toEqual(definition.faces.map((face) => `dice_locator_${face.value}`).sort());

      const instance = source.createInstance(`${type}_instance`);
      Dice.cloneInstanceChildren(source, instance);
      expect(
        instance
          .getChildTransformNodes()
          .map((node) => node.name)
          .filter((name) => name.startsWith("dice_locator_"))
          .sort(),
        `${type} instance locators`
      ).toEqual(definition.faces.map((face) => `dice_locator_${face.value}`).sort());
      expect(instance.getChildMeshes(true).length, `${type} engraved mesh`).toBeGreaterThan(0);
    }
  });
});
