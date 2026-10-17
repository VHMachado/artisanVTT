import { useArtisanStore } from "../state/artisanStore";

/**
 * Reads the mesa's current-map projection from the shared store. Set by
 * NetworkedMapAndTokens (the sole owner of `currentMap` network state) so
 * its sibling on the other side of Game.tsx's Flex — the Party sidebar's
 * NPCs tab — can scope its roster query to the right map without lifting
 * the whole map/asset-manifest state up or needing a provider boundary.
 *
 * - `currentMapId`: the id of whichever map is currently loaded, undefined
 *   before one is picked.
 * - `isCurrentMapOwner`: true when the CURRENT map's owner is this client —
 *   the same signal the old RightPanel used as a GM fallback
 *   (helpers/token.ts's `map.owner === userId`), needed by the Party
 *   sidebar to decide whether to show the NPCs tab at all.
 * - `placedCharacterIds`: every Character.id that currently has a token
 *   placed on the loaded map (TokenState.characterId) — read by
 *   CharacterRoster to stop a Personagem already on the board from being
 *   dragged on again. Recomputed by NetworkedMapAndTokens whenever
 *   mapState.tokens changes, so this means "placed right now", not "ever
 *   placed" — removing the token clears the entry. Empty before a map is
 *   loaded.
 * - `placedNpcIds`: same idea, keyed by MapNpc.id (TokenState.npcId) — one
 *   roster ROW may only have one token on the board at a time; the Mestre
 *   can still add several separate rows for the same creature (three
 *   goblins = three rows) and place one each.
 */
export function useCurrentMap() {
  const currentMapId = useArtisanStore((state) => state.currentMapId);
  const isCurrentMapOwner = useArtisanStore(
    (state) => state.isCurrentMapOwner
  );
  const placedCharacterIds = useArtisanStore(
    (state) => state.placedCharacterIds
  );
  const placedNpcIds = useArtisanStore((state) => state.placedNpcIds);
  const setCurrentMap = useArtisanStore((state) => state.setCurrentMap);
  const setPlacedTokenEntities = useArtisanStore(
    (state) => state.setPlacedTokenEntities
  );

  return {
    currentMapId,
    isCurrentMapOwner,
    placedCharacterIds,
    placedNpcIds,
    setCurrentMap,
    setPlacedTokenEntities,
  };
}