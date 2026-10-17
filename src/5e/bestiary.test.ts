import { describe, expect, it, beforeAll } from "vitest";

import {
  loadMonster,
  loadMonsterSummaries,
  loadMonsters,
} from "./bestiary";
import { createMonsterSearch, searchMonsters } from "./monsterSearch";
import type { MonsterSummary } from "../types/Monster";

/**
 * Runs against the REAL vendored dataset (src/5e/data/monsters-2014.json),
 * not a fixture: the point of these cases is that the committed file is
 * actually loadable and shaped the way types/Monster.ts claims — a fixture
 * would pass just as happily after scripts/vendor-5e.mjs vendored something
 * broken.
 */
describe("bestiary", () => {
  it("loads the pinned 2014 SRD monster list", async () => {
    const monsters = await loadMonsters();
    expect(monsters.length).toBe(334);
  });

  it("strips the upstream url/image fields the vendor script drops", async () => {
    // The bestiary is vendored specifically to avoid depending on an
    // external API at session time; these two fields are the only things
    // in the upstream JSON that point at dnd5eapi.co, so their absence is
    // the invariant worth pinning.
    const monsters = await loadMonsters();
    for (const monster of monsters) {
      expect(monster).not.toHaveProperty("url");
      expect(monster).not.toHaveProperty("image");
    }
  });

  it("returns name-sorted summaries with a formatted challenge rating", async () => {
    const summaries = await loadMonsterSummaries();
    expect(summaries.length).toBe(334);
    const names = summaries.map((s) => s.name);
    expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
    const bat = summaries.find((s) => s.index === "bat");
    expect(bat?.challengeRating).toBe("0");
    const kobold = summaries.find((s) => s.index === "kobold");
    expect(kobold?.challengeRating).toBe("1/8");
  });

  it("memoises: two calls hand back the same array instance", async () => {
    // The panel's list and an open stat block both load on mount; a second
    // parse of a 1MB JSON per consumer is the thing this guards against.
    expect(await loadMonsters()).toBe(await loadMonsters());
    expect(await loadMonsterSummaries()).toBe(await loadMonsterSummaries());
  });

  it("looks up a full stat block by index", async () => {
    const duergar = await loadMonster("duergar");
    expect(duergar?.name).toBe("Duergar");
    expect(duergar?.hit_points).toBe(26);
    expect(duergar?.actions?.some((a) => a.name === "War Pick")).toBe(true);
    expect(await loadMonster("not-a-monster")).toBeUndefined();
  });
});

describe("searchMonsters", () => {
  let summaries: MonsterSummary[];
  let index: ReturnType<typeof createMonsterSearch>;

  beforeAll(async () => {
    summaries = await loadMonsterSummaries();
    index = createMonsterSearch(summaries);
  });

  function names(query: string): string[] {
    return searchMonsters(index, summaries, query).map((s) => s.name);
  }

  it("returns the whole list for an empty query", () => {
    expect(searchMonsters(index, summaries, "")).toBe(summaries);
    expect(searchMonsters(index, summaries, "   ")).toBe(summaries);
  });

  it("finds an exact name", () => {
    expect(names("Owlbear")[0]).toBe("Owlbear");
  });

  it("finds a monster from a partial, mid-word query", () => {
    expect(names("bear")).toContain("Brown Bear");
  });

  it("tolerates the typos a Portuguese-speaking table makes on English names", () => {
    // The dataset is English (see 5e/monsterFormat.ts) while the user types
    // in Portuguese — near-misses are the normal case, which is why this is
    // a fuzzy index instead of a substring filter.
    expect(names("dragao").length).toBeGreaterThan(0);
    expect(names("goblim")).toContain("Goblin");
  });

  it("ranks a monster named after a type above mere members of that type", () => {
    const results = names("dragon");
    expect(results.length).toBeGreaterThan(1);
    // Every "* Dragon" entry should come before a non-dragon-named monster
    // that merely has type "dragon" (e.g. Wyvern/Pseudodragon ordering is
    // Fuse's business, but a type-only match must not win outright).
    expect(results[0].toLowerCase()).toContain("dragon");
  });

  it("lets a type work as a filter typed into the same box", () => {
    expect(names("undead").length).toBeGreaterThan(0);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(names("zzzzqqqq")).toEqual([]);
  });
});
