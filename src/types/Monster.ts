/**
 * Shape of a monster in the vendored 2014 SRD dataset
 * (`src/5e/data/monsters-2014.json`, see that folder's PROVENANCE.md).
 *
 * These types describe the file AS VENDORED, not an idealised model: field
 * names stay snake_case because they're the upstream JSON's own, and `url`/
 * `image` are absent because scripts/vendor-5e.mjs strips them (they point
 * at dnd5eapi.co, and this project forbids depending on an external
 * API at session time). Anything optional here is optional in the data —
 * 3 of 334 monsters have no `actions`, most have no `legendary_actions`.
 */

/** A `{index, name}` reference to another SRD entity, with its `url` stripped. */
export type SRDRef = {
  index: string;
  name: string;
};

export type MonsterArmorClass = {
  /** "natural" | "dex" | "armor" | "spell" | "condition" — see armorClassText. */
  type: string;
  value: number;
  armor?: SRDRef[];
  spell?: SRDRef;
  condition?: SRDRef;
  desc?: string;
};

/** Movement modes in feet, e.g. `{ walk: "25 ft.", fly: "60 ft.", hover: true }`. */
export type MonsterSpeed = {
  walk?: string;
  fly?: string;
  swim?: string;
  climb?: string;
  burrow?: string;
  /** Present (always `true`) only for creatures that hover while flying. */
  hover?: boolean;
};

export type MonsterSenses = {
  passive_perception: number;
  darkvision?: string;
  blindsight?: string;
  truesight?: string;
  tremorsense?: string;
};

/** A save or skill bonus: `proficiency.name` is "Saving Throw: CON" / "Skill: Stealth". */
export type MonsterProficiency = {
  value: number;
  proficiency: SRDRef;
};

export type MonsterDamage = {
  damage_type: SRDRef;
  damage_dice: string;
};

export type MonsterUsage = {
  /** "recharge on roll" | "per day" | "recharge after rest". */
  type: string;
  times?: number;
  dice?: string;
  min_value?: number;
  rest_types?: string[];
};

export type MonsterDC = {
  dc_type: SRDRef;
  dc_value: number;
  success_type: string;
};

/**
 * One entry of `actions`, `special_abilities`, `legendary_actions` or
 * `reactions`. Only `name`/`desc` are rendered as prose — `desc` in the SRD
 * already spells out attack bonuses, damage and spell lists, so the
 * structured `damage`/`dc`/`attack_bonus` fields are redundant for display
 * and exist here for later use (the HP tracker, dice rolling).
 */
export type MonsterAction = {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage?: MonsterDamage[];
  usage?: MonsterUsage;
  dc?: MonsterDC;
  multiattack_type?: string;
  actions?: unknown[];
  action_options?: unknown;
  options?: unknown;
  attacks?: unknown[];
  spellcasting?: unknown;
};

export type Monster = {
  /** Slug, unique within the dataset ("adult-black-dragon") — used as the id. */
  index: string;
  name: string;
  /** "Tiny" … "Gargantuan". */
  size: string;
  /** "beast", "humanoid", "swarm of Tiny beasts", … */
  type: string;
  /** "dwarf", "shapechanger", … when the type has one. */
  subtype?: string;
  alignment: string;
  armor_class: MonsterArmorClass[];
  hit_points: number;
  hit_dice: string;
  hit_points_roll?: string;
  speed: MonsterSpeed;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  proficiencies: MonsterProficiency[];
  damage_vulnerabilities: string[];
  damage_resistances: string[];
  damage_immunities: string[];
  condition_immunities: SRDRef[];
  senses: MonsterSenses;
  languages: string;
  /** Fractional below 1: 0.125, 0.25, 0.5 — render with challengeRatingText. */
  challenge_rating: number;
  proficiency_bonus: number;
  xp: number;
  /** Flavour text, present for 45 of the 334 entries. */
  desc?: string;
  special_abilities?: MonsterAction[];
  actions?: MonsterAction[];
  legendary_actions?: MonsterAction[];
  reactions?: MonsterAction[];
  /** Alternate forms (vampire bat/mist form, …), as references. */
  forms?: SRDRef[];
};

/**
 * The lightweight row the bestiary panel's list and search work against —
 * built once from the full dataset (see 5e/bestiary.ts). Keeping the list
 * off the full monster objects is what lets the panel render 334 rows and
 * fuzzy-search them without holding every stat block in a Fuse index.
 */
export type MonsterSummary = {
  index: string;
  name: string;
  size: string;
  type: string;
  subtype?: string;
  challenge_rating: number;
  /** Pre-formatted "1/4", "1", "30" — sorting still uses the number. */
  challengeRating: string;
  xp: number;
  /**
   * Where the row comes from: the vendored SRD bestiary (default) or a
   * homebrew/derived creature stored per-Mesa in the broker
   * (types/TableMonster.ts). One summary type for both is deliberate —
   * the panel's search wants to "agrupe pai e variações", which
   * only works if they share a list, a Fuse index and a row component.
   */
  source?: "srd" | "table";
  /** For a derived creature, the SRD parent's name — shown under the row
   * so a list of five Duergar variants is readable at a glance. */
  parentName?: string;
  /**
   * "Perfil" image. For a homebrew/derived row this is the
   * TableMonster's own portraitAssetId; for an SRD row it's merged in by
   * combineMonsterSummaries from an "art-only overlay" (see
   * helpers/tableMonsters.ts's isArtOnlyOverlay) — a GM attaching art
   * directly to an SRD monster without going through "Criar variação".
   * Absent when there's no image either way.
   */
  portraitAssetId?: string;
  /**
   * Asset hashes for a homebrew/derived creature's token art
   * variants (types/TableMonster.ts's tokenAssetIds), carried on the
   * summary so helpers/monsterToken.ts can build a token without a
   * second lookup back into the Mesa's TableMonster rows. For an SRD row
   * this is merged in the same way portraitAssetId above is — never from
   * the vendored bestiary itself (reuse the type
   * silhouette, don't fetch external art) — and absent for a from-scratch/
   * derived/SRD creature with none uploaded yet.
   */
  tokenAssetIds?: string[];
};
