import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import type { DiceType } from "../types/Dice";

/**
 * Low-poly, collision-only proxy per die TYPE, built from Babylon's
 * built-in Platonic/Johnson solid primitives instead of the detailed
 * rendered mesh (CC0 glTF, thousands of vertices for bevels/engraved
 * numerals).
 *
 * See PLAN.md's dice investigation ("Dados 3D — otimização aplicada"):
 * Ammo's `ConvexHullImpostor` construction (AmmoJSPlugin's
 * `_addHullVerts`, which calls `btConvexHullShape.addPoint(point, true)`
 * once per input vertex — the `true` recalculates the shape's local AABB
 * on EVERY point) costs super-linearly with the INPUT vertex count,
 * independent of how complex the resulting hull actually is. A benchmark
 * (`src/dice/physicsLoadBenchmark.bench.test.ts`) measured creating 20
 * physics bodies from a ~6000-vertex hull at ~1718ms, and the same 20
 * bodies from a ~60-vertex hull at ~6ms — about 270x, for geometry whose
 * resulting CONVEX hull barely changes, since most of the removed
 * vertices were fine bevel/engraving detail nowhere near the die's true
 * convex silhouette.
 *
 * This proxy is INVISIBLE (`isVisible = false`) and used ONLY for
 * physics — the detailed CC0 mesh keeps rendering at full fidelity,
 * parented to an instance of this proxy (see `Dice.ts`'s
 * `createInstanceFromMesh`), so visual quality is unaffected.
 *
 * Mapped to Babylon's own built-in solid closest to each die's REAL
 * shape family, not an arbitrary stand-in, so the physical tumble/rest
 * feel stays representative: d4→tetrahedron, d6→box (cube), d8→
 * octahedron, d10/d100→pentagonal dipyramid (Babylon polyhedron type 11
 * — the same 10-triangular-face family a real d10 belongs to, not a
 * generic blob), d12→dodecahedron, d20→icosahedron.
 */
const POLYHEDRON_TYPE_BY_DICE: Partial<Record<DiceType, number>> = {
  d4: 0, // Tetrahedron
  d8: 1, // Octahedron
  d10: 11, // Pentagonal Dipyramid (J13) — a real d10's shape family
  d12: 2, // Dodecahedron
  d20: 3, // Icosahedron
  d100: 11, // Shares its own body's shape with d10 (see Dice.ts's d10Instance)
};

/** Uniformly rescales `mesh` so its own bounding box's longest dimension
 * matches `targetDiameter`, then bakes the scale into vertex data — same
 * technique `CC0Dice.ts`'s `normalizeCC0DiceMeshes` already uses for the
 * detailed render meshes, so the invisible physics proxy ends up roughly
 * the same real-world size as what it's standing in for. */
function normalizeToTargetDiameter(mesh: Mesh, targetDiameter: number): void {
  mesh.computeWorldMatrix(true);
  const extents = mesh.getBoundingInfo().boundingBox.extendSizeWorld.scale(2);
  const maxDimension = Math.max(extents.x, extents.y, extents.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    return;
  }
  const factor = targetDiameter / maxDimension;
  mesh.scaling.scaleInPlace(factor);
  mesh.computeWorldMatrix(true);
  mesh.bakeCurrentTransformIntoVertices();
}

/** Builds one invisible, pickable-disabled low-poly collision proxy for
 * `diceType`, normalized to `targetDiameter`. Call once per die type per
 * loaded style (see `CC0Dice.ts`'s `load`) and reuse the returned `Mesh`
 * as the source for `mesh.createInstance(...)` per rolled body — never
 * rebuild it per instance, that would defeat the whole optimization. */
export function createPhysicsHullMesh(
  diceType: DiceType,
  targetDiameter: number,
  scene: Scene
): Mesh {
  const name = `dice_physics_hull_${diceType}`;
  const mesh =
    diceType === "d6"
      ? MeshBuilder.CreateBox(name, { size: 1 }, scene)
      : MeshBuilder.CreatePolyhedron(
          name,
          { type: POLYHEDRON_TYPE_BY_DICE[diceType] ?? 3, size: 1 },
          scene
        );
  normalizeToTargetDiameter(mesh, targetDiameter);
  mesh.isVisible = false;
  mesh.isPickable = false;
  return mesh;
}
