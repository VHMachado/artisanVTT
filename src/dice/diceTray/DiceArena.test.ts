import { describe, expect, test } from "vitest";

import { collisionBoxesFor } from "./DiceArena";

describe("collisionBoxesFor", () => {
  test("ground and roof cover a wide arena on both horizontal axes", () => {
    const boxes = collisionBoxesFor({
      center: { x: 3, y: 8, z: -4 } as any,
      halfWidth: 80,
      halfDepth: 12,
    });

    for (const name of ["ground", "roof"] as const) {
      expect(boxes[name].width).toBeGreaterThanOrEqual(160);
      expect(boxes[name].depth).toBeGreaterThanOrEqual(24);
    }
    expect(boxes.wallTop.width).toBeGreaterThanOrEqual(160);
    expect(boxes.wallLeft.depth).toBeGreaterThanOrEqual(24);
  });

  test("ground and roof cover a tall arena without square-cube assumptions", () => {
    const boxes = collisionBoxesFor({
      center: { x: 0, y: 8, z: 0 } as any,
      halfWidth: 9,
      halfDepth: 70,
    });

    expect(boxes.ground.width).toBeGreaterThanOrEqual(18);
    expect(boxes.ground.depth).toBeGreaterThanOrEqual(140);
    expect(boxes.wallTop.width).toBeGreaterThanOrEqual(18);
    expect(boxes.wallLeft.depth).toBeGreaterThanOrEqual(140);
  });

  test("keeps collision walls thick while placing their inner faces on the bounds", () => {
    const boxes = collisionBoxesFor({
      center: { x: 5, y: 8, z: 7 } as any,
      halfWidth: 20,
      halfDepth: 10,
    });

    expect(boxes.wallRight.width).toBe(50);
    expect(boxes.wallTop.depth).toBe(50);
    expect(boxes.wallRight.x + boxes.wallRight.width / 2).toBe(5 - 20);
    expect(boxes.wallTop.z + boxes.wallTop.depth / 2).toBe(7 - 10);
  });
});
