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
  const ownSessionId = session.id;
  const publishPartyState = useArtisanStore((state) => state.publishPartyState);

  useEffect(() => {
    if (!socket) {
      publishPartyState({});
      return undefined;
    }

    const receiveParty = (nextParty: PartyState) => {
      if (!nextParty || !ownSessionId) {
        publishPartyState({});
        return;
      }

      const { [ownSessionId]: _localPlayer, ...otherPlayers } = nextParty;
      publishPartyState(otherPlayers);
    };

    socket.on("party_state", receiveParty);
    return () => {
      socket.off("party_state", receiveParty);
    };
  }, [ownSessionId, socket, publishPartyState]);

  return <>{children}</>;
}

export function useParty(): PartyState {
  return useArtisanStore((state) => state.partyState);
}
