import {
  floorTo as floorNumber,
  lerp as interpolateNumber,
  roundTo as roundNumber,
  toRadians,
} from "../shared";

export type VectorLike = { x: number; y: number };

export type BoundingBox = {
  min: VectorLike;
  max: VectorLike;
  width: number;
  height: number;
  center: VectorLike;
};

export type DistanceResult = { distance: number; point: VectorLike };

type VectorOperand = VectorLike | number;

type ComponentOperator = (left: number, right: number) => number;

function withComponents(
  source: VectorLike,
  operand: VectorOperand,
  operation: ComponentOperator
): VectorLike {
  const { x: otherX, y: otherY } =
    typeof operand === "number" ? { x: operand, y: operand } : operand;
  return { x: operation(source.x, otherX), y: operation(source.y, otherY) };
}

export function lengthSquared(vector: VectorLike): number {
  return vector.x * vector.x + vector.y * vector.y;
}

export function magnitude(vector: VectorLike): number {
  return Math.sqrt(lengthSquared(vector));
}

export function normalize(vector: VectorLike): VectorLike {
  const length = magnitude(vector);
  return length === 0 ? { x: 0, y: 0 } : divide(vector, length);
}

export function dot(left: VectorLike, right: VectorLike): number {
  return left.x * right.x + left.y * right.y;
}

export function subtract(left: VectorLike, right: VectorOperand): VectorLike {
  return withComponents(left, right, (a, b) => a - b);
}

export function add(left: VectorLike, right: VectorOperand): VectorLike {
  return withComponents(left, right, (a, b) => a + b);
}

export function multiply(left: VectorLike, right: VectorOperand): VectorLike {
  return withComponents(left, right, (a, b) => a * b);
}

export function divide(left: VectorLike, right: VectorOperand): VectorLike {
  return withComponents(left, right, (a, b) => a / b);
}

export function rotateAround(
  point: VectorLike,
  pivot: VectorLike,
  degrees: number
): VectorLike {
  const radians = toRadians(degrees);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const offset = subtract(point, pivot);

  return {
    x: pivot.x + cosine * offset.x - sine * offset.y,
    y: pivot.y + sine * offset.x + cosine * offset.y,
  };
}

export function min(left: VectorLike, right: VectorOperand): VectorLike {
  return withComponents(left, right, Math.min);
}

export function componentMin(vector: VectorLike): number {
  return Math.min(vector.x, vector.y);
}

export function max(left: VectorLike, right: VectorOperand): VectorLike {
  return withComponents(left, right, Math.max);
}

export function componentMax(vector: VectorLike): number {
  return Math.max(vector.x, vector.y);
}

export function roundTo(vector: VectorLike, step: VectorLike): VectorLike {
  return { x: roundNumber(vector.x, step.x), y: roundNumber(vector.y, step.y) };
}

export function floorTo(vector: VectorLike, step: VectorLike): VectorLike {
  return { x: floorNumber(vector.x, step.x), y: floorNumber(vector.y, step.y) };
}

export function sign(vector: VectorLike): VectorLike {
  return { x: Math.sign(vector.x), y: Math.sign(vector.y) };
}

export function abs(vector: VectorLike): VectorLike {
  return { x: Math.abs(vector.x), y: Math.abs(vector.y) };
}

export function pow(left: VectorLike, right: VectorOperand): VectorLike {
  return withComponents(left, right, Math.pow);
}

export function dot2(vector: VectorLike): number {
  return dot(vector, vector);
}

export function clamp(vector: VectorLike, lower: number, upper: number): VectorLike {
  return {
    x: Math.min(Math.max(vector.x, lower), upper),
    y: Math.min(Math.max(vector.y, lower), upper),
  };
}

export function distanceToLine(
  point: VectorLike,
  start: VectorLike,
  end: VectorLike
): DistanceResult {
  const pointFromStart = subtract(point, start);
  const segment = subtract(end, start);
  const denominator = dot(segment, segment);
  const progress = Math.min(Math.max(dot(pointFromStart, segment) / denominator, 0), 1);
  const closest = add(start, multiply(segment, progress));

  return {
    distance: magnitude(subtract(pointFromStart, multiply(segment, progress))),
    point: closest,
  };
}

export function distanceToQuadraticBezier(
  position: VectorLike,
  start: VectorLike,
  control: VectorLike,
  end: VectorLike
): DistanceResult {
  let squaredDistance = 0;
  let closest = { x: position.x, y: position.y };

  const firstDerivative = subtract(control, start);
  const secondDerivative = add(subtract(start, multiply(control, 2)), end);
  const doubledFirstDerivative = multiply(firstDerivative, 2);
  const startToPosition = subtract(start, position);

  const reciprocalSecondDerivativeLength = 1 / dot(secondDerivative, secondDerivative);
  const kx = reciprocalSecondDerivativeLength * dot(firstDerivative, secondDerivative);
  const ky =
    (reciprocalSecondDerivativeLength *
      (2 * dot(firstDerivative, firstDerivative) + dot(startToPosition, secondDerivative))) /
    3;
  const kz = reciprocalSecondDerivativeLength * dot(startToPosition, firstDerivative);

  const p = ky - kx * kx;
  const cubeOfP = p * p * p;
  const q = kx * (2 * kx * kx - 3 * ky) + kz;
  let discriminant = q * q + 4 * cubeOfP;

  if (discriminant >= 0) {
    discriminant = Math.sqrt(discriminant);
    const roots = divide(subtract({ x: discriminant, y: -discriminant }, q), 2);
    const cubeRoots = multiply(sign(roots), pow(abs(roots), 1 / 3));
    const t = Math.min(Math.max(cubeRoots.x + cubeRoots.y - kx, 0), 1);
    const curvePoint = add(start, multiply(add(doubledFirstDerivative, multiply(secondDerivative, t)), t));
    closest = curvePoint;
    squaredDistance = dot2(
      add(startToPosition, multiply(add(doubledFirstDerivative, multiply(secondDerivative, t)), t))
    );
  } else {
    const root = Math.sqrt(-p);
    const angle = Math.acos(q / (p * root * 2)) / 3;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle) * 1.732050808;
    const candidates = clamp(
      subtract(multiply({ x: cosine + cosine, y: -sine - cosine }, root), kx),
      0,
      1
    );
    const firstDistance = dot2(
      add(
        startToPosition,
        multiply(add(doubledFirstDerivative, multiply(secondDerivative, candidates.x)), candidates.x)
      )
    );
    const secondDistance = dot2(
      add(
        startToPosition,
        multiply(add(doubledFirstDerivative, multiply(secondDerivative, candidates.y)), candidates.y)
      )
    );
    squaredDistance = Math.min(firstDistance, secondDistance);
    closest =
      firstDistance < secondDistance
        ? add(
            startToPosition,
            multiply(add(doubledFirstDerivative, multiply(secondDerivative, candidates.x)), candidates.x)
          )
        : add(
            startToPosition,
            multiply(add(doubledFirstDerivative, multiply(secondDerivative, candidates.y)), candidates.y)
          );
  }

  return { distance: Math.sqrt(squaredDistance), point: closest };
}

export function getBoundingBox(points: VectorLike[]): BoundingBox {
  let minX = Number.MAX_VALUE;
  let maxX = Number.MIN_VALUE;
  let minY = Number.MAX_VALUE;
  let maxY = Number.MIN_VALUE;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

export function pointInPolygon(point: VectorLike, vertices: VectorLike[]): boolean {
  const bounds = getBoundingBox(vertices);
  if (
    point.x < bounds.min.x ||
    point.x > bounds.max.x ||
    point.y < bounds.min.y ||
    point.y > bounds.max.y
  ) {
    return false;
  }

  let inside = false;
  for (let index = 0, previous = vertices.length - 1; index < vertices.length; previous = index++) {
    const current = vertices[index];
    const prior = vertices[previous];
    const straddlesRay = (current.y > point.y) !== (prior.y > point.y);
    const intersectionX =
      ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x;

    if (straddlesRay && point.x < intersectionX) {
      inside = !inside;
    }
  }

  return inside;
}

export function compare(left: VectorLike, right: VectorLike, threshold: number): boolean {
  return lengthSquared(subtract(left, right)) < threshold * threshold;
}

export function distance(left: VectorLike, right: VectorLike): number {
  return magnitude(subtract(left, right));
}

export function lerp(left: VectorLike, right: VectorLike, alpha: number): VectorLike {
  return {
    x: interpolateNumber(left.x, right.x, alpha),
    y: interpolateNumber(left.y, right.y, alpha),
  };
}

export function pathLength(points: VectorLike[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }
  return total;
}

export function resamplePath(points: VectorLike[], targetCount: number): VectorLike[] {
  if (points.length === 0 || targetCount <= 0) {
    return [];
  }

  const mutablePoints = [...points];
  const interval = pathLength(mutablePoints) / (targetCount - 1);
  const sampled = [mutablePoints[0]];
  let travelled = 0;

  for (let index = 1; index < mutablePoints.length; index += 1) {
    const segmentLength = distance(mutablePoints[index - 1], mutablePoints[index]);
    if (travelled + segmentLength >= interval) {
      const inserted = lerp(
        mutablePoints[index - 1],
        mutablePoints[index],
        (interval - travelled) / segmentLength
      );
      sampled.push(inserted);
      mutablePoints.splice(index, 0, inserted);
      travelled = 0;
    } else {
      travelled += segmentLength;
    }
  }

  if (sampled.length === targetCount - 1) {
    sampled.push(mutablePoints[mutablePoints.length - 1]);
  }

  return sampled;
}

export function rotate90(
  vector: VectorLike,
  direction: "counterClockwise" | "clockwise" = "clockwise"
): VectorLike {
  return direction === "clockwise"
    ? { x: vector.y, y: -vector.x }
    : { x: -vector.y, y: vector.x };
}

export function centroid(points: VectorLike[]): VectorLike {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  const sum = points.reduce(
    (total, point) => ({ x: total.x + point.x, y: total.y + point.y }),
    { x: 0, y: 0 }
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function rectangular(points: VectorLike[]): boolean {
  if (points.length !== 4) {
    return false;
  }

  const center = centroid(points);
  let previousDistance: number | undefined;
  for (const point of points) {
    const currentDistance = distance(point, center);
    if (previousDistance !== undefined && currentDistance !== previousDistance) {
      return false;
    }
    previousDistance = currentDistance;
  }
  return true;
}

export function circular(points: VectorLike[], threshold = 0.1): boolean {
  if (points.length === 0) {
    return false;
  }

  const center = centroid(points);
  const radii = points.map((point) => distance(point, center));
  return Math.max(...radii) - Math.min(...radii) < threshold;
}
