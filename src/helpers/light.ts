import { TokenLight, defaultTokenLight } from "../types/TokenState";
import { MapDarkness, defaultMapDarkness } from "../types/MapState";

/**
 * Pure geometry/normalization for the darkness + token light
 * feature. No React, no Konva, no Dexie: everything here is a function of
 * stored values plus the grid's current pixel size, so the whole rule set
 * is unit-testable (the same "compute on read, store only the choices"
 * discipline used for the 5e sheet).
 */

/** Smallest cone aperture that still reads as a cone rather than a line. */
export const minLightAngle = 5;
/** A full circle expressed as a cone — the editor caps here instead of
 * letting a "cone" quietly become a circle at 361°. */
export const maxLightAngle = 360;
/** Radius bounds in grid cells. 0 is legal (a light switched on but
 * configured with no reach, which simply never lights anything per
 * isLightActive below); the upper bound keeps the input usable and a
 * stray 10000 from painting the whole map. */
export const minLightRadius = 0;
export const maxLightRadius = 60;

/**
 * Fills in anything missing/invalid on a stored light so every consumer
 * reads a complete, sane value. Clamping happens HERE (on read) rather
 * than on write.
 *
 * `dimRadius`/penumbra was removed at the user's request
 * — a light is now a hard-edged circle/cone at `radius`, nothing softer.
 */
export function normalizeTokenLight(light?: TokenLight): TokenLight {
  const merged = { ...defaultTokenLight, ...(light ?? {}) };
  const radius = clamp(
    numberOr(merged.radius, defaultTokenLight.radius),
    minLightRadius,
    maxLightRadius
  );
  return {
    radius,
    shape: merged.shape === "cone" ? "cone" : "circle",
    angle: clamp(
      numberOr(merged.angle, defaultTokenLight.angle),
      minLightAngle,
      maxLightAngle
    ),
    enabled: merged.enabled !== false,
  };
}

/** Same treatment for a map's darkness settings.
 *
 * `opacity` ausente conta como 1 (escuridão total) e é clampada em 0..1;
 * `occlusion` ausente conta como ligada. Ver os comentários em
 * types/MapState.ts — os dois defaults são escolhidos para que qualquer
 * mapState escrito antes de o campo existir leia como o comportamento
 * atual, sem migração em upgrade.ts.
 */
export function normalizeMapDarkness(darkness?: MapDarkness): MapDarkness {
  const merged = { ...defaultMapDarkness, ...(darkness ?? {}) };
  return {
    enabled: merged.enabled === true,
    opacity: clamp(numberOr(merged.opacity, 1), 0, 1),
    occlusion: merged.occlusion !== false,
  };
}

/** True when this light should actually paint anything. */
export function isLightActive(light?: TokenLight): boolean {
  if (!light) {
    return false;
  }
  const normalized = normalizeTokenLight(light);
  return normalized.enabled && normalized.radius > 0;
}

/**
 * Converts a light's cell radius into a pixel radius on the current map.
 *
 * `cellSize` is the min of the grid cell's width/height — the same
 * reduction Token.tsx already uses to size a token, so a light of radius
 * 1 on a non-square grid matches the token sitting in the cell rather
 * than stretching with the grid's aspect ratio.
 */
export function lightPixelRadius(light: TokenLight, cellSize: number): number {
  return normalizeTokenLight(light).radius * cellSize;
}

/**
 * The Konva.Wedge rotation that aims a cone at the token's facing.
 *
 * Konva's Wedge is drawn centred on its own `rotation`, sweeping
 * clockwise from it by `angle`, with 0° pointing RIGHT (+x). The token's
 * own `rotation` convention in this codebase is 0 = the art's neutral
 * pose facing DOWN the screen (see Token.tsx's handleDragMove, which
 * derives the drag-facing angle as atan2(-dx, dy) for exactly this
 * reason). So aiming the wedge means rotating from "right" to "down"
 * (+90°), adding the token's own rotation, then backing off half the
 * aperture so the cone is centred on the facing direction instead of
 * starting at it.
 */
export function coneRotation(tokenRotation: number, angle: number): number {
  return tokenRotation + 90 - angle / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}
