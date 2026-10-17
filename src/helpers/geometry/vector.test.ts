import { describe, expect, it } from "vitest";

import {
  add,
  distanceToLine,
  normalize,
  pointInPolygon,
  resamplePath,
  rotateAround,
} from "./vector";

describe("geometry vector primitives", () => {
  it("combines scalar and component inputs without mutating the source", () => {
    const source = { x: 6, y: -4 };

    expect(add(source, 2)).toEqual({ x: 8, y: -2 });
    expect(normalize({ x: 3, y: 4 })).toEqual({ x: 0.6, y: 0.8 });
    expect(source).toEqual({ x: 6, y: -4 });
  });

  it("rotates map points around an explicit pivot", () => {
    const rotated = rotateAround({ x: 2, y: 1 }, { x: 1, y: 1 }, 90);

    expect(rotated.x).toBeCloseTo(1);
    expect(rotated.y).toBeCloseTo(2);
  });

  it("finds the nearest point on a bounded segment", () => {
    expect(distanceToLine({ x: 5, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({
      distance: 4,
      point: { x: 5, y: 0 },
    });
    expect(distanceToLine({ x: -4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({
      distance: 5,
      point: { x: 0, y: 0 },
    });
  });

  it("resamples paths and rejects a point outside the polygon bounds", () => {
    expect(
      resamplePath(
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

    const square = [
      { x: -2, y: -1 },
      { x: 4, y: -1 },
      { x: 4, y: 3 },
      { x: -2, y: 3 },
    ];
    expect(pointInPolygon({ x: 0, y: 0 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 0 }, square)).toBe(false);
  });
});
