import { FogToolSettings } from "./Fog";
import { PointerToolSettings } from "./Pointer";
import { SelectToolSettings } from "./Select";
import { MouseButtonToolId } from "../helpers/mouseBindings";

/**
 * Per-device UI preferences (contexts/SettingsContext.tsx -> settings.ts),
 * written to this browser's localStorage. These are NOT game data: unlike
 * everything in database.ts, nothing here syncs between players — two
 * people in the same game can have different fog brush opacity or grid
 * snapping sensitivity.
 */

export interface DiceSettings {
  shareDice: boolean;
  style: string;
}

export interface GameSettings {
  usePassword: boolean;
}

export interface MapSettings {
  fullScreen: boolean;
  labeSize: number;
  gridSnappingSensitivity: number;
  /** Party sidebar width in px, user-resizable (see
   * hooks/useResizableWidth.ts) — the Party
   * roster needs room for portrait + name + owner name without ellipsis. */
  partyWidth: number;
  /** Which tab of the Party sidebar is open: "players" (every account's
   * own roster) or "npcs" (Mestre-only, per-map NPCs — see
   * components/party/NpcRoster.tsx). A Player always sees "players"
   * regardless of this value, since the npcs tab is hidden for them
   * entirely (Party.tsx) — persisted purely so a GM mid-session keeps
   * their tab across reloads. */
  partyTab: "players" | "npcs";
  /** Which tool each mouse button triggers
   * when dragged over the map, replacing the single-tool selector rail.
   * Per-device like the rest of this section (helpers/mouseBindings.ts). */
  leftButtonTool: MouseButtonToolId;
  rightButtonTool: MouseButtonToolId;
}

export type FogSettings = FogToolSettings & {
  editOpacity: number;
  showGuides: boolean;
};
export type PointerSettings = PointerToolSettings;
export type SelectSettings = SelectToolSettings;

export interface Settings {
  dice: DiceSettings;
  fog: FogSettings;
  game: GameSettings;
  map: MapSettings;
  pointer: PointerSettings;
  select: SelectSettings;
}
