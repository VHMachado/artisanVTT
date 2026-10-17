import { Selection } from "../types/Select";
import { RectData } from "../types/Geometry";
import { MapState } from "../types/MapState";
import Vector2 from "./Vector2";

// A selection marquee's hit-test geometry needs a plain point list
// regardless of whether it was drawn as a lasso (already points) or a
// drag rectangle (four corners derived from x/y/width/height, wound
// clockwise from the top-left) — this is that normalization step.
export function getSelectionPoints(selection: Selection): Vector2[] {
  if (selection.type === "path") {
    return selection.data.points;
  }
  const { x, y, width, height } = selection.data;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

// Padding (in normalized map units) around a click-built selection's
// bounding box, purely cosmetic — the marching-ants rectangle just needs
// to visibly enclose the tokens it was built from, not hug them exactly.
const CLICK_SELECTION_PADDING = 0.03;

/**
 * Builds a RectSelection's `data` (x/y/width/height, normalized 0..1)
 * around a set of tokens' current positions — used for a shift+click
 * multi-selection (as opposed to a marquee drag, which already has its
 * own geometry from the brush gesture). The returned box is advisory
 * only: `Selection.tsx`'s drag handler moves each listed item by id, not
 * by clipping to this rectangle, so an approximate box is enough.
 */
export function boundingSelectionForTokens(
  tokenIds: string[],
  mapState: MapState
): RectData {
  const positions = tokenIds
    .map((id) => mapState.tokens[id])
    .filter((token): token is NonNullable<typeof token> => Boolean(token))
    .map((token) => ({ x: token.x, y: token.y }));
  if (positions.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const bounds = Vector2.getBoundingBox(positions);
  return {
    x: bounds.min.x - CLICK_SELECTION_PADDING,
    y: bounds.min.y - CLICK_SELECTION_PADDING,
    width: bounds.width + CLICK_SELECTION_PADDING * 2,
    height: bounds.height + CLICK_SELECTION_PADDING * 2,
  };
}
