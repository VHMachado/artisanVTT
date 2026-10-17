import React, { useEffect } from "react";

import { useDatabase } from "./DatabaseContext";
import { useUserId } from "./UserIdContext";
import { useAccount } from "./AccountContext";

import useNetworkedState from "../hooks/useNetworkedState";
import Session, { SessionStatus } from "../network/Session";
import { PlayerState } from "../types/PlayerState";
import { useArtisanStore } from "../state/artisanStore";

type SetPlayerState = ReturnType<typeof useNetworkedState<PlayerState>>[1];
type DatabaseHandle = ReturnType<typeof useDatabase>;

const PlayerStateContext = React.createContext<PlayerState | undefined>(undefined);
const PlayerUpdaterContext = React.createContext<SetPlayerState | undefined>(undefined);

/** Loads the persisted nickname once Dexie is ready, merging it into
 * whatever networked player state already exists rather than waiting
 * for it — a slow Dexie open shouldn't block the player from joining. */
function useLoadStoredNickname(
  { database, databaseStatus }: DatabaseHandle,
  setPlayerState: SetPlayerState
) {
  useEffect(() => {
    if (!database || databaseStatus === "loading") {
      return;
    }
    database
      .table("user")
      .get("nickname")
      .then((stored) => {
        if (stored !== undefined) {
          setPlayerState((prevState) => ({ ...prevState, nickname: stored.value }));
        }
      });
  }, [database, databaseStatus, setPlayerState]);
}

/** Mirrors the player's nickname back into Dexie any time it changes —
 * the write side of the same persistence `useLoadStoredNickname` reads
 * from, kept as its own effect since the two run on different triggers. */
function usePersistNickname(
  playerState: PlayerState,
  { database, databaseStatus }: DatabaseHandle
) {
  useEffect(() => {
    const ready = databaseStatus === "loaded" || databaseStatus === "disabled";
    if (playerState.nickname && database && ready) {
      database.table("user").update("nickname", { value: playerState.nickname });
    }
  }, [playerState, database, databaseStatus]);
}

/** Keeps a single field of the networked player state in sync with an
 * external value, skipping the update whenever they already agree —
 * shared by the `userId`/`accountId` effects below, which otherwise
 * differed only in which field they wrote. `skipWhenFalsy` preserves the
 * original `userId` behaviour of never writing back `undefined` once a
 * real id has been set. */
function useSyncPlayerField<K extends keyof PlayerState>(
  key: K,
  value: PlayerState[K],
  setPlayerState: SetPlayerState,
  skipWhenFalsy = false
) {
  useEffect(() => {
    if (skipWhenFalsy && !value) {
      return;
    }
    setPlayerState((prevState) => {
      if (!prevState || prevState[key] === value) {
        return prevState;
      }
      return { ...prevState, [key]: value };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, setPlayerState]);
}

/** Re-announces this player's `sessionId` on every socket (re)connect, so
 * other peers always see a fresh join rather than a stale session from
 * before a reconnect. */
function useAnnounceSessionOnReconnect(
  session: Session,
  setPlayerState: SetPlayerState
) {
  useEffect(() => {
    function announce() {
      setPlayerState((prevState) =>
        prevState ? { ...prevState, sessionId: session.id } : prevState
      );
    }
    function handleStatus(status: SessionStatus) {
      if (status === "joined") {
        announce();
      }
    }

    session.on("status", handleStatus);
    session.socket?.on("connect", announce);
    session.socket?.io.on("reconnect", announce);

    return () => {
      session.off("status", handleStatus);
      session.socket?.off("connect", announce);
      session.socket?.io.off("reconnect", announce);
    };
  });
}

type PlayerProviderProps = {
  session: Session;
  children: React.ReactNode;
};

export function PlayerProvider({ session, children }: PlayerProviderProps) {
  const userId = useUserId();
  const database = useDatabase();
  // accountsAvailable === false builds (no VITE_BROKER_URL/PORT) never
  // mount an AccountProvider-backed session, but the context itself is
  // always present (App.tsx wraps the whole router) so this is safe.
  const { session: accountSession } = useAccount();
  const publishPlayerState = useArtisanStore((state) => state.publishPlayerState);

  const [playerState, setPlayerState] = useNetworkedState<PlayerState>(
    {
      nickname: "",
      dice: { share: false, rolls: [] },
      sessionId: undefined,
      userId,
      accountId: accountSession?.accountId,
    },
    session,
    "player_state",
    500,
    false
  );

  // The React contexts make the current snapshot available to descendants on
  // their first render. The store remains a post-commit projection for code
  // that needs it outside this provider, avoiding external-store mutations
  // while React is rendering its children.
  useEffect(() => {
    publishPlayerState(playerState, setPlayerState);
  }, [playerState, setPlayerState, publishPlayerState]);

  useLoadStoredNickname(database, setPlayerState);
  usePersistNickname(playerState, database);
  useSyncPlayerField("userId", userId, setPlayerState, true);
  useSyncPlayerField("accountId", accountSession?.accountId, setPlayerState);
  useAnnounceSessionOnReconnect(session, setPlayerState);

  return (
    <PlayerStateContext.Provider value={playerState}>
      <PlayerUpdaterContext.Provider value={setPlayerState}>
        {children}
      </PlayerUpdaterContext.Provider>
    </PlayerStateContext.Provider>
  );
}

/**
 * Reads the networked player snapshot from its owning `PlayerProvider`.
 */
export function usePlayerState(): PlayerState {
  const playerState = React.useContext(PlayerStateContext);
  if (playerState === undefined) {
    throw new Error("usePlayerState must be used within a PlayerProvider");
  }
  return playerState;
}

export function usePlayerUpdater() {
  const playerUpdater = React.useContext(PlayerUpdaterContext);
  if (playerUpdater === undefined) {
    throw new Error("usePlayerUpdater must be used within a PlayerProvider");
  }
  return playerUpdater;
}
