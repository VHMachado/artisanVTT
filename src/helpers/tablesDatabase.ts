import Dexie from "dexie";

/**
 * Local mirror of the broker tables (Mesas/Personagens) plus the
 * outbox and sync cursor. Deliberately its own Dexie database, separate
 * from ArtisanDB (database.ts/upgrade.ts) — the Home screen needs to list
 * Mesas before any game is ever opened, same reasoning that put the account
 * session in its own ArtisanAccountDB (helpers/accountSession.ts) instead
 * of extending AccountContext.
 *
 * No numbered upgrade chain here (unlike upgrade.ts's 41 versions): there
 * is no legacy shape to migrate for a database that's brand new.
 */
let db: Dexie | undefined;

export type OutboxEntityType = "table" | "character" | "monster" | "rule_option";

/**
 * One pending write, coalesced by entity id (Dexie `put()` on the primary
 * key overwrites any earlier pending edit for the same entity) — only the
 * most recent edit per entity is
 * ever sent, never one op per keystroke. `baseVersion` is NOT stored here:
 * it's read from the local entity's own `version` field at drain time,
 * which stays pinned at the last-synced value for as long as edits remain
 * unsynced (see helpers/tablesSync.ts).
 */
export type OutboxEntry = {
  id: string;
  entityType: OutboxEntityType;
  /** Only meaningful for "character"/"monster" creates, where the row
   * doesn't exist locally as part of a table's own record — carried
   * separately so the op can be built without re-reading the local row. */
  tableId?: string;
  patch: Record<string, unknown>;
  deleted?: boolean;
  enqueuedAt: number;
};

export function getTablesDatabase(): Dexie {
  if (!db) {
    db = new Dexie("ArtisanTablesDB");
    db.version(1).stores({
      tables: "id",
      tableMembers: "[tableId+accountId], tableId",
      characters: "id, tableId",
      outbox: "id",
      // Out-of-line key/value store for the sync cursor (mirrors
      // accountSession.ts's "session" table pattern).
      syncMeta: "",
    });
    // Per-Mesa homebrew/derived monsters (types/TableMonster.ts).
    // A new numbered version rather than an edit to version(1) — same rule
    // as upgrade.ts's chain — so an existing install gains the table
    // instead of failing to open. Nothing to migrate: the store starts
    // empty and the next sync cycle fills it from the broker's changes log.
    db.version(2).stores({
      monsters: "id, tableId",
    });
    // Per-Mesa homebrew subraces/subclasses
    // (types/HomebrewOption.ts). Indexed by tableId like the others, plus
    // by parentIndex because that's how the sheet reads them — "which
    // options exist for elf?" runs on every render of the subrace picker.
    db.version(3).stores({
      ruleOptions: "id, tableId, parentIndex",
    });
  }
  return db;
}

const CURSOR_KEY = "cursor";

export async function loadSyncCursor(): Promise<number> {
  try {
    const value = await getTablesDatabase().table("syncMeta").get(CURSOR_KEY);
    return typeof value === "number" ? value : 0;
  } catch {
    return 0;
  }
}

export async function storeSyncCursor(cursor: number): Promise<void> {
  try {
    await getTablesDatabase().table("syncMeta").put(cursor, CURSOR_KEY);
  } catch {
    // Storage disabled — same fallback as the rest of the app.
  }
}
