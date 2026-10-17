import { describe, expect, it, vi } from "vitest";

vi.mock("@babylonjs/core/Maths/math", () => ({
  Vector3: {
    Dot: (direction: { alignment: number }) => direction.alignment,
    Up: () => ({ alignment: 1 }),
  },
}));

import {
  getDiceInstanceRoll,
  getDiceRoll,
  getDiceRollTotal,
} from "./dice";
import type { DiceMesh } from "../types/Dice";

function instanceForFaces(...faces: Array<[number, number]>) {
  return {
    getAbsolutePosition: () => ({}),
    getChildTransformNodes: () =>
      faces.map(([face, alignment]) => ({
        name: `dice_locator_${face}`,
        getAbsolutePosition: () => ({
          subtract: () => ({ normalize: () => ({ alignment }) }),
        }),
      })),
  } as any;
}

describe("dice helpers", () => {
  it("uses the most upward-facing locator and ignores malformed names", () => {
    expect(getDiceInstanceRoll(instanceForFaces([2, 0.2], [17, 0.9]))).toBe(17);
    expect(getDiceInstanceRoll(instanceForFaces())).toBe(0);
  });

  it("normalizes d10 zero and combines the percentile pair", () => {
    const d10 = {
      type: "d10",
      instance: instanceForFaces([0, 1]),
    } as DiceMesh;
    const d100 = {
      type: "d100",
      instance: instanceForFaces([0, 1]),
      d10Instance: instanceForFaces([0, 1]),
    } as DiceMesh;

    expect(getDiceRoll(d10)).toEqual({ type: "d10", roll: 10 });
    expect(getDiceRoll(d100)).toEqual({ type: "d100", roll: 100 });
  });

  it("excludes unsettled dice from the total", () => {
    expect(
      getDiceRollTotal([
        { type: "d20", roll: 14 },
        { type: "d6", roll: "unknown" },
        { type: "d4", roll: 3 },
      ])
    ).toBe(17);
  });
});
