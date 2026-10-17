import { v4 as uuid } from "uuid";

import { AccountSession } from "./account";
import { ensureRemoteAssetCached } from "./remoteAssetCache";
import { getImageOutline } from "./image";
import Vector2 from "./Vector2";

import { Character } from "../types/Character";
import { TokenState } from "../types/TokenState";
import { GetAssetEventHanlder, PutAssetEventsHandler } from "../contexts/AssetsContext";

/**
 * The token enters the grid via drag and drop of the
 * character onto the map. A Personagem's tokenAssetId lives on the broker
 * (content-addressed), not in this game's local `assets`
 * table the Konva layer actually renders from (contexts/AssetsContext.tsx)
 * — so the first time ANY local player drops a given character on the
 * map, its image has to be fetched and cached locally, the same as if it
 * had just been uploaded through createTokenFromFile (helpers/token.ts).
 * Once cached, this device becomes an `owner` other peers can request the
 * asset from over WebRTC (NetworkedMapAndTokens's assetRequest flow),
 * exactly like any other file token. See helpers/remoteAssetCache.ts for
 * the shared fetch/cache step, also used by helpers/monsterToken.ts.
 */

/**
 * Builds the TokenState to drop on the map for a Personagem, caching its
 * token image locally first when it has one. Falls back to a generic
 * "default" token (same family as tokens/index.ts's built-ins) when the
 * character has no tokenAssetId — CreateCharacterModal's token image is
 * optional, this is the "no image uploaded yet" path, not an error.
 */
export async function createCharacterTokenState(
  character: Character,
  session: AccountSession | undefined,
  getAsset: GetAssetEventHanlder,
  putAsset: PutAssetEventsHandler,
  position: Vector2,
  userId: string
): Promise<TokenState> {
  const base = {
    id: uuid(),
    tokenId: `__character-${character.id}`,
    owner: userId,
    size: 1,
    category: "character" as const,
    label: character.name,
    statuses: [],
    x: position.x,
    y: position.y,
    lastModifiedBy: userId,
    lastModified: Date.now(),
    rotation: 0,
    locked: false,
    visible: true,
    characterId: character.id,
  };

  if (character.tokenAssetId && session) {
    try {
      const { asset, image } = await ensureRemoteAssetCached(
        session,
        getAsset,
        putAsset,
        character.tokenAssetId,
        userId
      );
      const outline = getImageOutline(image);
      return {
        ...base,
        type: "file",
        file: character.tokenAssetId,
        width: asset.width,
        height: asset.height,
        outline,
      };
    } catch {
      // Fetch failed (offline, broker unreachable) — fall through to the
      // generic default token below rather than blocking the drop.
    }
  }

  return {
    ...base,
    type: "default",
    key: "humanoid",
    width: 256,
    height: 256,
    outline: { type: "circle", x: 128, y: 128, radius: 128 },
  };
}
