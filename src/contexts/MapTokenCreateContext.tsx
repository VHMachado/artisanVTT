import React, { useContext } from "react";

import { TokensStateCreateHandler } from "../types/Events";

/**
 * A mutable ref to the map's current "create these token states" handler,
 * shared the same way MapStageContext.tsx shares the Konva stage: Game.tsx
 * owns the ref and hands it to both siblings under the map/party split
 * (routes/Game.tsx), NetworkedMapAndTokens keeps it pointed at its latest
 * handleMapTokensStateCreate closure (currentMap/currentMapState change
 * every render), and CharacterRoster calls through it to drop a
 * spawned character token onto the map — "O token
 * entra na grid por drag and drop do personagem para o mapa." A ref
 * avoids lifting NetworkedMapAndTokens's whole map/asset-manifest state up
 * to Game.tsx just to share one callback with its sibling.
 */
export type MapTokenCreateRef =
  React.MutableRefObject<TokensStateCreateHandler | null>;

const MapTokenCreateContext = React.createContext<MapTokenCreateRef | undefined>(
  undefined
);
export const MapTokenCreateProvider = MapTokenCreateContext.Provider;

export function useMapTokenCreate() {
  const context = useContext(MapTokenCreateContext);
  if (context === undefined) {
    throw new Error(
      "useMapTokenCreate must be used within a MapTokenCreateProvider"
    );
  }
  return context;
}

export default MapTokenCreateContext;
