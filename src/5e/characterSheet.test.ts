import { beforeAll, describe, expect, test } from "vitest";

import { loadCompendium, Compendium } from "./compendium";
import {
  allSkillModifiers,
  baseArmorClass,
  featuresByLevel,
  maxHitPoints,
  parseSheet,
  proficiencyBonus,
  racialAbilityBonuses,
  racialSpeed,
  racialTraits,
  resolveAbilities,
  savingThrowProficiencies,
  serialiseSheet,
  sheetSummary,
  spellSlots,
  totalArmorClass,
  totalInitiativeBonus,
  totalSpeed,
} from "./characterSheet";

import type { CharacterSheet } from "../types/CharacterSheet";

/**
 * Derived values for a player character sheet. The premise under test
 * throughout: nothing here is stored, so changing a choice changes every
 * number that depends on it — no stale totals, no half-applied edit.
 */

let compendium: Compendium;

beforeAll(async () => {
  compendium = await loadCompendium();
});

const loreBard: CharacterSheet = {
  classIndex: "bard",
  subclassIndex: "lore",
  raceIndex: "elf",
  subraceIndex: "high-elf",
  level: 3,
  abilities: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
};

describe("resolveAbilities", () => {
  test("adds race and subrace bonuses on top of the rolled score", () => {
    const abilities = resolveAbilities(compendium, loreBard);
    const dex = abilities.find((a) => a.key === "dex")!;
    // Elf: +2 DEX.
    expect(dex.base).toBe(14);
    expect(dex.racialBonus).toBe(2);
    expect(dex.total).toBe(16);
    expect(dex.modifier).toBe(3);
    expect(dex.modifierText).toBe("+3");

    const int = abilities.find((a) => a.key === "int")!;
    // High elf: +1 INT.
    expect(int.racialBonus).toBe(1);
    expect(int.total).toBe(13);
  });

  test("a negative modifier renders with its sign", () => {
    const str = resolveAbilities(compendium, loreBard).find(
      (a) => a.key === "str"
    )!;
    expect(str.total).toBe(8);
    expect(str.modifierText).toBe("-1");
  });

  test("returns all six abilities, in order, defaulting to 10", () => {
    const abilities = resolveAbilities(compendium, {});
    expect(abilities.map((a) => a.key)).toEqual([
      "str",
      "dex",
      "con",
      "int",
      "wis",
      "cha",
    ]);
    expect(abilities.every((a) => a.total === 10 && a.modifier === 0)).toBe(
      true
    );
  });

  test("changing race recomputes the totals instead of keeping the old sum", () => {
    const asElf = resolveAbilities(compendium, loreBard).find(
      (a) => a.key === "dex"
    )!.total;
    const asDwarf = resolveAbilities(compendium, {
      ...loreBard,
      raceIndex: "dwarf",
      subraceIndex: undefined,
    }).find((a) => a.key === "dex")!.total;
    expect(asElf).toBe(16);
    expect(asDwarf).toBe(14); // dwarves get +2 CON, not DEX
  });
});

describe("racialAbilityBonuses", () => {
  test("ignores a subrace that doesn't belong to the chosen race", () => {
    // Stale pick: race changed, subrace not yet cleared. Its +1 INT must
    // not survive the change.
    const bonuses = racialAbilityBonuses(compendium, {
      raceIndex: "dwarf",
      subraceIndex: "high-elf",
    });
    expect(bonuses.int).toBeUndefined();
    expect(bonuses.con).toBe(2);
  });

  test("does not silently spend the half-elf's choose-two", () => {
    // ability_bonus_options is a player choice; picking for them is the
    // opposite of this phase's premise.
    const bonuses = racialAbilityBonuses(compendium, { raceIndex: "half-elf" });
    expect(bonuses.cha).toBe(2);
    expect(Object.keys(bonuses)).toEqual(["cha"]);
  });
});

describe("proficiencyBonus", () => {
  test("follows 5e's table", () => {
    expect(proficiencyBonus(compendium, { classIndex: "bard", level: 1 })).toBe(
      2
    );
    expect(proficiencyBonus(compendium, { classIndex: "bard", level: 5 })).toBe(
      3
    );
    expect(proficiencyBonus(compendium, { classIndex: "bard", level: 17 })).toBe(
      6
    );
  });

  test("falls back to the formula when there's no level row", () => {
    expect(proficiencyBonus(compendium, { level: 9 })).toBe(4);
  });
});

describe("maxHitPoints", () => {
  test("is full hit die at level 1 plus CON", () => {
    // Bard d8, CON 13 -> +1.
    expect(maxHitPoints(compendium, { ...loreBard, level: 1 })).toBe(9);
  });

  test("adds the class average plus CON per level after the first", () => {
    // d8 average 5, +1 CON, twice.
    expect(maxHitPoints(compendium, loreBard)).toBe(9 + 2 * 6);
  });

  test("a barbarian's d12 outpaces a bard's d8 at the same level", () => {
    const barbarian = maxHitPoints(compendium, {
      ...loreBard,
      classIndex: "barbarian",
      subclassIndex: "berserker",
    });
    expect(barbarian).toBeGreaterThan(maxHitPoints(compendium, loreBard));
  });

  test("is 0 with no class rather than a made-up number", () => {
    expect(maxHitPoints(compendium, { level: 5 })).toBe(0);
  });
});

describe("baseArmorClass", () => {
  test("is 10 + DEX, using the racially adjusted score", () => {
    expect(baseArmorClass(compendium, loreBard)).toBe(13);
  });
});

describe("allSkillModifiers", () => {
  test("returns all 18 skills with ability modifier when not proficient", () => {
    const skills = allSkillModifiers(compendium, loreBard);
    expect(skills).toHaveLength(18);
    const athletics = skills.find((s) => s.index === "skill-athletics")!;
    // loreBard STR 8 (racial bonus none) -> -1, no proficiency marked.
    expect(athletics.proficient).toBe(false);
    expect(athletics.modifier).toBe(-1);
    expect(athletics.modifierText).toBe("-1");
  });

  test("adds the full proficiency bonus when the skill is marked", () => {
    const skills = allSkillModifiers(compendium, {
      ...loreBard,
      proficiencies: ["skill-stealth"],
    });
    const stealth = skills.find((s) => s.index === "skill-stealth")!;
    // DEX 16 -> +3, proficiency bonus at level 3 -> +2.
    expect(stealth.proficient).toBe(true);
    expect(stealth.modifier).toBe(5);
  });

  test("an unmarked skill never gets the proficiency bonus", () => {
    const skills = allSkillModifiers(compendium, {
      ...loreBard,
      proficiencies: ["skill-stealth"],
    });
    const arcana = skills.find((s) => s.index === "skill-arcana")!;
    expect(arcana.proficient).toBe(false);
    // INT 12 (no racial bonus) -> +1, no proficiency bonus added.
    expect(arcana.modifier).toBe(1);
  });
});

describe("racialSpeed / totalSpeed", () => {
  test("reads the race's base speed", () => {
    expect(racialSpeed(compendium, { raceIndex: "dwarf" })).toBe(25);
    expect(racialSpeed(compendium, { raceIndex: "elf" })).toBe(30);
  });

  test("is 0 with no race rather than a made-up number", () => {
    expect(racialSpeed(compendium, {})).toBe(0);
  });

  test("totalSpeed falls back to the racial base with no override", () => {
    expect(totalSpeed(compendium, { raceIndex: "dwarf" })).toBe(25);
  });

  test("a speedOverride replaces the racial base outright", () => {
    expect(
      totalSpeed(compendium, {
        raceIndex: "dwarf",
        coreStats: { speedOverride: 35 },
      })
    ).toBe(35);
  });
});

describe("totalArmorClass", () => {
  test("equals the derived base with no adjustment", () => {
    expect(totalArmorClass(compendium, loreBard)).toBe(13);
  });

  test("adds the coreStats.acBonus adjustment on top of the derived base", () => {
    expect(
      totalArmorClass(compendium, {
        ...loreBard,
        coreStats: { acBonus: 4 },
      })
    ).toBe(17);
  });
});

describe("totalInitiativeBonus", () => {
  test("equals the DEX modifier with no adjustment", () => {
    expect(totalInitiativeBonus(compendium, loreBard)).toBe(3);
  });

  test("adds the coreStats.initiativeBonus adjustment", () => {
    expect(
      totalInitiativeBonus(compendium, {
        ...loreBard,
        coreStats: { initiativeBonus: 5 },
      })
    ).toBe(8);
  });
});

describe("spellSlots", () => {
  test("lists a caster's slots by level", () => {
    expect(spellSlots(compendium, loreBard)).toEqual([
      { level: 1, slots: 4 },
      { level: 2, slots: 2 },
    ]);
  });

  test("is empty for a non-caster", () => {
    expect(
      spellSlots(compendium, { classIndex: "barbarian", level: 20 })
    ).toEqual([]);
  });
});

describe("racialTraits", () => {
  test("merges race and subrace traits without repeating any", () => {
    const traits = racialTraits(compendium, loreBard).map((t) => t.index);
    expect(traits).toContain("darkvision"); // elf
    expect(traits).toContain("high-elf-cantrip"); // high elf
    expect(new Set(traits).size).toBe(traits.length);
  });

  test("ignores a subrace from another race", () => {
    const traits = racialTraits(compendium, {
      raceIndex: "dwarf",
      subraceIndex: "high-elf",
    }).map((t) => t.index);
    expect(traits).not.toContain("high-elf-cantrip");
  });
});

describe("savingThrowProficiencies", () => {
  test("reads them from the class", () => {
    expect(savingThrowProficiencies(compendium, loreBard).sort()).toEqual([
      "cha",
      "dex",
    ]);
  });

  test("is empty with no class", () => {
    expect(savingThrowProficiencies(compendium, {})).toEqual([]);
  });
});

describe("sheetSummary", () => {
  test("describes the sheet in Portuguese around the English SRD names", () => {
    const summary = sheetSummary(compendium, loreBard);
    expect(summary.line).toBe("Bard (Lore) nível 3 — Elf (High Elf)");
    expect(summary.proficiencyBonus).toBe(2);
  });

  test("an empty sheet reads as empty rather than throwing", () => {
    const summary = sheetSummary(compendium, {});
    expect(summary.line).toBe("Sem classe — Sem raça");
    expect(summary.maxHitPoints).toBe(0);
  });
});

describe("featuresByLevel", () => {
  test("groups the earned features by the level that granted them", () => {
    const groups = featuresByLevel(compendium, loreBard);
    expect(groups.map((g) => g.level)).toEqual([1, 2, 3]);
    const third = groups.find((g) => g.level === 3)!;
    expect(third.features.some((f) => f.name.includes("Expertise"))).toBe(true);
  });
});

describe("parseSheet / serialiseSheet", () => {
  test("round trips", () => {
    expect(parseSheet(serialiseSheet(loreBard))).toEqual({
      ...loreBard,
      v: 1,
    });
  });

  test("an early character's empty sheet parses as an empty sheet", () => {
    // Every character created before player sheets existed has exactly "{}".
    expect(parseSheet("{}")).toEqual({});
    expect(parseSheet("")).toEqual({});
  });

  test("garbage parses as empty instead of throwing", () => {
    expect(parseSheet("not json")).toEqual({});
    expect(parseSheet("[1,2,3]")).toEqual({});
    expect(parseSheet("null")).toEqual({});
  });

  test("serialising stamps the schema version", () => {
    expect(JSON.parse(serialiseSheet({})).v).toBe(1);
  });
});
