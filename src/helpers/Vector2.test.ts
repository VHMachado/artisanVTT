import { describe, expect, it } from "vitest";

import Vector2 from "./Vector2";

describe("Vector2", () => {
  it("performs scalar and component-wise arithmetic without mutating inputs", () => {
    const source = new Vector2(6, -4);

    expect(Vector2.add(source, 2)).toEqual({ x: 8, y: -2 });
    expect(Vector2.multiply(source, { x: 3, y: -2 })).toEqual({ x: 18, y: 8 });
    expect(source).toEqual({ x: 6, y: -4 });
  });

  it("rotates directions in degrees around the origin", () => {
    const result = Vector2.rotateDirection({ x: 1, y: 0 }, 90);

    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(1);
  });

  it("resamples a path at equal intervals and retains its end point", () => {
    expect(
      Vector2.resample(
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
        3
      )
    ).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("returns a bounding box and rejects points outside its polygon bounds", () => {
    const square = [
      { x: -2, y: -1 },
      { x: 4, y: -1 },
      { x: 4, y: 3 },
      { x: -2, y: 3 },
    ];

    expect(Vector2.getBoundingBox(square)).toEqual({
      min: { x: -2, y: -1 },
      max: { x: 4, y: 3 },
      width: 6,
      height: 4,
      center: { x: 1, y: 1 },
    });
    expect(Vector2.pointInPolygon({ x: 0, y: 0 }, square)).toBe(true);
    expect(Vector2.pointInPolygon({ x: 5, y: 0 }, square)).toBe(false);
  });
});
