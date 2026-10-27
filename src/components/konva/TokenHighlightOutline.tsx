import Konva from "konva";
import { Rect } from "react-konva";

type TokenHighlightOutlineProps = {
  /** The token's own box, in the rotated transform-root's coordinate
   * space (0..width, 0..height) — the same space TokenOutline and the
   * token image use. */
  width: number;
  height: number;
  color: string;
  strokeWidth: number;
  /** Soft halo behind the border — DESIGN.md "Elevation & Depth" item 3.
   * Omitted for an indicator that should be the border alone; see the
   * comment in Token.tsx that tells selection (no glow) apart from active
   * turn (glow). */
  glowBlur?: number;
  /** Rounds the box's corners instead of the sharp right angles a plain
   * Konva Rect draws by default — the user found the square corners hard
   * to read against round/organic token art (dragon wings, etc).
   * Defaults to a size-proportional radius so it scales with the token
   * instead of looking chunky on a small token or negligible on a huge
   * one; pass an explicit value to override. */
  cornerRadius?: number;
} & Konva.ShapeConfig;

/**
 * The border drawn around a token for the two states that use this visual
 * language: selected (border only) and active turn in combat (border plus
 * glow — see `glowBlur`).
 *
 * Deliberately a PLAIN BOX, identical for every token whatever its art.
 * It used to trace the token's own cut-out shape (circle/rect/path, via
 * `getScaledOutline`, the same geometry TokenOutline.tsx uses for its
 * silhouette), which on a path outline drew a wobbly contour that followed
 * every bump of the artwork. The user asked for "só um quadrado em torno
 * do token, sem esse desenho dinâmico", so the art no longer influences
 * the indicator's shape at all.
 */
function TokenHighlightOutline({
  width,
  height,
  color,
  strokeWidth,
  glowBlur,
  cornerRadius = Math.min(width, height) * 0.08,
  ...shapeProps
}: TokenHighlightOutlineProps) {
  return (
    <Rect
      x={0}
      y={0}
      width={width}
      height={height}
      cornerRadius={cornerRadius}
      stroke={color}
      strokeWidth={strokeWidth}
      fillEnabled={false}
      listening={false}
      {...(glowBlur
        ? {
            shadowColor: color,
            shadowBlur: glowBlur,
            shadowOpacity: 0.85,
            shadowForStrokeEnabled: true,
          }
        : {})}
      {...shapeProps}
    />
  );
}

export default TokenHighlightOutline;
