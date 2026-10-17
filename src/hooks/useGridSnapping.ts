import Vector2 from "../helpers/Vector2";
import {
  getCellCorners,
  getCellLocation,
  getNearestCellCoordinates,
} from "../helpers/grid";

import {
  useGrid,
  useGridCellPixelOffset,
  useGridCellPixelSize,
  useGridOffset,
  useGridSnappingSensitivity,
} from "../contexts/GridContext";

type GridSnapGeometry = {
  grid: ReturnType<typeof useGrid>;
  gridOffset: ReturnType<typeof useGridOffset>;
  gridCellPixelSize: ReturnType<typeof useGridCellPixelSize>;
  gridCellPixelOffset: ReturnType<typeof useGridCellPixelOffset>;
};

function toGridLocalSpace(position: Vector2, geometry: GridSnapGeometry) {
  // Work in grid-local space: undo the grid's own offset from the map
  // and the hex-center-to-top-left correction before comparing against
  // cell geometry, then reapply both to whatever snap point is chosen.
  return Vector2.subtract(
    Vector2.subtract(position, geometry.gridOffset),
    geometry.gridCellPixelOffset
  );
}

function fromGridLocalSpace(point: Vector2, geometry: GridSnapGeometry) {
  return Vector2.add(
    Vector2.add(point, geometry.gridOffset),
    geometry.gridCellPixelOffset
  );
}

function nearestCellCenter(localPosition: Vector2, geometry: GridSnapGeometry) {
  const nearestCell = getNearestCellCoordinates(
    geometry.grid,
    localPosition.x,
    localPosition.y,
    geometry.gridCellPixelSize
  );
  return getCellLocation(
    geometry.grid,
    nearestCell.x,
    nearestCell.y,
    geometry.gridCellPixelSize
  );
}

function candidateSnapPoints(
  cellCenter: Vector2,
  geometry: GridSnapGeometry,
  useCorners: boolean
): Vector2[] {
  if (!useCorners) {
    return [cellCenter];
  }
  return [
    cellCenter,
    ...getCellCorners(
      geometry.grid,
      cellCenter.x,
      cellCenter.y,
      geometry.gridCellPixelSize
    ),
  ];
}

function closestWithinThreshold(
  localPosition: Vector2,
  candidates: Vector2[],
  threshold: number
): Vector2 | null {
  for (const candidate of candidates) {
    if (Vector2.distance(localPosition, candidate) < threshold) {
      return candidate;
    }
  }
  return null;
}

function resolveSensitivity(
  requested: number | undefined,
  userSensitivity: number
) {
  const snappingDisabled = userSensitivity === -1;
  return snappingDisabled ? 0 : requested ?? userSensitivity;
}

/**
 * Builds a function that snaps a pixel position to the nearest grid cell
 * center or corner, within a sensitivity radius.
 * @param snappingSensitivity 1 = always snap, 0 = never snap; defaults to
 * the user's own setting when omitted.
 * @param useCorners also snap to cell corners, not just centers
 */
function useGridSnapping(
  snappingSensitivity: number | undefined = undefined,
  useCorners: boolean = true
) {
  const sensitivity = resolveSensitivity(
    snappingSensitivity,
    useGridSnappingSensitivity()
  );

  const geometry: GridSnapGeometry = {
    grid: useGrid(),
    gridOffset: useGridOffset(),
    gridCellPixelSize: useGridCellPixelSize(),
    gridCellPixelOffset: useGridCellPixelOffset(),
  };

  function snapPositionToGrid(position: Vector2) {
    const localPosition = toGridLocalSpace(position, geometry);
    const cellCenter = nearestCellCenter(localPosition, geometry);
    const candidates = candidateSnapPoints(cellCenter, geometry, useCorners);
    const threshold =
      Vector2.componentMin(geometry.gridCellPixelSize) * sensitivity;

    const snapped = closestWithinThreshold(localPosition, candidates, threshold);
    return snapped ? fromGridLocalSpace(snapped, geometry) : position;
  }

  return snapPositionToGrid;
}

export default useGridSnapping;
