import { describe, expect, it } from "vitest";

import {
  getGridPixelSize,
  getCellPixelSize,
  getCellLocation,
  getNearestCellCoordinates,
  getCellCorners,
  getGridDefaultInset,
  getGridUpdatedInset,
  getGridDetectionInset,
  getGridMaxZoom,
  hexCubeToOffset,
  hexOffsetToCube,
  gridDistance,
  parseGridScale,
  gridSizeVaild,
} from "./grid";
import Size from "./Size";
import { Grid } from "../types/Grid";

function squareGrid(overrides: Partial<Grid> = {}): Grid {
  return {
    type: "square",
    size: { x: 10, y: 10 },
    inset: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } },
    measurement: { type: "chebyshev", scale: "5ft" },
    ...overrides,
  };
}

function hexGrid(
  type: "hexVertical" | "hexHorizontal",
  overrides: Partial<Grid> = {}
): Grid {
  return {
    type,
    size: { x: 10, y: 10 },
    inset: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } },
    measurement: { type: "manhattan", scale: "5ft" },
    ...overrides,
  };
}

describe("getGridPixelSize", () => {
  it("scales the base size by the inset fraction", () => {
    const grid = squareGrid({
      inset: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 0.5, y: 0.25 } },
    });
    const size = getGridPixelSize(grid as Required<Grid>, 200, 400);
    expect(size.width).toBe(100);
    expect(size.height).toBe(100);
  });
});

describe("getCellPixelSize", () => {
  it("divides a square grid evenly", () => {
    const size = getCellPixelSize(squareGrid(), 100, 200);
    expect(size.width).toBe(10);
    expect(size.height).toBe(20);
  });

  it("returns zero size when the grid has no columns or rows", () => {
    const size = getCellPixelSize(squareGrid({ size: { x: 0, y: 10 } }), 100, 200);
    expect(size.width).toBe(0);
    expect(size.height).toBe(0);
  });

  it("derives a hex-vertical cell from its radius", () => {
    const size = getCellPixelSize(hexGrid("hexVertical"), 173.205, 200);
    expect(size.radius).toBeCloseTo(10, 3);
    expect(size.width).toBeCloseTo(17.3205, 3);
    expect(size.height).toBeCloseTo(20, 3);
  });

  it("derives a hex-horizontal cell from its radius", () => {
    const size = getCellPixelSize(hexGrid("hexHorizontal"), 200, 173.205);
    expect(size.radius).toBeCloseTo(10, 3);
    expect(size.width).toBeCloseTo(20, 3);
    expect(size.height).toBeCloseTo(17.3205, 3);
  });
});

describe("getCellLocation", () => {
  it("centers a square cell at col/row times cell size", () => {
    const location = getCellLocation(squareGrid(), 2, 3, new Size(10, 20));
    expect(location).toEqual({ x: 25, y: 70 });
  });
});

describe("getNearestCellCoordinates", () => {
  it("floors a point into its square grid cell", () => {
    const coords = getNearestCellCoordinates(squareGrid(), 25, 45, new Size(10, 10));
    expect(coords).toEqual({ x: 2, y: 4 });
  });

  it("round-trips through hex cube rounding for a hex-vertical grid", () => {
    const cellSize = getCellPixelSize(hexGrid("hexVertical"), 173.205, 200);
    const center = getCellLocation(hexGrid("hexVertical"), 3, 2, cellSize);
    const coords = getNearestCellCoordinates(
      hexGrid("hexVertical"),
      center.x,
      center.y,
      cellSize
    );
    expect(coords.x).toBeCloseTo(3, 3);
    expect(coords.y).toBeCloseTo(2, 3);
  });
});

describe("getCellCorners", () => {
  it("returns the 4 axis-aligned corners of a square cell", () => {
    const corners = getCellCorners(squareGrid(), 0, 0, new Size(10, 20));
    expect(corners).toEqual([
      { x: -5, y: -10 },
      { x: 5, y: -10 },
      { x: 5, y: 10 },
      { x: -5, y: 10 },
    ]);
  });

  it("returns 6 corners for a hex cell", () => {
    const corners = getCellCorners(hexGrid("hexVertical"), 0, 0, new Size(10, 20, 10));
    expect(corners).toHaveLength(6);
    for (const corner of corners) {
      expect(Math.hypot(corner.x, corner.y)).toBeCloseTo(10, 3);
    }
  });
});

describe("getGridDefaultInset / getGridUpdatedInset", () => {
  it("spans the full map width and derives height from the grid aspect", () => {
    const grid = squareGrid({ size: { x: 10, y: 5 } });
    const inset = getGridDefaultInset(grid, 1000, 1000);
    expect(inset.topLeft).toEqual({ x: 0, y: 0 });
    expect(inset.bottomRight.x).toBe(1);
    expect(inset.bottomRight.y).toBeCloseTo(0.5, 5);
  });

  it("recomputes only the height when the grid size changes", () => {
    const grid = squareGrid({
      size: { x: 10, y: 10 },
      inset: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } },
    });
    const updated = getGridUpdatedInset({ ...grid, size: { x: 10, y: 5 } }, 1000, 1000);
    expect(updated.topLeft).toEqual({ x: 0, y: 0 });
    expect(updated.bottomRight.x).toBe(1);
    expect(updated.bottomRight.y).toBeCloseTo(0.5, 5);
  });

  it("keeps detected seams aligned instead of resetting their phase to zero", () => {
    const inset = getGridDetectionInset(
      {
        pitch: 23,
        phase: { x: 12, y: 9 },
        size: { x: 74, y: 40 },
      },
      1692,
      930
    );
    // The nearest phase-equivalent line to each centered grid bound preserves
    // the 23px image-space tile pitch and the observed seam phase.
    expect(inset.topLeft).toEqual({ x: -11 / 1692, y: 9 / 930 });
    expect(inset.bottomRight).toEqual({ x: 1691 / 1692, y: 929 / 930 });
  });
});

describe("getGridMaxZoom", () => {
  it("returns the default zoom with no grid", () => {
    expect(getGridMaxZoom(undefined)).toBe(10);
  });

  it("scales with the larger grid dimension, floored at 5", () => {
    expect(getGridMaxZoom(squareGrid({ size: { x: 4, y: 4 } }))).toBe(5);
    expect(getGridMaxZoom(squareGrid({ size: { x: 40, y: 10 } }))).toBe(20);
  });
});

describe("hexCubeToOffset / hexOffsetToCube", () => {
  it("round-trips a hex-vertical cell", () => {
    const offset = { x: 3, y: -2 };
    const cube = hexOffsetToCube(offset, "hexVertical");
    expect(cube.x + cube.y + cube.z).toBe(0);
    expect(hexCubeToOffset(cube as any, "hexVertical")).toEqual(offset);
  });

  it("round-trips a hex-horizontal cell", () => {
    const offset = { x: -4, y: 5 };
    const cube = hexOffsetToCube(offset, "hexHorizontal");
    expect(cube.x + cube.y + cube.z).toBe(0);
    expect(hexCubeToOffset(cube as any, "hexHorizontal")).toEqual(offset);
  });
});

describe("gridDistance", () => {
  const cellSize = new Size(10, 10);

  it("chebyshev counts the longer axis", () => {
    const grid = squareGrid({ measurement: { type: "chebyshev", scale: "5ft" } });
    expect(gridDistance(grid, { x: 0, y: 0 }, { x: 30, y: 10 }, cellSize)).toBe(3);
  });

  it("manhattan sums both axes", () => {
    const grid = squareGrid({ measurement: { type: "manhattan", scale: "5ft" } });
    expect(gridDistance(grid, { x: 0, y: 0 }, { x: 30, y: 10 }, cellSize)).toBe(4);
  });

  it("alternating counts diagonals as 1.5", () => {
    const grid = squareGrid({ measurement: { type: "alternating", scale: "5ft" } });
    expect(gridDistance(grid, { x: 0, y: 0 }, { x: 30, y: 20 }, cellSize)).toBe(4);
  });

  it("euclidean is the raw pixel distance in cell units", () => {
    const grid = squareGrid({ measurement: { type: "euclidean", scale: "5ft" } });
    expect(gridDistance(grid, { x: 0, y: 0 }, { x: 30, y: 40 }, cellSize)).toBeCloseTo(5, 5);
  });

  it("hex manhattan uses cube distance", () => {
    const grid = hexGrid("hexVertical", { measurement: { type: "manhattan", scale: "5ft" } });
    const hexCellSize = getCellPixelSize(grid, 173.205, 200);
    const a = getCellLocation(grid, 0, 0, hexCellSize);
    const b = getCellLocation(grid, 2, 1, hexCellSize);
    expect(gridDistance(grid, a, b, hexCellSize)).toBeCloseTo(2, 3);
  });
});

describe("parseGridScale", () => {
  it("parses an integer scale with a unit", () => {
    expect(parseGridScale("5ft")).toEqual({ multiplier: 5, unit: "ft", digits: 0 });
  });

  it("parses a decimal scale with a unit", () => {
    expect(parseGridScale("1.5m")).toEqual({ multiplier: 1.5, unit: "m", digits: 1 });
  });

  it("falls back to a 1x multiplier for null or unparsable input", () => {
    expect(parseGridScale(null)).toEqual({ multiplier: 1, unit: "", digits: 0 });
  });
});

describe("gridSizeVaild", () => {
  it("accepts sizes strictly inside the typical battle-map range", () => {
    expect(gridSizeVaild(20, 20)).toBe(true);
  });

  it("rejects sizes at or outside the range", () => {
    expect(gridSizeVaild(10, 20)).toBe(false);
    expect(gridSizeVaild(20, 200)).toBe(false);
    expect(gridSizeVaild(5, 5)).toBe(false);
  });
});
