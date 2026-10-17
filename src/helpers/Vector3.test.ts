import { describe, expect, test } from "vitest";

import Vector3 from "./Vector3";

describe("Vector3.cubeRound", () => {
  test("rounds fractional cube coordinates while preserving zero sum", () => {
    const rounded = Vector3.cubeRound(new Vector3(0.4, -1.2, 0.8));

    expect(rounded).toEqual(new Vector3(0, -1, 1));
    expect(rounded.x + rounded.y + rounded.z).toBe(0);
  });

  test("repairs the component with the largest rounding difference", () => {
    const rounded = Vector3.cubeRound(new Vector3(1.6, -0.2, -1.4));

    expect(rounded.x).toBe(2);
    expect(Object.is(rounded.y, -0)).toBe(true);
    expect(rounded.z).toBe(-2);
    expect(rounded.x + rounded.y + rounded.z).toBe(0);
  });
});
