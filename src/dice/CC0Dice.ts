import { Color3 } from "@babylonjs/core/Maths/math";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { InstancedMesh, Scene } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

import Dice from "./Dice";
import { attachCC0DiceFaceLocators, CC0_DICE } from "./cc0";
import type { DiceMeshes, DiceType } from "../types/Dice";

export type CC0DiceStyle = {
  color: string;
  key: string;
  metallic: number;
  roughness: number;
};

function importedMeshes(sceneMeshes: unknown[]): Mesh[] {
  return sceneMeshes.filter(
    (mesh): mesh is Mesh => mesh instanceof Mesh && mesh.getTotalVertices() > 0
  );
}

/** The legacy procedural dice (`MeshBuilder.CreateBox`/`CreatePolyhedron`,
 * both built with `size: 2`) were ~2 world units across. The vendored CC0
 * PolyhedralDice glTFs measure ~0.70–0.89 units across their own authored
 * scale (see `spikes/005-dice-cc0-assets/README.md`), so every die rendered
 * at roughly a third of the expected size once swapped in — the physics
 * (impostor mass/friction, arena jitter of ±1 unit, drop height, camera
 * framing) was all tuned against the old ~2-unit dice and never adjusted.
 *
 * Pedido do usuário (2026-10-12): os dados CC0 ainda liam pequenos demais
 * mesmo normalizados para o diâmetro legado de 2 unidades — aumentado
 * para 3 (+50%). A área de rolagem (helpers/diceRoll.ts's
 * `DICE_ROLL_AREA_FRACTION`) e os impulsos de arremesso (Dice.ts) são
 * dimensionados contra a CÂMERA/viewport, não contra o tamanho do dado,
 * então aumentar só este diâmetro deixa os dados maiores sem overflow da
 * área visível nem reajuste de física — o hull de colisão (convexo) é
 * derivado da própria malha, então cresce junto automaticamente. */
export const LEGACY_DICE_DIAMETER = 3;

/**
 * Uniformly rescales every mesh of one CC0 die (source + engraved detail
 * children) so the SOURCE mesh's bounding box matches `targetDiameter`, then
 * bakes the scale into vertex data immediately. Baking (not just setting
 * `.scaling`) is required: `InstancedMesh` has its own identity transform
 * independent of the source's `.scaling`, so a later `source.createInstance`
 * would otherwise ignore this resize entirely.
 */
export function normalizeCC0DiceMeshes(
  meshes: Mesh[],
  source: Mesh,
  targetDiameter: number = LEGACY_DICE_DIAMETER
): void {
  source.computeWorldMatrix(true);
  const extents = source.getBoundingInfo().boundingBox.extendSizeWorld.scale(2);
  const maxDimension = Math.max(extents.x, extents.y, extents.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    return;
  }
  const factor = targetDiameter / maxDimension;
  for (const mesh of meshes) {
    mesh.scaling.scaleInPlace(factor);
    mesh.computeWorldMatrix(true);
    mesh.bakeCurrentTransformIntoVertices();
  }
}

class CC0Dice extends Dice {
  static style: CC0DiceStyle;
  static meshes: DiceMeshes;

  static async load(scene: Scene): Promise<void> {
    if (this.meshes) {
      return;
    }

    const entries = await Promise.all(
      (Object.keys(CC0_DICE) as DiceType[]).map(async (type) => [
        type,
        await this.loadMesh(type, scene),
      ] as const)
    );
    this.meshes = Object.fromEntries(entries) as DiceMeshes;
  }

  static async loadMesh(type: DiceType, scene: Scene): Promise<Mesh> {
    const result = await SceneLoader.ImportMeshAsync(
      "",
      "/dice/",
      CC0_DICE[type].asset,
      scene
    );
    const meshes = importedMeshes(result.meshes);
    const [firstMesh, ...rest] = meshes;
    if (!firstMesh) {
      throw new Error(`CC0 dice asset ${CC0_DICE[type].asset} has no renderable mesh`);
    }
    const source = rest.reduce(
      (largest, mesh) =>
        mesh.getTotalVertices() > largest.getTotalVertices() ? mesh : largest,
      firstMesh
    );

    // The mappings were measured against the source primitive's local space.
    // Bake the glTF root transform into vertices, then transform each mapping
    // direction once before adding locators. This keeps later Ammo instances
    // parentless, so the arena coordinates remain the visible arena coordinates.
    source.computeWorldMatrix(true);
    const sourceWorld = source.getWorldMatrix().clone();
    for (const mesh of meshes) {
      mesh.computeWorldMatrix(true);
      mesh.bakeCurrentTransformIntoVertices();
      mesh.parent = null;
      mesh.isVisible = false;
      this.tintBodyMaterial(mesh.material);
    }

    // The vendored glTF's own authored scale (~0.7-0.9 units across) is much
    // smaller than the ~2-unit dice the physics/camera/arena were tuned for
    // (see `normalizeCC0DiceMeshes`). Resize to the legacy diameter before
    // deriving locator distances, so face-plane offsets are measured against
    // the final on-screen size.
    normalizeCC0DiceMeshes(meshes, source);

    for (const mesh of meshes) {
      if (mesh !== source) {
        mesh.parent = source;
      }
    }
    attachCC0DiceFaceLocators(source, type, sourceWorld, scene);
    return source;
  }

  static tintBodyMaterial(material: unknown): void {
    if (!(material instanceof PBRMaterial) || !material.name.includes("Dice_Recess")) {
      return;
    }
    // Keep the asset's engraved Antique Gold material and its CC0 PBR textures.
    // The style palette tints only the recessed body material, avoiding texture
    // redistribution or procedural face plates.
    material.albedoColor = Color3.FromHexString(this.style.color);
    material.metallic = this.style.metallic;
    material.roughness = this.style.roughness;
  }

  static createInstance(diceType: DiceType, scene: Scene): InstancedMesh {
    if (!this.meshes) {
      throw new Error("Dice not loaded, call load before creating an instance");
    }
    return this.createInstanceMesh(
      this.meshes[diceType],
      this.getDicePhysicalProperties(diceType),
      scene
    );
  }
}

export function createCC0DiceStyle(style: CC0DiceStyle): typeof CC0Dice {
  class StyledCC0Dice extends CC0Dice {}
  StyledCC0Dice.style = style;
  return StyledCC0Dice;
}

export default CC0Dice;
