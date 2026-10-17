/**
 * The shape used to draw a token's selection/hover outline on the Konva
 * canvas (see `components/konva/TokenOutline.tsx`), derived once per
 * token image from `helpers/image.ts` and stored alongside the token so
 * it never needs to be recomputed on every render.
 */
type BaseOutline = { type: "circle" | "rect" | "path" };
export type CircleOutline = BaseOutline & {
  radius: number,
  y: number,
  x: number,
  type: "circle",
};
export type RectOutline = BaseOutline & {
  height: number,
  width: number,
  y: number,
  x: number,
  type: "rect",
};
export type PathOutline = BaseOutline & {
  // Flat alternating [x0, y0, x1, y1, ...] array — the same encoding
  // Konva.Line/Path expect, so an outline can be handed straight to
  // `points`/`data` without a conversion step at render time.
  points: number[],
  type: "path",
};
export type Outline = PathOutline | RectOutline | CircleOutline;
