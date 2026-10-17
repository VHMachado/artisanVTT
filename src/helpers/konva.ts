import Konva from "konva";
import Vector2 from "./Vector2";

/**
 * Position of the pointer in a Konva node's own (untransformed) coordinate
 * space, rather than the stage's screen space.
 */
export function getRelativePointerPosition(
  node: Konva.Node
): Vector2 | undefined {
  const pointer = node.getStage()?.getPointerPosition();
  if (!pointer) {
    return undefined;
  }
  const inverse = node.getAbsoluteTransform().copy().invert();
  return inverse.point(pointer);
}

/**
 * Same as {@link getRelativePointerPosition} but divided by the node's
 * width/height so both axes fall in the 0-1 range.
 */
export function getRelativePointerPositionNormalized(
  node: Konva.Node
): Vector2 | undefined {
  const position = getRelativePointerPosition(node);
  if (!position) {
    return undefined;
  }
  const width = node.width();
  const height = node.height();
  return { x: position.x / width, y: position.y / height };
}

/** Unpacks a flat `[x0, y0, x1, y1, ...]` array into `Vector2` pairs */
export function convertNumbersToPoints(numbers: number[]): Vector2[] {
  const points: Vector2[] = [];
  for (let i = 0; i < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return points;
}

/** Inverse of {@link convertNumbersToPoints}, as Konva line props expect */
export function convertPointsToNumbers(points: Vector2[]): number[] {
  const numbers: number[] = [];
  for (const point of points) {
    numbers.push(point.x, point.y);
  }
  return numbers;
}

/**
 * Scales every point and flattens the result, the shape Konva's `points`
 * prop wants for lines, polygons and the like.
 */
export function scaleAndFlattenPoints(
  points: Vector2[],
  scale: Vector2
): number[] {
  return convertPointsToNumbers(
    points.map((point) => Vector2.multiply(point, scale))
  );
}
