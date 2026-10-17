import type Vector2 from "../../helpers/Vector2";
import type { GridScale } from "../../types/Grid";

const maximumLabelCells = 3;
const sourceFontSize = 144;
const smallestCandidate = 6;

type Point = Pick<Vector2, "x" | "y">;

type LabelScaleInput = {
  height: number;
  tokenSize: number;
  setting: number;
  availableWidth: number;
  horizontalPadding: number;
  measure: (fontSize: number) => number;
};

export function labelBoxPadding(height: number, tokenSize: number) {
  const effectiveSize = Math.min(tokenSize, maximumLabelCells);
  return {
    x: (height * effectiveSize) / (8 * tokenSize),
    y: (height * effectiveSize) / (12 * tokenSize),
  };
}

export function labelFontScale({
  height,
  tokenSize,
  setting,
  availableWidth,
  horizontalPadding,
  measure,
}: LabelScaleInput) {
  const visibleCells = Math.min(tokenSize, maximumLabelCells);
  let chosenFontSize = 1;

  for (let candidate = Math.floor(16 * setting); candidate >= smallestCandidate; candidate -= 1) {
    const sourceSize = (height * visibleCells * setting) / (candidate * tokenSize);
    if (measure(sourceSize) + horizontalPadding * 2 >= availableWidth) {
      break;
    }
    chosenFontSize = sourceSize;
  }

  return chosenFontSize / sourceFontSize;
}

export function formatRulerReadout(length: number, scale: GridScale) {
  const count = Math.round(length);
  const squareWord = count === 1 ? "quadrado" : "quadrados";
  const distance = (length * scale.multiplier).toFixed(scale.digits);
  return `${count} ${squareWord} (${distance}${scale.unit})`;
}

export function attachmentHandleLayout(tokenHeight: number, radius: number) {
  const width = radius / 3;
  const height = radius / 8;
  return {
    hitbox: {
      x: -width,
      y: tokenHeight / 2 - height,
      width: width * 2,
      height: height * 2,
    },
    grip: {
      x: -width / 2,
      y: tokenHeight / 2 - height / 2,
      width,
      height,
    },
  };
}

function perpendicularUnit(from: Point, to: Point) {
  const deltaX = from.x - to.x;
  const deltaY = from.y - to.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: -deltaY / length, y: deltaX / length };
}

/** Produces the closed ribbon outline used to paint a fading laser trail. */
export function trailPolygon(points: Point[], diameter: number): Point[] {
  if (points.length === 0) {
    return [];
  }
  if (points.length === 1) {
    return [points[0], points[0]];
  }

  const left: Point[] = [points[0]];
  const right: Point[] = [];
  const lastIndex = points.length - 1;

  for (let index = 1; index <= lastIndex; index += 1) {
    const unit = perpendicularUnit(points[index - 1], points[index]);
    const radius = (diameter * index) / (2 * points.length);
    left.push({ x: points[index].x + unit.x * radius, y: points[index].y + unit.y * radius });
    right.push({ x: points[index].x - unit.x * radius, y: points[index].y - unit.y * radius });
  }

  return [...left, ...right.reverse(), points[0]];
}
