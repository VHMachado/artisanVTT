import type { Compendium } from "./compendium";
import { abilityModifier, signed } from "./monsterFormat";
import {
  classLevelRow,
  earnedFeatures,
  homebrewFeatures,
  type HomebrewContext,
} from "./prerequisites";

import type { CharacterSheet } from "../types/CharacterSheet";
import { parseRuleOptionPayload } from "../types/HomebrewOption";
import type { SRDTrait } from "../types/SRD";

/**
 * Derived values for a player character sheet.
 *
 * Everything here is COMPUTED from the sheet's choices plus the vendored
 * SRD, never stored (see types/CharacterSheet.ts) — so a racial bonus
 * correction or a level-table fix reaches every existing character, and
 * changing race/class can't leave a stale total behind. Pure functions
 * over a loaded Compendium, same as 5e/prerequisites.ts.
 */

export const ABILITY_KEYS = [
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
] as const;

export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "FOR",
  dex: "DES",
  con: "CON",
  int: "INT",
  wis: "SAB",
  cha: "CAR",
};

export type ResolvedAbility = {
  key: AbilityKey;
  label: string;
  /** What the player rolled/bought. */
  base: number;
  /** From race + subrace. */
  racialBonus: number;
  total: number;
  modifier: number;
  /** "+3" / "-1", ready to render. */
  modifierText: string;
};

/** 5e's default array, used for a sheet that hasn't set scores yet — a
 * brand-new sheet shows a legal character rather than six blanks. */
const DEFAULT_SCORE = 10;

export function resolveAbilities(
  compendium: Compendium,
  sheet: CharacterSheet,
  homebrew?: HomebrewContext
): ResolvedAbility[] {
  const bonuses = racialAbilityBonuses(compendium, sheet, homebrew);
  return ABILITY_KEYS.map((key) => {
    const base = sheet.abilities?.[key] ?? DEFAULT_SCORE;
    const racialBonus = bonuses[key] ?? 0;
    const total = base + racialBonus;
    const modifier = abilityModifier(total);
    return {
      key,
      label: ABILITY_LABELS[key],
      base,
      racialBonus,
      total,
      modifier,
      modifierText: signed(modifier),
    };
  });
}

/** Race + subrace ability bonuses, summed. The half-elf's "choose two"
 * (`ability_bonus_options`) is NOT applied automatically — it's a player
 * choice, and silently picking for them would be the opposite of this
 * phase's whole premise. */
export function racialAbilityBonuses(
  compendium: Compendium,
  sheet: CharacterSheet,
  homebrew?: HomebrewContext
): Partial<Record<AbilityKey, number>> {
  const totals: Partial<Record<AbilityKey, number>> = {};
  const add = (index: string, bonus: number) => {
    const key = index as AbilityKey;
    if (ABILITY_KEYS.includes(key)) {
      totals[key] = (totals[key] ?? 0) + bonus;
    }
  };

  const race = sheet.raceIndex
    ? compendium.raceByIndex.get(sheet.raceIndex)
    : undefined;
  for (const bonus of race?.ability_bonuses || []) {
    add(bonus.ability_score.index, bonus.bonus);
  }

  const subrace = sheet.subraceIndex
    ? compendium.subraceByIndex.get(sheet.subraceIndex)
    : undefined;
  // A subrace only counts when it actually belongs to the chosen race —
  // otherwise a stale pick (race changed, subrace not yet cleared) would
  // keep contributing a bonus the character has no claim to.
  if (subrace && subrace.race.index === sheet.raceIndex) {
    for (const bonus of subrace.ability_bonuses || []) {
      add(bonus.ability_score.index, bonus.bonus);
    }
  }

  // A homebrew subrace contributes exactly like a vendored one,
  // and is gated by the same "does it belong to this race?" check — its
  // parentIndex is the race slug.
  const homebrewSubrace = homebrew?.options.find(
    (option) =>
      !option.deleted &&
      option.kind === "subrace" &&
      option.id === sheet.subraceIndex &&
      option.parentIndex === sheet.raceIndex
  );
  if (homebrewSubrace) {
    const payload = parseRuleOptionPayload(homebrewSubrace.payload);
    for (const [ability, bonus] of Object.entries(
      payload.abilityBonuses || {}
    )) {
      if (typeof bonus === "number") {
        add(ability, bonus);
      }
    }
  }

  return totals;
}

/** 5e's proficiency bonus, preferring the level table (so a dataset fix
 * wins) and falling back to the printed formula when a row is missing. */
export function proficiencyBonus(
  compendium: Compendium,
  sheet: CharacterSheet
): number {
  const row = classLevelRow(compendium, sheet);
  if (row?.prof_bonus) {
    return row.prof_bonus;
  }
  return Math.floor(((sheet.level ?? 1) - 1) / 4) + 2;
}

/**
 * Max HP: full hit die at level 1, then the class's average per level
 * (5e's "fixed" option, not a roll), plus CON modifier per level.
 *
 * Fixed rather than rolled on purpose: a rolled total would have to be
 * STORED to stay stable, and storing it reintroduces exactly the staleness
 * this module exists to avoid. A GM who wants rolled HP overrides the
 * number on the sheet's notes for now.
 */
export function maxHitPoints(
  compendium: Compendium,
  sheet: CharacterSheet
): number {
  const klass = sheet.classIndex
    ? compendium.classByIndex.get(sheet.classIndex)
    : undefined;
  if (!klass) {
    return 0;
  }
  const level = sheet.level ?? 1;
  const conModifier =
    resolveAbilities(compendium, sheet).find((a) => a.key === "con")
      ?.modifier ?? 0;
  const averagePerLevel = Math.floor(klass.hit_die / 2) + 1;
  return klass.hit_die + conModifier + (level - 1) * (averagePerLevel + conModifier);
}

/** Unarmoured AC (10 + DEX). Armour is out of scope: equipment
 * isn't vendored, so claiming a number from armour the sheet can't record
 * would be a made-up value. */
export function baseArmorClass(
  compendium: Compendium,
  sheet: CharacterSheet
): number {
  const dex =
    resolveAbilities(compendium, sheet).find((a) => a.key === "dex")
      ?.modifier ?? 0;
  return 10 + dex;
}

/**
 * The 18 5e skills, each tied to the ability it rolls against. Slugs
 * match the SRD's own (`skill-acrobatics`, …), the same ones a class's
 * `proficiency_choices` and `sheet.proficiencies` store — so a skill's
 * proficiency state is read straight off the sheet's existing field,
 * nothing new stored for it beyond what the sheet already models.
 */
export const SKILLS: { index: string; label: string; ability: AbilityKey }[] = [
  { index: "skill-acrobatics", label: "Acrobacia", ability: "dex" },
  { index: "skill-animal-handling", label: "Adestrar Animais", ability: "wis" },
  { index: "skill-arcana", label: "Arcanismo", ability: "int" },
  { index: "skill-athletics", label: "Atletismo", ability: "str" },
  { index: "skill-deception", label: "Enganação", ability: "cha" },
  { index: "skill-history", label: "História", ability: "int" },
  { index: "skill-insight", label: "Intuição", ability: "wis" },
  { index: "skill-intimidation", label: "Intimidação", ability: "cha" },
  { index: "skill-investigation", label: "Investigação", ability: "int" },
  { index: "skill-medicine", label: "Medicina", ability: "wis" },
  { index: "skill-nature", label: "Natureza", ability: "int" },
  { index: "skill-perception", label: "Percepção", ability: "wis" },
  { index: "skill-performance", label: "Atuação", ability: "cha" },
  { index: "skill-persuasion", label: "Persuasão", ability: "cha" },
  { index: "skill-religion", label: "Religião", ability: "int" },
  { index: "skill-sleight-of-hand", label: "Prestidigitação", ability: "dex" },
  { index: "skill-stealth", label: "Furtividade", ability: "dex" },
  { index: "skill-survival", label: "Sobrevivência", ability: "wis" },
];

export type ResolvedSkill = {
  index: string;
  label: string;
  ability: AbilityKey;
  proficient: boolean;
  modifier: number;
  modifierText: string;
};

/**
 * The 18 skills with proficiency (read from `sheet.proficiencies`, the
 * same field the class-proficiency-choice UI already writes) and
 * the modifier DERIVED on read — ability modifier, plus the full
 * proficiency bonus when marked proficient. No half-proficiency/expertise
 * modelling here: those are feature-level bonuses layered on top by
 * `featuresByLevel`'s own entries, not a change to this base number.
 */
export function allSkillModifiers(
  compendium: Compendium,
  sheet: CharacterSheet,
  homebrew?: HomebrewContext
): ResolvedSkill[] {
  const abilities = resolveAbilities(compendium, sheet, homebrew);
  const profBonus = proficiencyBonus(compendium, sheet);
  const proficiencies = sheet.proficiencies || [];
  return SKILLS.map((skill) => {
    const proficient = proficiencies.includes(skill.index);
    const abilityModifierValue =
      abilities.find((a) => a.key === skill.ability)?.modifier ?? 0;
    const modifier = abilityModifierValue + (proficient ? profBonus : 0);
    return {
      index: skill.index,
      label: skill.label,
      ability: skill.ability,
      proficient,
      modifier,
      modifierText: signed(modifier),
    };
  });
}

/** Racial base speed (`races-2014.json`'s `speed`), before any Core
 * Stats override — 0 with no race chosen rather than a made-up number,
 * same rule `baseArmorClass` already follows with no class. */
export function racialSpeed(
  compendium: Compendium,
  sheet: CharacterSheet
): number {
  const race = sheet.raceIndex
    ? compendium.raceByIndex.get(sheet.raceIndex)
    : undefined;
  return race?.speed ?? 0;
}

/** Deslocamento final: the sheet's `coreStats.speedOverride` REPLACES the
 * racial base outright when set (speed has a real dataset base, so this
 * is a genuine override — see types/CharacterSheet.ts's doc on the
 * field), otherwise the racial base is used unchanged. */
export function totalSpeed(
  compendium: Compendium,
  sheet: CharacterSheet
): number {
  return sheet.coreStats?.speedOverride ?? racialSpeed(compendium, sheet);
}

/** CA final: the derived unarmoured AC plus the sheet's `coreStats.acBonus`
 * ADJUSTMENT — never a replacement, so a dataset/ability fix to the base
 * still reaches a sheet that also has an armour/shield bonus typed in. */
export function totalArmorClass(
  compendium: Compendium,
  sheet: CharacterSheet
): number {
  return baseArmorClass(compendium, sheet) + (sheet.coreStats?.acBonus ?? 0);
}

/** Bônus de iniciativa final: DEX modifier plus the sheet's
 * `coreStats.initiativeBonus` adjustment (feats like Alert, say) — same
 * additive discipline as `totalArmorClass`. */
export function totalInitiativeBonus(
  compendium: Compendium,
  sheet: CharacterSheet
): number {
  const dex =
    resolveAbilities(compendium, sheet).find((a) => a.key === "dex")
      ?.modifier ?? 0;
  return dex + (sheet.coreStats?.initiativeBonus ?? 0);
}

export type SpellSlots = { level: number; slots: number }[];

/** The sheet's spell slots by level, empty for a non-caster. */
export function spellSlots(
  compendium: Compendium,
  sheet: CharacterSheet
): SpellSlots {
  const spellcasting = classLevelRow(compendium, sheet)?.spellcasting;
  if (!spellcasting) {
    return [];
  }
  const slots: SpellSlots = [];
  for (let level = 1; level <= 9; level += 1) {
    const count = spellcasting[
      `spell_slots_level_${level}` as keyof typeof spellcasting
    ];
    if (typeof count === "number" && count > 0) {
      slots.push({ level, slots: count });
    }
  }
  return slots;
}

/** Racial traits from race + subrace, deduplicated (a subrace's list can
 * repeat one of its race's). */
export function racialTraits(
  compendium: Compendium,
  sheet: CharacterSheet
): SRDTrait[] {
  const indexes: string[] = [];
  const race = sheet.raceIndex
    ? compendium.raceByIndex.get(sheet.raceIndex)
    : undefined;
  indexes.push(...(race?.traits || []).map((t) => t.index));

  const subrace = sheet.subraceIndex
    ? compendium.subraceByIndex.get(sheet.subraceIndex)
    : undefined;
  if (subrace && subrace.race.index === sheet.raceIndex) {
    indexes.push(...(subrace.racial_traits || []).map((t) => t.index));
  }

  const seen = new Set<string>();
  const traits: SRDTrait[] = [];
  for (const index of indexes) {
    if (seen.has(index)) {
      continue;
    }
    seen.add(index);
    const trait = compendium.traitByIndex.get(index);
    if (trait) {
      traits.push(trait);
    }
  }
  return traits;
}

/** Saving throws the class is proficient in, as ability keys. */
export function savingThrowProficiencies(
  compendium: Compendium,
  sheet: CharacterSheet
): AbilityKey[] {
  const klass = sheet.classIndex
    ? compendium.classByIndex.get(sheet.classIndex)
    : undefined;
  return (klass?.saving_throws || [])
    .map((ref) => ref.index as AbilityKey)
    .filter((key) => ABILITY_KEYS.includes(key));
}

export type SheetSummary = {
  /** "Bardo (Lore) nível 3 — Elfo (Alto Elfo)" style line, in Portuguese
   * around English SRD names (same rule as the monster stat block: the
   * data is English, only the frame is translated). */
  line: string;
  level: number;
  proficiencyBonus: number;
  maxHitPoints: number;
  armorClass: number;
};

export function sheetSummary(
  compendium: Compendium,
  sheet: CharacterSheet
): SheetSummary {
  const klass = sheet.classIndex
    ? compendium.classByIndex.get(sheet.classIndex)
    : undefined;
  const subclass = sheet.subclassIndex
    ? compendium.subclassByIndex.get(sheet.subclassIndex)
    : undefined;
  const race = sheet.raceIndex
    ? compendium.raceByIndex.get(sheet.raceIndex)
    : undefined;
  const subrace = sheet.subraceIndex
    ? compendium.subraceByIndex.get(sheet.subraceIndex)
    : undefined;
  const level = sheet.level ?? 1;

  const classPart = klass
    ? `${klass.name}${subclass ? ` (${subclass.name})` : ""} nível ${level}`
    : "Sem classe";
  const racePart = race
    ? `${race.name}${subrace ? ` (${subrace.name})` : ""}`
    : "Sem raça";

  return {
    line: `${classPart} — ${racePart}`,
    level,
    proficiencyBonus: proficiencyBonus(compendium, sheet),
    maxHitPoints: maxHitPoints(compendium, sheet),
    armorClass: baseArmorClass(compendium, sheet),
  };
}

/** Feature count by level, for the sheet's "o que você ganhou" section. */
export function featuresByLevel(
  compendium: Compendium,
  sheet: CharacterSheet,
  homebrew?: HomebrewContext
): { level: number; features: { name: string; desc: string[] }[] }[] {
  const grouped = new Map<number, { name: string; desc: string[] }[]>();
  for (const feature of earnedFeatures(compendium, sheet, homebrew)) {
    const list = grouped.get(feature.level) || [];
    list.push({ name: feature.name, desc: feature.desc });
    grouped.set(feature.level, list);
  }
  // Homebrew features interleave BY LEVEL with the printed ones instead of
  // forming a separate section — at the table they're the same thing, and
  // the name already carries which option granted them.
  for (const feature of homebrewFeatures(compendium, sheet, homebrew)) {
    const list = grouped.get(feature.level) || [];
    list.push({
      name: `${feature.name} (${feature.from})`,
      desc: feature.desc ? [feature.desc] : [],
    });
    grouped.set(feature.level, list);
  }
  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, features]) => ({
      level,
      features: features.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/** Parses a Character.sheet JSON string. `{}` (the default for a newly
 * created character) and
 * anything unparseable both yield an empty sheet rather than throwing —
 * every character created before player sheets existed has exactly that value. */
export function parseSheet(sheet: string): CharacterSheet {
  try {
    const parsed = JSON.parse(sheet || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as CharacterSheet;
  } catch {
    return {};
  }
}

export function serialiseSheet(sheet: CharacterSheet): string {
  return JSON.stringify({ ...sheet, v: 1 });
}
