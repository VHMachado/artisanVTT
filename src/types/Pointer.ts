import { Color } from "../helpers/colors";
import Vector2 from "../helpers/Vector2";

/** Shared pointer tool configuration (the laser-pointer color picker in the
 * toolbar) — same shape kept by every connected player. */
export type PointerToolSettings = { color: Color };

/** One player's live pointer: broadcast at high frequency over the socket
 * (`player_pointer`), so this stays a flat, cheap-to-serialize shape rather
 * than anything nested. */
export type PointerState = { id: string; position: Vector2; visible: boolean; color: Color };
