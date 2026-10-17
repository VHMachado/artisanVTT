import Vector2 from "../helpers/Vector2";

/** Normalized (0-1) crop of a grid against the map image it sits on */
export interface GridInset {
  /** Normalized top left corner of the grid */
  topLeft: Vector2;
  /** Normalized bottom right corner of the grid */
  bottomRight: Vector2;
}
export type GridMeasurementType = "chebyshev" | "alternating" | "euclidean" | "manhattan";
/** How a distance on the grid is converted into a real-world ruler value */
export interface GridMeasurement {
  type: GridMeasurementType;
  /** Raw scale string as typed by the user, e.g. `"5ft"` */
  scale: string;
}
export type GridType = "square" | "hexVertical" | "hexHorizontal";
export interface Grid {
  type: GridType;
  /** Crop of the grid against the map */
  inset: GridInset;
  /** Column (`x`) and row (`y`) count of the grid */
  size: Vector2;
  measurement: GridMeasurement;
}
/** Parsed form of a `GridMeasurement.scale` string */
export interface GridScale {
  /** Numeric part of the scale, e.g. `5` for `"5ft"` */
  multiplier: number;
  /** Unit suffix of the scale, e.g. `"ft"` for `"5ft"` */
  unit: string;
  /** Number of decimal digits in `multiplier` */
  digits: number;
}
