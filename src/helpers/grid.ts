import { detectGrid, GridDetection } from "./gridDetection";
import Vector3 from "./Vector3";
import Vector2 from "./Vector2";
import Size from "./Size";

import { Grid, GridInset, GridScale } from "../types/Grid";

// sqrt(3), used throughout the hex-grid math below to go between a hex's
// "radius" (center to corner) and its flat width/height.
const SQRT_3 = 1.73205;

function unsupportedGridType(): never {
  throw new Error("Grid type not implemented");
}

/**
 * Size in pixels of the grid once its normalized inset is applied to the
 * map it sits on.
 */
export function getGridPixelSize(
  grid: Required<Grid>,
  baseWidth: number,
  baseHeight: number
): Size {
  const { topLeft, bottomRight } = grid.inset;
  return new Size(
    (bottomRight.x - topLeft.x) * baseWidth,
    (bottomRight.y - topLeft.y) * baseHeight
  );
}

/** Size in pixels of a single cell, given the grid's own pixel size */
export function getCellPixelSize(
  grid: Grid,
  gridWidth: number,
  gridHeight: number
): Size {
  if (grid.size.x === 0 || grid.size.y === 0) {
    return new Size(0, 0);
  }

  if (grid.type === "square") {
    return new Size(gridWidth / grid.size.x, gridHeight / grid.size.y);
  }

  if (grid.type === "hexVertical") {
    const radius = gridWidth / grid.size.x / SQRT_3;
    return new Size(radius * SQRT_3, radius * 2, radius);
  }

  if (grid.type === "hexHorizontal") {
    const radius = gridHeight / grid.size.y / SQRT_3;
    return new Size(radius * 2, radius * SQRT_3, radius);
  }

  return unsupportedGridType();
}

/**
 * Center of a cell addressed in offset coordinates (even rows/columns of a
 * hex grid are offset to the right of odd ones).
 */
export function getCellLocation(
  grid: Grid,
  col: number,
  row: number,
  cellSize: Size
): Vector2 {
  if (grid.type === "square") {
    return {
      x: col * cellSize.width + cellSize.width / 2,
      y: row * cellSize.height + cellSize.height / 2,
    };
  }

  if (grid.type === "hexVertical") {
    return {
      x: cellSize.radius * SQRT_3 * (col - 0.5 * (row & 1)),
      y: ((cellSize.radius * 3) / 2) * row,
    };
  }

  if (grid.type === "hexHorizontal") {
    return {
      x: ((cellSize.radius * 3) / 2) * col,
      y: cellSize.radius * SQRT_3 * (row - 0.5 * (col & 1)),
    };
  }

  return unsupportedGridType();
}

/** Offset-coordinate cell closest to a point given in pixels */
export function getNearestCellCoordinates(
  grid: Grid,
  x: number,
  y: number,
  cellSize: Size
): Vector2 {
  if (grid.type === "square") {
    return Vector2.divide(Vector2.floorTo({ x, y }, cellSize), cellSize);
  }

  if (grid.type === "hexVertical") {
    const cubeX = ((SQRT_3 / 3) * x - (1 / 3) * y) / cellSize.radius;
    const cubeZ = ((2 / 3) * y) / cellSize.radius;
    const cube = new Vector3(cubeX, -cubeX - cubeZ, cubeZ);
    return hexCubeToOffset(Vector3.cubeRound(cube), "hexVertical");
  }

  if (grid.type === "hexHorizontal") {
    const cubeX = ((2 / 3) * x) / cellSize.radius;
    const cubeZ = (-(1 / 3) * x + (SQRT_3 / 3) * y) / cellSize.radius;
    const cube = new Vector3(cubeX, -cubeX - cubeZ, cubeZ);
    return hexCubeToOffset(Vector3.cubeRound(cube), "hexHorizontal");
  }

  return unsupportedGridType();
}

/** The four (square) or six (hex) corners of the cell centered at `x, y` */
export function getCellCorners(
  grid: Grid,
  x: number,
  y: number,
  cellSize: Size
): Vector2[] {
  const center = new Vector2(x, y);

  if (grid.type === "square") {
    const half = Vector2.multiply(cellSize, 0.5);
    return [
      Vector2.add(center, Vector2.multiply(half, { x: -1, y: -1 })),
      Vector2.add(center, Vector2.multiply(half, { x: 1, y: -1 })),
      Vector2.add(center, Vector2.multiply(half, { x: 1, y: 1 })),
      Vector2.add(center, Vector2.multiply(half, { x: -1, y: 1 })),
    ];
  }

  if (grid.type === "hexVertical") {
    const topCorner = Vector2.subtract(center, { x: 0, y: cellSize.radius });
    return [0, 60, 120, 180, 240, 300].map((angle) =>
      Vector2.rotate(topCorner, center, angle)
    );
  }

  if (grid.type === "hexHorizontal") {
    const rightCorner = Vector2.add(center, { x: cellSize.radius, y: 0 });
    return [0, 60, 120, 180, 240, 300].map((angle) =>
      Vector2.rotate(rightCorner, center, angle)
    );
  }

  return unsupportedGridType();
}

/** Height a grid would need, in pixels, to keep its cells regular at `gridWidth` */
function getGridHeightFromWidth(
  grid: Pick<Grid, "type" | "size">,
  gridWidth: number
): number {
  if (grid.type === "square") {
    return (grid.size.y * gridWidth) / grid.size.x;
  }

  if (grid.type === "hexVertical") {
    const cellHeight = ((gridWidth / grid.size.x / SQRT_3) * 2);
    return grid.size.y * cellHeight * (3 / 4) + cellHeight * (1 / 4);
  }

  if (grid.type === "hexHorizontal") {
    const cellHeight = gridWidth / ((grid.size.x - 1) * (3 / 4) + 1);
    return grid.size.y * cellHeight * (SQRT_3 / 2);
  }

  return unsupportedGridType();
}

/** Inset that spans the full map width with a height that keeps cells regular */
export function getGridDefaultInset(
  grid: Pick<Grid, "type" | "size">,
  mapWidth: number,
  mapHeight: number
): GridInset {
  const heightNormalized = getGridHeightFromWidth(grid, mapWidth) / mapHeight;
  return {
    topLeft: { x: 0, y: 0 },
    bottomRight: { x: 1, y: heightNormalized },
  };
}

/** Recomputes an existing inset's height after its grid size changed */
export function getGridUpdatedInset(
  grid: Grid,
  mapWidth: number,
  mapHeight: number
): GridInset {
  const inset: GridInset = {
    topLeft: { ...grid.inset.topLeft },
    bottomRight: { ...grid.inset.bottomRight },
  };

  if (grid.size.x > 0 && grid.size.x > 0) {
    const widthPixels = (inset.bottomRight.x - inset.topLeft.x) * mapWidth;
    const heightNormalized =
      getGridHeightFromWidth(grid, widthPixels) / mapHeight;
    inset.bottomRight.y = inset.topLeft.y + heightNormalized;
  }

  return inset;
}

const DEFAULT_MAX_ZOOM = 10;
const MIN_MAX_ZOOM = 5;

/** Furthest a map can be zoomed in, scaled off of how fine the grid is */
export function getGridMaxZoom(grid?: Grid): number {
  if (!grid) {
    return DEFAULT_MAX_ZOOM;
  }
  return Math.max(Math.max(grid.size.x, grid.size.y) / 2, MIN_MAX_ZOOM);
}

/** Cube-coordinate hex cell converted into offset (column/row) coordinates */
export function hexCubeToOffset(
  cube: Vector3,
  type: "hexVertical" | "hexHorizontal"
): Vector2 {
  if (type === "hexVertical") {
    return new Vector2(cube.x + (cube.z + (cube.z & 1)) / 2, cube.z);
  }
  return new Vector2(cube.x, cube.z + (cube.x + (cube.x & 1)) / 2);
}

/** Inverse of {@link hexCubeToOffset} */
export function hexOffsetToCube(
  offset: Vector2,
  type: "hexVertical" | "hexHorizontal"
) {
  if (type === "hexVertical") {
    const x = offset.x - (offset.y + (offset.y & 1)) / 2;
    const z = offset.y;
    return { x, y: -x - z, z };
  }
  const x = offset.x;
  const z = offset.y - (offset.x + (offset.x & 1)) / 2;
  return { x, y: -x - z, z };
}

/** Distance between two points on the grid, in the grid's own measurement type */
export function gridDistance(
  grid: Grid,
  a: Vector2,
  b: Vector2,
  cellSize: Size
): number {
  const cellA = getNearestCellCoordinates(grid, a.x, a.y, cellSize);
  const cellB = getNearestCellCoordinates(grid, b.x, b.y, cellSize);

  if (grid.type === "square") {
    switch (grid.measurement.type) {
      case "chebyshev":
        return Vector2.componentMax(
          Vector2.abs(Vector2.subtract(cellA, cellB))
        );
      case "alternating": {
        // Alternating diagonal distance, as used by D&D 3.5e/Pathfinder:
        // every other diagonal step counts as 2 squares instead of 1.
        const delta = Vector2.abs(Vector2.subtract(cellA, cellB));
        const longest = Vector2.componentMax(delta);
        const shortest = Vector2.componentMin(delta);
        return longest + Math.floor(0.5 * shortest);
      }
      case "euclidean":
        return Vector2.magnitude(Vector2.divide(Vector2.subtract(a, b), cellSize));
      case "manhattan":
        return Math.abs(cellA.x - cellB.x) + Math.abs(cellA.y - cellB.y);
    }
  } else {
    switch (grid.measurement.type) {
      case "manhattan": {
        const cubeA = hexOffsetToCube(cellA, grid.type);
        const cubeB = hexOffsetToCube(cellB, grid.type);
        return (
          (Math.abs(cubeA.x - cubeB.x) +
            Math.abs(cubeA.y - cubeB.y) +
            Math.abs(cubeA.z - cubeB.z)) /
          2
        );
      }
      case "euclidean":
        return Vector2.magnitude(Vector2.divide(Vector2.subtract(a, b), cellSize));
    }
  }

  return 0;
}

/** Parses a scale string like `"5ft"` or `"1.5m"` into its parts */
export function parseGridScale(scale: string | null): GridScale {
  const fallback: GridScale = { multiplier: 1, unit: "", digits: 0 };
  if (typeof scale !== "string") {
    return fallback;
  }

  const match = scale.match(/(\d*)(\.\d*)?([a-zA-Z]*)/);
  if (!match) {
    return fallback;
  }

  const integer = parseFloat(match[1]);
  const fractional = parseFloat(match[2]);
  const unit = match[3] || "";

  if (!isNaN(integer) && !isNaN(fractional)) {
    return {
      multiplier: integer + fractional,
      unit,
      digits: match[2].length - 1,
    };
  }
  if (!isNaN(integer)) {
    return { multiplier: integer, unit, digits: 0 };
  }
  return fallback;
}

// The vast majority of real battle-map grids fall in this cell-count range.
const MIN_GRID_SIZE = 10;
const MAX_GRID_SIZE = 200;

/** Default grid used when a map's own grid cannot be determined */
export const DEFAULT_GRID_SIZE: Vector2 = { x: 22, y: 22 };

/** Whether a candidate `x` by `y` cell count is a plausible grid size */
export function gridSizeVaild(x: number, y: number): boolean {
  return (
    x > MIN_GRID_SIZE &&
    y > MIN_GRID_SIZE &&
    x < MAX_GRID_SIZE &&
    y < MAX_GRID_SIZE
  );
}

/** Rasterizes an image so its pixels can be measured */
function getImageData(image: HTMLImageElement): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Grid size of a map image, read from the lattice actually drawn in its pixels.
 *
 * Returns `null` when the image has no detectable grid rather than guessing:
 * many battle maps genuinely have none, and a confident wrong number is worse
 * than no suggestion. Callers decide what to fall back to.
 *
 * See `gridDetection.ts` for the algorithm and for why the previous
 * CNN-plus-nearest-divisor approach reported multiples of the real cell size.
 */
export function getGridDetectionFromImage(image: HTMLImageElement): GridDetection | null {
  const imageData = getImageData(image);
  if (!imageData) {
    return null;
  }

  const detection = detectGrid(imageData.data, imageData.width, imageData.height);
  return detection && gridSizeVaild(detection.size.x, detection.size.y) ? detection : null;
}

/**
 * Converts detected pixel pitch and phase to the editable grid rectangle. The
 * grid may begin just outside the image: that preserves a partial edge cell
 * instead of silently shifting every visible line to image coordinate zero.
 */
export function getGridDetectionInset(
  detection: Pick<GridDetection, "pitch" | "phase" | "size">,
  mapWidth: number,
  mapHeight: number
): GridInset {
  const origin = (phase: number, length: number, cells: number) => {
    const centered = (length - cells * detection.pitch) / 2;
    return phase + Math.round((centered - phase) / detection.pitch) * detection.pitch;
  };
  const x = origin(detection.phase.x, mapWidth, detection.size.x);
  const y = origin(detection.phase.y, mapHeight, detection.size.y);
  return {
    topLeft: { x: x / mapWidth, y: y / mapHeight },
    bottomRight: {
      x: (x + detection.size.x * detection.pitch) / mapWidth,
      y: (y + detection.size.y * detection.pitch) / mapHeight,
    },
  };
}

export function getGridSizeFromImage(image: HTMLImageElement): Vector2 | null {
  return getGridDetectionFromImage(image)?.size ?? null;
}