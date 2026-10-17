import { useEffect, useRef } from "react";
import type React from "react";
import { useToasts } from "react-toast-notifications";

import Party from "../components/party/Party";

import { useParty } from "../contexts/PartyContext";

import Session from "./Session";

/**
 * @typedef {object} NetworkedPartyProps
 * @property {string} gameId
 * @property {Session} session
 */

type NetworkedPartyProps = { gameId: string; session: Session };

function usePendingJoinAnnouncements(
  partyState: ReturnType<typeof useParty>,
  announce: (message: string) => void
) {
  // Keep a reference to players who have just joined to show the joined notification
  const joinedPlayersRef = useRef<string[]>([]);

  useEffect(() => {
    const pending = joinedPlayersRef.current;
    if (pending.length === 0) return;
    for (const id of pending) {
      if (!partyState[id]) continue;
      // "Some a noção de nickname avulso" — a fresh
      // PlayerState has no name to show yet until its owner's
      // character(s) sync in, so this is deliberately generic rather
      // than reading a nickname field that no longer has UI to set it.
      announce("A player joined the party");
    }
    joinedPlayersRef.current = [];
  }, [partyState, announce]);

  return joinedPlayersRef;
}

function useSessionPartyEvents(
  session: Session,
  partyState: ReturnType<typeof useParty>,
  announce: (message: string) => void,
  joinedPlayersRef: React.MutableRefObject<string[]>
) {
  useEffect(() => {
    function handlePlayerJoined(sessionId: string) {
      // Add player to join notification list
      // Can't just show the notification here as the partyState data isn't populated at this point
      joinedPlayersRef.current.push(sessionId);
    }

    function handlePlayerLeft(sessionId: string) {
      if (partyState[sessionId]) {
        announce("A player left the party");
      }
    }

    session.on("playerJoined", handlePlayerJoined);
    session.on("playerLeft", handlePlayerLeft);

    return () => {
      session.off("playerJoined", handlePlayerJoined);
      session.off("playerLeft", handlePlayerLeft);
    };
  });
}

/**
 * @param {NetworkedPartyProps} props
 */
function NetworkedParty({ gameId, session }: NetworkedPartyProps) {
  const partyState = useParty();
  const { addToast } = useToasts();

  const joinedPlayersRef = usePendingJoinAnnouncements(partyState, addToast);
  useSessionPartyEvents(session, partyState, addToast, joinedPlayersRef);

  return <Party tableId={gameId} />;
}

export default NetworkedParty;