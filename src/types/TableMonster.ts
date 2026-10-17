/**
 * A homebrew or derived creature: user content, per-Mesa, owned
 * and synced — the mirror of broker-go's `tables.MonsterRow`.
 *
 * The vendored SRD bestiary (types/Monster.ts) is the opposite kind of
 * data — static, ownerless, read-only, shipped inside the client — which
 * is why the two types are separate rather than one with optional fields:
 * nothing in the sync machinery (outbox, `baseVersion` guard, `changes`
 * log) applies to an SRD row, and nothing in the vendoring script applies
 * to this one.
 */
export type TableMonster = {
  id: string;
  tableId: string;
  name: string;
  /**
   * Slug of the SRD monster this one derives from ("duergar"), undefined
   * for a creature built from scratch. "Derivados ficam
   * atrelados ao monstro pai ... para que a busca agrupe pai e variações."
   *
   * Always an SRD index, never another TableMonster's id — a chain of
   * derivations would need cycle detection and a multi-level merge, and
   * the vendored bestiary is the one parent space every client already
   * has locally. Fixed at creation (the broker ignores it in an edit
   * patch): re-parenting would reinterpret every stored override against
   * a different base stat block.
   */
  parentIndex?: string;
  /**
   * The fields this creature overrides on its parent — or its whole stat
   * block when it has no parent. Stored as JSON text (not a parsed
   * object) because that is exactly how the broker carries it: an opaque
   * string it never introspects, so the 5e schema stays in the client.
   * Parse with helpers/tableMonsters.ts's `resolveTableMonster`.
   */
  overrides: string;
  /**
   * "Perfil" image — a content-addressed asset hash,
   * same store and upload path as Character's portraitAssetId
   * (helpers/assetUpload.ts). Optional: a homebrew/derived creature with
   * none falls back to the type silhouette, same as a Character with no
   * portrait falls back to PersonIcon (CharacterPortrait.tsx).
   */
  portraitAssetId?: string;
  /**
   * Token art variants — "variações de aparência" so the same creature
   * (e.g. "goblin comum") can look different token to token on the board,
   * cycled per-instance via a map token's own right-click carousel
   * (TokenState.variantIndex indexes into this array, see
   * helpers/monsterToken.ts). Stored as a JSON array of asset hashes for
   * the same opaque-to-the-broker reason `overrides` is; parse/serialise
   * with helpers/tableMonsters.ts.
   */
  tokenAssetIds?: string[];
  /** Who authored it. Never null and never reassigned — edit rights come
   * from being the Mesa's GM, not from this (see applyMonsterOp). */
  ownerAccountId: number;
  createdAt: number;
  updatedAt: number;
  version: number;
  deleted: boolean;
};

/**
 * The subset of a 5e stat block this phase lets a GM override. Deliberately
 * NOT the full `Monster` shape: a form with 40 fields (every legendary
 * action, every proficiency) is a worse tool than one with the handful a
 * GM actually retunes mid-prep, and every field added here has to be
 * merged, validated and rendered. `actions`/`special_abilities` are the
 * two list fields included because "habilidades de ladina" — the user's
 * own example of a derived monster — needs them.
 */
export type MonsterOverrides = {
  name?: string;
  size?: string;
  type?: string;
  subtype?: string;
  alignment?: string;
  armorClass?: number;
  hitPoints?: number;
  hitDice?: string;
  speedWalk?: string;
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  challengeRating?: number;
  languages?: string;
  desc?: string;
  /** Appended to (not replacing) the parent's, so a derived creature keeps
   * what makes it a Duergar while gaining what makes it a rogue. */
  extraAbilities?: { name: string; desc: string }[];
  extraActions?: { name: string; desc: string }[];
  /**
   * Internal marker, NOT a stat field: true means this
   * TableMonster carries ONLY uploaded art for its SRD `parentIndex` —
   * created exclusively by MonsterArtModal's "Editar imagens" action on
   * an SRD row, never by MonsterFormModal's full creature form. Read by
   * helpers/tableMonsters.ts's `isArtOnlyOverlay`, which makes
   * `combineMonsterSummaries` merge the art straight onto the SRD row
   * instead of listing a separate "variação de X" entry — the whole
   * point being the user never has to go through "Criar variação" just
   * to attach a portrait/token image to an existing monster. Living
   * inside the opaque `overrides` JSON (rather than a new broker column)
   * because the broker never introspects that field either way — see
   * MonsterRow.Overrides's own comment.
   */
  artOnly?: boolean;
};
