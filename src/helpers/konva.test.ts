import { describe, expect, it } from "vitest";

import {
  convertNumbersToPoints,
  convertPointsToNumbers,
  scaleAndFlattenPoints,
} from "./konva";

describe("convertNumbersToPoints", () => {
  it("pairs a flat alternating array into Vector2s", () => {
    expect(convertNumbersToPoints([1, 2, 3, 4, 5, 6])).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
      { x: 5, y: 6 },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(convertNumbersToPoints([])).toEqual([]);
  });
});

describe("convertPointsToNumbers", () => {
  it("flattens Vector2s into an alternating array", () => {
    expect(
      convertPointsToNumbers([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ])
    ).toEqual([1, 2, 3, 4]);
  });

  it("round-trips with convertNumbersToPoints", () => {
    const numbers = [1, 2, 3, 4, 5, 6];
    expect(convertPointsToNumbers(convertNumbersToPoints(numbers))).toEqual(numbers);
  });
});

describe("scaleAndFlattenPoints", () => {
  it("scales each point by a non-uniform factor before flattening", () => {
    const points = [
      { x: 1, y: 1 },
      { x: 2, y: 3 },
    ];
    expect(scaleAndFlattenPoints(points, { x: 10, y: 100 })).toEqual([
      10, 100, 20, 300,
    ]);
  });

  it("leaves points unchanged with a scale of 1", () => {
    const points = [{ x: 5, y: -5 }];
    expect(scaleAndFlattenPoints(points, { x: 1, y: 1 })).toEqual([5, -5]);
  });
});
