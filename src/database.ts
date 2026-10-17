import Dexie, { DexieOptions } from "dexie"; // eslint-disable-line no-unused-vars
import { v4 as makeUuid } from "uuid";

import { getRandomMonster } from "./helpers/monsters";
import { getDefaultTokens } from "./tokens";
import { getDefaultMaps } from "./maps";
import { loadVersions, UpgradeEventHandler } from "./upgrade";

/** Default Dexie database name. Callers override it for the disposable
 * staging databases the import flow opens (ImportExportModal.tsx reads
 * an uploaded file into one; SelectDataModal.tsx browses it by name). */
const DEFAULT_DB_NAME = "ArtisanDB";

function seedGroups(maps: ReturnType<typeof getDefaultMaps>["maps"], tokens: ReturnType<typeof getDefaultTokens>) {
  return [
    { id: "maps", items: maps.map((map) => ({ id: map.id, type: "item" as const })) },
    { id: "tokens", items: tokens.map((token) => ({ id: token.id, type: "item" as const })) },
  ];
}

/**
 * Hooks Dexie's `"populate"` event — fired exactly once, the first time a
 * given database NAME is opened on this machine — to write a per-device
 * user id/nickname and whatever starter content the build ships (empty
 * today, see maps/index.ts and tokens/index.ts).
 */
function seedNewDatabase(db: Dexie) {
  db.on("populate", () => {
    const userId = makeUuid();
    db.table("user").bulkAdd([
      { key: "userId", value: userId },
      { key: "nickname", value: getRandomMonster() },
    ]);

    const { maps, mapStates } = getDefaultMaps(userId);
    const tokens = getDefaultTokens(userId);

    db.table("maps").bulkAdd(maps);
    db.table("states").bulkAdd(mapStates);
    db.table("tokens").bulkAdd(tokens);
    db.table("groups").bulkAdd(seedGroups(maps, tokens));
  });
}

/**
 * Opens (and, on first use, creates) the Dexie database holding this
 * browser's whole game library — maps, tokens, map states, assets, groups
 * — per CLAUDE.md's "Data lives in the browser". The last three
 * parameters only matter to the import-staging path: a staging database
 * is opened at the imported file's own `versionNumber`, with
 * `populateData` off so it stays exactly what was uploaded.
 * `onUpgrade` lets the caller drive a loading screen during a slow
 * version bump (see contexts/DatabaseContext.tsx).
 */
export function getDatabase(
  options: DexieOptions,
  name = DEFAULT_DB_NAME,
  versionNumber?: number,
  populateData = true,
  onUpgrade?: UpgradeEventHandler
): Dexie {
  const db = new Dexie(name, options);
  loadVersions(db, versionNumber, onUpgrade);
  if (populateData) {
    seedNewDatabase(db);
  }
  return db;
}

