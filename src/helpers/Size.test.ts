import { describe, expect, test } from "vitest";

import Size from "./Size";

describe("Size", () => {
  test("keeps width and height as writable Vector2 aliases", () => {
    const size = new Size(10, 20);

    expect(size).toMatchObject({ x: 10, y: 20, width: 10, height: 20 });
    size.width = 30;
    size.height = 40;

    expect(size).toMatchObject({ x: 30, y: 40, width: 30, height: 40 });
  });

  test("derives radius from the smaller dimension unless a truthy radius is set", () => {
    const derived = new Size(10, 30);
    const explicit = new Size(10, 30, 7);
    const zeroRadius = new Size(10, 30, 0);

    expect(derived.radius).toBe(5);
    expect(explicit.radius).toBe(7);
    explicit.radius = 9;
    expect(explicit.radius).toBe(9);
    expect(zeroRadius.radius).toBe(5);
  });
});
