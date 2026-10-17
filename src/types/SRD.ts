/**
 * Shapes of the vendored 2014 SRD character-building datasets
 * (`src/5e/data/{classes,subclasses,races,subraces,features,levels,spells,traits}-2014.json`,
 * see that folder's PROVENANCE.md).
 *
 * Same discipline as types/Monster.ts: these describe the files AS
 * VENDORED, not an idealised model — snake_case field names are the
 * upstream JSON's own, and `url`/`image` are absent because
 * scripts/vendor-5e.mjs strips them (this project forbids depending
 * on an external API at session time).
 */

/** A `{index, name}` reference to another SRD entity, with its `url` stripped. */
export type SRDRef = {
  index: string;
  name: string;
};

/**
 * An SRD "choose N from a set". The upstream schema is a small algebra —
 * `from` is either an inline array of options or a reference to a whole
 * category — and each option is itself one of several shapes. Only the two
 * that actually occur in the datasets this app vendors are modelled:
 * `reference` (a proficiency/spell/equipment item) and `choice` (a nested
 * pick). Anything else is carried as `unknown` and skipped by the engine
 * rather than crashing it.
 */
export type SRDOption =
  | { option_type: "reference"; item: SRDRef }
  | { option_type: "choice"; choice: SRDChoice }
  | { option_type: string; [key: string]: unknown };

export type SRDOptionSet =
  | { option_set_type: "options_array"; options: SRDOption[] }
  | { option_set_type: "equipment_category"; equipment_category: SRDRef }
  | { option_set_type: "resource_list"; resource_list_url?: string }
  | { option_set_type: string; [key: string]: unknown };

export type SRDChoice = {
  desc?: string;
  choose: number;
  /** "proficiencies" | "proficiency" | "equipment" | "languages" | … */
  type: string;
  from: SRDOptionSet;
};

export type AbilityBonus = {
  ability_score: SRDRef;
  bonus: number;
};

export type SRDRace = {
  index: string;
  name: string;
  speed: number;
  ability_bonuses: AbilityBonus[];
  /** Only the half-elf: "+1 to two abilities of your choice". */
  ability_bonus_options?: SRDChoice;
  alignment: string;
  age: string;
  size: string;
  size_description: string;
  languages: SRDRef[];
  language_desc: string;
  language_options?: SRDChoice;
  starting_proficiencies?: SRDRef[];
  starting_proficiency_options?: SRDChoice;
  /** Trait references — resolve against traits-2014.json. */
  traits: SRDRef[];
  subraces: SRDRef[];
};

export type SRDSubrace = {
  index: string;
  name: string;
  race: SRDRef;
  desc: string;
  ability_bonuses: AbilityBonus[];
  starting_proficiencies?: SRDRef[];
  language_options?: SRDChoice;
  racial_traits: SRDRef[];
};

export type SRDTrait = {
  index: string;
  name: string;
  races: SRDRef[];
  subraces: SRDRef[];
  desc: string[];
  proficiencies: SRDRef[];
};

export type SRDSpellcasting = {
  level: number;
  spellcasting_ability: SRDRef;
  info: { name: string; desc: string[] }[];
};

export type SRDClass = {
  index: string;
  name: string;
  hit_die: number;
  proficiency_choices: SRDChoice[];
  proficiencies: SRDRef[];
  saving_throws: SRDRef[];
  subclasses: SRDRef[];
  spellcasting?: SRDSpellcasting;
  multi_classing?: unknown;
  starting_equipment?: unknown[];
  starting_equipment_options?: unknown[];
};

export type SRDSubclass = {
  index: string;
  name: string;
  class: SRDRef;
  subclass_flavor: string;
  desc: string[];
};

/** A prerequisite attached to a feature — 21 of the 407 have one, all of
 * them warlock invocations. `spell`/`feature` are API paths in the upstream
 * data (the vendor script only strips keys literally named `url`), so the
 * engine compares by SLUG SUFFIX, not by equality. */
export type SRDFeaturePrerequisite = {
  type: "level" | "feature" | "spell" | string;
  level?: number;
  feature?: string;
  spell?: string;
};

export type SRDFeature = {
  index: string;
  name: string;
  level: number;
  class: SRDRef;
  /** Present on 88 features: the feature only exists for THIS subclass —
   * the exact rule that's enforced ("Se a habilidade exige uma
   * subclasse específica de Bardo, ela não aparece para outra subclasse"). */
  subclass?: SRDRef;
  prerequisites: SRDFeaturePrerequisite[];
  desc: string[];
  /** Embedded "choose N" payloads (expertise, fighting style, …). */
  feature_specific?: Record<string, SRDChoice | unknown>;
};

export type SRDLevelSpellcasting = {
  cantrips_known?: number;
  spells_known?: number;
  spell_slots_level_1?: number;
  spell_slots_level_2?: number;
  spell_slots_level_3?: number;
  spell_slots_level_4?: number;
  spell_slots_level_5?: number;
  spell_slots_level_6?: number;
  spell_slots_level_7?: number;
  spell_slots_level_8?: number;
  spell_slots_level_9?: number;
};

export type SRDLevel = {
  index: string;
  level: number;
  ability_score_bonuses?: number;
  prof_bonus?: number;
  features: SRDRef[];
  class: SRDRef;
  /** Set only on the 50 rows that belong to a subclass's own progression. */
  subclass?: SRDRef;
  spellcasting?: SRDLevelSpellcasting;
  class_specific?: Record<string, unknown>;
};

export type SRDSpell = {
  index: string;
  name: string;
  desc: string[];
  higher_level?: string[];
  range: string;
  components: string[];
  material?: string;
  ritual: boolean;
  duration: string;
  concentration: boolean;
  casting_time: string;
  /** 0 = cantrip. */
  level: number;
  school: SRDRef;
  attack_type?: string;
  damage?: unknown;
  /** Which classes have it on their list. */
  classes: SRDRef[];
  /** Subclasses that gain it BEYOND their class list (Lore bard's magical
   * secrets, a Land druid's circle spells) — never a restriction. */
  subclasses: SRDRef[];
};
