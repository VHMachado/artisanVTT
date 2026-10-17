import Konva from "konva";

import Vector2 from "./Vector2";

import { Outline } from "../types/Outline";
import { TokenState } from "../types/TokenState";

function mapImageFrom(stage: Konva.Stage) {
  return stage.findOne("#mapImage");
}

function mapElement(): Element | null {
  return document.querySelector(".map");
}

export function clientPositionToMapPosition(
  mapStage: Konva.Stage,
  clientPosition: Vector2,
  checkMapBounds = true
): Vector2 | undefined {
  const mapImage = mapImageFrom(mapStage);
  const map = mapElement();
  if (!map || !mapImage) return undefined;

  const rect = map.getBoundingClientRect();
  const inside =
    clientPosition.x >= rect.left &&
    clientPosition.x <= rect.right &&
    clientPosition.y >= rect.top &&
    clientPosition.y <= rect.bottom;
  if (checkMapBounds && !inside) return undefined;

  const relative = { x: clientPosition.x - rect.left, y: clientPosition.y - rect.top };
  const imagePoint = mapImage.getAbsoluteTransform().copy().invert().point(relative);
  return { x: imagePoint.x / mapImage.width(), y: imagePoint.y / mapImage.height() };
}

export function mapPositionToClientPosition(
  mapStage: Konva.Stage,
  normalizedPosition: Vector2
): Vector2 | undefined {
  const mapImage = mapImageFrom(mapStage);
  const map = mapElement();
  if (!map || !mapImage) return undefined;

  const imagePoint = {
    x: normalizedPosition.x * mapImage.width(),
    y: normalizedPosition.y * mapImage.height(),
  };
  const stagePoint = mapImage.getAbsoluteTransform().point(imagePoint);
  const rect = map.getBoundingClientRect();
  return { x: stagePoint.x + rect.left, y: stagePoint.y + rect.top };
}

export function getScaledOutline(
  tokenState: TokenState,
  tokenWidth: number,
  tokenHeight: number
): Outline {
  const outline = tokenState.outline;
  const scaleX = tokenWidth / tokenState.width;
  const scaleY = tokenHeight / tokenState.height;

  if (outline.type === "rect") {
    return { ...outline, x: outline.x * scaleX, y: outline.y * scaleY, width: outline.width * scaleX, height: outline.height * scaleY };
  }
  if (outline.type === "circle") {
    return { ...outline, x: outline.x * scaleX, y: outline.y * scaleY, radius: outline.radius * scaleX };
  }
  return {
    ...outline,
    points: outline.points.map((value, index) => value * (index % 2 === 0 ? scaleX : scaleY)),
  };
}

function outlinePoints(outline: Outline, position: Vector2, center: Vector2, rotation: number): Vector2[] | undefined {
  if (outline.type === "circle") return undefined;

  const localPoints = outline.type === "rect"
    ? [
        { x: outline.x, y: outline.y },
        { x: outline.x + outline.width, y: outline.y },
        { x: outline.x + outline.width, y: outline.y + outline.height },
        { x: outline.x, y: outline.y + outline.height },
      ]
    : outline.points.reduce<Vector2[]>((points, value, index) => {
        if (index % 2 === 0) points.push({ x: value, y: outline.points[index + 1] });
        return points;
      }, []);

  return localPoints.map((point) => Vector2.rotate(Vector2.add(point, position), center, rotation));
}

export class Intersection {
  points: Vector2[] | undefined;

  constructor(
    readonly outline: Outline,
    readonly position: Vector2,
    readonly center: Vector2,
    readonly rotation: number
  ) {
    this.points = outlinePoints(outline, position, center, rotation);
  }

  intersects(point: Vector2): boolean {
    if (this.points) return Vector2.pointInPolygon(point, this.points);
    return this.outline.type === "circle" && Vector2.distance(this.center, point) < this.outline.radius;
  }
}
