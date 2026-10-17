import { describe, expect, test } from "vitest";

import { cardinalRotationForMovement } from "./cardinalDrag";

describe("cardinalRotationForMovement", () => {
  test("faces up for an upward diagonal drag", () => {
    expect(cardinalRotationForMovement({ x: 30, y: -30 })).toBe(180);
  });

  test("faces the dominant horizontal direction for a mostly horizontal drag", () => {
    expect(cardinalRotationForMovement({ x: 30, y: -10 })).toBe(-90);
    expect(cardinalRotationForMovement({ x: -30, y: 10 })).toBe(90);
  });

  test("does not change facing until the token moves", () => {
    expect(cardinalRotationForMovement({ x: 0, y: 0 })).toBeUndefined();
  });
});
