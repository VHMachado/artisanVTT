/**
 * One entry of a map's NPCs roster — the Mestre's per-map shortlist built
 * through the Add-NPCs modal (modals/AddNpcModal.tsx), replacing the old
 * Tokens/Monstros right-hand panel's bare drag-from-bestiary flow with an
 * explicit "add N of creature X to THIS map" step.
 *
 * Deliberately local-only (its own IndexedDB table, see upgrade.ts), never
 * synced through the broker: only the Mestre ever sees this roster (the
 * NPCs tab is gated the same way the old RightPanel was), and — like every
 * other map/token record in this app (see CLAUDE.md "Data lives in the
 * browser") — it lives on whichever device is running the game, the same
 * way the `maps`/`tokens`/`states` tables already do.
 */
export type MapNpc = {
  id: string;
  /** The map this entry was added to — one roster per map, so switching
   * maps changes what the NPCs tab shows. */
  mapId: string;
  /** SRD slug (types/Monster.ts's Monster.index) or a per-Mesa
   * TableMonster id (homebrew/derived creature) — the same
   * identifier space MonsterSummary.index already uses, so any existing
   * bestiary lookup (combineMonsterSummaries, loadMonster, …) resolves
   * this without a new kind of id. */
  monsterIndex: string;
  createdAt: number;
};
