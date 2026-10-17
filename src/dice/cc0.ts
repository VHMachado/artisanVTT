import { Matrix, Vector3 } from "@babylonjs/core/Maths/math";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexBuffer } from "@babylonjs/core/Meshes/buffer";
import type { Mesh, Scene } from "@babylonjs/core";

import type { DiceType } from "../types/Dice";

export type CC0DiceFace = { value: number; direction: readonly [number, number, number] };
export type CC0DiceDefinition = { asset: string; faces: readonly CC0DiceFace[] };

/**
 * Face directions transcribed from the validated CC0 PolyhedralDice spike.
 * They deliberately stay in the model's local coordinates: runtime applies the
 * imported mesh's world matrix before placing each locator.
 */
export const CC0_DICE: Record<DiceType, CC0DiceDefinition> = {
  d4: {
    asset: "D4.gltf",
    faces: [
      { value: 2, direction: [0.588728652, 0.588728652, -0.553892724] },
      { value: 1, direction: [-0.553892724, 0.588728652, 0.588728652] },
      { value: 3, direction: [-0.588728652, -0.553892724, -0.588728652] },
      { value: 4, direction: [0.588728652, -0.588728652, 0.553892724] },
    ],
  },
  d6: {
    asset: "D6.gltf",
    faces: [
      { value: 1, direction: [-0.00207, 0.3587, 0.02612] },
      { value: 2, direction: [-0.35855, -0.00455, -0.00237] },
      { value: 3, direction: [0.00249, -0.00521, -0.35847] },
      { value: 4, direction: [0.01178, -0.03042, 0.35856] },
      { value: 5, direction: [0.35849, -0.00979, -0.0009] },
      { value: 6, direction: [-0.00357, -0.35851, 0.01569] },
    ],
  },
  d8: {
    asset: "D8.gltf",
    faces: [
      { value: 1, direction: [-0.6, 0.5349, 0.5949] },
      { value: 2, direction: [0.5793, 0.5706, 0.5821] },
      { value: 3, direction: [0.5819, 0.5718, -0.5783] },
      { value: 4, direction: [-0.6151, 0.5272, -0.5863] },
      { value: 5, direction: [-0.5676, -0.5947, 0.5694] },
      { value: 6, direction: [0.5686, -0.6039, 0.5585] },
      { value: 7, direction: [0.6065, -0.546, -0.578] },
      { value: 8, direction: [-0.5693, -0.5927, -0.5698] },
    ],
  },
  d10: {
    asset: "D10_Ones.gltf",
    faces: [
      { value: 0, direction: [-0.7244, 0.4486, 0.5233] },
      { value: 1, direction: [0.2749, 0.4232, 0.8633] },
      { value: 2, direction: [0.8903, 0.4553, 0.0035] },
      { value: 3, direction: [0.2788, 0.4535, -0.8465] },
      { value: 4, direction: [-0.7487, 0.4143, -0.5176] },
      { value: 5, direction: [-0.2731, -0.4739, 0.8371] },
      { value: 6, direction: [0.7098, -0.4861, 0.5099] },
      { value: 7, direction: [0.7398, -0.4308, -0.5169] },
      { value: 8, direction: [-0.2729, -0.4743, -0.837] },
      { value: 9, direction: [-0.8839, -0.4677, -0.0022] },
    ],
  },
  d100: {
    asset: "D10_Percentile.gltf",
    faces: [
      { value: 20, direction: [0.8683, 0.4957, 0.0205] },
      { value: 70, direction: [0.6814, -0.5202, -0.5149] },
      { value: 30, direction: [0.2135, 0.5492, -0.808] },
      { value: 80, direction: [-0.2048, -0.5955, -0.7769] },
      { value: 40, direction: [-0.685, 0.5241, -0.5061] },
      { value: 90, direction: [-0.8628, -0.5054, -0.0149] },
      { value: 0, direction: [-0.6674, 0.5414, 0.5114] },
      { value: 50, direction: [-0.2209, -0.5556, 0.8016] },
      { value: 10, direction: [0.2281, 0.5797, 0.7823] },
      { value: 60, direction: [0.6844, -0.524, 0.507] },
    ],
  },
  d12: {
    asset: "D12.gltf",
    faces: [
      { value: 11, direction: [-0.5002, -0.8659, -0.0035] },
      { value: 5, direction: [-0.8505, -0.0175, 0.5257] },
      { value: 8, direction: [-0.8504, -0.0184, -0.5259] },
      { value: 10, direction: [-0.0005, -0.5426, -0.84] },
      { value: 7, direction: [0.8579, 0.0329, -0.5128] },
      { value: 12, direction: [0.5135, -0.858, -0.0125] },
      { value: 4, direction: [-0.0169, 0.4782, -0.8781] },
      { value: 6, direction: [0.8526, -0.028, 0.5217] },
      { value: 3, direction: [-0.0033, 0.5184, 0.8551] },
      { value: 1, direction: [0.563, 0.8264, 0.0021] },
      { value: 9, direction: [-0.0026, -0.5311, 0.8473] },
      { value: 2, direction: [-0.5294, 0.8484, -0.0044] },
    ],
  },
  d20: {
    asset: "D20.gltf",
    faces: [
      { value: 17, direction: [0.5824, -0.5816, -0.5679] },
      { value: 14, direction: [-0.0141, -0.3756, -0.9267] },
      { value: 8, direction: [-0.0012, 0.3494, -0.937] },
      { value: 5, direction: [0.5792, 0.5694, -0.5834] },
      { value: 11, direction: [0.9346, -0.018, -0.3551] },
      { value: 10, direction: [0.9346, -0.0128, 0.3555] },
      { value: 16, direction: [0.5799, -0.5877, 0.5642] },
      { value: 19, direction: [0.3493, -0.9369, -0.0122] },
      { value: 20, direction: [-0.3494, -0.9369, -0.008] },
      { value: 18, direction: [-0.5851, -0.5844, -0.5623] },
      { value: 12, direction: [-0.9362, -0.0098, -0.3513] },
      { value: 6, direction: [-0.5878, 0.5621, -0.5818] },
      { value: 2, direction: [-0.3603, 0.9328, -0.0022] },
      { value: 1, direction: [0.3707, 0.9287, 0.0017] },
      { value: 4, direction: [0.5949, 0.5536, 0.5828] },
      { value: 7, direction: [-0.0131, 0.373, 0.9277] },
      { value: 13, direction: [0.0099, -0.3653, 0.9309] },
      { value: 15, direction: [-0.5667, -0.5854, 0.5798] },
      { value: 9, direction: [-0.9346, -0.0049, 0.3556] },
      { value: 3, direction: [-0.5785, 0.5766, 0.577] },
    ],
  },
};

function surfaceDistance(mesh: Mesh, direction: Vector3): number {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind) || [];
  let distance = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    distance = Math.max(
      distance,
      Vector3.Dot(new Vector3(positions[index], positions[index + 1], positions[index + 2]), direction)
    );
  }
  return Number.isFinite(distance) ? distance : 1;
}

/** Adds one local-space result locator for every validated physical face. */
export function attachCC0DiceFaceLocators(
  mesh: Mesh,
  type: DiceType,
  localToMesh: Matrix,
  scene: Scene
): void {
  for (const face of CC0_DICE[type].faces) {
    const direction = Vector3.TransformNormal(
      Vector3.FromArray(face.direction),
      localToMesh
    ).normalize();
    const locator = new TransformNode(`dice_locator_${face.value}`, scene);
    locator.position = direction.scale(surfaceDistance(mesh, direction) + 0.04);
    locator.parent = mesh;
  }
}

export function cc0FaceValues(type: DiceType): number[] {
  return CC0_DICE[type].faces.map((face) => face.value);
}
