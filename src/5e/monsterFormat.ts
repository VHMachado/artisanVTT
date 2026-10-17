import type {
  Monster,
  MonsterAction,
  MonsterArmorClass,
  MonsterProficiency,
  MonsterSenses,
  MonsterSpeed,
} from "../types/Monster";

/**
 * Presentation helpers for a vendored SRD monster (types/Monster.ts).
 *
 * Deliberately separate from bestiary.ts: these are pure functions over one
 * monster object, so they're unit-testable without loading the ~1MB dataset
 * (see monsterFormat.test.ts), and a stat block component stays free of
 * formatting logic. Output text is English on purpose — the vendored data
 * is the English SRD (5e-database's pt-BR translation covers neither
 * monsters nor spells), so mixing a Portuguese label into an English stat
 * line would read worse than keeping the whole block in the source
 * language. Only the UI chrome around it is in Portuguese.
 */

/** "1/8" / "1/4" / "1/2" for the fractional CRs, the plain integer otherwise. */
export function challengeRatingText(cr: number): string {
  switch (cr) {
    case 0.125:
      return "1/8";
    case 0.25:
      return "1/4";
    case 0.5:
      return "1/2";
    default:
      return String(cr);
  }
}

/** "+3" / "-1" / "+0" — the 5e ability modifier for a raw score. */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

/** "Medium humanoid (dwarf), lawful evil" — the stat block's italic line. */
export function typeLine(monster: Monster): string {
  const type = monster.subtype
    ? `${monster.type} (${monster.subtype})`
    : monster.type;
  return `${monster.size} ${type}, ${monster.alignment}`;
}

/**
 * "16 (scale mail, shield)" / "13 (natural armor)" / "15 (mage armor)".
 *
 * The SRD models AC as a LIST because a few monsters have conditional
 * values (a vampire's mist form, a creature's AC while prone) — the first
 * entry is the baseline, and the rest are appended in parentheses so no
 * information is silently dropped.
 */
export function armorClassText(armorClass: MonsterArmorClass[]): string {
  if (armorClass.length === 0) {
    return "—";
  }
  const [primary, ...rest] = armorClass;
  let text = `${primary.value}${qualifier(primary)}`;
  for (const entry of rest) {
    text += `, ${entry.value}${qualifier(entry)}`;
  }
  return text;
}

function qualifier(entry: MonsterArmorClass): string {
  switch (entry.type) {
    case "armor": {
      const names = (entry.armor || []).map((a) => a.name.toLowerCase());
      return names.length > 0 ? ` (${names.join(", ")})` : "";
    }
    case "natural":
      return " (natural armor)";
    case "spell":
      return entry.spell ? ` (${entry.spell.name.toLowerCase()})` : "";
    case "condition":
      return entry.condition ? ` (while ${entry.condition.name.toLowerCase()})` : "";
    default:
      // "dex" — a plain Dexterity-based AC needs no qualifier, same as the
      // printed stat block.
      return "";
  }
}

/** "25 ft., fly 60 ft. (hover)" — `hover` is a flag on the whole speed block. */
export function speedText(speed: MonsterSpeed): string {
  const parts: string[] = [];
  if (speed.walk) {
    parts.push(speed.walk);
  }
  for (const mode of ["burrow", "climb", "fly", "swim"] as const) {
    const value = speed[mode];
    if (value) {
      parts.push(`${mode} ${value}${mode === "fly" && speed.hover ? " (hover)" : ""}`);
    }
  }
  return parts.length > 0 ? parts.join(", ") : "—";
}

/** "darkvision 120 ft., passive Perception 10" */
export function sensesText(senses: MonsterSenses): string {
  const parts: string[] = [];
  for (const sense of ["blindsight", "darkvision", "tremorsense", "truesight"] as const) {
    const value = senses[sense];
    if (value) {
      parts.push(`${sense} ${value}`);
    }
  }
  parts.push(`passive Perception ${senses.passive_perception}`);
  return parts.join(", ");
}

/**
 * Splits `proficiencies` into the stat block's two separate lines. The SRD
 * encodes both as one list, distinguished only by the "Saving Throw: CON" /
 * "Skill: Stealth" prefix of `proficiency.name`.
 */
export function savingThrowsText(proficiencies: MonsterProficiency[]): string {
  return proficiencyText(proficiencies, "Saving Throw: ");
}

export function skillsText(proficiencies: MonsterProficiency[]): string {
  return proficiencyText(proficiencies, "Skill: ");
}

function proficiencyText(
  proficiencies: MonsterProficiency[],
  prefix: string
): string {
  return proficiencies
    .filter((p) => p.proficiency.name.startsWith(prefix))
    .map((p) => `${p.proficiency.name.slice(prefix.length)} ${signed(p.value)}`)
    .join(", ");
}

/** Comma-joined damage/condition list, "—" when empty (never an empty line). */
export function listText(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

/**
 * "Recharge 5-6" / "3/Day" / "Recharge after a Short or Long Rest" — the
 * parenthetical the printed stat block puts after an ability's name.
 * Returns "" when the ability has no usage limit.
 */
export function usageText(action: MonsterAction): string {
  const usage = action.usage;
  if (!usage) {
    return "";
  }
  switch (usage.type) {
    case "recharge on roll":
      return usage.min_value
        ? `Recharge ${usage.min_value}-6`
        : "Recharge";
    case "per day":
      return `${usage.times ?? 1}/Day`;
    case "recharge after rest": {
      const rests = (usage.rest_types || []).map(
        (rest) => rest.charAt(0).toUpperCase() + rest.slice(1)
      );
      return rests.length > 0
        ? `Recharge after a ${rests.join(" or ")} Rest`
        : "Recharge after a Rest";
    }
    default:
      return "";
  }
}

/** The six ability scores in printed order, ready to render as a row. */
export function abilityScores(
  monster: Monster
): { label: string; score: number; modifier: string }[] {
  return [
    { label: "STR", score: monster.strength },
    { label: "DEX", score: monster.dexterity },
    { label: "CON", score: monster.constitution },
    { label: "INT", score: monster.intelligence },
    { label: "WIS", score: monster.wisdom },
    { label: "CHA", score: monster.charisma },
  ].map((ability) => ({
    ...ability,
    modifier: signed(abilityModifier(ability.score)),
  }));
}
