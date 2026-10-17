import React, { useContext } from "react";

/**
 * True for the read-only Espectador window opened via the map
 * controls' eye button (helpers/spectator.ts's openSpectatorWindow) — a
 * dedicated viewer, always following the Mestre's camera, that can move
 * nothing (tokens, fog, monsters) and never shows the Party or
 * right-hand (Tokens/Monstros) panels. Read wherever a component needs to
 * distinguish "this window is the Espectador" from an ordinary Jogador,
 * whose camera is NOT forced to follow the Mestre (that behaviour used to
 * belong to the old camera-share toggle and has moved to this dedicated
 * viewer instead — see Map.tsx/MapControls.tsx).
 */
const SpectatorContext = React.createContext<boolean>(false);
export const SpectatorProvider = SpectatorContext.Provider;

export function useIsSpectator(): boolean {
  return useContext(SpectatorContext);
}

export default SpectatorContext;
