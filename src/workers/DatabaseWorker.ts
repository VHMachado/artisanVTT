import * as Comlink from "comlink";
import { encode, decode } from "@msgpack/msgpack";
import {
  exportDB,
  importInto,
  peakImportFile,
} from "@mitchemmc/dexie-export-import";
import type { ExportProgress } from "@mitchemmc/dexie-export-import/dist/export";

import { getDatabase } from "../database";
import blobToBuffer from "../helpers/blobToBuffer";

import type { Map } from "../types/Map";
import type { Token } from "../types/Token";
import type { Asset } from "../types/Asset";

type ProgressCallback = (progress: ExportProgress) => boolean;

/** Wraps an ArrayBuffer-backed value for a zero-copy handoff across the
 * worker boundary, instead of letting Comlink structured-clone it. */
function transferable(bytes: Uint8Array): Uint8Array {
  return Comlink.transfer(bytes, [bytes.buffer]);
}

/**
 * Reads an entire Dexie table via cursor (not `toArray()`, which can trip
 * the structured-clone/IPC size ceiling on a large table before msgpack
 * even runs), returning each row through `onRow` as it's read.
 */
async function forEachRow<T>(
  db: ReturnType<typeof getDatabase>,
  table: string,
  onRow: (row: T) => void
) {
  await db.table(table).each(onRow as any);
}

/** Fetch an entire table or one row by key, msgpack-encoded for transfer. */
async function readTable<T>(table: string, key?: string): Promise<Uint8Array> {
  const db = getDatabase({});
  if (key !== undefined) {
    const row = await db.table(table).get(key);
    return transferable(encode(row));
  }
  const rows: T[] = [];
  await forEachRow<T>(db, table, (row) => rows.push(row));
  return transferable(encode(rows));
}

/** Decode and write a single msgpack-encoded row into `table`. */
async function writeRow(encoded: Uint8Array, table: string): Promise<boolean> {
  try {
    await getDatabase({}).table(table).put(decode(encoded));
    return true;
  } catch {
    return false;
  }
}

/** Collects every asset id a map or token file-type row points at. */
function collectAssetIds(maps: Map[], tokens: Token[]): string[] {
  const ids: string[] = [];
  for (const map of maps) {
    if (map.type !== "file") {
      continue;
    }
    ids.push(map.file, map.thumbnail);
    for (const resolutionId of Object.values(map.resolutions)) {
      if (resolutionId) {
        ids.push(resolutionId);
      }
    }
  }
  for (const token of tokens) {
    if (token.type === "file") {
      ids.push(token.file, token.thumbnail);
    }
  }
  return ids;
}

/**
 * Builds the export of a user-picked subset of maps/tokens (plus every
 * asset they reference, and the full `groups` table) into a downloadable
 * `.artisan` file — ImportExportModal.tsx's export flow.
 */
async function buildSelectiveExport(
  progressCallback: ProgressCallback,
  mapIds: string[],
  tokenIds: string[]
): Promise<Uint8Array> {
  const db = getDatabase({});
  const wantedMapIds = new Set(mapIds);
  const wantedTokenIds = new Set(tokenIds);

  const maps = await db.table<Map>("maps").where("id").anyOf(mapIds).toArray();
  const tokens = await db.table<Token>("tokens").where("id").anyOf(tokenIds).toArray();
  const wantedAssetIds = new Set(collectAssetIds(maps, tokens));

  const tableFilters: Record<string, (value: any) => boolean> = {
    maps: (value) => wantedMapIds.has(value.id),
    states: (value) => wantedMapIds.has(value.mapId),
    tokens: (value) => wantedTokenIds.has(value.id),
    assets: (value) => wantedAssetIds.has(value.id),
    // Groups are small and position-only; keep them all so the imported
    // library has somewhere to slot the restored items into.
    groups: () => true,
  };

  const exportedBlob = await exportDB(db as any, {
    progressCallback,
    filter: (table, value) => tableFilters[table]?.(value) ?? false,
    numRowsPerChunk: 1,
    prettyJson: true,
  });

  return transferable(await blobToBuffer(exportedBlob));
}

function hasShapeFor(table: string, value: any): boolean {
  if (table === "maps" || table === "tokens") {
    return "id" in value && "owner" in value;
  }
  if (table === "states") {
    return "mapId" in value;
  }
  return true;
}

/**
 * Loads an uploaded `.artisan` file into a throwaway database named
 * `stagingDatabaseName`, which SelectDataModal.tsx then browses so the
 * user can pick what to merge into their real library.
 */
async function stageImport(
  data: Blob,
  stagingDatabaseName: string,
  progressCallback: ProgressCallback
) {
  const meta = await peakImportFile(data);
  if (!meta.data) {
    throw new Error("Uanble to parse file");
  }

  const liveDb = getDatabase({});
  if (meta.data.databaseName !== liveDb.name) {
    throw new Error("Unable to import database, name mismatch");
  }
  if (meta.data.databaseVersion > liveDb.verno) {
    throw new Error(
      `Database version differs. Current database is in version ${liveDb.verno} but export is ${meta.data.databaseVersion}`
    );
  }

  const emptyStaging = getDatabase({ addons: [] }, stagingDatabaseName, 0);
  await emptyStaging.delete();
  emptyStaging.close();

  const staging = getDatabase(
    { addons: [] },
    stagingDatabaseName,
    meta.data.databaseVersion,
    false
  );
  await importInto(staging as any, data, {
    progressCallback,
    acceptNameDiff: true,
    acceptVersionDiff: true,
    overwriteValues: true,
    // Reject rows missing fields the rest of the app assumes exist —
    // guards against a malformed export seeding garbage into staging.
    filter: hasShapeFor,
  });
  staging.close();
}

/**
 * Evicts assets this browser doesn't own, largest first, until the total
 * is back under `maxCacheSize` bytes. This browser's OWN assets are never
 * touched — only cached content from other players/GMs is reclaimable.
 */
async function trimAssetCache(maxCacheSize: number) {
  try {
    const db = getDatabase({});
    const localUserId = (await db.table("user").get("userId")).value;

    const foreignAssets: { id: string; size: number }[] = [];
    await db
      .table("assets")
      .where("owner")
      .notEqual(localUserId)
      .each((asset: Asset) => {
        foreignAssets.push({ id: asset.id, size: asset.file.byteLength });
      });

    const totalBytes = foreignAssets.reduce((sum, item) => sum + item.size, 0);
    if (totalBytes <= maxCacheSize) {
      return;
    }

    const evictionOrder = [...foreignAssets].sort((a, b) => b.size - a.size);
    const idsToEvict: string[] = [];
    let bytesFreed = 0;
    for (const asset of evictionOrder) {
      idsToEvict.push(asset.id);
      bytesFreed += asset.size;
      if (totalBytes - bytesFreed < maxCacheSize) {
        break;
      }
    }
    await db.table("assets").bulkDelete(idsToEvict);
  } catch {
    // Best-effort: a failed sweep just leaves the cache a bit larger
    // until the next opportunity, nothing user-visible breaks.
  }
}

/**
 * Off-main-thread Dexie access (CLAUDE.md "Heavy DB work runs off the
 * main thread"), exposed to the rest of the app over Comlink —
 * contexts/DatabaseContext.tsx wraps a Worker around this module and
 * hands callers the proxy as `useDatabase().worker`.
 */
const exposedService = {
  loadData: readTable,
  putData: writeRow,
  exportData: buildSelectiveExport,
  importData: stageImport,
  cleanAssetCache: trimAssetCache,
};

export type DatabaseWorkerService = typeof exposedService;

Comlink.expose(exposedService);
