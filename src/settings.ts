import Settings from "./helpers/Settings";

/**
 * Per-device UI preferences (types/Settings.ts), versioned the same way
 * as the database (upgrade.ts) but stored in localStorage instead of
 * IndexedDB — cheap enough to overwrite the whole blob on every step, no
 * Dexie transaction needed. Each entry below only runs once: the first
 * time a stored blob's version is below that step's number (see
 * `Settings.version()` in helpers/Settings.ts).
 *
 * Kept as a plain array walked in a loop, rather than one editor-visible
 * `settings.version(n, fn)` statement per step, so the migration HISTORY
 * (what shipped, in what order) reads as data instead of as a long run of
 * near-identical call expressions.
 */
type SettingsBlob = any;
type Migration = { step: number; upgrade: (prev: SettingsBlob) => SettingsBlob };

const migrations: Migration[] = [
  {
    step: 1,
    upgrade: () => ({
      fog: {
        type: "polygon",
        useEdgeSnapping: false,
        useFogCut: false,
        preview: false,
      },
      drawing: { color: "red", type: "brush", useBlending: true },
      measure: { type: "chebyshev", scale: "1.5m" },
      timer: { hour: 0, minute: 0, second: 0 },
      dice: { shareDice: false, style: "galaxy" },
    }),
  },
  {
    // Full screen toggle and label size for the map view.
    step: 2,
    upgrade: (prev) => ({ ...prev, map: { fullScreen: false, labelSize: 1 } }),
  },
  {
    // Optional password protection for a hosted game.
    step: 3,
    upgrade: (prev) => ({ ...prev, game: { usePassword: true } }),
  },
  {
    // Pointer color and grid-snap sensitivity replace the old free-form
    // measure block.
    step: 4,
    upgrade: (prev) => {
      const next = {
        ...prev,
        pointer: { color: "red" },
        map: { ...prev.map, gridSnappingSensitivity: 0.2 },
      };
      delete next.measure;
      return next;
    },
  },
  {
    // Multilayer fog dropped per-edge snapping in favor of a single toggle.
    step: 5,
    upgrade: (prev) => {
      const next = { ...prev };
      delete next.fog.useEdgeSnapping;
      next.fog.multilayer = false;
      return next;
    },
  },
  {
    step: 6,
    upgrade: (prev) => ({ ...prev, fog: { ...prev.fog, showGuides: true } }),
  },
  {
    step: 7,
    upgrade: (prev) => ({ ...prev, fog: { ...prev.fog, editOpacity: 0.5 } }),
  },
  {
    step: 8,
    upgrade: (prev) => ({ ...prev, select: { type: "rectangle" } }),
  },
  {
    step: 9,
    upgrade: (prev) => ({
      ...prev,
      drawing: { ...prev.drawing, useShapeFill: true },
    }),
  },
  {
    // A follow-up — Party sidebar and token bar both
    // became user-resizable, so both need a persisted starting width.
    step: 10,
    upgrade: (prev) => ({
      ...prev,
      map: { ...prev.map, partyWidth: 220, tokenBarWidth: 96 },
    }),
  },
  {
    // The right panel gained a bestiary tab next to
    // the visual token list. 96px fit a column of 48px token images but
    // truncates every monster name, and the two tabs share one width
    // (RightPanel.tsx), so the default grows with it.
    step: 11,
    upgrade: (prev) => ({
      ...prev,
      map: {
        ...prev.map,
        rightPanelTab: "tokens",
        tokenBarWidth: Math.max(prev.map?.tokenBarWidth ?? 0, 200),
      },
    }),
  },
  {
    // The right-hand Tokens/Monstros panel was removed entirely:
    // "Monstros" moved into the Party sidebar as "NPCs" (per-map roster,
    // components/party/NpcRoster.tsx), and the old visual token list has
    // no replacement. Drop the now-meaningless rightPanelTab/tokenBarWidth
    // keys, add partyTab.
    step: 12,
    upgrade: (prev) => {
      const next = { ...prev, map: { ...prev.map, partyTab: "players" } };
      delete next.map.rightPanelTab;
      delete next.map.tokenBarWidth;
      return next;
    },
  },
  {
    // The countdown timer was removed from the
    // product (unused in practice). `timer` (set up in step 1) goes away
    // along with types/Timer.ts.
    step: 13,
    upgrade: (prev) => {
      const next = { ...prev };
      delete next.timer;
      return next;
    },
  },
  {
    // Per-mouse-button tool
    // assignment, replacing the single tool-selection rail on the right.
    // Default: left click = Move (unchanged behavior), right click = None
    // (the token context menu stays free, as before — see
    // helpers/mouseBindings.ts).
    step: 14,
    upgrade: (prev) => ({
      ...prev,
      map: { ...prev.map, leftButtonTool: "move", rightButtonTool: "none" },
    }),
  },
  {
    // Free-hand drawing left the product entirely;
    // its settings block goes with it.
    step: 15,
    upgrade: (prev) => {
      const next = { ...prev };
      delete next.drawing;
      return next;
    },
  },
];

export function getSettings(): Settings {
  const settings = new Settings("ArtisanSettings");
  for (const migration of migrations) {
    settings.version(migration.step, migration.upgrade);
  }
  return settings;
}
