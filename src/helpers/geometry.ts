import simplify from "simplify-js";

import Vector2 from "./Vector2";
import { toDegrees } from "./shared";
import {
  CircleData,
  PointsData,
  RectData,
  ShapeData,
  ShapeType,
} from "../types/Geometry";

export function getDefaultShapeData(type: ShapeType, anchor: Vector2): ShapeData {
  switch (type) {
    case "line":
      return { points: [{ ...anchor }, { ...anchor }] };
    case "circle":
      return { x: anchor.x, y: anchor.y, radius: 0 };
    case "rectangle":
      return { x: anchor.x, y: anchor.y, width: 0, height: 0 };
    case "triangle":
      return { points: [{ ...anchor }, { ...anchor }, { ...anchor }] };
  }
}

export function getGridCellRatio(cellSize: Vector2): Vector2 {
  if (cellSize.x === cellSize.y) return { x: 1, y: 1 };
  return cellSize.x < cellSize.y
    ? { x: cellSize.y / cellSize.x, y: 1 }
    : { x: 1, y: cellSize.x / cellSize.y };
}

export function getUpdatedShapeData(
  type: ShapeType,
  data: ShapeData,
  pointer: Vector2,
  gridCellNormalizedSize: Vector2,
  mapWidth: number,
  mapHeight: number
): ShapeData {
  if (type === "line") {
    const { points } = data as PointsData;
    return { points: [points[0], { ...pointer }] };
  }
  if (type === "circle") {
    const circle = data as CircleData;
    const delta = Vector2.multiply(
      Vector2.subtract(pointer, { x: circle.x, y: circle.y }),
      getGridCellRatio(gridCellNormalizedSize)
    );
    return { ...circle, radius: Vector2.magnitude(delta) };
  }
  if (type === "rectangle") {
    const rect = data as RectData;
    const delta = Vector2.subtract(pointer, { x: rect.x, y: rect.y });
    return { ...rect, width: delta.x, height: delta.y };
  }

  if (type !== "triangle") {
    throw new Error("Shape type not implemented");
  }

  const { points } = data as PointsData;
  const mapSize = { x: mapWidth, y: mapHeight };
  const apexPixel = Vector2.multiply(points[0], mapSize);
  const pointerPixel = Vector2.multiply(pointer, mapSize);
  const toPointer = Vector2.subtract(pointerPixel, apexPixel);
  const dragLength = Vector2.magnitude(toPointer);
  const dragDirection = Vector2.normalize(toPointer);
  const halfAngle = Math.atan(dragLength / 2 / (dragLength || 1));
  const baseCornerDistance = dragLength / Math.cos(halfAngle);
  const leftDirection = Vector2.rotateDirection(dragDirection, toDegrees(halfAngle));
  const rightDirection = Vector2.rotateDirection(dragDirection, -toDegrees(halfAngle));
  const leftCorner = Vector2.add(
    points[0],
    Vector2.divide(Vector2.multiply(leftDirection, baseCornerDistance), mapSize)
  );
  const rightCorner = Vector2.add(
    points[0],
    Vector2.divide(Vector2.multiply(rightDirection, baseCornerDistance), mapSize)
  );
  return { points: [points[0], leftCorner, rightCorner] };
}

export function simplifyPoints(points: Vector2[], tolerance: number): Vector2[] {
  return simplify(points, tolerance);
}
