import { useEffect, type ReactNode } from "react";

import Session from "../network/Session";
import type { PartyState } from "../types/PartyState";
import { useArtisanStore } from "../state/artisanStore";

type PartyProviderProps = {
  session: Session;
  children: ReactNode;
};

/**
 * Keeps the connected peers' public player state, excluding this session.
 *
 * Published to the `artisanStore` party slice instead of a
 * `createContext` — this component is still the sole socket listener
 * (`party_state`), it only stopped wrapping `children` in a Provider.
 */
export function PartyProvider({ session, children }: PartyProviderProps) {
  const socket = session.socket;
  const publishPartyState = useArtisanStore((state) => state.publishPartyState);

  useEffect(() => {
    if (!socket) {
      publishPartyState({});
      return undefined;
    }

    const receiveParty = (nextParty: PartyState) => {
      if (!nextParty) {
        publishPartyState({});
        return;
      }

      // `session.id` is read HERE, when the frame arrives, not captured
      // from the render that installed this listener. The broker only
      // ever sends `party_state` on this client's own join and when some
      // OTHER client's player_state changes (see hub.go's handleJoinGame
      // / handlePlayerState) — there is no replay. Nothing re-renders
      // this component when the socket learns its id, so the listener
      // used to be installed with `ownSessionId === undefined`, and the
      // old guard answered that by publishing an EMPTY party and
      // dropping the frame for good.
      //
      // The Espectador window is where that bites: its own WebView2
      // profile shares no IndexedDB with the Mestre's, so it owns none
      // of the map's assets and has to ask a peer for them. With an
      // empty party, NetworkedMapAndTokens' queueUnavailableAssets finds
      // no owner for the map image, never requests it, and the Stage
      // renders empty — the "grid toda preta" on first open. Hitting the
      // back arrow rejoined the Mesa and re-sent party_state at a
      // luckier moment, which is why that looked like a fix.
      const ownSessionId = session.id;
      const { [ownSessionId ?? ""]: _localPlayer, ...otherPlayers } = nextParty;
      publishPartyState(otherPlayers);
    };

    socket.on("party_state", receiveParty);
    return () => {
      socket.off("party_state", receiveParty);
    };
  }, [session, socket, publishPartyState]);

  return <>{children}</>;
}

export function useParty(): PartyState {
  return useArtisanStore((state) => state.partyState);
}
