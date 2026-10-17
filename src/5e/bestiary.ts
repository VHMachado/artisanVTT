import type { Monster, MonsterSummary } from "../types/Monster";
import { challengeRatingText } from "./monsterFormat";

/**
 * Access to the vendored 2014 SRD bestiary (`data/monsters-2014.json`, see
 * `data/PROVENANCE.md`) — vendoring a fixed release means this app can
 * stay offline-first: it never depends on an external API at session time.
 *
 * The dataset is ~1MB of JSON, so it is loaded through a DYNAMIC import:
 * Vite emits it as its own chunk, fetched the first time a monster panel or
 * stat block is actually opened, instead of being parsed on every app start
 * for the majority of sessions that never look at a monster. Everything
 * here memoises on that one promise, so concurrent callers (the panel's
 * list and a stat block opening at the same time) share a single fetch.
 */

let monstersPromise: Promise<Monster[]> | undefined;

export function loadMonsters(): Promise<Monster[]> {
  if (!monstersPromise) {
    monstersPromise = import("./data/monsters-2014.json").then(
      (module) => (module.default as unknown) as Monster[]
    );
  }
  return monstersPromise;
}

let summariesPromise: Promise<MonsterSummary[]> | undefined;

/**
 * The bestiary list: one light row per monster, sorted by name. Built once
 * and reused — the panel re-renders on every keystroke, and re-deriving 334
 * summaries per render would be wasted work.
 */
export function loadMonsterSummaries(): Promise<MonsterSummary[]> {
  if (!summariesPromise) {
    summariesPromise = loadMonsters().then((monsters) =>
      monsters
        .map((monster) => ({
          index: monster.index,
          name: monster.name,
          size: monster.size,
          type: monster.type,
          subtype: monster.subtype,
          challenge_rating: monster.challenge_rating,
          challengeRating: challengeRatingText(monster.challenge_rating),
          xp: monster.xp,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }
  return summariesPromise;
}

let byIndexPromise: Promise<Map<string, Monster>> | undefined;

function loadByIndex(): Promise<Map<string, Monster>> {
  if (!byIndexPromise) {
    byIndexPromise = loadMonsters().then(
      (monsters) => new Map(monsters.map((monster) => [monster.index, monster]))
    );
  }
  return byIndexPromise;
}

/** One full stat block by its slug, undefined for an unknown index. */
export async function loadMonster(
  index: string
): Promise<Monster | undefined> {
  return (await loadByIndex()).get(index);
}

/**
 * The whole dataset keyed by slug — what a derived homebrew creature needs
 * to resolve their `parentIndex` into a base stat block
 * (helpers/tableMonsters.ts). Exposed as the shared memoised map rather
 * than N calls to loadMonster so a panel listing a dozen homebrew variants
 * still touches the dataset once.
 */
export async function loadMonstersByIndex(): Promise<Map<string, Monster>> {
  return loadByIndex();
}

/**
 * Test seam: drops every memoised promise so a test can load the dataset
 * again (or a different one) without a fresh module registry. Never called
 * by app code — the whole point of the caches above is that a session loads
 * this data at most once.
 */
export function resetBestiaryCache(): void {
  monstersPromise = undefined;
  summariesPromise = undefined;
  byIndexPromise = undefined;
}
