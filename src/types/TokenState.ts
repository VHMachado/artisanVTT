import { Color } from "../helpers/colors";
import { Outline } from "./Outline";
import { TokenCategory } from "./Token";

export type TokenLightShape = "cone" | "circle";
export type TokenLight = {
  enabled: boolean,
  angle: number,
  shape: TokenLightShape,
  radius: number,
};

/** Defaults used by the light editor and by any read of a token whose
 * light was only partially stored. A 4-cell radius is the 5e torch's
 * bright-light reach (20ft on a 5ft grid). */
export const defaultTokenLight: TokenLight = {
  radius: 4,
  shape: "circle",
  angle: 90,
  enabled: true,
};

/**
 * Pedido do usuário (2026-10-12): HP atual/máximo de UM token colocado
 * no mapa — distinto do `hit_points` estático do bestiário
 * (types/Monster.ts), que descreve a criatura em geral, não esta
 * instância. Vive no token (sincronizado pelo map_state versionado,
 * igual a `light`) para que o Combat Tracker
 * (types/Initiative.ts's InitiativeEntry.tokenId) possa espelhar o MESMO
 * dado em vez de manter uma cópia — editar HP no menu do token e editar
 * HP no tracker são a mesma escrita.
 */
export type TokenHp = { max: number, current: number };

export type BaseTokenState = {
  height: number,
  width: number,
  outline: Outline,
  visible: boolean,
  locked: boolean,
  rotation: number,
  lastModified: number,
  lastModifiedBy: string,
  y: number,
  x: number,
  statuses: Color[],
  label: string,
  category: TokenCategory,
  size: number,
  owner: string,
  tokenId: string,
  id: string,
  /** Links this token to a synced Personagem (types/Character.ts).
   * `owner` above stays the per-device id it always was (visibility/asset
   * ownership, unrelated to accounts) — this is the separate id the broker
   * resolves against `characters.ownerAccountId` to enforce "Jogador move
   * só o próprio personagem" ("Permissões"). Undefined for
   * every token that isn't a character (props, plain monster tokens,
   * anything created before accounts existed). */
  characterId?: string;
  /**
   * Links this token back to the specific MapNpc roster
   * entry (types/MapNpc.ts) it was dropped from — distinct from
   * `monsterIndex` (shared by every roster entry of the same creature,
   * e.g. three separate goblins) because each roster ROW represents one
   * placeable board entity. Used to stop the same roster entry from
   * being dragged onto the map more than once (see CurrentMapContext's
   * placedNpcIds) — undefined for every token that isn't an NPC-roster
   * token (characters, props, plain file tokens).
   */
  npcId?: string;
  /**
   * Which entry of the monster's `tokenAssetIds` variant list
   * (types/TableMonster.ts) this PLACED token instance shows — so two
   * goblins dropped from the same TableMonster can each look different
   * ("variações de aparência" the user asked for), cycled per-token via
   * a right-click carousel (see components/konva/TokenVariantMenu.tsx)
   * rather than baked into the monster's own art list. Undefined/0 means
   * the first variant (or the type silhouette when there are none yet).
   * Meaningless for anything that isn't a monster token; travels through
   * the ordinary versioned map_state sync like any other TokenState
   * field, no new entity or broker change needed.
   */
  variantIndex?: number;
  /**
   * Snapshot, taken when this token was dropped onto the map, of the
   * source TableMonster's `tokenAssetIds` (asset hashes) — the list the
   * right-click carousel cycles through via `variantIndex` above.
   * Deliberately a snapshot rather than a live lookup: this token would
   * otherwise need to know which Mesa/TableMonster it came from just to
   * render, and a GM adding a 4th variant later shouldn't reshuffle art
   * already placed on the board. Undefined for every non-monster token
   * and for a monster with no uploaded art (falls back to the type
   * silhouette, same as before this field existed).
   */
  monsterTokenVariants?: string[];
  /**
   * The light/vision area this token reveals through the map's
   * darkness overlay (types above, components/konva/TokenLights.tsx).
   * Undefined for every token that emits no light, which is the default
   * and the vast majority — a token only gains this field when a GM
   * explicitly configures it through the right-click "Luz" entry.
   */
  light?: TokenLight;
  /**
   * Pedido do usuário (2026-10-12): HP atual/máximo do token, para o
   * Combat Tracker (types/Initiative.ts's InitiativeEntry.tokenId) poder
   * espelhar PERMANENTEMENTE o HP de um token adicionado ao combate —
   * editar no tracker ou aqui (TokenMenu.tsx) é o MESMO dado, não uma
   * cópia. Undefined para a grande maioria dos tokens (props, qualquer
   * token criado antes desta mudança, ou nunca adicionado ao combate) —
   * o tracker trata ausência como 0/0, igual ao combatente free-typed
   * sempre tratou um campo em branco.
   */
  hp?: TokenHp;
};

export type DefaultTokenState = BaseTokenState & { key: string, type: "default" };
export type FileTokenState = BaseTokenState & { file: string, type: "file" };
export type TokenState = FileTokenState | DefaultTokenState;
export type TokenStates = Record<string, TokenState>;
