import { v4 as uuid } from "uuid";

import { AccountSession } from "./account";
import {
  getTablesDatabase,
  loadSyncCursor,
  storeSyncCursor,
  OutboxEntry,
} from "./tablesDatabase";
import {
  fetchChangesSince,
  postSyncOps,
  SyncOp,
  SyncEntityType,
  Change,
} from "./tablesApi";
import { SyncedTable } from "../types/SyncedTable";
import { Character } from "../types/Character";
import { TableMonster } from "../types/TableMonster";
import { RuleOptionKind, TableRuleOption } from "../types/HomebrewOption";

/**
 * Sync engine: local-first writes (write to Dexie + enqueue outbox
 * in the same operation) plus a drain-then-pull cycle run whenever the app
 * reconnects. This file is the implementation of that design, not a new design of its own.
 */

export type SyncNotice =
  | { kind: "conflict"; entityType: SyncEntityType; id: string; name?: string }
  | { kind: "rejected"; entityType: SyncEntityType; id: string; error: string };

function nowMillis(): number {
  return Date.now();
}

// --- Local-first writes -----------------------------------------------

/** Creates a Mesa locally (optimistic) and enqueues its create op. Returns
 * the new table's id immediately — the caller never waits on the network. */
export async function createTableLocally(
  session: AccountSession,
  name: string,
  bannerAssetId?: string
): Promise<string> {
  const id = uuid();
  const now = nowMillis();
  const table: SyncedTable = {
    id,
    name,
    bannerAssetId,
    // Optimistic: the real owner_id is always stamped by the broker,
    // this is just what the local UI shows before the
    // first successful sync — it will always equal the caller's own
    // account here since only the creator can enqueue a create.
    ownerId: session.accountId,
    createdAt: now,
    updatedAt: now,
    version: 0,
    deleted: false,
  };
  const entry: OutboxEntry = {
    id,
    entityType: "table",
    patch: { name, bannerAssetId },
    enqueuedAt: now,
  };
  const db = getTablesDatabase();
  await db.transaction("rw", db.table("tables"), db.table("outbox"), async () => {
    await db.table("tables").put(table);
    await db.table("outbox").put(entry);
  });
  return id;
}

export async function renameTableLocally(
  id: string,
  name: string
): Promise<void> {
  const now = nowMillis();
  const db = getTablesDatabase();
  await db.transaction("rw", db.table("tables"), db.table("outbox"), async () => {
    const current = (await db.table("tables").get(id)) as SyncedTable | undefined;
    if (!current) {
      return;
    }
    await db.table("tables").update(id, { name, updatedAt: now });
    const entry: OutboxEntry = {
      id,
      entityType: "table",
      patch: { name, bannerAssetId: current.bannerAssetId },
      enqueuedAt: now,
    };
    await db.table("outbox").put(entry);
  });
}

export async function deleteTableLocally(id: string): Promise<void> {
  const now = nowMillis();
  const db = getTablesDatabase();
  await db.transaction("rw", db.table("tables"), db.table("outbox"), async () => {
    await db.table("tables").update(id, { deleted: true, updatedAt: now });
    const entry: OutboxEntry = {
      id,
      entityType: "table",
      patch: {},
      deleted: true,
      enqueuedAt: now,
    };
    await db.table("outbox").put(entry);
  });
}

// --- Characters --------------------------------------------------

/** Creates a Personagem locally (optimistic, same discipline as
 * createTableLocally above). `claim` decides whether the creator becomes
 * the owner right away or leaves it unowned/adoptable later ("pode ou não
 * ser atribuído a um Jogador na criação"). Available
 * to the table's GM AND its players — unlike tables, there's no
 * ownership gate on creating a character, only on editing one that
 * belongs to someone else (enforced server-side in applyCharacterOp). */
export async function createCharacterLocally(
  session: AccountSession,
  tableId: string,
  name: string,
  portraitAssetId?: string,
  tokenAssetId?: string,
  claim = true
): Promise<string> {
  const id = uuid();
  const now = nowMillis();
  const ownerAccountId = claim ? session.accountId : null;
  const character: Character = {
    id,
    tableId,
    name,
    portraitAssetId,
    tokenAssetId,
    ownerAccountId,
    sheet: "{}",
    createdAt: now,
    updatedAt: now,
    version: 0,
    deleted: false,
  };
  const patch: Record<string, unknown> = { name, portraitAssetId, tokenAssetId };
  // Only include ownerAccountId in the patch when claiming — an absent key
  // means "no owner" on create (see ops.go's resolveOwnerAccountID), which
  // is exactly the unowned/adoptable-later case.
  if (claim) {
    patch.ownerAccountId = ownerAccountId;
  }
  const entry: OutboxEntry = {
    id,
    entityType: "character",
    tableId,
    patch,
    enqueuedAt: now,
  };
  const db = getTablesDatabase();
  await db.transaction(
    "rw",
    db.table("characters"),
    db.table("outbox"),
    async () => {
      await db.table("characters").put(character);
      await db.table("outbox").put(entry);
    }
  );
  return id;
}

/** Claims a currently-unowned character for the calling account ("personagem
 * sem dono pode ser adotado depois"). A no-op if the
 * local view is already owned by someone — the real race, if two players
 * adopt at once, is resolved server-side by the ordinary version guard
 * (whoever's op lands first wins version N+1; the loser's stale baseVersion
 * comes back as a conflict and is resynced with the winner's canonical
 * row, surfaced as a SyncNotice same as any other conflict). */
export async function adoptCharacterLocally(
  session: AccountSession,
  id: string
): Promise<void> {
  const now = nowMillis();
  const db = getTablesDatabase();
  await db.transaction(
    "rw",
    db.table("characters"),
    db.table("outbox"),
    async () => {
      const current = (await db.table("characters").get(id)) as
        | Character
        | undefined;
      if (!current || current.ownerAccountId !== null) {
        return;
      }
      await db.table("characters").update(id, {
        ownerAccountId: session.accountId,
        updatedAt: now,
      });
      const entry: OutboxEntry = {
        id,
        entityType: "character",
        tableId: current.tableId,
        patch: { ownerAccountId: session.accountId },
        enqueuedAt: now,
      };
      await db.table("outbox").put(entry);
    }
  );
}

/** Edits a Personagem's own fields (name/portrait/token image), same
 * local-first discipline as the rest of this file. Authorization (GM or
 * the character's own owner) is enforced again server-side in
 * applyCharacterOp — this just optimistically applies the edit locally
 * and enqueues it; a rejection surfaces later as a SyncNotice like any
 * other op, same as a stale-version conflict would. */
export async function editCharacterLocally(
  id: string,
  patch: {
    name?: string;
    portraitAssetId?: string;
    tokenAssetId?: string;
    /** The character's serialised CharacterSheet. The broker has carried this
     * column since characters were introduced; the sheet UI is the first thing to write it. */
    sheet?: string;
  }
): Promise<void> {
  const now = nowMillis();
  const db = getTablesDatabase();
  await db.transaction("rw", db.table("characters"), db.table("outbox"), async () => {
    const current = (await db.table("characters").get(id)) as Character | undefined;
    if (!current) {
      return;
    }
    await db.table("characters").update(id, { ...patch, updatedAt: now });
    const entry: OutboxEntry = {
      id,
      entityType: "character",
      tableId: current.tableId,
      patch: {
        name: patch.name ?? current.name,
        portraitAssetId: patch.portraitAssetId ?? current.portraitAssetId,
        tokenAssetId: patch.tokenAssetId ?? current.tokenAssetId,
        sheet: patch.sheet ?? current.sheet,
      },
      enqueuedAt: now,
    };
    await db.table("outbox").put(entry);
  });
}

/** Deletes a Personagem, same local-first + outbox discipline as
 * deleteTableLocally above. */
export async function deleteCharacterLocally(
  id: string,
  tableId: string
): Promise<void> {
  const now = nowMillis();
  const db = getTablesDatabase();
  await db.transaction("rw", db.table("characters"), db.table("outbox"), async () => {
    await db.table("characters").update(id, { deleted: true, updatedAt: now });
    const entry: OutboxEntry = {
      id,
      entityType: "character",
      tableId,
      patch: {},
      deleted: true,
      enqueuedAt: now,
    };
    await db.table("outbox").put(entry);
  });
}

// --- Homebrew / derived monsters ------------------------------

/**
 * Creates a per-Mesa homebrew or derived creature locally (optimistic,
 * same discipline as the helpers above) — creating a monster/NPC
 * from scratch or derived from an existing one.
 *
 * `parentIndex` is the SRD slug it derives from, omitted for one built
 * from scratch; `overrides` is the serialised diff over that parent (see
 * helpers/tableMonsters.ts). Only the Mesa's GM may do this — enforced
 * server-side in applyMonsterOp, mirrored in the UI so a Player never
 * reaches a rejection.
 */
export async function createTableMonsterLocally(
  session: AccountSession,
  tableId: string,
  name: string,
  overrides: string,
  parentIndex?: string,
  portraitAssetId?: string,
  tokenAssetIds?: string[]
): Promise<string> {
  const id = uuid();
  const now = nowMillis();
  const monster: TableMonster = {
    id,
    tableId,
    name,
    parentIndex,
    overrides,
    portraitAssetId,
    tokenAssetIds,
    ownerAccountId: session.accountId,
    createdAt: now,
    updatedAt: now,
    version: 0,
    deleted: false,
  };
  const patch: Record<string, unknown> = {
    name,
    overrides,
    portraitAssetId,
    tokenAssetIds: JSON.stringify(tokenAssetIds ?? []),
  };
  // Absent rather than empty: the broker stores NULL for "no parent", and
  // an explicit "" would be indistinguishable from a parent named "".
  if (parentIndex) {
    patch.parentIndex = parentIndex;
  }
  const entry: OutboxEntry = {
    id,
    entityType: "monster",
    tableId,
    patch,
    enqueuedAt: now,
  };
  const db = getTablesDatabase();
  await db.transaction("rw", db.table("monsters"), db.table("outbox"), async () => {
    await db.table("monsters").put(monster);
    await db.table("outbox").put(entry);
  });
  return id;
}

/** Edits a homebrew creature's name, overrides and/or art. `parentIndex`
 * is deliberately not editable — the broker ignores it in an edit patch,
 * since re-parenting would reinterpret every stored override against a
 * different base stat block (see applyMonsterOp). */
export async function editTableMonsterLocally(
  id: string,
  patch: {
    name?: string;
    overrides?: string;
    portraitAssetId?: string;
    tokenAssetIds?: string[];
  }
): Promise<void> {
  const now = nowMillis();
  const db = getTablesDatabase();
  await db.transaction("rw", db.table("monsters"), db.table("outbox"), async () => {
    const current = (await db.table("monsters").get(id)) as
      | TableMonster
      | undefined;
    if (!current) {
      return;
    }
    await db.table("monsters").update(id, { ...patch, updatedAt: now });
    const tokenAssetIds = patch.tokenAssetIds ?? current.tokenAssetIds;
    const entry: OutboxEntry = {
      id,
      entityType: "monster",
      tableId: current.tableId,
      patch: {
        name: patch.name ?? current.name,
        overrides: patch.overrides ?? current.overrides,
        portraitAssetId: patch.portraitAssetId ?? current.portraitAssetId,
        tokenAssetIds: JSON.stringify(tokenAssetIds ?? []),
      },
      enqueuedAt: now,
    };
    await db.table("outbox").put(entry);
  });
}

export async function deleteTableMonsterLocally(
  id: string,
  tableId: string
): Promise<void> {
  const now = nowMillis();
  const db = getTablesDatabase();
  await db.transaction("rw", db.table("monsters"), db.table("outbox"), async () => {
    await db.table("monsters").update(id, { deleted: true, updatedAt: now });
    const entry: OutboxEntry = {
      id,
      entityType: "monster",
      tableId,
      patch: {},
      deleted: true,
      enqueuedAt: now,
    };
    await db.table("outbox").put(entry);
  });
}

// --- Homebrew subraces / subclasses ---------------------------

/**
 * Creates a per-Mesa homebrew subrace or subclass locally (optimistic,
 * same discipline as the helpers above).
 *
 * Unlike a monster (GM only), ANY member of the Mesa may author one, and
 * the author may edit their own — the broker enforces exactly that in
 * applyRuleOptionOp. `kind` and `parentIndex` are fixed at creation there,
 * so they're write-once here too.
 */
export async function createRuleOptionLocally(
  session: AccountSession,
  tableId: string,
  option: {
    kind: RuleOptionKind;
    name: string;
    parentIndex: string;
    payload: string;
  }
): Promise<string> {
  const id = uuid();
  const now = nowMillis();
  const row: TableRuleOption = {
    id,
    tableId,
    kind: option.kind,
    name: option.name,
    parentIndex: option.parentIndex,
    payload: option.payload,
    ownerAccountId: session.accountId,
    ownerDisplayName: session.displayName,
    createdAt: now,
    updatedAt: now,
    version: 0,
    deleted: false,
  };
  const entry: OutboxEntry = {
    id,
    entityType: "rule_option",
    tableId,
    patch: {
      kind: option.kind,
      name: option.name,
      parentIndex: option.parentIndex,
      payload: option.payload,
    },
    enqueuedAt: now,
  };
  const db = getTablesDatabase();
  await db.transaction(
    "rw",
    db.table("ruleOptions"),
    db.table("outbox"),
    async () => {
      await db.table("ruleOptions").put(row);
      await db.table("outbox").put(entry);
    }
  );
  return id;
}

/** Edits a homebrew option's name and/or payload. `kind` and
 * `parentIndex` are deliberately not editable — the broker ignores them in
 * an edit patch, since every bonus and feature in the payload was written
 * against that parent (see applyRuleOptionOp). */
export async function editRuleOptionLocally(
  id: string,
  patch: { name?: string; payload?: string }
): Promise<void> {
  const now = nowMillis();
  const db = getTablesDatabase();
  await db.transaction(
    "rw",
    db.table("ruleOptions"),
    db.table("outbox"),
    async () => {
      const current = (await db.table("ruleOptions").get(id)) as
        | TableRuleOption
        | undefined;
      if (!current) {
        return;
      }
      await db.table("ruleOptions").update(id, { ...patch, updatedAt: now });
      const entry: OutboxEntry = {
        id,
        entityType: "rule_option",
        tableId: current.tableId,
        patch: {
          name: patch.name ?? current.name,
          payload: patch.payload ?? current.payload,
        },
        enqueuedAt: now,
      };
      await db.table("outbox").put(entry);
    }
  );
}

export async function deleteRuleOptionLocally(
  id: string,
  tableId: string
): Promise<void> {
  const now = nowMillis();
  const db = getTablesDatabase();
  await db.transaction(
    "rw",
    db.table("ruleOptions"),
    db.table("outbox"),
    async () => {
      await db.table("ruleOptions").update(id, { deleted: true, updatedAt: now });
      await db.table("outbox").put({
        id,
        entityType: "rule_option",
        tableId,
        patch: {},
        deleted: true,
        enqueuedAt: now,
      } as OutboxEntry);
    }
  );
}

// --- Applying incoming state --------------------------------------------

function tableFromChangeData(data: any): SyncedTable {
  return {
    id: data.id,
    name: data.name,
    bannerAssetId: data.bannerAssetId || undefined,
    ownerId: data.ownerId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    version: data.version,
    deleted: Boolean(data.deleted),
  };
}

function characterFromChangeData(data: any): Character {
  return {
    id: data.id,
    tableId: data.tableId,
    name: data.name,
    portraitAssetId: data.portraitAssetId || undefined,
    tokenAssetId: data.tokenAssetId || undefined,
    ownerAccountId:
      typeof data.ownerAccountId === "number" ? data.ownerAccountId : null,
    ownerDisplayName: data.ownerDisplayName || undefined,
    sheet: data.sheet ?? "{}",
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    version: data.version,
    deleted: Boolean(data.deleted),
  };
}

function monsterFromChangeData(data: any): TableMonster {
  let tokenAssetIds: string[] | undefined;
  if (typeof data.tokenAssetIds === "string") {
    try {
      const parsed = JSON.parse(data.tokenAssetIds);
      tokenAssetIds = Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined;
    } catch {
      tokenAssetIds = undefined;
    }
  }
  return {
    id: data.id,
    tableId: data.tableId,
    name: data.name,
    parentIndex: data.parentIndex || undefined,
    overrides: data.overrides ?? "{}",
    portraitAssetId: data.portraitAssetId || undefined,
    tokenAssetIds,
    ownerAccountId: data.ownerAccountId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    version: data.version,
    deleted: Boolean(data.deleted),
  };
}

function ruleOptionFromChangeData(data: any): TableRuleOption {
  return {
    id: data.id,
    tableId: data.tableId,
    kind: data.kind,
    name: data.name,
    parentIndex: data.parentIndex,
    payload: data.payload ?? "{}",
    ownerAccountId: data.ownerAccountId,
    ownerDisplayName: data.ownerDisplayName || undefined,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    version: data.version,
    deleted: Boolean(data.deleted),
  };
}

async function applyChange(change: Change): Promise<void> {
  const db = getTablesDatabase();
  if (change.entityType === "table") {
    if (change.deleted) {
      await db.table("tables").update(change.entityId, { deleted: true });
      return;
    }
    if (change.data) {
      await db.table("tables").put(tableFromChangeData(change.data));
    }
  } else if (change.entityType === "character") {
    if (change.deleted) {
      await db.table("characters").update(change.entityId, { deleted: true });
      return;
    }
    if (change.data) {
      await db.table("characters").put(characterFromChangeData(change.data));
    }
  } else if (change.entityType === "monster") {
    if (change.deleted) {
      await db.table("monsters").update(change.entityId, { deleted: true });
      return;
    }
    if (change.data) {
      await db.table("monsters").put(monsterFromChangeData(change.data));
    }
  } else if (change.entityType === "rule_option") {
    if (change.deleted) {
      await db.table("ruleOptions").update(change.entityId, { deleted: true });
      return;
    }
    if (change.data) {
      await db.table("ruleOptions").put(ruleOptionFromChangeData(change.data));
    }
  }
}

// --- The sync cycle -------------------------------------------------------

/** Dexie store name for each syncable entity type — the one place the
 * wire's singular entityType is mapped to a local table, so adding an
 * entity (the "monster" type) can't half-land by updating one branch of
 * a ternary and missing another. */
const storeForEntity: Record<SyncEntityType, string> = {
  table: "tables",
  character: "characters",
  monster: "monsters",
  rule_option: "ruleOptions",
};

/** Builds the wire Op for one outbox entry, reading the entity's CURRENT
 * local version as baseVersion (not a version captured at enqueue time) —
 * the outbox holds "o estado local mais recente dessa
 * entidade", and baseVersion must reflect whatever this client last knew
 * as canonical, which only drifts forward as syncs succeed. */
async function buildOp(entry: OutboxEntry): Promise<SyncOp | undefined> {
  const db = getTablesDatabase();
  if (entry.entityType === "table") {
    const current = (await db.table("tables").get(entry.id)) as
      | SyncedTable
      | undefined;
    if (!current) {
      return undefined;
    }
    return {
      entityType: "table",
      id: entry.id,
      baseVersion: current.version,
      deleted: entry.deleted,
      patch: entry.patch,
    };
  }
  if (entry.entityType === "monster") {
    const current = (await db.table("monsters").get(entry.id)) as
      | TableMonster
      | undefined;
    return {
      entityType: "monster",
      id: entry.id,
      baseVersion: current ? current.version : 0,
      deleted: entry.deleted,
      patch: { ...entry.patch, tableId: entry.tableId ?? current?.tableId },
    };
  }
  if (entry.entityType === "rule_option") {
    const current = (await db.table("ruleOptions").get(entry.id)) as
      | TableRuleOption
      | undefined;
    return {
      entityType: "rule_option",
      id: entry.id,
      baseVersion: current ? current.version : 0,
      deleted: entry.deleted,
      patch: { ...entry.patch, tableId: entry.tableId ?? current?.tableId },
    };
  }
  const current = (await db.table("characters").get(entry.id)) as
    | Character
    | undefined;
  const baseVersion = current ? current.version : 0;
  return {
    entityType: "character",
    id: entry.id,
    baseVersion,
    deleted: entry.deleted,
    patch: { ...entry.patch, tableId: entry.tableId ?? current?.tableId },
  };
}

/** Writes a canonical row pushed back by a conflict into its local store. */
function putCanonical(
  db: ReturnType<typeof getTablesDatabase>,
  entityType: SyncEntityType,
  canonical: unknown
): Promise<unknown> {
  if (entityType === "table") {
    return db.table("tables").put(tableFromChangeData(canonical));
  }
  if (entityType === "monster") {
    return db.table("monsters").put(monsterFromChangeData(canonical));
  }
  if (entityType === "rule_option") {
    return db.table("ruleOptions").put(ruleOptionFromChangeData(canonical));
  }
  return db.table("characters").put(characterFromChangeData(canonical));
}

/** Runs one full drain-then-pull cycle: push every pending outbox entry,
 * resolve accepted/conflict/rejected locally, then pull and apply every
 * change since the saved cursor. Safe to call repeatedly (e.g. on
 * reconnect) — a cycle with an empty outbox is just a pull. Returns the
 * notices the caller should surface ("a UI avisa o que foi
 * sobrescrito — silêncio aqui é exatamente o bug que esse design existe para
 * matar"). */
export async function runSyncCycle(session: AccountSession): Promise<SyncNotice[]> {
  const db = getTablesDatabase();
  const notices: SyncNotice[] = [];

  const entries = (await db.table("outbox").toArray()) as OutboxEntry[];
  if (entries.length > 0) {
    const opsWithEntries = await Promise.all(
      entries.map(async (entry) => ({ entry, op: await buildOp(entry) }))
    );
    const valid = opsWithEntries.filter(
      (x): x is { entry: OutboxEntry; op: SyncOp } => x.op !== undefined
    );

    if (valid.length > 0) {
      const result = await postSyncOps(
        session,
        valid.map((x) => x.op)
      );

      await db.transaction(
        "rw",
        db.table("tables"),
        db.table("characters"),
        db.table("monsters"),
        db.table("ruleOptions"),
        db.table("outbox"),
        async () => {
          for (const accepted of result.accepted) {
            const matching = valid.find((x) => x.op.id === accepted.id);
            if (!matching) continue;
            const tableName = storeForEntity[matching.op.entityType];
            if (typeof accepted.version === "number") {
              await db.table(tableName).update(accepted.id, {
                version: accepted.version,
              });
            }
            await db.table("outbox").delete(accepted.id);
          }
          for (const conflict of result.conflicts) {
            const matching = valid.find((x) => x.op.id === conflict.id);
            if (!matching) continue;
            if (conflict.canonical) {
              await putCanonical(
                db,
                matching.op.entityType,
                conflict.canonical
              );
            }
            await db.table("outbox").delete(conflict.id);
            notices.push({
              kind: "conflict",
              entityType: matching.op.entityType,
              id: conflict.id,
              name:
                matching.op.entityType === "character"
                  ? undefined
                  : (conflict.canonical as any)?.name,
            });
          }
          for (const rejected of result.rejected) {
            const matching = valid.find((x) => x.op.id === rejected.id);
            if (!matching) continue;
            await db.table("outbox").delete(rejected.id);
            notices.push({
              kind: "rejected",
              entityType: matching.op.entityType,
              id: rejected.id,
              error: rejected.error || "Operação recusada pelo servidor",
            });
          }
        }
      );
    }
  }

  // Pull: apply everyone else's changes since our last cursor. Entities
  // with a still-pending outbox entry (enqueued during the push above, or
  // left behind by an op that had no local row — see buildOp) are skipped
  // so a fresher local edit is never clobbered by an older pulled snapshot.
  let cursor = await loadSyncCursor();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await fetchChangesSince(session, cursor);
    if (page.changes.length === 0) {
      cursor = page.cursor;
      break;
    }
    const pendingIds = new Set(
      ((await db.table("outbox").toArray()) as OutboxEntry[]).map((e) => e.id)
    );
    for (const change of page.changes) {
      if (pendingIds.has(change.entityId)) {
        continue;
      }
      await applyChange(change);
    }
    cursor = page.cursor;
    if (page.changes.length < 500) {
      // Fewer than a full page (see broker's changesPageLimit) means we've
      // caught up; a full page means there may be more immediately after.
      break;
    }
  }
  await storeSyncCursor(cursor);

  return notices;
}
