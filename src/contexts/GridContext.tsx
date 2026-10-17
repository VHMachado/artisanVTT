import React, { useContext, useEffect, useState } from "react";

import { getCellPixelSize, getGridPixelSize } from "../helpers/grid";
import Size from "../helpers/Size";
import Vector2 from "../helpers/Vector2";

import shortcuts from "../shortcuts";

import { Grid } from "../types/Grid";

import useSetting from "../hooks/useSetting";

import { useBlur, useKeyboard } from "./KeyboardContext";

const DEFAULT_GRID: Grid = {
  size: new Vector2(0, 0),
  inset: { topLeft: new Vector2(0, 0), bottomRight: new Vector2(1, 1) },
  type: "square",
  measurement: { scale: "", type: "euclidean" },
};
const DEFAULT_SIZE = new Size(0, 0);
const DEFAULT_CELL_SIZE = new Size(0, 0, 0);
const DEFAULT_OFFSET = new Vector2(0, 0);

export const GridContext = React.createContext<Grid>(DEFAULT_GRID);
export const GridPixelSizeContext = React.createContext<Size>(DEFAULT_SIZE);
export const GridCellPixelSizeContext =
  React.createContext<Size>(DEFAULT_CELL_SIZE);
export const GridCellNormalizedSizeContext =
  React.createContext<Size>(DEFAULT_CELL_SIZE);
export const GridOffsetContext =
  React.createContext<Vector2>(DEFAULT_OFFSET);
export const GridStrokeWidthContext = React.createContext<number>(0);
export const GridCellPixelOffsetContext =
  React.createContext<Vector2>(DEFAULT_OFFSET);
export const GridSnappingSensitivityContext = React.createContext<number>(0);

// Grid line thickness as a fraction of a cell's smallest dimension
const STROKE_WIDTH_RATIO = 1 / 10;

type GridProviderProps = {
  grid: Grid | null;
  width: number;
  height: number;
  children: React.ReactNode;
};

type DerivedGridMetrics = {
  pixelSize: Size;
  cellPixelSize: Size;
  cellNormalizedSize: Size;
  offset: Vector2;
  strokeWidth: number;
  cellPixelOffset: Vector2;
};

function resolveGrid(inputGrid: Grid | null): Grid {
  const hasDimensions = inputGrid && inputGrid.size.x && inputGrid.size.y;
  return hasDimensions ? (inputGrid as Grid) : DEFAULT_GRID;
}

function isHexGrid(grid: Grid): boolean {
  return grid.type === "hexVertical" || grid.type === "hexHorizontal";
}

function deriveGridMetrics(
  grid: Grid,
  width: number,
  height: number
): DerivedGridMetrics {
  const pixelSize = getGridPixelSize(grid, width, height);
  const cellPixelSize = getCellPixelSize(
    grid,
    pixelSize.width,
    pixelSize.height
  );
  const cellNormalizedSize = new Size(
    cellPixelSize.width / width,
    cellPixelSize.height / height
  );
  const offset = Vector2.multiply(grid.inset.topLeft, { x: width, y: height });
  const strokeWidth =
    Math.min(cellPixelSize.width, cellPixelSize.height) * STROKE_WIDTH_RATIO;

  // Hex cells are addressed from their center; shift them so the grid's
  // own origin stays at the top left like a square grid's does.
  const cellPixelOffset = isHexGrid(grid)
    ? Vector2.multiply(cellPixelSize, 0.5)
    : { x: 0, y: 0 };

  return { pixelSize, cellPixelSize, cellNormalizedSize, offset, strokeWidth, cellPixelOffset };
}

/**
 * Derives every pixel-space measurement consumers need (cell size, offset,
 * stroke width, ...) from a map's raw `Grid` plus the map's rendered
 * width/height, and republishes each as its own context so a component
 * reading one value doesn't re-render on changes to the others.
 */
const GRID_PROVIDER_LAYERS: Array<[React.Context<any>, (metrics: {
  pixelSize: Size;
  cellPixelSize: Size;
  cellNormalizedSize: Size;
  offset: Vector2;
  strokeWidth: number;
  cellPixelOffset: Vector2;
  grid: Grid;
  snappingSensitivity: number;
}) => unknown]> = [
  [GridContext, (m) => m.grid],
  [GridPixelSizeContext, (m) => m.pixelSize],
  [GridCellPixelSizeContext, (m) => m.cellPixelSize],
  [GridCellNormalizedSizeContext, (m) => m.cellNormalizedSize],
  [GridOffsetContext, (m) => m.offset],
  [GridStrokeWidthContext, (m) => m.strokeWidth],
  [GridCellPixelOffsetContext, (m) => m.cellPixelOffset],
  [GridSnappingSensitivityContext, (m) => m.snappingSensitivity],
];

function nestGridProviders(
  layers: typeof GRID_PROVIDER_LAYERS,
  values: Parameters<(typeof GRID_PROVIDER_LAYERS)[number][1]>[0],
  content: React.ReactNode
): React.ReactNode {
  return layers.reduceRight(
    (inner, [Context, pick]) => (
      <Context.Provider value={pick(values)}>{inner}</Context.Provider>
    ),
    content
  );
}

export function GridProvider({
  grid: inputGrid,
  width,
  height,
  children,
}: GridProviderProps) {
  const grid = resolveGrid(inputGrid);

  const [gridPixelSize, setGridPixelSize] = useState(DEFAULT_CELL_SIZE);
  const [gridCellPixelSize, setGridCellPixelSize] =
    useState(DEFAULT_CELL_SIZE);
  const [gridCellNormalizedSize, setGridCellNormalizedSize] =
    useState(DEFAULT_CELL_SIZE);
  const [gridOffset, setGridOffset] = useState(DEFAULT_OFFSET);
  const [gridStrokeWidth, setGridStrokeWidth] = useState(0);
  const [gridCellPixelOffset, setGridCellPixelOffset] =
    useState(DEFAULT_OFFSET);

  useEffect(() => {
    const metrics = deriveGridMetrics(grid, width, height);
    setGridPixelSize(metrics.pixelSize);
    setGridCellPixelSize(metrics.cellPixelSize);
    setGridCellNormalizedSize(metrics.cellNormalizedSize);
    setGridOffset(metrics.offset);
    setGridStrokeWidth(metrics.strokeWidth);
    setGridCellPixelOffset(metrics.cellPixelOffset);
  }, [grid, width, height]);

  const [defaultSnappingSensitivity] =
    useSetting<number>("map.gridSnappingSensitivity");
  const [gridSnappingSensitivity, setGridSnappingSensitivity] = useState(
    defaultSnappingSensitivity
  );
  useEffect(() => {
    const snappingDisabled = gridSnappingSensitivity === -1;
    const stale = gridSnappingSensitivity !== defaultSnappingSensitivity;
    if (!snappingDisabled && stale) {
      setGridSnappingSensitivity(defaultSnappingSensitivity);
    }
  }, [defaultSnappingSensitivity, gridSnappingSensitivity]);

  const restoreDefaultSensitivity = () =>
    setGridSnappingSensitivity(defaultSnappingSensitivity);

  useKeyboard(
    (event: KeyboardEvent) => {
      if (shortcuts.disableSnapping(event)) {
        setGridSnappingSensitivity(-1);
      }
    },
    (event: KeyboardEvent) => {
      if (shortcuts.disableSnapping(event)) {
        restoreDefaultSensitivity();
      }
    }
  );
  useBlur(restoreDefaultSensitivity);

  return (
    <>
      {nestGridProviders(
        GRID_PROVIDER_LAYERS,
        {
          grid,
          pixelSize: gridPixelSize,
          cellPixelSize: gridCellPixelSize,
          cellNormalizedSize: gridCellNormalizedSize,
          offset: gridOffset,
          strokeWidth: gridStrokeWidth,
          cellPixelOffset: gridCellPixelOffset,
          snappingSensitivity: gridSnappingSensitivity,
        },
        children
      )}
    </>
  );
}

function useGridContext<T>(context: React.Context<T>, hookName: string): T {
  const value = useContext(context);
  if (value === undefined) {
    throw new Error(`${hookName} must be used within a GridProvider`);
  }
  return value;
}

export const useGrid = () => useGridContext(GridContext, "useGrid");
export const useGridPixelSize = () =>
  useGridContext(GridPixelSizeContext, "useGridPixelSize");
export const useGridCellPixelSize = () =>
  useGridContext(GridCellPixelSizeContext, "useGridCellPixelSize");
export const useGridCellNormalizedSize = () =>
  useGridContext(GridCellNormalizedSizeContext, "useGridCellNormalizedSize");
export const useGridOffset = () =>
  useGridContext(GridOffsetContext, "useGridOffset");
export const useGridStrokeWidth = () =>
  useGridContext(GridStrokeWidthContext, "useGridStrokeWidth");
export const useGridCellPixelOffset = () =>
  useGridContext(GridCellPixelOffsetContext, "useGridCellPixelOffset");
export const useGridSnappingSensitivity = () =>
  useGridContext(
    GridSnappingSensitivityContext,
    "useGridSnappingSensitivity"
  );
