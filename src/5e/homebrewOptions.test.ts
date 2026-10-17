import { describe, expect, it, beforeAll } from "vitest";

import { loadCompendium, type Compendium } from "./compendium";
import {
  eligibleSubclasses,
  eligibleSubraces,
  earnedFeatures,
  homebrewFeatures,
  isHomebrewOptionId,
  type HomebrewContext,
} from "./prerequisites";
import {
  racialAbilityBonuses,
  resolveAbilities,
  featuresByLevel,
} from "./characterSheet";
import {
  serialiseRuleOptionPayload,
  type TableRuleOption,
} from "../types/HomebrewOption";

/**
 * The table's own subraces and subclasses.
 *
 * The bug that motivated this phase: a player picked Elf and was offered
 * only High Elf, because the vendored 2014 SRD contains exactly ONE subrace
 * per race and one subclass per class. Drow, Wood Elf and College of Valor
 * are Player's Handbook text, not SRD, so they can never ship with the app.
 * These tests pin the mechanism that lets a table add them, and — equally
 * important — that adding them does not disturb the 12d engine.
 */

let compendium: Compendium;

beforeAll(async () => {
  compendium = await loadCompendium();
});

function option(
  over: Partial<TableRuleOption> & Pick<TableRuleOption, "kind" | "parentIndex">
): TableRuleOption {
  return {
    id: over.id ?? "opt-1",
    tableId: "t1",
    name: over.name ?? "Homebrew",
    payload: over.payload ?? "{}",
    ownerAccountId: over.ownerAccountId ?? 7,
    ownerDisplayName: over.ownerDisplayName ?? "Mestre",
    createdAt: 0,
    updatedAt: 0,
    version: 1,
    deleted: over.deleted,
    ...over,
  } as TableRuleOption;
}

function ctx(options: TableRuleOption[]): HomebrewContext {
  return { options };
}

const drow = option({
  id: "hb-drow",
  kind: "subrace",
  parentIndex: "elf",
  name: "Drow",
  payload: serialiseRuleOptionPayload({
    abilityBonuses: { cha: 1 },
    features: [
      { name: "Visão no Escuro Superior", desc: "Alcance de 36 metros." },
      { name: "Sensibilidade à Luz Solar", desc: "Desvantagem sob luz direta." },
    ],
  }),
});

const woodElf = option({
  id: "hb-wood-elf",
  kind: "subrace",
  parentIndex: "elf",
  name: "Wood Elf",
  payload: serialiseRuleOptionPayload({ abilityBonuses: { wis: 1 } }),
});

describe("the defect this phase fixes", () => {
  it("offers only High Elf from the SRD alone", () => {
    // Not a bug, a dataset limit — pinned so nobody 'fixes' the engine.
    const names = eligibleSubraces(compendium, { raceIndex: "elf" }).map(
      (o) => o.name
    );
    expect(names).toEqual(["High Elf"]);
  });

  it("offers High Elf, Drow and Wood Elf once the table adds them", () => {
    const options = eligibleSubraces(
      compendium,
      { raceIndex: "elf" },
      ctx([drow, woodElf])
    );
    expect(options.map((o) => o.name)).toEqual([
      "Drow",
      "High Elf",
      "Wood Elf",
    ]);
    // All three are pickable; the table's two are labelled as such.
    expect(options.every((o) => o.eligible)).toBe(true);
    expect(options.filter((o) => o.source === "table").map((o) => o.name)).toEqual(
      ["Drow", "Wood Elf"]
    );
    expect(options.find((o) => o.name === "Drow")?.authorName).toBe("Mestre");
  });
});

describe("eligibleSubraces with homebrew", () => {
  it("ignores options belonging to another race", () => {
    const dwarfOption = option({
      id: "hb-mountain",
      kind: "subrace",
      parentIndex: "dwarf",
      name: "Mountain Dwarf",
    });
    const names = eligibleSubraces(
      compendium,
      { raceIndex: "elf" },
      ctx([drow, dwarfOption])
    ).map((o) => o.name);
    expect(names).toContain("Drow");
    expect(names).not.toContain("Mountain Dwarf");
  });

  it("ignores deleted options", () => {
    const names = eligibleSubraces(
      compendium,
      { raceIndex: "elf" },
      ctx([{ ...drow, deleted: true }])
    ).map((o) => o.name);
    expect(names).toEqual(["High Elf"]);
  });

  it("ignores subclass options in the subrace list", () => {
    const subclass = option({
      id: "hb-valor",
      kind: "subclass",
      parentIndex: "bard",
      name: "College of Valor",
    });
    const names = eligibleSubraces(
      compendium,
      { raceIndex: "elf" },
      ctx([subclass])
    ).map((o) => o.name);
    expect(names).toEqual(["High Elf"]);
  });

  it("still yields nothing for a race with no subraces and no homebrew", () => {
    expect(
      eligibleSubraces(compendium, { raceIndex: "human" }, ctx([drow]))
    ).toEqual([]);
  });
});

describe("eligibleSubclasses with homebrew", () => {
  const valor = option({
    id: "hb-valor",
    kind: "subclass",
    parentIndex: "bard",
    name: "College of Valor",
    payload: serialiseRuleOptionPayload({
      features: [{ name: "Combat Inspiration", desc: "..." }],
    }),
  });

  it("merges the table's subclasses with the SRD's", () => {
    const options = eligibleSubclasses(
      compendium,
      { classIndex: "bard", level: 3 },
      ctx([valor])
    );
    // The SRD names its subclasses bare ("Lore", not "College of Lore"),
    // and the merged list sorts alphabetically regardless of source.
    expect(options.map((o) => o.name)).toEqual(["College of Valor", "Lore"]);
    expect(options.every((o) => o.eligible)).toBe(true);
  });

  it("gates homebrew by the SAME level rule as the SRD", () => {
    // A bard gets a subclass at 3; a level 1 bard may choose neither.
    const options = eligibleSubclasses(
      compendium,
      { classIndex: "bard", level: 1 },
      ctx([valor])
    );
    expect(options).toHaveLength(2);
    expect(options.every((o) => !o.eligible)).toBe(true);
    for (const o of options) {
      expect(o.reason).toBe("Disponível a partir do nível 3");
    }
  });

  it("ignores options belonging to another class", () => {
    const thief = option({
      id: "hb-trickster",
      kind: "subclass",
      parentIndex: "rogue",
      name: "Arcane Trickster",
    });
    const names = eligibleSubclasses(
      compendium,
      { classIndex: "bard", level: 3 },
      ctx([valor, thief])
    ).map((o) => o.name);
    expect(names).toEqual(["College of Valor", "Lore"]);
  });
});

describe("a homebrew subclass does not inherit SRD subclass features", () => {
  it("grants the class's features but none of College of Lore's", () => {
    const valor = option({
      id: "hb-valor",
      kind: "subclass",
      parentIndex: "bard",
      name: "College of Valor",
    });
    const sheet = { classIndex: "bard", level: 3, subclassIndex: "hb-valor" };
    const features = earnedFeatures(compendium, sheet, ctx([valor])).map(
      (f) => f.index
    );
    // Bardic Inspiration is the class's: still there.
    expect(features.some((i) => i.includes("bardic-inspiration"))).toBe(true);
    // Cutting Words / Bonus Proficiencies belong to College of Lore: absent.
    // Without the isHomebrewOptionId guard these would leak in only if the
    // ids collided, so assert the stronger property: NO feature is
    // subclass-gated.
    const gated = earnedFeatures(compendium, sheet, ctx([valor])).filter(
      (f) => f.subclass
    );
    expect(gated).toEqual([]);
  });

  it("still grants the SRD subclass's features when the SRD one is chosen", () => {
    const gated = earnedFeatures(compendium, {
      classIndex: "bard",
      level: 3,
      subclassIndex: "lore",
    }).filter((f) => f.subclass);
    expect(gated.length).toBeGreaterThan(0);
  });
});

describe("homebrewFeatures", () => {
  it("lists a subrace's traits from level 1", () => {
    const features = homebrewFeatures(
      compendium,
      { raceIndex: "elf", subraceIndex: "hb-drow", level: 1 },
      ctx([drow])
    );
    expect(features.map((f) => f.name)).toEqual([
      "Sensibilidade à Luz Solar",
      "Visão no Escuro Superior",
    ]);
    expect(features.every((f) => f.level === 1)).toBe(true);
    expect(features[0].from).toBe("Drow");
  });

  it("defaults a subclass feature to the class's subclass level", () => {
    const valor = option({
      id: "hb-valor",
      kind: "subclass",
      parentIndex: "bard",
      name: "College of Valor",
      payload: serialiseRuleOptionPayload({
        features: [{ name: "Combat Inspiration", desc: "..." }],
      }),
    });
    // At level 1 a bard has no subclass yet, so nothing is granted…
    expect(
      homebrewFeatures(
        compendium,
        { classIndex: "bard", level: 1, subclassIndex: "hb-valor" },
        ctx([valor])
      )
    ).toEqual([]);
    // …and at 3 it is.
    const at3 = homebrewFeatures(
      compendium,
      { classIndex: "bard", level: 3, subclassIndex: "hb-valor" },
      ctx([valor])
    );
    expect(at3.map((f) => f.level)).toEqual([3]);
  });

  it("honours an explicit level and withholds what the character hasn't reached", () => {
    const valor = option({
      id: "hb-valor",
      kind: "subclass",
      parentIndex: "bard",
      name: "College of Valor",
      payload: serialiseRuleOptionPayload({
        features: [
          { name: "Combat Inspiration", desc: "...", level: 3 },
          { name: "Extra Attack", desc: "...", level: 6 },
        ],
      }),
    });
    const sheet = { classIndex: "bard", subclassIndex: "hb-valor" };
    expect(
      homebrewFeatures(compendium, { ...sheet, level: 3 }, ctx([valor])).map(
        (f) => f.name
      )
    ).toEqual(["Combat Inspiration"]);
    expect(
      homebrewFeatures(compendium, { ...sheet, level: 6 }, ctx([valor])).map(
        (f) => f.name
      )
    ).toEqual(["Combat Inspiration", "Extra Attack"]);
  });

  it("survives an unreadable payload instead of breaking the sheet", () => {
    const broken = option({
      id: "hb-broken",
      kind: "subrace",
      parentIndex: "elf",
      name: "Quebrada",
      payload: "{not json",
    });
    expect(
      homebrewFeatures(
        compendium,
        { raceIndex: "elf", subraceIndex: "hb-broken" },
        ctx([broken])
      )
    ).toEqual([]);
    // And it's still offered — the name is intact even if the body isn't.
    expect(
      eligibleSubraces(compendium, { raceIndex: "elf" }, ctx([broken])).map(
        (o) => o.name
      )
    ).toContain("Quebrada");
  });

  it("returns nothing without a homebrew context", () => {
    expect(
      homebrewFeatures(compendium, { raceIndex: "elf", subraceIndex: "hb-drow" })
    ).toEqual([]);
  });
});

describe("ability bonuses from a homebrew subrace", () => {
  it("applies them like a vendored subrace's", () => {
    // Elf gives +2 DEX; Drow adds +1 CHA.
    const bonuses = racialAbilityBonuses(
      compendium,
      { raceIndex: "elf", subraceIndex: "hb-drow" },
      ctx([drow])
    );
    expect(bonuses.dex).toBe(2);
    expect(bonuses.cha).toBe(1);
  });

  it("reaches the resolved ability totals", () => {
    const cha = resolveAbilities(
      compendium,
      {
        raceIndex: "elf",
        subraceIndex: "hb-drow",
        abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 14 },
      },
      ctx([drow])
    ).find((a) => a.key === "cha");
    expect(cha?.racialBonus).toBe(1);
    expect(cha?.total).toBe(15);
    expect(cha?.modifier).toBe(2);
  });

  it("does not apply an option belonging to another race", () => {
    // A stale pick after the player switched race must not keep paying out.
    const bonuses = racialAbilityBonuses(
      compendium,
      { raceIndex: "dwarf", subraceIndex: "hb-drow" },
      ctx([drow])
    );
    expect(bonuses.cha).toBeUndefined();
  });

  it("ignores a deleted option", () => {
    const bonuses = racialAbilityBonuses(
      compendium,
      { raceIndex: "elf", subraceIndex: "hb-drow" },
      ctx([{ ...drow, deleted: true }])
    );
    expect(bonuses.cha).toBeUndefined();
  });

  it("ignores a non-numeric bonus", () => {
    const junk = option({
      id: "hb-junk",
      kind: "subrace",
      parentIndex: "elf",
      name: "Junk",
      payload: JSON.stringify({ abilityBonuses: { cha: "muito" } }),
    });
    const bonuses = racialAbilityBonuses(
      compendium,
      { raceIndex: "elf", subraceIndex: "hb-junk" },
      ctx([junk])
    );
    expect(bonuses.cha).toBeUndefined();
  });
});

describe("featuresByLevel interleaves homebrew with printed features", () => {
  it("puts a homebrew subclass feature in its level's group", () => {
    const valor = option({
      id: "hb-valor",
      kind: "subclass",
      parentIndex: "bard",
      name: "College of Valor",
      payload: serialiseRuleOptionPayload({
        features: [{ name: "Combat Inspiration", desc: "Bônus de dano." }],
      }),
    });
    const groups = featuresByLevel(
      compendium,
      { classIndex: "bard", level: 3, subclassIndex: "hb-valor" },
      ctx([valor])
    );
    const third = groups.find((g) => g.level === 3);
    expect(third).toBeDefined();
    expect(third?.features.map((f) => f.name)).toContain(
      "Combat Inspiration (College of Valor)"
    );
    // Level 1 still carries the class's own features.
    expect(groups.find((g) => g.level === 1)?.features.length).toBeGreaterThan(0);
  });
});

describe("isHomebrewOptionId", () => {
  it("distinguishes a table option from an SRD index", () => {
    expect(isHomebrewOptionId(ctx([drow]), "hb-drow")).toBe(true);
    expect(isHomebrewOptionId(ctx([drow]), "high-elf")).toBe(false);
    expect(isHomebrewOptionId(ctx([{ ...drow, deleted: true }]), "hb-drow")).toBe(
      false
    );
    expect(isHomebrewOptionId(undefined, "hb-drow")).toBe(false);
    expect(isHomebrewOptionId(ctx([drow]), undefined)).toBe(false);
  });
});

describe("12d behaviour is unchanged when no homebrew exists", () => {
  it("matches the SRD-only results", () => {
    const empty = ctx([]);
    expect(
      eligibleSubraces(compendium, { raceIndex: "elf" }, empty).map(
        (o) => o.index
      )
    ).toEqual(eligibleSubraces(compendium, { raceIndex: "elf" }).map((o) => o.index));
    expect(
      eligibleSubclasses(compendium, { classIndex: "bard", level: 3 }, empty).map(
        (o) => o.index
      )
    ).toEqual(
      eligibleSubclasses(compendium, { classIndex: "bard", level: 3 }).map(
        (o) => o.index
      )
    );
    const sheet = { classIndex: "bard", level: 3, subclassIndex: "lore" };
    expect(earnedFeatures(compendium, sheet, empty).map((f) => f.index)).toEqual(
      earnedFeatures(compendium, sheet).map((f) => f.index)
    );
  });
});
