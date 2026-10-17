import Fuse from "fuse.js";

import type { MonsterSummary } from "../types/Monster";

/**
 * Fuzzy search over the bestiary list — a monster panel on the right with
 * names and search, since a purely visual list doesn't scale to hundreds
 * of entries. fuse.js is already in package.json.
 *
 * Why fuzzy and not a plain `includes`: the whole dataset is in English
 * (see 5e/monsterFormat.ts for why) while the user types in Portuguese at a
 * Portuguese-speaking table, so near-misses and typos are the normal case,
 * not the exception — "dragao"/"draggon" must still find the dragons. Fuse
 * also handles the SRD's compound names ("adult black dragon") matching a
 * partial, out-of-order query ("black adult").
 */

const options: Fuse.IFuseOptions<MonsterSummary> = {
  // Name carries almost all the signal; type/subtype let "undead" or
  // "dwarf" work as a category filter typed into the same box, at a lower
  // weight so a monster literally NAMED "Dragon" still outranks the 43
  // monsters merely OF type dragon.
  keys: [
    { name: "name", weight: 0.8 },
    { name: "type", weight: 0.15 },
    { name: "subtype", weight: 0.05 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
  // Single-character queries match almost everything at this threshold;
  // 2 keeps the list from flickering to noise on the first keystroke.
  minMatchCharLength: 2,
};

export function createMonsterSearch(
  summaries: MonsterSummary[]
): Fuse<MonsterSummary> {
  return new Fuse(summaries, options);
}

/**
 * Applies a query to a prepared index. An empty/whitespace query returns
 * the full list (already name-sorted by loadMonsterSummaries) rather than
 * nothing — the panel's default state is "browse everything", and search
 * only narrows it.
 */
export function searchMonsters(
  index: Fuse<MonsterSummary>,
  summaries: MonsterSummary[],
  query: string
): MonsterSummary[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return summaries;
  }
  return index.search(trimmed).map((result) => result.item);
}
