import { describe, expect, test } from "vitest";

import { isVector2 } from "./Vector2";

describe("isVector2", () => {
  test("accepts a finite-looking coordinate pair", () => {
    expect(isVector2({ x: -12.5, y: 0 })).toBe(true);
  });

  test.each([
    ["a missing x coordinate", { y: 1 }],
    ["a missing y coordinate", { x: 1 }],
    ["a string coordinate", { x: "1", y: 2 }],
    ["a non-object", null],
  ])("rejects %s", (_label, value) => {
    expect(isVector2(value)).toBe(false);
  });
});
