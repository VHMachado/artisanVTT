// eslint-disable-next-line no-unused-vars
import Dexie, { Version } from "dexie";

export type UpgradeEventHandler = (versionNumber: number) => void;

type VersionCallback = (
  version: Version,
  onUpgrade?: UpgradeEventHandler
) => void;

/**
 * Collapsed schema baseline.
 *
 * Upstream Owlbear Rodeo 1.0 carried a chain of 41 numbered Dexie
 * migrations stretching from 2020's `v1.2.0` schema to `v1.10.0`'s
 * double-fixed rename, and this fork added 4 more on top (the
 * `mapNpcs` table, the notes purge, the grid-scale ft->m
 * conversion, the drawing-tool removal) — 45 versions, ~900 lines,
 * almost entirely dead weight for a brand new install: a fresh database
 * has no 2020-era rows to convert, it only ever needs the FINAL shape
 * those 45 steps converged on.
 *
 * This file IS that final shape, written as a single `version(1)`. Unlike
 * the old chain, this is not a historical record to leave frozen: no live
 * database anywhere depends on replaying version 1 specifically, so a
 * genuine schema fix can edit it directly. Any schema change from here
 * forward still goes in a new `version(2)`, `version(3)`, etc., same rule
 * as before.
 *
 * A pre-existing ArtisanDB (this repo author's own install — the one real
 * legacy database in the world, already migrated through the old chain
 * over time) cannot open directly against this
 * `version(1)`-only schema: IndexedDB refuses to downgrade an existing
 * database to a version lower than what's already stored on disk.
 * Upgrading that one real install to a build at or after this baseline needs a
 * one-time out-of-band conversion (export the already-migrated content
 * under the OLD build, delete the database, let the new build recreate it
 * at this baseline, reimport) run once before the new build ever opens
 * that profile. Every other
 * install (any future user, any clean clone) has no existing database to
 * conflict with, so `version(1)` here is simply where it starts.
 */
// Table -> Dexie index spec, kept as a standalone map (rather than inlined
// into the `stores()` call) so a future version bump can diff against it
// directly instead of hunting through a call expression.
export const baselineSchema = {
  maps: "id, owner",
  tokens: "id, owner",
  assets: "id, owner",
  states: "mapId",
  mapNpcs: "id, mapId",
  groups: "id",
  user: "key",
};

export const versions: Record<number, VersionCallback> = {
  1(v) {
    v.stores(baselineSchema);
  },
  // Regression found 2026-10-14: the one real pre-collapse ArtisanDB (the
  // GM's own machine) went through the old 45-step migration chain
  // before this file collapsed it, so its on-disk Dexie `verno` is 45
  // (raw IndexedDB version 450). IndexedDB refuses to open a database at
  // a version LOWER than what is already stored, so `version(1)` above
  // — correct for a brand-new install — threw `VersionError` /
  // `DatabaseClosedError` for that install specifically, and the app
  // rendered a blank Mesa with nothing surfaced in the UI (only visible
  // via the browser console). `baselineSchema` is unchanged here: it
  // already IS the exact final shape version 45 converged on (confirmed
  // against the real backup during this baseline's own validation), so this
  // is a version-NUMBER bump only, not a data migration — Dexie just
  // re-declares the identical stores one tick above 45 and moves on,
  // whether the database starts at 0, 1, or 45.
  46(v) {
    v.stores(baselineSchema);
  },
};

export const latestVersion = 46;

/**
 * Register every `version(n).stores(...)` callback up to (by default)
 * `latestVersion`, in ascending order. `versions` is intentionally
 * sparse (not every integer from 1 has a callback) — Dexie only needs
 * each declared version applied in order, not a contiguous run — so
 * `getDatabase`'s staging-database helpers can still pass an explicit
 * `upTo` lower than the live schema (e.g. to replay an older export's
 * own `databaseVersion`) without every integer below it existing here.
 */
export function loadVersions(
  db: Dexie,
  upTo: number = latestVersion,
  onUpgrade?: UpgradeEventHandler
) {
  const registered = Object.keys(versions)
    .map(Number)
    .filter((n) => n <= upTo)
    .sort((a, b) => a - b);
  for (const n of registered) {
    versions[n](db.version(n), onUpgrade);
  }
}
