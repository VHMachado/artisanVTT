import { v4 as uuid } from "uuid";

import { ensureRemoteAssetCached } from "./remoteAssetCache";
import { getImageOutline } from "./image";
import Vector2 from "./Vector2";
import { AccountSession } from "./account";
import {
  hasMonsterTokenArt,
  monsterTokenArtVariants,
  monsterTokenArtSize,
  isMonsterTokenArtKey,
} from "../5e/monsterTokenArt";

import type { MonsterSummary } from "../types/Monster";
import type { TokenState } from "../types/TokenState";
import { GetAssetEventHanlder, PutAssetEventsHandler } from "../contexts/AssetsContext";

/**
 * Turns a bestiary row into a token to drop on the map.
 *
 * The monster panel replaces a
 * visual list that "não escala para centenas" — so the named panel has to
 * do what the visual TokenBar already does (drop a monster on the grid),
 * or it would be strictly worse for the task it exists to fix.
 *
 * No image is invented: monsters with curated global art still use it. Every
 * other monster keeps a semantic default key, but with no bundled silhouette
 * source the canvas renders the token's outline only.
 */

/**
 * Creature type / subtype -> semantic default-token key.
 *
 * The source library is intentionally empty, so these keys select
 * an outline-only fallback unless the monster has curated global art. Keeping
 * the type/subtype still preserves a stable token shape/identifier for maps
 * written before the bundled silhouettes were removed.
 */
const subtypeKeys: Record<string, string> = {
  shapechanger: "shapechanger",
  titan: "titan",
  goblinoid: "goblinoid",
};

export function monsterTokenKey(monster: {
  type: string;
  subtype?: string;
}): string {
  if (monster.subtype && subtypeKeys[monster.subtype]) {
    return subtypeKeys[monster.subtype];
  }
  // "swarm of Tiny beasts" is the only compound type in the dataset, and
  // retaining "beast" makes its fallback key stable.
  const type = monster.type.toLowerCase();
  if (type.includes("beast")) {
    return "beast";
  }
  return type || "humanoid";
}

/** Namespace prefix for a monster token's `tokenId` — shared by the
 * builder below and monsterIndexFromTokenId so the two stay in sync. */
const MONSTER_TOKEN_PREFIX = "__monster-";

/**
 * Recovers the bestiary index (SRD slug or homebrew
 * TableMonster id) a placed token was dropped from, so a right-click on
 * the map can resolve back to "Abrir ficha"/"Editar..." actions without a
 * live lookup through the panel. Undefined for any token that isn't a
 * monster token (a character, prop, or anything created before monster
 * tokens existed).
 */
export function monsterIndexFromTokenId(tokenId: string): string | undefined {
  return tokenId.startsWith(MONSTER_TOKEN_PREFIX)
    ? tokenId.slice(MONSTER_TOKEN_PREFIX.length)
    : undefined;
}

/** 5e size category -> token size in grid squares. */
export function monsterTokenSize(size: string): number {
  switch (size) {
    case "Large":
      return 2;
    case "Huge":
      return 3;
    case "Gargantuan":
      return 4;
    default:
      // Tiny/Small/Medium all occupy one square in 5e.
      return 1;
  }
}

/**
 * Builds the base fields shared by the sync ("no image yet") and async
 * ("first uploaded variant") paths — extracted so createMonsterTokenState
 * can return synchronously the common case (no art), matching this
 * function's existing signature and every existing caller
 * (BestiaryPanel's drag handler), while createMonsterTokenStateWithArt
 * below is the opt-in async path a caller uses when it wants the FIRST
 * uploaded token variant instead of the type silhouette.
 *
 * An SRD monster with curated global token art (see
 * src/5e/monsterTokenArt.ts — the bundled manifest is empty;
 * this art comes from the user's local override folder, monsterArtLocal.ts)
 * shows that art here by default, with every
 * variant reachable through the same right-click carousel a homebrew
 * monster's uploaded tokenAssetIds already use (monsterTokenVariants/
 * variantIndex) — no broker/session/asset-cache involved since these are
 * plain static files, so this stays fully synchronous. A monster with no
 * curated art falls back to the type silhouette exactly as before.
 */
function baseMonsterTokenState(
  monster: MonsterSummary,
  position: Vector2,
  userId: string,
  npcId?: string
): TokenState {
  if (hasMonsterTokenArt(monster.index)) {
    const variants = monsterTokenArtVariants(monster.index);
    const size = monsterTokenArtSize(variants[0]);
    return {
      id: uuid(),
      tokenId: `${MONSTER_TOKEN_PREFIX}${monster.index}`,
      owner: userId,
      size: monsterTokenSize(monster.size),
      category: "character",
      label: monster.name,
      statuses: [],
      x: position.x,
      y: position.y,
      lastModifiedBy: userId,
      lastModified: Date.now(),
      rotation: 0,
      locked: false,
      visible: true,
      type: "default",
      key: variants[0],
      width: size.width,
      height: size.height,
      outline: { type: "rect", x: 0, y: 0, width: size.width, height: size.height },
      variantIndex: 0,
      monsterTokenVariants: variants,
      npcId,
    };
  }
  return {
    id: uuid(),
    // Namespaced the same way createCharacterTokenState namespaces its own
    // synthetic ids, so nothing mistakes this for a row in the local
    // `tokens` table.
    tokenId: `${MONSTER_TOKEN_PREFIX}${monster.index}`,
    owner: userId,
    size: monsterTokenSize(monster.size),
    category: "character",
    // The monster's name IS the useful label here (unlike a player
    // character's token, which the roster already identifies) — a board
    // with four unlabelled goblins and two hobgoblins is unusable.
    label: monster.name,
    statuses: [],
    x: position.x,
    y: position.y,
    lastModifiedBy: userId,
    lastModified: Date.now(),
    rotation: 0,
    locked: false,
    visible: true,
    type: "default",
    key: monsterTokenKey(monster),
    width: 256,
    height: 256,
    outline: { type: "circle", x: 128, y: 128, radius: 128 },
    npcId,
  };
}

export function createMonsterTokenState(
  monster: MonsterSummary,
  position: Vector2,
  userId: string,
  npcId?: string
): TokenState {
  return baseMonsterTokenState(monster, position, userId, npcId);
}

/**
 * Variant of createMonsterTokenState: when the monster (a
 * homebrew/derived TableMonster — the SRD bestiary never has uploaded
 * art) carries `tokenAssetIds`, caches the FIRST variant locally
 * (ensureRemoteAssetCached, shared with createCharacterTokenState) and
 * drops a `type: "file"` token showing it, with `monsterTokenVariants`
 * snapshotted onto the token so the map's right-click carousel
 * (components/konva/TokenVariantMenu.tsx) can cycle through the rest
 * without a live lookup back into the Mesa's TableMonster row. Falls
 * back to the synchronous silhouette path on any fetch failure (offline,
 * broker unreachable) or when there is no art at all — never blocks the
 * drop over a missing/unreachable image, same discipline as
 * createCharacterTokenState.
 */
export async function createMonsterTokenStateWithArt(
  monster: MonsterSummary,
  position: Vector2,
  userId: string,
  session: AccountSession | undefined,
  getAsset: GetAssetEventHanlder,
  putAsset: PutAssetEventsHandler,
  npcId?: string
): Promise<TokenState> {
  const base = baseMonsterTokenState(monster, position, userId, npcId);
  const variants = monster.tokenAssetIds;
  if (!variants || variants.length === 0 || !session) {
    return base;
  }
  try {
    const { asset, image } = await ensureRemoteAssetCached(
      session,
      getAsset,
      putAsset,
      variants[0],
      userId
    );
    const outline = getImageOutline(image);
    return {
      ...base,
      type: "file",
      file: variants[0],
      width: asset.width,
      height: asset.height,
      outline,
      variantIndex: 0,
      monsterTokenVariants: variants,
    };
  } catch {
    return base;
  }
}

/**
 * Switches a PLACED monster token to show a different uploaded
 * variant — the patch (types/TokenState.ts's Partial<TokenState>) for
 * useMapTokens.tsx's onTokenStateChange, mirroring what
 * createMonsterTokenStateWithArt does for a token's FIRST variant at drop
 * time. Downloads and caches the asset if this device doesn't have it yet
 * (ensureRemoteAssetCached — same as any peer requesting a file token's
 * image for the first time), then recomputes width/height/outline from the
 * actual image rather than reusing whatever the token's previous variant
 * had, since two uploaded variants are never guaranteed to share
 * dimensions. Returns undefined (no-op) on any failure — offline, broker
 * unreachable, asset since deleted — so a stale click never corrupts the
 * token's current display.
 *
 * `assetId` may also be one of the synthetic global monster-art
 * keys (`monster-art:<index>:<n>`, see src/5e/monsterTokenArt.ts) rather
 * than a real broker asset hash — those resolve from the static manifest
 * with no network/session involved, so this branches before ever touching
 * ensureRemoteAssetCached.
 */
export async function switchMonsterTokenVariant(
  assetId: string,
  variantIndex: number,
  variantAssetIds: string[],
  session: AccountSession | undefined,
  getAsset: GetAssetEventHanlder,
  putAsset: PutAssetEventsHandler,
  userId: string
): Promise<Partial<TokenState> | undefined> {
  if (isMonsterTokenArtKey(assetId)) {
    const size = monsterTokenArtSize(assetId);
    return {
      type: "default",
      key: assetId,
      width: size.width,
      height: size.height,
      outline: { type: "rect", x: 0, y: 0, width: size.width, height: size.height },
      variantIndex,
      monsterTokenVariants: variantAssetIds,
    };
  }
  if (!session) {
    return undefined;
  }
  try {
    const { asset, image } = await ensureRemoteAssetCached(
      session,
      getAsset,
      putAsset,
      assetId,
      userId
    );
    const outline = getImageOutline(image);
    return {
      type: "file",
      file: assetId,
      width: asset.width,
      height: asset.height,
      outline,
      variantIndex,
      monsterTokenVariants: variantAssetIds,
    };
  } catch {
    return undefined;
  }
}
