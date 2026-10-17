/**
 * A homebrew subrace or subclass: the table's own content,
 * filling the gap the vendored SRD leaves.
 *
 * Why this exists at all: the 2014 SRD ships 4 subraces (hill dwarf, high
 * elf, lightfoot halfling, rock gnome) and exactly ONE subclass per class.
 * Drow, Wood Elf, College of Valor, Arcane Trickster and the rest are
 * Player's Handbook text, not SRD, so no free dataset carries them and the
 * app cannot ship them. (The 2024 SRD adds the elven/tiefling/gnome
 * lineages by NAME, but with no mechanics attached, and drops the
 * prerequisite and choice data 12d's engine runs on — so migrating to it
 * would trade a real engine for a longer dropdown.) The app therefore
 * ships the mechanism and each table supplies the content it owns.
 *
 * Mirrors broker-go's `tables.RuleOptionRow`.
 */
export type RuleOptionKind = "subrace" | "subclass";

export type TableRuleOption = {
  id: string;
  tableId: string;
  kind: RuleOptionKind;
  name: string;
  /** SRD race slug ("elf") for a subrace, class slug ("bard") for a
   * subclass. Immutable after creation — see RuleOptionRow. */
  parentIndex: string;
  /** Serialised RuleOptionPayload. Opaque to the broker. */
  payload: string;
  ownerAccountId: number;
  ownerDisplayName?: string;
  createdAt: number;
  updatedAt: number;
  version: number;
  deleted?: boolean;
};

/** One trait or feature the option grants. */
export type HomebrewFeature = {
  name: string;
  desc: string;
  /** For a subclass: the level at which it's gained. Ignored for a
   * subrace, whose traits apply from level 1. Defaults to the class's
   * subclass level when omitted. */
  level?: number;
};

/**
 * The body of a homebrew option, parsed from `payload`.
 *
 * Deliberately a SUBSET of what the SRD models: ability bonuses, traits
 * and granted features cover what a table actually needs to write down,
 * while proficiency choices and spell-list changes are left out because
 * they'd need their own pickers and the 5e schema's full option algebra.
 * A table that needs those writes them as free text in a feature's desc —
 * which is what it would read off the page anyway.
 */
export type RuleOptionPayload = {
  /** Ability score increases, by SRD ability slug ("dex": 2). Applied on
   * top of the base race exactly like a vendored subrace's. */
  abilityBonuses?: Record<string, number>;
  /** Traits (subrace) or features (subclass). */
  features?: HomebrewFeature[];
  /** Free-text flavour shown above the features. */
  desc?: string;
};

export function parseRuleOptionPayload(payload: string): RuleOptionPayload {
  try {
    const parsed = JSON.parse(payload || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as RuleOptionPayload;
  } catch {
    // Same discipline as the monster overrides: unreadable homebrew
    // degrades to "no bonuses, no features" rather than breaking the
    // sheet that references it.
    return {};
  }
}

export function serialiseRuleOptionPayload(payload: RuleOptionPayload): string {
  return JSON.stringify(payload);
}
