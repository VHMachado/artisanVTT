import type { Compendium } from "./compendium";
import type {
  SRDChoice,
  SRDFeature,
  SRDOption,
  SRDRef,
  SRDSpell,
} from "../types/SRD";
import { parseRuleOptionPayload } from "../types/HomebrewOption";
import type {
  CharacterSheet,
  EligibleOption,
  PendingChoice,
} from "../types/CharacterSheet";
import type { TableRuleOption } from "../types/HomebrewOption";

/**
 * Homebrew options a Mesa added, threaded through the engine
 * alongside the vendored SRD.
 *
 * Passed as an argument rather than read from Dexie inside the engine so
 * every function here stays pure and testable — the same reason the
 * compendium is a parameter. Undefined means "SRD only", which is what
 * every 12d call site did before this existed.
 */
export type HomebrewContext = {
  options: TableRuleOption[];
};

const NO_HOMEBREW: TableRuleOption[] = [];

function homebrewOf(
  homebrew: HomebrewContext | undefined,
  kind: "subrace" | "subclass",
  parentIndex: string | undefined
): TableRuleOption[] {
  if (!homebrew || !parentIndex) {
    return NO_HOMEBREW;
  }
  return homebrew.options.filter(
    (option) =>
      !option.deleted &&
      option.kind === kind &&
      option.parentIndex === parentIndex
  );
}

/** Marks an option as coming from the table rather than the SRD, so the
 * UI can label it and the sheet can explain a pick that vanished when its
 * author deleted it. */
export function isHomebrewOptionId(
  homebrew: HomebrewContext | undefined,
  id: string | undefined
): boolean {
  if (!homebrew || !id) {
    return false;
  }
  return homebrew.options.some((option) => option.id === id && !option.deleted);
}

/**
 * The prerequisite engine for player sheets created on the platform, with
 * the rule that motivated building it: offer **only** what is eligible.
 * Se a habilidade exige uma
 *    subclasse específica de Bardo, ela não aparece para outra subclasse.
 *    Isso é um **motor de pré-requisitos**, não um formulário — é a parte
 *    cara desta fase, e o ponto onde os outros VTTs falham."
 *
 * Design in one line: **eligibility is computed, never stored.** A sheet
 * (types/CharacterSheet.ts) records only what the player CHOSE; every
 * question of "may they choose this?" is answered here from the vendored
 * SRD at read time. That's what makes a data fix reach existing sheets,
 * and what makes "changed my subclass" impossible to leave half-applied.
 *
 * Pure functions over a loaded Compendium — no React, no Dexie, no
 * network — so the whole rule set is unit-testable against the real
 * dataset (see prerequisites.test.ts).
 */

/** Slug of an SRD reference the upstream data left as an API path
 * ("/api/2014/spells/eldritch-blast" -> "eldritch-blast"). Feature
 * prerequisites carry these because the vendor script only strips keys
 * literally named `url`. */
export function slugFromPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** The level at which a class picks its subclass, read FROM THE DATA (the
 * lowest level that has any subclass-specific row) rather than hardcoded:
 * cleric/sorcerer/warlock at 1, druid/wizard at 2, everyone else at 3, and
 * a future dataset that changes one of those needs no code change. */
export function subclassLevel(
  compendium: Compendium,
  classIndex: string
): number | undefined {
  let min: number | undefined;
  for (const level of compendium.levels) {
    if (level.subclass && level.class.index === classIndex) {
      if (min === undefined || level.level < min) {
        min = level.level;
      }
    }
  }
  return min;
}

/** Subclasses of a class, marked ineligible below the level where the
 * class may choose one. They are still RETURNED (with a reason) so the UI
 * can say "escolha sua subclasse no nível 3" instead of showing an empty
 * list with no explanation. */
export function eligibleSubclasses(
  compendium: Compendium,
  sheet: CharacterSheet,
  homebrew?: HomebrewContext
): EligibleOption[] {
  const classIndex = sheet.classIndex;
  if (!classIndex) {
    return [];
  }
  const required = subclassLevel(compendium, classIndex);
  const level = sheet.level ?? 1;
  const unlocked = required === undefined || level >= required;
  const reason = unlocked
    ? undefined
    : `Disponível a partir do nível ${required}`;
  const srd: EligibleOption[] = compendium.subclasses
    .filter((subclass) => subclass.class.index === classIndex)
    .map((subclass) => ({
      index: subclass.index,
      name: subclass.name,
      eligible: unlocked,
      reason,
      source: "srd" as const,
    }));
  // The Mesa's own subclasses sit in the SAME list, gated by the SAME
  // level rule — the whole point of 12e is that homebrew is offered
  // exactly like printed content, not in a second-class bucket.
  const table: EligibleOption[] = homebrewOf(
    homebrew,
    "subclass",
    classIndex
  ).map((option) => ({
    index: option.id,
    name: option.name,
    eligible: unlocked,
    reason,
    source: "table" as const,
    authorName: option.ownerDisplayName,
  }));
  return [...srd, ...table].sort((a, b) => a.name.localeCompare(b.name));
}

/** Subraces of the chosen race. A race with none (human, dragonborn, …)
 * yields an empty list, which the UI reads as "no subrace step". */
export function eligibleSubraces(
  compendium: Compendium,
  sheet: CharacterSheet,
  homebrew?: HomebrewContext
): EligibleOption[] {
  if (!sheet.raceIndex) {
    return [];
  }
  const srd: EligibleOption[] = compendium.subraces
    .filter((subrace) => subrace.race.index === sheet.raceIndex)
    .map((subrace) => ({
      index: subrace.index,
      name: subrace.name,
      eligible: true,
      source: "srd" as const,
    }));
  // This is the gap 12e exists to fill: the SRD ships ONE subrace for elf
  // (High Elf), so Drow and Wood Elf can only ever arrive this way.
  const table: EligibleOption[] = homebrewOf(
    homebrew,
    "subrace",
    sheet.raceIndex
  ).map((option) => ({
    index: option.id,
    name: option.name,
    eligible: true,
    source: "table" as const,
    authorName: option.ownerDisplayName,
  }));
  return [...srd, ...table].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every feature the sheet has EARNED: its class's features up to its
 * level, plus its subclass's own — and nothing from a sibling subclass.
 *
 * This is the headline rule a subclass filter has to get right. The dataset marks 88 of its 407
 * features with a `subclass`, and the filter below is what keeps a Lore
 * bard from being offered a Valor bard's feature. A feature also has to
 * clear its own `prerequisites` (21 warlock invocations do), which is
 * `meetsFeaturePrerequisites` below.
 */
export function earnedFeatures(
  compendium: Compendium,
  sheet: CharacterSheet,
  homebrew?: HomebrewContext
): SRDFeature[] {
  const classIndex = sheet.classIndex;
  if (!classIndex) {
    return [];
  }
  const level = sheet.level ?? 1;
  // A homebrew subclass has no SRD features of its own — its content
  // lives in its payload and is surfaced by homebrewFeatures() below. The
  // SRD filter must therefore match NOTHING subclass-gated, rather than
  // accidentally matching the class's one printed subclass.
  const subclassIndex = isHomebrewOptionId(homebrew, sheet.subclassIndex)
    ? undefined
    : sheet.subclassIndex;
  return compendium.features
    .filter((feature) => {
      if (feature.class.index !== classIndex) {
        return false;
      }
      if (feature.level > level) {
        return false;
      }
      // The rule: a subclass feature belongs to EXACTLY that subclass.
      if (feature.subclass && feature.subclass.index !== subclassIndex) {
        return false;
      }
      return meetsFeaturePrerequisites(compendium, sheet, feature).eligible;
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/**
 * Features a homebrew subrace or subclass grants at or below the sheet's
 * level, resolved from its payload.
 *
 * A subclass feature defaults to the class's subclass level when the
 * author didn't say (they usually won't for the first one); a subrace's
 * traits apply from level 1, matching how the SRD treats them.
 */
export function homebrewFeatures(
  compendium: Compendium,
  sheet: CharacterSheet,
  homebrew?: HomebrewContext
): { name: string; desc: string; level: number; from: string }[] {
  if (!homebrew) {
    return [];
  }
  const level = sheet.level ?? 1;
  const picked = homebrew.options.filter(
    (option) =>
      !option.deleted &&
      (option.id === sheet.subraceIndex || option.id === sheet.subclassIndex)
  );
  const results: { name: string; desc: string; level: number; from: string }[] =
    [];
  for (const option of picked) {
    const defaultLevel =
      option.kind === "subclass"
        ? subclassLevel(compendium, option.parentIndex) ?? 1
        : 1;
    const payload = parseRuleOptionPayload(option.payload);
    for (const feature of payload.features || []) {
      const featureLevel = feature.level ?? defaultLevel;
      if (featureLevel <= level) {
        results.push({
          name: feature.name,
          desc: feature.desc,
          level: featureLevel,
          from: option.name,
        });
      }
    }
  }
  return results.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/**
 * Evaluates a feature's own `prerequisites` array against the sheet. The
 * three shapes that occur in the 2014 SRD:
 *   - `level`   — a minimum character level.
 *   - `spell`   — the character must know a specific spell.
 *   - `feature` — the character must already have another feature.
 *
 * A `feature` prerequisite is resolved against the sheet's OTHER earned
 * features without recursing into their prerequisites: every such chain in
 * the SRD is one deep (an invocation requiring a pact boon), and a
 * mutually-referencing pair in a future dataset would otherwise loop
 * forever.
 */
export function meetsFeaturePrerequisites(
  compendium: Compendium,
  sheet: CharacterSheet,
  feature: SRDFeature
): EligibleOption {
  const base: EligibleOption = {
    index: feature.index,
    name: feature.name,
    eligible: true,
  };
  for (const prerequisite of feature.prerequisites || []) {
    if (prerequisite.type === "level") {
      const required = prerequisite.level ?? 0;
      if ((sheet.level ?? 1) < required) {
        return { ...base, eligible: false, reason: `Exige nível ${required}` };
      }
    } else if (prerequisite.type === "spell" && prerequisite.spell) {
      const slug = slugFromPath(prerequisite.spell);
      if (!(sheet.spells || []).includes(slug)) {
        const spell = compendium.spellByIndex.get(slug);
        return {
          ...base,
          eligible: false,
          reason: `Exige a magia ${spell?.name ?? slug}`,
        };
      }
    } else if (prerequisite.type === "feature" && prerequisite.feature) {
      const slug = slugFromPath(prerequisite.feature);
      if (!hasFeature(compendium, sheet, slug)) {
        const required = compendium.featureByIndex.get(slug);
        return {
          ...base,
          eligible: false,
          reason: `Exige ${required?.name ?? slug}`,
        };
      }
    }
  }
  return base;
}

/** Whether the sheet already has a given feature, WITHOUT evaluating that
 * feature's own prerequisites — see the note on recursion above. */
function hasFeature(
  compendium: Compendium,
  sheet: CharacterSheet,
  index: string
): boolean {
  const feature = compendium.featureByIndex.get(index);
  if (!feature) {
    return false;
  }
  if (feature.class.index !== sheet.classIndex) {
    return false;
  }
  if (feature.level > (sheet.level ?? 1)) {
    return false;
  }
  if (feature.subclass && feature.subclass.index !== sheet.subclassIndex) {
    return false;
  }
  return true;
}

/**
 * Spells the sheet may learn: its class's list, capped at the highest
 * spell level its slots reach, plus the extra spells its SUBCLASS grants.
 *
 * `spell.subclasses` in the SRD is additive, never restrictive — a Lore
 * bard's magical secrets ADD to the bard list, they don't narrow it — so a
 * spell qualifies when its class list contains the class OR its subclass
 * list contains the subclass. Reading it as a restriction (the tempting
 * misreading) would hide most of the bard list from a Lore bard.
 */
export function eligibleSpells(
  compendium: Compendium,
  sheet: CharacterSheet
): SRDSpell[] {
  const classIndex = sheet.classIndex;
  if (!classIndex) {
    return [];
  }
  const maxLevel = maxSpellLevel(compendium, sheet);
  return compendium.spells
    .filter((spell) => {
      const fromClass = spell.classes.some((c) => c.index === classIndex);
      const fromSubclass =
        Boolean(sheet.subclassIndex) &&
        spell.subclasses.some((s) => s.index === sheet.subclassIndex);
      if (!fromClass && !fromSubclass) {
        return false;
      }
      // Cantrips (level 0) are always available to a caster; levelled
      // spells need a slot of that level.
      return spell.level === 0 || spell.level <= maxLevel;
    })
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/**
 * The highest spell level the sheet has slots for, read from its class's
 * level row. 0 for a non-caster (fighter, barbarian) and for a caster
 * whose level grants no slots yet — which is exactly what makes
 * `eligibleSpells` return only cantrips for a level-1 warlock's
 * still-empty higher slots.
 */
export function maxSpellLevel(
  compendium: Compendium,
  sheet: CharacterSheet
): number {
  const row = classLevelRow(compendium, sheet);
  const spellcasting = row?.spellcasting;
  if (!spellcasting) {
    return 0;
  }
  let max = 0;
  for (let level = 1; level <= 9; level += 1) {
    const slots = spellcasting[
      `spell_slots_level_${level}` as keyof typeof spellcasting
    ];
    if (typeof slots === "number" && slots > 0) {
      max = level;
    }
  }
  return max;
}

/** The class-progression row for the sheet's current level (the one
 * WITHOUT a subclass — those 50 rows are the subclass's own extras). */
export function classLevelRow(compendium: Compendium, sheet: CharacterSheet) {
  const level = sheet.level ?? 1;
  return compendium.levels.find(
    (row) =>
      row.class.index === sheet.classIndex &&
      row.level === level &&
      !row.subclass
  );
}

/**
 * Every "choose N" the sheet still owes, from its class's
 * `proficiency_choices` and from each earned feature's `feature_specific`
 * payload (expertise, fighting style, favoured enemy, …).
 *
 * Because the feature list is itself filtered by subclass and level, a
 * choice that belonged to a feature the sheet no longer has simply stops
 * being returned — no separate cleanup pass, and no stale question.
 */
export function pendingChoices(
  compendium: Compendium,
  sheet: CharacterSheet
): PendingChoice[] {
  const choices: PendingChoice[] = [];
  const chosen = sheet.featureChoices || {};

  const klass = sheet.classIndex
    ? compendium.classByIndex.get(sheet.classIndex)
    : undefined;
  if (klass) {
    klass.proficiency_choices.forEach((choice, position) => {
      const key = `class-proficiency-${position}`;
      choices.push({
        key,
        source: klass.name,
        desc: choice.desc || "Escolha proficiências",
        choose: choice.choose,
        options: choiceOptions(choice),
        chosen: chosen[key] || [],
      });
    });
  }

  for (const feature of earnedFeatures(compendium, sheet)) {
    for (const choice of featureChoices(feature)) {
      const key = `feature:${feature.index}`;
      choices.push({
        key,
        source: feature.name,
        desc: choice.desc || feature.name,
        choose: choice.choose,
        options: choiceOptions(choice),
        chosen: chosen[key] || [],
      });
    }
  }

  return choices;
}

/** Pulls the SRDChoice payloads out of a feature's `feature_specific`
 * bag. The bag's keys vary per feature (`expertise_options`,
 * `subfeature_options`, …), so it's read structurally — anything with a
 * numeric `choose` and a `from` — rather than by an enumerated key list
 * that a dataset bump would silently outgrow. */
export function featureChoices(feature: SRDFeature): SRDChoice[] {
  const specific = feature.feature_specific;
  if (!specific) {
    return [];
  }
  const found: SRDChoice[] = [];
  for (const value of Object.values(specific)) {
    if (
      value &&
      typeof value === "object" &&
      typeof (value as SRDChoice).choose === "number" &&
      (value as SRDChoice).from
    ) {
      found.push(value as SRDChoice);
    }
  }
  return found;
}

/**
 * Flattens an SRD choice's option set into selectable rows. Only
 * `options_array` yields concrete options; the other set types
 * (`equipment_category`, `resource_list`) point at data this app doesn't
 * vendor, so they yield nothing rather than a list of broken rows — the UI
 * then shows the choice's description without a picker instead of a picker
 * that can't be used.
 */
export function choiceOptions(choice: SRDChoice): EligibleOption[] {
  const from = choice.from;
  if (!from || from.option_set_type !== "options_array") {
    return [];
  }
  const options = (from as { options: SRDOption[] }).options || [];
  const flattened: EligibleOption[] = [];
  for (const option of options) {
    if (option.option_type === "reference") {
      const item = (option as { item: SRDRef }).item;
      flattened.push({ index: item.index, name: item.name, eligible: true });
    } else if (option.option_type === "choice") {
      // A nested choice ("choose 1 from these two skills") is flattened
      // into its leaf options: for the sheet's purposes the player is
      // still picking one proficiency, and a tree UI for a two-item
      // nested pick would be ceremony without information.
      flattened.push(
        ...choiceOptions((option as { choice: SRDChoice }).choice)
      );
    }
  }
  // The same proficiency can appear via two nested branches; a picker
  // listing "Stealth" twice is a bug the player sees.
  const seen = new Set<string>();
  return flattened.filter((option) => {
    if (seen.has(option.index)) {
      return false;
    }
    seen.add(option.index);
    return true;
  });
}

/**
 * Re-validates everything a sheet already chose against its CURRENT
 * class/subclass/level, returning a human-readable problem per invalid
 * pick.
 *
 * This is the other half of "eligibility is computed, never stored":
 * changing subclass can't corrupt a sheet, because nothing was baked in —
 * but the player still has to be TOLD that their Valor-bard spell no
 * longer belongs, rather than having it silently vanish or silently stay.
 * Same reasoning elsewhere in this codebase: "silêncio aqui é exatamente o bug".
 */
export function sheetProblems(
  compendium: Compendium,
  sheet: CharacterSheet,
  homebrew?: HomebrewContext
): string[] {
  const problems: string[] = [];

  if (sheet.subclassIndex) {
    // A homebrew pick is validated against the Mesa's options, not the SRD
    // — and a pick whose option was DELETED is reported rather than
    // silently dropped, the same discipline as every other check here.
    const homebrewPick = homebrew?.options.find(
      (option) => option.id === sheet.subclassIndex
    );
    if (homebrewPick || isHomebrewOptionId(homebrew, sheet.subclassIndex)) {
      if (!homebrewPick || homebrewPick.deleted) {
        problems.push(
          "A subclasse escolhida foi removida do conteúdo da Mesa."
        );
      } else if (
        homebrewPick.kind !== "subclass" ||
        homebrewPick.parentIndex !== sheet.classIndex
      ) {
        problems.push("A subclasse escolhida não pertence a esta classe.");
      } else {
        const required = subclassLevel(compendium, sheet.classIndex || "");
        if (required !== undefined && (sheet.level ?? 1) < required) {
          problems.push(
            `${homebrewPick.name} só está disponível a partir do nível ${required}.`
          );
        }
      }
    } else {
      const subclass = compendium.subclassByIndex.get(sheet.subclassIndex);
      if (!subclass || subclass.class.index !== sheet.classIndex) {
        problems.push("A subclasse escolhida não pertence a esta classe.");
      } else {
        const required = subclassLevel(compendium, sheet.classIndex || "");
        if (required !== undefined && (sheet.level ?? 1) < required) {
          problems.push(
            `${subclass.name} só está disponível a partir do nível ${required}.`
          );
        }
      }
    }
  }

  if (sheet.subraceIndex) {
    const homebrewPick = homebrew?.options.find(
      (option) => option.id === sheet.subraceIndex
    );
    const looksHomebrew =
      Boolean(homebrewPick) || isHomebrewOptionId(homebrew, sheet.subraceIndex);
    if (looksHomebrew) {
      if (!homebrewPick || homebrewPick.deleted) {
        problems.push("A sub-raça escolhida foi removida do conteúdo da Mesa.");
      } else if (
        homebrewPick.kind !== "subrace" ||
        homebrewPick.parentIndex !== sheet.raceIndex
      ) {
        problems.push("A sub-raça escolhida não pertence a esta raça.");
      }
    } else {
      const subrace = compendium.subraceByIndex.get(sheet.subraceIndex);
      if (!subrace || subrace.race.index !== sheet.raceIndex) {
        problems.push("A sub-raça escolhida não pertence a esta raça.");
      }
    }
  }

  const legalSpells = new Set(
    eligibleSpells(compendium, sheet).map((spell) => spell.index)
  );
  for (const index of sheet.spells || []) {
    if (!legalSpells.has(index)) {
      const spell = compendium.spellByIndex.get(index);
      problems.push(
        `${spell?.name ?? index} não está disponível para esta classe/nível.`
      );
    }
  }

  const openKeys = new Set(
    pendingChoices(compendium, sheet).map((choice) => choice.key)
  );
  for (const key of Object.keys(sheet.featureChoices || {})) {
    if (!openKeys.has(key)) {
      problems.push(
        "Uma escolha registrada pertence a uma habilidade que o personagem não tem mais."
      );
      break;
    }
  }

  return problems;
}
