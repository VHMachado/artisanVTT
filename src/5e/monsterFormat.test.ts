import { describe, expect, it } from "vitest";

import {
  abilityModifier,
  abilityScores,
  armorClassText,
  challengeRatingText,
  listText,
  savingThrowsText,
  sensesText,
  signed,
  skillsText,
  speedText,
  typeLine,
  usageText,
} from "./monsterFormat";
import type { Monster } from "../types/Monster";

/** Minimal valid monster; each case overrides only what it exercises. */
function monster(overrides: Partial<Monster> = {}): Monster {
  return {
    index: "test-monster",
    name: "Test Monster",
    size: "Medium",
    type: "humanoid",
    alignment: "neutral",
    armor_class: [{ type: "dex", value: 12 }],
    hit_points: 10,
    hit_dice: "3d8",
    speed: { walk: "30 ft." },
    strength: 10,
    dexterity: 14,
    constitution: 11,
    intelligence: 8,
    wisdom: 12,
    charisma: 6,
    proficiencies: [],
    damage_vulnerabilities: [],
    damage_resistances: [],
    damage_immunities: [],
    condition_immunities: [],
    senses: { passive_perception: 11 },
    languages: "Common",
    challenge_rating: 1,
    proficiency_bonus: 2,
    xp: 200,
    ...overrides,
  };
}

describe("challengeRatingText", () => {
  it("renders the SRD's fractional ratings as fractions", () => {
    expect(challengeRatingText(0.125)).toBe("1/8");
    expect(challengeRatingText(0.25)).toBe("1/4");
    expect(challengeRatingText(0.5)).toBe("1/2");
  });

  it("leaves whole ratings as plain integers", () => {
    expect(challengeRatingText(0)).toBe("0");
    expect(challengeRatingText(1)).toBe("1");
    expect(challengeRatingText(30)).toBe("30");
  });
});

describe("abilityModifier", () => {
  it("floors toward negative infinity, as 5e does", () => {
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(9)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(20)).toBe(5);
    expect(abilityModifier(30)).toBe(10);
  });
});

describe("signed", () => {
  it("always carries an explicit sign, including for zero", () => {
    expect(signed(3)).toBe("+3");
    expect(signed(0)).toBe("+0");
    expect(signed(-2)).toBe("-2");
  });
});

describe("typeLine", () => {
  it("includes the subtype in parentheses when present", () => {
    expect(
      typeLine(monster({ size: "Medium", type: "humanoid", subtype: "dwarf", alignment: "lawful evil" }))
    ).toBe("Medium humanoid (dwarf), lawful evil");
  });

  it("omits the parentheses entirely when there is no subtype", () => {
    expect(
      typeLine(monster({ size: "Large", type: "beast", alignment: "unaligned" }))
    ).toBe("Large beast, unaligned");
  });
});

describe("armorClassText", () => {
  it("names the armor worn for an armor-based AC", () => {
    expect(
      armorClassText([
        {
          type: "armor",
          value: 16,
          armor: [
            { index: "scale-mail", name: "Scale Mail" },
            { index: "shield", name: "Shield" },
          ],
        },
      ])
    ).toBe("16 (scale mail, shield)");
  });

  it("labels natural armor and leaves a dex AC bare", () => {
    expect(armorClassText([{ type: "natural", value: 17 }])).toBe(
      "17 (natural armor)"
    );
    expect(armorClassText([{ type: "dex", value: 13 }])).toBe("13");
  });

  it("keeps conditional entries instead of dropping them", () => {
    // A few SRD monsters carry a second, situational AC — silently showing
    // only the first would lose real rules information.
    expect(
      armorClassText([
        { type: "natural", value: 16 },
        {
          type: "condition",
          value: 11,
          condition: { index: "prone", name: "Prone" },
        },
      ])
    ).toBe("16 (natural armor), 11 (while prone)");
  });

  it("does not render an empty line when there is no AC at all", () => {
    expect(armorClassText([])).toBe("—");
  });
});

describe("speedText", () => {
  it("lists walk first and marks hovering flight", () => {
    expect(
      speedText({ walk: "10 ft.", fly: "60 ft.", hover: true })
    ).toBe("10 ft., fly 60 ft. (hover)");
  });

  it("omits the hover note for ordinary flight", () => {
    expect(speedText({ walk: "30 ft.", fly: "60 ft." })).toBe(
      "30 ft., fly 60 ft."
    );
  });

  it("handles a creature with no walking speed", () => {
    expect(speedText({ swim: "40 ft." })).toBe("swim 40 ft.");
    expect(speedText({})).toBe("—");
  });
});

describe("sensesText", () => {
  it("always ends with passive Perception", () => {
    expect(
      sensesText({ darkvision: "120 ft.", passive_perception: 10 })
    ).toBe("darkvision 120 ft., passive Perception 10");
    expect(sensesText({ passive_perception: 12 })).toBe(
      "passive Perception 12"
    );
  });
});

describe("savingThrowsText / skillsText", () => {
  const proficiencies = [
    { value: 6, proficiency: { index: "saving-throw-con", name: "Saving Throw: CON" } },
    { value: 8, proficiency: { index: "skill-perception", name: "Skill: Perception" } },
    { value: 4, proficiency: { index: "skill-stealth", name: "Skill: Stealth" } },
  ];

  it("splits the SRD's single proficiency list into its two stat block lines", () => {
    expect(savingThrowsText(proficiencies)).toBe("CON +6");
    expect(skillsText(proficiencies)).toBe("Perception +8, Stealth +4");
  });

  it("returns an empty string when a monster has neither", () => {
    expect(savingThrowsText([])).toBe("");
    expect(skillsText([])).toBe("");
  });
});

describe("listText", () => {
  it("joins values and falls back to a dash", () => {
    expect(listText(["poison", "fire"])).toBe("poison, fire");
    expect(listText([])).toBe("—");
  });
});

describe("usageText", () => {
  it("renders each of the three SRD usage types", () => {
    expect(
      usageText({ name: "Breath", desc: "", usage: { type: "recharge on roll", dice: "1d6", min_value: 5 } })
    ).toBe("Recharge 5-6");
    expect(
      usageText({ name: "Spell", desc: "", usage: { type: "per day", times: 3 } })
    ).toBe("3/Day");
    expect(
      usageText({
        name: "Enlarge",
        desc: "",
        usage: { type: "recharge after rest", rest_types: ["short", "long"] },
      })
    ).toBe("Recharge after a Short or Long Rest");
  });

  it("is empty for an ability with no usage limit", () => {
    expect(usageText({ name: "Bite", desc: "" })).toBe("");
  });
});

describe("abilityScores", () => {
  it("returns the six scores in printed order with signed modifiers", () => {
    const scores = abilityScores(
      monster({
        strength: 18,
        dexterity: 11,
        constitution: 16,
        intelligence: 6,
        wisdom: 12,
        charisma: 7,
      })
    );
    expect(scores.map((s) => s.label)).toEqual([
      "STR",
      "DEX",
      "CON",
      "INT",
      "WIS",
      "CHA",
    ]);
    expect(scores.map((s) => s.modifier)).toEqual([
      "+4",
      "+0",
      "+3",
      "-2",
      "+1",
      "-2",
    ]);
  });
});
