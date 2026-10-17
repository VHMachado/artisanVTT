import type { Monster, MonsterSummary } from "../types/Monster";
import type { MonsterOverrides, TableMonster } from "../types/TableMonster";
import { challengeRatingText } from "../5e/monsterFormat";

/**
 * Resolves a homebrew/derived creature into a full `Monster` the
 * existing stat block renderer can display unchanged.
 *
 * Creating a monster/NPC from scratch or derived from an
 * existing one: "Criar monstro/NPC do zero ou derivado de um
 * existente. Derivados ficam atrelados ao monstro pai ('Fulana é uma
 * Duergar comum, mas com x de HP e habilidades de ladina') — modelar como
 * parent_id + campos sobrescritos, para que a busca agrupe pai e
 * variações."
 *
 * Storing the DIFF rather than a copy of the parent is what makes the
 * relationship live: a derived creature that only overrides HP still shows
 * its parent's full stat block, and both appear grouped in the panel. The
 * cost is that the merge has to be explicit, which is this file.
 */

/** Empty stat block used when a creature has no parent: every field the
 * renderer reads, at 5e's neutral defaults, so a from-scratch monster is
 * "overrides applied to nothing" rather than a separate code path. */
function blankMonster(id: string): Monster {
  return {
    index: id,
    name: "",
    size: "Medium",
    type: "humanoid",
    alignment: "unaligned",
    armor_class: [{ type: "dex", value: 10 }],
    hit_points: 1,
    hit_dice: "1d8",
    speed: { walk: "30 ft." },
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
    proficiencies: [],
    damage_vulnerabilities: [],
    damage_resistances: [],
    damage_immunities: [],
    condition_immunities: [],
    senses: { passive_perception: 10 },
    languages: "",
    challenge_rating: 0,
    proficiency_bonus: 2,
    xp: 0,
  };
}

/**
 * Parses a TableMonster's stored `overrides` JSON. Returns `{}` for
 * anything unparseable rather than throwing: the field is opaque to the
 * broker (see applyMonsterOp), so a client with a newer schema could have
 * written something this build doesn't understand, and a stat block that
 * degrades to its parent's is far better than a panel that crashes.
 */
export function parseOverrides(overrides: string): MonsterOverrides {
  try {
    const parsed = JSON.parse(overrides || "{}");
    return parsed && typeof parsed === "object" ? (parsed as MonsterOverrides) : {};
  } catch {
    return {};
  }
}

export function serialiseOverrides(overrides: MonsterOverrides): string {
  // Drop undefined/empty entries so an untouched field stays absent —
  // "absent means inherit from the parent" is the whole contract, and a
  // stored `{"hitPoints": undefined}` would serialise away anyway while a
  // stored `""` would override the parent with nothing.
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === "" || value === null) {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    cleaned[key] = value;
  }
  return JSON.stringify(cleaned);
}

/**
 * True for a TableMonster created purely to attach a "Perfil"
 * image and/or token variants to an SRD monster — never through
 * MonsterFormModal's full creature form, only MonsterArtModal's "Editar
 * imagens" action on an SRD row. `combineMonsterSummaries` reads this to
 * merge the art straight onto the SRD row's own summary instead of
 * listing a separate "variação de X" entry: the whole point of the
 * marker is that a GM never has to go through "Criar variação" just to
 * give an existing monster art. Stored inside the opaque `overrides` JSON
 * (rather than a new broker column or EntityType) because the field is
 * never introspected by the broker either way — see MonsterRow.Overrides.
 */
export function isArtOnlyOverlay(monster: TableMonster): boolean {
  return Boolean(monster.parentIndex) && parseOverrides(monster.overrides).artOnly === true;
}

/**
 * Applies a TableMonster's overrides over its parent stat block (or over a
 * blank one when it has none), producing a `Monster` the stat block
 * component renders with no knowledge that it's homebrew.
 *
 * `parent` is passed in rather than looked up here so this stays a pure
 * function (testable without the ~1MB dataset) — callers get it from
 * 5e/bestiary.ts's `loadMonster`.
 */
export function resolveTableMonster(
  monster: TableMonster,
  parent?: Monster
): Monster {
  const overrides = parseOverrides(monster.overrides);
  const base = parent ? { ...parent } : blankMonster(monster.id);

  // The row's own `name` column always wins: it's what the panel lists and
  // what the GM typed, and keeping it in two places (column + override)
  // would let them disagree.
  const resolved: Monster = {
    ...base,
    index: monster.id,
    name: monster.name,
  };

  if (overrides.size) resolved.size = overrides.size;
  if (overrides.type) resolved.type = overrides.type;
  if (overrides.subtype) resolved.subtype = overrides.subtype;
  if (overrides.alignment) resolved.alignment = overrides.alignment;
  if (typeof overrides.armorClass === "number") {
    // A flat number replaces the parent's whole AC list: the SRD's
    // conditional entries ("15 while prone") describe the PARENT's body,
    // and silently keeping them beside a GM's new value would render a
    // stat block nobody wrote.
    resolved.armor_class = [{ type: "natural", value: overrides.armorClass }];
  }
  if (typeof overrides.hitPoints === "number") {
    resolved.hit_points = overrides.hitPoints;
    // The parent's hit_points_roll is now a lie about a different HP
    // total, so drop it and let the renderer fall back to hit_dice.
    resolved.hit_points_roll = undefined;
  }
  if (overrides.hitDice) resolved.hit_dice = overrides.hitDice;
  if (overrides.speedWalk) {
    resolved.speed = { ...base.speed, walk: overrides.speedWalk };
  }
  for (const ability of [
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
  ] as const) {
    const value = overrides[ability];
    if (typeof value === "number") {
      resolved[ability] = value;
    }
  }
  if (typeof overrides.challengeRating === "number") {
    resolved.challenge_rating = overrides.challengeRating;
  }
  if (overrides.languages) resolved.languages = overrides.languages;
  if (overrides.desc) resolved.desc = overrides.desc;

  // Extra abilities/actions APPEND: "uma Duergar comum, mas com
  // habilidades de ladina" keeps everything that makes it a Duergar.
  if (overrides.extraAbilities && overrides.extraAbilities.length > 0) {
    resolved.special_abilities = [
      ...(base.special_abilities || []),
      ...overrides.extraAbilities,
    ];
  }
  if (overrides.extraActions && overrides.extraActions.length > 0) {
    resolved.actions = [...(base.actions || []), ...overrides.extraActions];
  }

  return resolved;
}

/**
 * The light row a resolved homebrew creature contributes to the bestiary
 * panel's list and Fuse index, in the same shape as an SRD row so the two
 * sources sort, search and render through one code path.
 */
export function tableMonsterSummary(
  monster: TableMonster,
  parent?: Monster
): MonsterSummary {
  const resolved = resolveTableMonster(monster, parent);
  return {
    index: monster.id,
    name: resolved.name,
    size: resolved.size,
    type: resolved.type,
    subtype: resolved.subtype,
    challenge_rating: resolved.challenge_rating,
    challengeRating: challengeRatingText(resolved.challenge_rating),
    xp: resolved.xp,
    /** Set only for homebrew, so a row can render its badge and open the
     * right editor without the panel tracking two parallel lists. */
    source: "table",
    parentName: parent?.name,
    portraitAssetId: monster.portraitAssetId,
    tokenAssetIds:
      monster.tokenAssetIds && monster.tokenAssetIds.length > 0
        ? monster.tokenAssetIds
        : undefined,
  };
}

/**
 * Merges the vendored SRD list with a Mesa's homebrew creatures into the
 * single list the panel renders and searches.
 *
 * Derivados ficam atrelados ao monstro pai ... para que
 * a busca agrupe pai e variações." That grouping is what the sort key
 * below implements: a derived creature sorts under its PARENT's name, not
 * its own, so "Fulana, a Duergar Ladina" sits directly beneath "Duergar"
 * instead of hundreds of rows away under F. The parent itself sorts first
 * within its group; homebrew with no parent just sorts by its own name
 * among the SRD rows, since there is no group for it to belong to.
 *
 * An "art-only overlay" (isArtOnlyOverlay — a TableMonster whose
 * only purpose is carrying uploaded art for an SRD parent) is NOT listed
 * as its own row here. Its portraitAssetId/tokenAssetIds are merged
 * straight onto the matching SRD summary instead, so attaching art to
 * "Goblin" shows up on the Goblin row itself rather than a separate
 * "variação de Goblin" entry the user never asked to create.
 */
export function combineMonsterSummaries(
  srdSummaries: MonsterSummary[],
  tableMonsters: TableMonster[],
  parents: Map<string, Monster>
): MonsterSummary[] {
  const artOverlays = new Map<string, TableMonster>();
  const realMonsters: TableMonster[] = [];
  for (const monster of tableMonsters) {
    if (isArtOnlyOverlay(monster) && monster.parentIndex) {
      // Last write wins if somehow more than one overlay exists for the
      // same parent — MonsterArtModal always upserts the same row, so
      // this is a defensive fallback, not the normal path.
      artOverlays.set(monster.parentIndex, monster);
    } else {
      realMonsters.push(monster);
    }
  }

  const srdWithArt = srdSummaries.map((summary) => {
    const overlay = artOverlays.get(summary.index);
    if (!overlay) {
      return summary;
    }
    return {
      ...summary,
      portraitAssetId: overlay.portraitAssetId,
      tokenAssetIds:
        overlay.tokenAssetIds && overlay.tokenAssetIds.length > 0
          ? overlay.tokenAssetIds
          : undefined,
    };
  });

  // Index the SRD rows AFTER their own art-only overlay was merged in, so
  // a variation that supplies no art of its own can inherit whatever the
  // parent effectively shows (its own upload if any) rather than falling
  // back to nothing.
  const srdArtByIndex = new Map(srdWithArt.map((summary) => [summary.index, summary]));

  const homebrew = realMonsters.map((monster) => {
    const parent = monster.parentIndex
      ? parents.get(monster.parentIndex)
      : undefined;
    const summary = tableMonsterSummary(monster, parent);
    if (!monster.parentIndex) {
      return summary;
    }
    // A variation inherits the parent's art wholesale when it has none of
    // its own — "variações devem herdar imagens da criatura-pai" — but a
    // variant that DID upload its own Perfil/token art always keeps it.
    const parentArt = srdArtByIndex.get(monster.parentIndex);
    if (!parentArt) {
      return summary;
    }
    return {
      ...summary,
      portraitAssetId: summary.portraitAssetId ?? parentArt.portraitAssetId,
      tokenAssetIds: summary.tokenAssetIds ?? parentArt.tokenAssetIds,
    };
  });
  const combined = [...srdWithArt, ...homebrew];
  return combined.sort((a, b) => {
    const groupA = a.parentName || a.name;
    const groupB = b.parentName || b.name;
    const byGroup = groupA.localeCompare(groupB);
    if (byGroup !== 0) {
      return byGroup;
    }
    // Same group: the SRD parent heads it, its variations follow by name.
    const derivedA = a.parentName ? 1 : 0;
    const derivedB = b.parentName ? 1 : 0;
    if (derivedA !== derivedB) {
      return derivedA - derivedB;
    }
    return a.name.localeCompare(b.name);
  });
}
