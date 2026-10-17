import { describe, expect, test } from "vitest";

import {
  combineMonsterSummaries,
  isArtOnlyOverlay,
  parseOverrides,
  resolveTableMonster,
  serialiseOverrides,
  tableMonsterSummary,
} from "./tableMonsters";

import type { Monster, MonsterSummary } from "../types/Monster";
import type { TableMonster } from "../types/TableMonster";

/**
 * A derived creature is stored as parent + overrides, so the
 * merge is where a bug would silently show the wrong stat block. These
 * cover the merge itself, the "absent means inherit" contract, and the
 * parent/variation grouping the panel's list needs to have.
 */

function parentMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    index: "duergar",
    name: "Duergar",
    size: "Medium",
    type: "humanoid",
    subtype: "dwarf",
    alignment: "lawful evil",
    armor_class: [{ type: "armor", value: 16 }],
    hit_points: 26,
    hit_dice: "4d8",
    hit_points_roll: "4d8+8",
    speed: { walk: "25 ft." },
    strength: 14,
    dexterity: 11,
    constitution: 14,
    intelligence: 11,
    wisdom: 10,
    charisma: 9,
    proficiencies: [],
    damage_vulnerabilities: [],
    damage_resistances: ["poison"],
    damage_immunities: [],
    condition_immunities: [],
    senses: { passive_perception: 10, darkvision: "120 ft." },
    languages: "Dwarvish, Undercommon",
    challenge_rating: 1,
    proficiency_bonus: 2,
    xp: 200,
    special_abilities: [{ name: "Sunlight Sensitivity", desc: "Disadvantage…" }],
    actions: [{ name: "War Pick", desc: "Melee Weapon Attack…" }],
    ...overrides,
  };
}

function derived(overrides: string, extra: Partial<TableMonster> = {}): TableMonster {
  return {
    id: "monster-1",
    tableId: "table-1",
    name: "Fulana, a Duergar Ladina",
    parentIndex: "duergar",
    overrides,
    ownerAccountId: 1,
    createdAt: 0,
    updatedAt: 0,
    version: 1,
    deleted: false,
    ...extra,
  };
}

describe("parseOverrides", () => {
  test("parses a stored patch", () => {
    expect(parseOverrides('{"hitPoints":42}')).toEqual({ hitPoints: 42 });
  });

  test("degrades to {} instead of throwing on unparseable data", () => {
    // The broker never introspects this field, so a newer client could
    // have written something this build can't read — falling back to the
    // parent's stat block beats crashing the panel.
    expect(parseOverrides("not json")).toEqual({});
    expect(parseOverrides("")).toEqual({});
    expect(parseOverrides("null")).toEqual({});
    expect(parseOverrides("[1,2]")).toEqual([1, 2]);
  });
});

describe("serialiseOverrides", () => {
  test("drops empty values so an untouched field stays inherited", () => {
    const json = serialiseOverrides({
      hitPoints: 42,
      languages: "",
      desc: undefined,
      extraActions: [],
    });
    expect(JSON.parse(json)).toEqual({ hitPoints: 42 });
  });

  test("keeps a zero, which is a real 5e value", () => {
    // CR 0 and STR 0 both exist; treating falsy as absent would make them
    // unsettable.
    expect(JSON.parse(serialiseOverrides({ challengeRating: 0 }))).toEqual({
      challengeRating: 0,
    });
  });
});

describe("resolveTableMonster", () => {
  test("inherits every unspecified field from the parent", () => {
    const resolved = resolveTableMonster(derived("{}"), parentMonster());
    expect(resolved.hit_points).toBe(26);
    expect(resolved.damage_resistances).toEqual(["poison"]);
    expect(resolved.senses.darkvision).toBe("120 ft.");
    expect(resolved.challenge_rating).toBe(1);
  });

  test("the row's own name always wins over the parent's", () => {
    const resolved = resolveTableMonster(derived("{}"), parentMonster());
    expect(resolved.name).toBe("Fulana, a Duergar Ladina");
  });

  test("the resolved index is the homebrew id, not the parent's slug", () => {
    // Otherwise opening a variation would load the parent's stat block.
    const resolved = resolveTableMonster(derived("{}"), parentMonster());
    expect(resolved.index).toBe("monster-1");
  });

  test("overrides replace the parent's value", () => {
    const resolved = resolveTableMonster(
      derived('{"hitPoints":42,"challengeRating":3,"dexterity":18}'),
      parentMonster()
    );
    expect(resolved.hit_points).toBe(42);
    expect(resolved.challenge_rating).toBe(3);
    expect(resolved.dexterity).toBe(18);
    expect(resolved.strength).toBe(14);
  });

  test("an overridden HP total drops the parent's hit_points_roll", () => {
    // The parent's roll describes a different HP total; keeping it would
    // print "42 (4d8+8)".
    const resolved = resolveTableMonster(
      derived('{"hitPoints":42}'),
      parentMonster()
    );
    expect(resolved.hit_points_roll).toBeUndefined();
  });

  test("an overridden AC replaces the whole conditional list", () => {
    const resolved = resolveTableMonster(
      derived('{"armorClass":18}'),
      parentMonster({
        armor_class: [
          { type: "armor", value: 16 },
          { type: "condition", value: 12 },
        ],
      })
    );
    expect(resolved.armor_class).toHaveLength(1);
    expect(resolved.armor_class[0].value).toBe(18);
  });

  test("a walk-speed override keeps the parent's other movement modes", () => {
    const resolved = resolveTableMonster(
      derived('{"speedWalk":"40 ft."}'),
      parentMonster({ speed: { walk: "25 ft.", fly: "60 ft." } })
    );
    expect(resolved.speed).toEqual({ walk: "40 ft.", fly: "60 ft." });
  });

  test("extra abilities and actions append rather than replace", () => {
    // "uma Duergar comum, mas com habilidades de ladina" — it keeps what
    // makes it a Duergar.
    const resolved = resolveTableMonster(
      derived(
        '{"extraActions":[{"name":"Sneak Attack","desc":"+2d6"}],' +
          '"extraAbilities":[{"name":"Cunning Action","desc":"Dash…"}]}'
      ),
      parentMonster()
    );
    expect(resolved.actions?.map((a) => a.name)).toEqual([
      "War Pick",
      "Sneak Attack",
    ]);
    expect(resolved.special_abilities?.map((a) => a.name)).toEqual([
      "Sunlight Sensitivity",
      "Cunning Action",
    ]);
  });

  test("mutating the resolved monster does not corrupt the cached parent", () => {
    // The parent comes from bestiary.ts's memoised dataset, shared by
    // every caller for the rest of the session.
    const parent = parentMonster();
    const resolved = resolveTableMonster(
      derived('{"extraActions":[{"name":"Sneak Attack","desc":"+2d6"}]}'),
      parent
    );
    resolved.hit_points = 999;
    expect(parent.hit_points).toBe(26);
    expect(parent.actions).toHaveLength(1);
  });

  test("a creature with no parent resolves against neutral defaults", () => {
    const scratch = derived('{"hitPoints":11,"type":"ooze"}', {
      name: "Coisa do Pântano",
      parentIndex: undefined,
    });
    const resolved = resolveTableMonster(scratch, undefined);
    expect(resolved.name).toBe("Coisa do Pântano");
    expect(resolved.hit_points).toBe(11);
    expect(resolved.type).toBe("ooze");
    expect(resolved.size).toBe("Medium");
    expect(resolved.armor_class[0].value).toBe(10);
  });

  test("a derived creature whose parent is missing still renders", () => {
    // A dataset bump could drop a slug a Mesa already derives from; the
    // variation must degrade to its own overrides, not disappear.
    const resolved = resolveTableMonster(
      derived('{"hitPoints":42}'),
      undefined
    );
    expect(resolved.name).toBe("Fulana, a Duergar Ladina");
    expect(resolved.hit_points).toBe(42);
  });
});

describe("tableMonsterSummary", () => {
  test("marks the row as homebrew and records its parent's name", () => {
    const summary = tableMonsterSummary(derived("{}"), parentMonster());
    expect(summary.source).toBe("table");
    expect(summary.parentName).toBe("Duergar");
    expect(summary.index).toBe("monster-1");
    expect(summary.challengeRating).toBe("1");
  });

  test("formats a fractional CR the same way the SRD list does", () => {
    const summary = tableMonsterSummary(
      derived('{"challengeRating":0.25}'),
      parentMonster()
    );
    expect(summary.challengeRating).toBe("1/4");
  });

  test("carries tokenAssetIds through for the map-drop path to use", () => {
    const summary = tableMonsterSummary(
      derived("{}", { tokenAssetIds: ["hash-1", "hash-2"] }),
      parentMonster()
    );
    expect(summary.tokenAssetIds).toEqual(["hash-1", "hash-2"]);
  });

  test("omits tokenAssetIds entirely when the creature has none", () => {
    const summary = tableMonsterSummary(derived("{}"), parentMonster());
    expect(summary.tokenAssetIds).toBeUndefined();
  });
});

describe("combineMonsterSummaries", () => {
  const srd: MonsterSummary[] = [
    {
      index: "duergar",
      name: "Duergar",
      size: "Medium",
      type: "humanoid",
      challenge_rating: 1,
      challengeRating: "1",
      xp: 200,
    },
    {
      index: "aboleth",
      name: "Aboleth",
      size: "Large",
      type: "aberration",
      challenge_rating: 10,
      challengeRating: "10",
      xp: 5900,
    },
    {
      index: "efreeti",
      name: "Efreeti",
      size: "Large",
      type: "elemental",
      challenge_rating: 11,
      challengeRating: "11",
      xp: 7200,
    },
  ];
  const parents = new Map([["duergar", parentMonster()]]);

  test("groups a variation directly under its parent, not under its own name", () => {
    const combined = combineMonsterSummaries(srd, [derived("{}")], parents);
    const names = combined.map((m) => m.name);
    expect(names).toEqual([
      "Aboleth",
      "Duergar",
      "Fulana, a Duergar Ladina",
      "Efreeti",
    ]);
  });

  test("several variations of one parent stay together, sorted by name", () => {
    const combined = combineMonsterSummaries(
      srd,
      [
        derived("{}", { id: "m2", name: "Zelda, a Duergar" }),
        derived("{}", { id: "m1", name: "Ana, a Duergar" }),
      ],
      parents
    );
    expect(combined.map((m) => m.name)).toEqual([
      "Aboleth",
      "Duergar",
      "Ana, a Duergar",
      "Zelda, a Duergar",
      "Efreeti",
    ]);
  });

  test("a parentless homebrew sorts by its own name among the SRD rows", () => {
    const combined = combineMonsterSummaries(
      srd,
      [
        derived('{"hitPoints":11}', {
          id: "m3",
          name: "Bicho Papão",
          parentIndex: undefined,
        }),
      ],
      parents
    );
    expect(combined.map((m) => m.name)).toEqual([
      "Aboleth",
      "Bicho Papão",
      "Duergar",
      "Efreeti",
    ]);
  });

  test("returns the SRD list unchanged when a Mesa has no homebrew", () => {
    const combined = combineMonsterSummaries(srd, [], parents);
    expect(combined.map((m) => m.name)).toEqual([
      "Aboleth",
      "Duergar",
      "Efreeti",
    ]);
    expect(combined.every((m) => m.source === undefined)).toBe(true);
  });

  test("merges an art-only overlay onto the SRD row instead of listing it", () => {
    // The whole point of allowing an art-only overlay: attaching art to Duergar shouldn't
    // create a separate "variação de Duergar" entry.
    const overlay = derived(serialiseOverrides({ artOnly: true }), {
      id: "overlay-1",
      name: "Duergar",
      portraitAssetId: "portrait-hash",
      tokenAssetIds: ["token-hash-1", "token-hash-2"],
    });
    const combined = combineMonsterSummaries(srd, [overlay], parents);
    expect(combined.map((m) => m.name)).toEqual([
      "Aboleth",
      "Duergar",
      "Efreeti",
    ]);
    const duergarRow = combined.find((m) => m.name === "Duergar");
    expect(duergarRow?.portraitAssetId).toBe("portrait-hash");
    expect(duergarRow?.tokenAssetIds).toEqual(["token-hash-1", "token-hash-2"]);
    // Not listed as homebrew — it's still the plain SRD row underneath.
    expect(duergarRow?.source).toBeUndefined();
  });

  test("an art-only overlay and a real variation of the same parent coexist", () => {
    const overlay = derived(serialiseOverrides({ artOnly: true }), {
      id: "overlay-1",
      name: "Duergar",
      portraitAssetId: "portrait-hash",
    });
    const variation = derived("{}", { id: "m2", name: "Zelda, a Duergar" });
    const combined = combineMonsterSummaries(
      srd,
      [overlay, variation],
      parents
    );
    expect(combined.map((m) => m.name)).toEqual([
      "Aboleth",
      "Duergar",
      "Zelda, a Duergar",
      "Efreeti",
    ]);
    expect(combined.find((m) => m.name === "Duergar")?.portraitAssetId).toBe(
      "portrait-hash"
    );
  });

  test("a variation with no art of its own inherits the parent's", () => {
    // "Variações devem herdar imagens da criatura-pai" — Zelda uploads
    // nothing herself, but Duergar has an art-only overlay attached.
    const overlay = derived(serialiseOverrides({ artOnly: true }), {
      id: "overlay-1",
      name: "Duergar",
      portraitAssetId: "portrait-hash",
      tokenAssetIds: ["token-hash-1"],
    });
    const variation = derived("{}", { id: "m2", name: "Zelda, a Duergar" });
    const combined = combineMonsterSummaries(
      srd,
      [overlay, variation],
      parents
    );
    const zelda = combined.find((m) => m.name === "Zelda, a Duergar");
    expect(zelda?.portraitAssetId).toBe("portrait-hash");
    expect(zelda?.tokenAssetIds).toEqual(["token-hash-1"]);
  });

  test("a variation with its own art keeps it over the parent's", () => {
    const overlay = derived(serialiseOverrides({ artOnly: true }), {
      id: "overlay-1",
      name: "Duergar",
      portraitAssetId: "parent-portrait",
    });
    const variation = derived("{}", {
      id: "m2",
      name: "Zelda, a Duergar",
      portraitAssetId: "zelda-own-portrait",
    });
    const combined = combineMonsterSummaries(
      srd,
      [overlay, variation],
      parents
    );
    const zelda = combined.find((m) => m.name === "Zelda, a Duergar");
    expect(zelda?.portraitAssetId).toBe("zelda-own-portrait");
  });
});

describe("isArtOnlyOverlay", () => {
  test("true only when parented and marked artOnly", () => {
    expect(
      isArtOnlyOverlay(derived(serialiseOverrides({ artOnly: true })))
    ).toBe(true);
  });

  test("false for a real derived creature with stat overrides", () => {
    expect(isArtOnlyOverlay(derived('{"hitPoints":42}'))).toBe(false);
  });

  test("false for a from-scratch creature even if somehow marked artOnly", () => {
    // artOnly only makes sense tied to an SRD parent — MonsterArtModal
    // never creates one without a parentIndex, but the merge logic
    // should not treat a parentless row as an overlay regardless.
    expect(
      isArtOnlyOverlay(
        derived(serialiseOverrides({ artOnly: true }), {
          parentIndex: undefined,
        })
      )
    ).toBe(false);
  });
});
