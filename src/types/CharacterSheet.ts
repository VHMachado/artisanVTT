/**
 * A player character sheet built on the platform ("Fichas de jogador
 * criadas na plataforma, com a regra que motivou o
 * pedido: oferecer **só** o que é elegível").
 *
 * Stored as the JSON text of `Character.sheet` — the field the broker already
 * syncs, versions and authorises per owner. Nothing new in the broker:
 * this is a sheet's CHOICES, not its derived numbers. AC, spell slots,
 * proficiency bonus and every feature a level grants are recomputed from
 * the SRD compendium on read (5e/characterSheet.ts), so a dataset fix
 * reaches every existing sheet instead of freezing whatever was true the
 * day it was created.
 *
 * Every field is optional: a sheet is built incrementally and a
 * half-filled one must round trip, not fail to parse.
 */
export type CharacterSheet = {
  /** Schema marker, so a future migration can tell an unversioned sheet
   * (or a plain `{}` from an earlier build) from one this build wrote. */
  v?: 1;
  /** SRD slugs. */
  raceIndex?: string;
  subraceIndex?: string;
  classIndex?: string;
  subclassIndex?: string;
  level?: number;
  /** The six rolled/pointbuy scores BEFORE racial bonuses — those are
   * applied on read from the race/subrace, so changing race updates the
   * totals instead of baking in a stale sum. */
  abilities?: {
    str?: number;
    dex?: number;
    con?: number;
    int?: number;
    wis?: number;
    cha?: number;
  };
  /** Proficiency slugs chosen from the class's `proficiency_choices`
   * ("skill-stealth"), plus any chosen for a race. */
  proficiencies?: string[];
  /** Spell slugs the character knows/has prepared. Validated against the
   * class+subclass list on read: a spell that stops being legal (the
   * subclass changed) is reported, never silently dropped from storage. */
  spells?: string[];
  /** Choices made inside a feature's `feature_specific` payload, keyed by
   * feature slug ("bard-expertise-1" -> ["skill-stealth", …]). */
  featureChoices?: Record<string, string[]>;
  /** Free-text the SRD has no model for. */
  notes?: string;
  /** "Core Stats": optional adjustments layered on top of the
   * derived numbers (5e/characterSheet.ts), never a substitute for the
   * computation — same discipline as `abilities` above, so a dataset or
   * ability-score fix keeps reaching every sheet instead of freezing a
   * number the day it was typed. `acBonus`/`initiativeBonus` are ADDED to
   * the derived dex-based AC/initiative; `speedOverride`, when set,
   * REPLACES the racial base speed outright — speed has a real dataset
   * base (`races-2014.json`'s `speed`), so overriding it is a genuine
   * override, not an invention (see 5e/characterSheet.ts's `totalSpeed`). */
  coreStats?: {
    acBonus?: number;
    initiativeBonus?: number;
    speedOverride?: number;
  };
};

/** One selectable option, already judged by the prerequisite engine. */
export type EligibleOption = {
  index: string;
  name: string;
  /** False when a rule blocks it. The rule is that ineligible
   * options are not OFFERED — the UI filters these out — but the engine
   * still returns them with a reason so a sheet that became invalid (its
   * subclass changed under it) can explain itself instead of silently
   * losing the pick. */
  eligible: boolean;
  /** Why it's blocked, in Portuguese, for the "this pick is no longer
   * valid" warning. Undefined when eligible. */
  reason?: string;
  /** "srd" (vendored) or "table" (homebrew). The UI badges the
   * latter so a player can tell their GM's Drow from a printed option. */
  source?: "srd" | "table";
  /** For a homebrew option: who wrote it. */
  authorName?: string;
};

/** A "choose N of these" the sheet still owes the player. */
export type PendingChoice = {
  /** Stable key: "class-proficiency-0", "feature:bard-expertise-1", … */
  key: string;
  /** What the choice belongs to, for grouping in the UI. */
  source: string;
  desc: string;
  choose: number;
  options: EligibleOption[];
  /** What's currently chosen for this key. */
  chosen: string[];
};
