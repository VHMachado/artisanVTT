import * as geometry from "./geometry/vector";

export type { BoundingBox } from "./geometry/vector";

/** A mutable coordinate pair plus the legacy geometry entry points. */
class Vector2 {
  constructor(public x: number, public y: number) {}

  static lengthSquared = geometry.lengthSquared;
  static magnitude = geometry.magnitude;
  static normalize = geometry.normalize;
  static dot = geometry.dot;
  static subtract = geometry.subtract;
  static add = geometry.add;
  static multiply = geometry.multiply;
  static divide = geometry.divide;
  static rotate = geometry.rotateAround;
  static rotateDirection(direction: Vector2, angle: number): Vector2 {
    return geometry.rotateAround(direction, { x: 0, y: 0 }, angle);
  }
  static min = geometry.min;
  static componentMin = geometry.componentMin;
  static max = geometry.max;
  static componentMax = geometry.componentMax;
  static roundTo = geometry.roundTo;
  static floorTo = geometry.floorTo;
  static sign = geometry.sign;
  static abs = geometry.abs;
  static pow = geometry.pow;
  static dot2 = geometry.dot2;
  static clamp = geometry.clamp;
  static distanceToLine = geometry.distanceToLine;
  static distanceToQuadraticBezier = geometry.distanceToQuadraticBezier;
  static getBoundingBox = geometry.getBoundingBox;
  static pointInPolygon = geometry.pointInPolygon;
  static compare = geometry.compare;
  static distance = geometry.distance;
  static lerp = geometry.lerp;
  static pathLength = geometry.pathLength;
  static resample = geometry.resamplePath;
  static rotate90 = geometry.rotate90;
  static centroid = geometry.centroid;
  static rectangular = geometry.rectangular;
  static circular = geometry.circular;
}

export default Vector2;
