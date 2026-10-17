import { beforeAll, describe, expect, test } from "vitest";

import { loadCompendium, Compendium } from "./compendium";
import {
  choiceOptions,
  earnedFeatures,
  eligibleSpells,
  eligibleSubclasses,
  eligibleSubraces,
  featureChoices,
  maxSpellLevel,
  meetsFeaturePrerequisites,
  pendingChoices,
  sheetProblems,
  slugFromPath,
  subclassLevel,
} from "./prerequisites";

import type { CharacterSheet } from "../types/CharacterSheet";

/**
 * The prerequisite engine, tested against the REAL vendored
 * datasets rather than fixtures — this is the point where other VTTs
 * famously fall short, and a fixture that agrees with a buggy reading of
 * the data would prove nothing.
 */

let compendium: Compendium;

beforeAll(async () => {
  compendium = await loadCompendium();
});

describe("the vendored datasets", () => {
  test("load with the expected shape", () => {
    expect(compendium.classes).toHaveLength(12);
    expect(compendium.subclasses).toHaveLength(12);
    expect(compendium.races).toHaveLength(9);
    expect(compendium.subraces).toHaveLength(4);
    expect(compendium.features).toHaveLength(407);
    expect(compendium.levels).toHaveLength(290);
    expect(compendium.spells).toHaveLength(319);
    expect(compendium.traits).toHaveLength(38);
  });

  test("carry no url/image keys back from the API host", () => {
    // The vendor script strips them; the whole point of vendoring is
    // never depending on an
    // external API at session time, so a bump that reintroduced them
    // would quietly break the offline-first promise.
    const text = JSON.stringify([
      compendium.classes,
      compendium.features,
      compendium.spells,
    ]);
    expect(text).not.toContain('"url"');
    expect(text).not.toContain('"image"');
  });

  test("memoises: a second load returns the same instance", () => {
    return expect(loadCompendium()).resolves.toBe(compendium);
  });
});

describe("subclassLevel", () => {
  test("is read from the data, matching 5e's actual tables", () => {
    expect(subclassLevel(compendium, "cleric")).toBe(1);
    expect(subclassLevel(compendium, "sorcerer")).toBe(1);
    expect(subclassLevel(compendium, "warlock")).toBe(1);
    expect(subclassLevel(compendium, "druid")).toBe(2);
    expect(subclassLevel(compendium, "wizard")).toBe(2);
    expect(subclassLevel(compendium, "bard")).toBe(3);
    expect(subclassLevel(compendium, "rogue")).toBe(3);
  });
});

describe("eligibleSubclasses", () => {
  test("only offers the chosen class's subclasses", () => {
    const options = eligibleSubclasses(compendium, {
      classIndex: "bard",
      level: 3,
    });
    expect(options.map((o) => o.index)).toEqual(["lore"]);
  });

  test("marks them ineligible below the class's subclass level, with a reason", () => {
    const options = eligibleSubclasses(compendium, {
      classIndex: "bard",
      level: 2,
    });
    expect(options[0].eligible).toBe(false);
    expect(options[0].reason).toContain("3");
  });

  test("a cleric may choose at level 1", () => {
    const options = eligibleSubclasses(compendium, {
      classIndex: "cleric",
      level: 1,
    });
    expect(options[0].eligible).toBe(true);
  });

  test("no class chosen means nothing to offer", () => {
    expect(eligibleSubclasses(compendium, {})).toEqual([]);
  });
});

describe("eligibleSubraces", () => {
  test("offers only the chosen race's subraces", () => {
    expect(
      eligibleSubraces(compendium, { raceIndex: "elf" }).map((o) => o.index)
    ).toEqual(["high-elf"]);
  });

  test("a race with no subrace yields an empty list", () => {
    expect(eligibleSubraces(compendium, { raceIndex: "human" })).toEqual([]);
  });
});

describe("earnedFeatures — the subclass-isolation rule", () => {
  test("a subclass feature never reaches a character of another subclass", () => {
    // "Se a habilidade exige uma subclasse específica de Bardo, ela não
    // aparece para outra subclasse."
    const loreBard: CharacterSheet = {
      classIndex: "bard",
      subclassIndex: "lore",
      level: 6,
    };
    const names = earnedFeatures(compendium, loreBard).map((f) => f.index);
    expect(names).toContain("cutting-words");

    const subclasslessBard: CharacterSheet = { classIndex: "bard", level: 6 };
    expect(
      earnedFeatures(compendium, subclasslessBard).map((f) => f.index)
    ).not.toContain("cutting-words");
  });

  test("a barbarian never sees another class's features", () => {
    const features = earnedFeatures(compendium, {
      classIndex: "barbarian",
      subclassIndex: "berserker",
      level: 20,
    });
    expect(features.every((f) => f.class.index === "barbarian")).toBe(true);
  });

  test("features above the character's level are withheld", () => {
    const low = earnedFeatures(compendium, {
      classIndex: "barbarian",
      subclassIndex: "berserker",
      level: 2,
    });
    expect(low.every((f) => f.level <= 2)).toBe(true);
    expect(low.map((f) => f.index)).not.toContain("frenzy"); // level 3
  });

  test("levelling up adds a subclass feature that was withheld", () => {
    const at2 = earnedFeatures(compendium, {
      classIndex: "barbarian",
      subclassIndex: "berserker",
      level: 2,
    }).map((f) => f.index);
    const at3 = earnedFeatures(compendium, {
      classIndex: "barbarian",
      subclassIndex: "berserker",
      level: 3,
    }).map((f) => f.index);
    expect(at2).not.toContain("frenzy");
    expect(at3).toContain("frenzy");
  });

  test("no class chosen yields nothing rather than everything", () => {
    expect(earnedFeatures(compendium, { level: 20 })).toEqual([]);
  });

  test("every returned feature is sorted by level", () => {
    const features = earnedFeatures(compendium, {
      classIndex: "wizard",
      subclassIndex: "evocation",
      level: 20,
    });
    const levels = features.map((f) => f.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });
});

describe("meetsFeaturePrerequisites", () => {
  const warlock: CharacterSheet = {
    classIndex: "warlock",
    subclassIndex: "fiend",
    level: 5,
  };

  test("a spell prerequisite blocks until the spell is known", () => {
    const feature = compendium.featureByIndex.get(
      "eldritch-invocation-agonizing-blast"
    )!;
    const without = meetsFeaturePrerequisites(compendium, warlock, feature);
    expect(without.eligible).toBe(false);
    expect(without.reason).toContain("Eldritch Blast");

    const withSpell = meetsFeaturePrerequisites(
      compendium,
      { ...warlock, spells: ["eldritch-blast"] },
      feature
    );
    expect(withSpell.eligible).toBe(true);
  });

  test("a feature prerequisite blocks until the other feature is earned", () => {
    const feature = compendium.featureByIndex.get(
      "eldritch-invocation-book-of-ancient-secrets"
    )!;
    // Pact of the Tome is a level-3 warlock feature.
    const tooLow = meetsFeaturePrerequisites(
      compendium,
      { ...warlock, level: 2 },
      feature
    );
    expect(tooLow.eligible).toBe(false);
    expect(meetsFeaturePrerequisites(compendium, warlock, feature).eligible).toBe(
      true
    );
  });

  test("a feature with no prerequisites is always eligible", () => {
    const feature = compendium.featureByIndex.get("rage")!;
    expect(
      meetsFeaturePrerequisites(compendium, { classIndex: "barbarian" }, feature)
        .eligible
    ).toBe(true);
  });

  test("every prerequisite in the dataset uses a shape the engine handles", () => {
    // A dataset bump introducing a fourth prerequisite type would
    // otherwise be silently ignored (treated as "met").
    const handled = new Set(["level", "feature", "spell"]);
    const unhandled = compendium.features
      .flatMap((f) => f.prerequisites || [])
      .filter((p) => !handled.has(p.type));
    expect(unhandled).toEqual([]);
  });
});

describe("slugFromPath", () => {
  test("extracts the slug from an upstream API path", () => {
    expect(slugFromPath("/api/2014/spells/eldritch-blast")).toBe(
      "eldritch-blast"
    );
    expect(slugFromPath("eldritch-blast")).toBe("eldritch-blast");
  });
});

describe("eligibleSpells", () => {
  test("a subclass ADDS spells, it never narrows the class list", () => {
    // spell.subclasses is additive in the SRD; reading it as a
    // restriction would hide most of the bard list from a Lore bard.
    const plain = eligibleSpells(compendium, { classIndex: "bard", level: 20 });
    const lore = eligibleSpells(compendium, {
      classIndex: "bard",
      subclassIndex: "lore",
      level: 20,
    });
    expect(lore.length).toBeGreaterThanOrEqual(plain.length);
    const loreIndexes = new Set(lore.map((s) => s.index));
    expect(plain.every((s) => loreIndexes.has(s.index))).toBe(true);
    // Fireball is a sorcerer/wizard spell that Lore bards reach via
    // magical secrets — it must appear for Lore and not for a plain bard.
    expect(loreIndexes.has("fireball")).toBe(true);
    expect(plain.some((s) => s.index === "fireball")).toBe(false);
  });

  test("a non-caster gets nothing", () => {
    expect(
      eligibleSpells(compendium, {
        classIndex: "barbarian",
        subclassIndex: "berserker",
        level: 20,
      })
    ).toEqual([]);
  });

  test("spell level is capped by the slots the character actually has", () => {
    const level1 = eligibleSpells(compendium, { classIndex: "wizard", level: 1 });
    expect(level1.every((s) => s.level <= 1)).toBe(true);
    const level5 = eligibleSpells(compendium, { classIndex: "wizard", level: 5 });
    expect(level5.some((s) => s.level === 3)).toBe(true);
    expect(level5.every((s) => s.level <= 3)).toBe(true);
  });

  test("cantrips are available at level 1", () => {
    const spells = eligibleSpells(compendium, { classIndex: "wizard", level: 1 });
    expect(spells.some((s) => s.level === 0)).toBe(true);
  });

  test("every offered spell really belongs to the class or its subclass", () => {
    const sheet: CharacterSheet = {
      classIndex: "druid",
      subclassIndex: "land",
      level: 20,
    };
    for (const spell of eligibleSpells(compendium, sheet)) {
      const ok =
        spell.classes.some((c) => c.index === "druid") ||
        spell.subclasses.some((s) => s.index === "land");
      expect(ok).toBe(true);
    }
  });
});

describe("maxSpellLevel", () => {
  test("is 0 for a non-caster and grows with the class table", () => {
    expect(maxSpellLevel(compendium, { classIndex: "fighter", level: 20 })).toBe(
      0
    );
    expect(maxSpellLevel(compendium, { classIndex: "wizard", level: 1 })).toBe(1);
    expect(maxSpellLevel(compendium, { classIndex: "wizard", level: 9 })).toBe(5);
    expect(maxSpellLevel(compendium, { classIndex: "wizard", level: 17 })).toBe(
      9
    );
  });
});

describe("choiceOptions", () => {
  test("flattens a class's proficiency choice into concrete options", () => {
    const bard = compendium.classByIndex.get("bard")!;
    const options = choiceOptions(bard.proficiency_choices[0]);
    expect(options.length).toBeGreaterThan(10);
    expect(options.every((o) => o.index.startsWith("skill-"))).toBe(true);
  });

  test("never lists the same option twice", () => {
    for (const klass of compendium.classes) {
      for (const choice of klass.proficiency_choices) {
        const options = choiceOptions(choice);
        expect(new Set(options.map((o) => o.index)).size).toBe(options.length);
      }
    }
  });

  test("an option set the app can't resolve yields nothing, not broken rows", () => {
    expect(
      choiceOptions({
        choose: 1,
        type: "equipment",
        from: {
          option_set_type: "equipment_category",
          equipment_category: { index: "martial-weapons", name: "Martial" },
        },
      })
    ).toEqual([]);
  });
});

describe("featureChoices / pendingChoices", () => {
  test("finds a feature's embedded choose-N payload structurally", () => {
    const expertise = compendium.featureByIndex.get("bard-expertise-1")!;
    const choices = featureChoices(expertise);
    expect(choices).toHaveLength(1);
    expect(choices[0].choose).toBe(2);
  });

  test("a feature with no embedded choice yields none", () => {
    expect(featureChoices(compendium.featureByIndex.get("rage")!)).toEqual([]);
  });

  test("a level-3 Lore bard owes its class skills and its expertise", () => {
    const choices = pendingChoices(compendium, {
      classIndex: "bard",
      subclassIndex: "lore",
      level: 3,
    });
    expect(choices.some((c) => c.key === "class-proficiency-0")).toBe(true);
    expect(choices.some((c) => c.key === "feature:bard-expertise-1")).toBe(true);
  });

  test("a choice from a feature the character hasn't earned isn't asked", () => {
    const atLevel1 = pendingChoices(compendium, {
      classIndex: "bard",
      level: 1,
    });
    expect(atLevel1.some((c) => c.key === "feature:bard-expertise-1")).toBe(
      false
    );
  });

  test("already-made choices are carried back on the pending entry", () => {
    const choices = pendingChoices(compendium, {
      classIndex: "bard",
      subclassIndex: "lore",
      level: 3,
      featureChoices: { "feature:bard-expertise-1": ["skill-stealth"] },
    });
    const expertise = choices.find(
      (c) => c.key === "feature:bard-expertise-1"
    )!;
    expect(expertise.chosen).toEqual(["skill-stealth"]);
  });
});

describe("sheetProblems — a changed pick is reported, never silently kept", () => {
  test("a clean sheet has no problems", () => {
    expect(
      sheetProblems(compendium, {
        classIndex: "bard",
        subclassIndex: "lore",
        level: 3,
        spells: ["vicious-mockery"],
      })
    ).toEqual([]);
  });

  test("a subclass belonging to another class is flagged", () => {
    const problems = sheetProblems(compendium, {
      classIndex: "bard",
      subclassIndex: "thief",
      level: 3,
    });
    expect(problems.join(" ")).toContain("subclasse");
  });

  test("a subclass above the character's level is flagged", () => {
    const problems = sheetProblems(compendium, {
      classIndex: "bard",
      subclassIndex: "lore",
      level: 1,
    });
    expect(problems.join(" ")).toContain("nível 3");
  });

  test("a spell that stopped being legal after a subclass change is flagged", () => {
    // Fireball is legal for a Lore bard (magical secrets), not for a
    // subclass-less one — exactly the "changed my subclass" case.
    const before = sheetProblems(compendium, {
      classIndex: "bard",
      subclassIndex: "lore",
      level: 20,
      spells: ["fireball"],
    });
    expect(before).toEqual([]);

    const after = sheetProblems(compendium, {
      classIndex: "bard",
      level: 20,
      spells: ["fireball"],
    });
    expect(after.join(" ")).toContain("Fireball");
  });

  test("a subrace belonging to another race is flagged", () => {
    const problems = sheetProblems(compendium, {
      raceIndex: "dwarf",
      subraceIndex: "high-elf",
    });
    expect(problems.join(" ")).toContain("sub-raça");
  });

  test("a choice recorded for a feature the character lost is flagged once", () => {
    const problems = sheetProblems(compendium, {
      classIndex: "bard",
      level: 1,
      featureChoices: { "feature:bard-expertise-1": ["skill-stealth"] },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("não tem mais");
  });
});
