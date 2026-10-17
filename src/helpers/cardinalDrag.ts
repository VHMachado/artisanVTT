import Vector2 from "./Vector2";

/**
 * Maps a token's latest movement vector to one of its four cardinal-facing
 * rotations. Vertical wins exact diagonal ties, so an upward diagonal drag
 * makes the token face up rather than creating an intermediate angle.
 */
export function cardinalRotationForMovement(
  movement: Vector2
): number | undefined {
  if (movement.x === 0 && movement.y === 0) {
    return undefined;
  }
  if (Math.abs(movement.y) >= Math.abs(movement.x)) {
    return movement.y < 0 ? 180 : 0;
  }
  return movement.x < 0 ? 90 : -90;
}
