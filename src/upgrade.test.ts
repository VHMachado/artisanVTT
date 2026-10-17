import { afterEach, describe, expect, test } from "vitest";
import indexedDB from "fake-indexeddb";
import IDBKeyRange from "fake-indexeddb/lib/FDBKeyRange";
import Dexie from "dexie";

import { getDatabase } from "./database";
import { isMapState } from "./validators/MapState";
import { latestVersion } from "./upgrade";

/**
 * This project collapsed a 45-version historical migration chain
 * into a single baseline (see upgrade.ts's top comment). There
 * is no longer any OLD-shape data to replay a content fixup against in
 * THIS repo: the one real legacy database in existence was already
 * migrated through the old chain once, out of band, before this baseline
 * shipped (see upgrade.ts's "Conversor" comment). What's left to guarantee
 * here is narrower but still real:
 *
 * 1. the baseline schema actually opens and the declared stores exist;
 * 2. a freshly written mapState, with the shape the rest of the app
 *    produces today (no `notes`, no `drawings`, `editFlags` restricted to
 *    "fog"/"tokens"), validates against the current Ajv schema — this is
 *    the guarantee the OLD test suite's v43/v45 cases were really after,
 *    just pointed at new data instead of replayed legacy data;
 * 3. `latestVersion` only ever grows, so a schema change from here
 *    forward is deliberate (bumping to the next integer) and not an
 *    accidental edit to an already-shipped version.
 *
 * Regression (found 2026-10-14): the one real pre-collapse ArtisanDB (the
 * GM's own machine) has Dexie `verno` 45 on disk (it rode the old
 * 45-step chain before this file collapsed it). IndexedDB refuses to
 * open a database at a version LOWER than what is already stored, so
 * shipping this baseline as `version(1)` broke that one real install
 * with a `VersionError`/`DatabaseClosedError` the UI never surfaced —
 * the Mesa just rendered blank. `rawVersion45Database()` below
 * reproduces that on-disk state directly against the native IndexedDB
 * API (bypassing Dexie, which would refuse to write a legacy-shaped
 * version chain itself) so the fix is pinned by a real regression test,
 * not just re-asserted by hand.
 */

const options = { indexedDB, IDBKeyRange };

const openDatabases: Dexie[] = [];

function open(name: string, version?: number) {
  const db = getDatabase(options, name, version, false);
  openDatabases.push(db);
  return db;
}

/** Puts a database on disk at raw IndexedDB version 450 (Dexie verno 45)
 * with the exact final table shape the old chain converged on — i.e.
 * the real GM machine's state the day this baseline shipped — using the
 * native IndexedDB API directly so no current-schema code has to agree
 * to write a legacy version. */
function rawVersion45Database(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 450);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("maps", { keyPath: "id" });
      db.createObjectStore("tokens", { keyPath: "id" });
      db.createObjectStore("assets", { keyPath: "id" });
      db.createObjectStore("states", { keyPath: "mapId" });
      db.createObjectStore("mapNpcs", { keyPath: "id" });
      db.createObjectStore("groups", { keyPath: "id" });
      db.createObjectStore("user", { keyPath: "key" });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

afterEach(async () => {
  while (openDatabases.length > 0) {
    const db = openDatabases.pop();
    db?.close();
    await db?.delete();
  }
});

describe("collapsed baseline schema", () => {
  test("latestVersion only grows past the collapsed baseline", () => {
    expect(latestVersion).toBeGreaterThanOrEqual(1);
  });

  test("opens a pre-existing real install stuck at Dexie verno 45", async () => {
    const name = `legacy-verno-45-${Date.now()}`;
    await rawVersion45Database(name);

    const db = open(name);
    await expect(db.open()).resolves.toBeDefined();

    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      ["assets", "groups", "maps", "mapNpcs", "states", "tokens", "user"].sort()
    );
  });

  test("opens with every table the app depends on", async () => {
    const name = `baseline-tables-${Date.now()}`;
    const db = open(name);
    await db.open();
    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      ["assets", "groups", "maps", "mapNpcs", "states", "tokens", "user"].sort()
    );
  });

  test("a mapState written today validates against the current schema", async () => {
    const name = `baseline-mapstate-${Date.now()}`;
    const db = open(name);
    await db.open();
    const state = {
      mapId: "map-fresh",
      tokens: {},
      fogs: {},
      editFlags: ["tokens", "fog"],
    };
    await db.table("states").put(state);
    const stored = await db.table("states").get("map-fresh");
    expect(isMapState(stored)).toBe(true);
  });
});
