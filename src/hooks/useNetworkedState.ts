import { useEffect, useState, useRef, useCallback } from "react";
import cloneDeep from "lodash.clonedeep";
import { Diff } from "deep-diff";

import useDebounce from "./useDebounce";
import { diff, applyChanges } from "../helpers/diff";
import Session from "../network/Session";

export type SetNetworkedState<S> = (
  update: React.SetStateAction<S>,
  /** Whether to sync the update with the session */
  sync?: boolean,
  /** Whether to force a full update, useful when partialUpdates is enabled */
  force?: boolean
) => void;

type Update<T> = {
  id: string;
  changes: Diff<T>[];
  // The version this update was computed against. Only set/read
  // when `versioned` is true.
  baseVersion?: number;
  // The resulting version after the broker applied this update,
  // echoed back on the broadcast to everyone but the sender.
  version?: number;
};

// Wire shape of a full-state sync (`eventName`) once `versioned` is
// true, matching broker-go/internal/game/hub.go's wrapMapState.
type VersionedState<S> = { state: S; version: number };

/** Refs that outlive a render and are shared between the outgoing-sync
 * and incoming-sync effects below — kept as one bundle so neither effect
 * needs five separate parameters for what's really one piece of mutable
 * bookkeeping per networked value. */
type SyncRefs<S> = {
  dirtyRef: React.MutableRefObject<boolean>;
  forceUpdateRef: React.MutableRefObject<boolean>;
  versionRef: React.MutableRefObject<number>;
  lastSyncedStateRef: React.MutableRefObject<S | undefined>;
};

type OutgoingSyncOptions<S> = {
  session: Session;
  eventName: string;
  debouncedState: S | undefined;
  partialUpdates: boolean;
  partialUpdatesKey: string;
  versioned: boolean;
  refs: SyncRefs<S>;
};

/**
 * Whenever a dirty, debounced state settles, emits either the diff since
 * the last sync (when partial updates are enabled and a prior state
 * exists) or the whole state, then clears the dirty flag and snapshots
 * what was just sent so the next diff has a baseline.
 */
function useSyncOutgoingState<S extends { readonly [x: string]: any } | null>(
  options: OutgoingSyncOptions<S>
) {
  const {
    session,
    eventName,
    debouncedState,
    partialUpdates,
    partialUpdatesKey,
    versioned,
    refs,
  } = options;
  const { dirtyRef, forceUpdateRef, versionRef, lastSyncedStateRef } = refs;

  useEffect(() => {
    if (!dirtyRef.current) {
      return;
    }
    const lastSynced = lastSyncedStateRef.current;
    const canSendPartial =
      lastSynced && debouncedState && partialUpdates && !forceUpdateRef.current;

    if (canSendPartial && lastSynced) {
      const changes = diff(lastSynced, debouncedState);
      if (changes) {
        if (!debouncedState) {
          return;
        }
        const update: Update<S> = {
          id: debouncedState[partialUpdatesKey],
          changes,
        };
        if (versioned) {
          update.baseVersion = versionRef.current;
        }
        session.socket?.emit(`${eventName}_update`, update);
      }
    } else {
      session.socket?.emit(eventName, debouncedState);
    }
    dirtyRef.current = false;
    forceUpdateRef.current = false;
    lastSyncedStateRef.current = cloneDeep(debouncedState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.socket, eventName, debouncedState, partialUpdates, partialUpdatesKey, versioned]);
}

type IncomingSyncOptions<S> = {
  session: Session;
  eventName: string;
  partialUpdatesKey: string;
  versioned: boolean;
  refs: SyncRefs<S>;
  setState: React.Dispatch<React.SetStateAction<S>>;
};

/**
 * Listens for the three socket events a networked value can arrive on:
 * a full replace (`eventName`), a partial diff (`${eventName}_update`),
 * and — only once `versioned` — a bare version-ack the broker sends the
 * client whose own edit was just accepted.
 */
function useSyncIncomingState<S extends { readonly [x: string]: any } | null>(
  options: IncomingSyncOptions<S>
) {
  const { session, eventName, partialUpdatesKey, versioned, refs, setState } =
    options;
  const { versionRef, lastSyncedStateRef } = refs;

  useEffect(() => {
    function handleSocketEvent(data: S | VersionedState<S>) {
      if (versioned) {
        const { state: newState, version } = data as VersionedState<S>;
        versionRef.current = version;
        setState(newState);
        lastSyncedStateRef.current = newState;
      } else {
        setState(data as S);
        lastSyncedStateRef.current = data as S;
      }
    }

    function handleSocketUpdateEvent(update: Update<S>) {
      if (versioned && typeof update.version === "number") {
        versionRef.current = update.version;
      }
      setState((prevState) => {
        if (!prevState || prevState[partialUpdatesKey] !== update.id) {
          return prevState;
        }
        const newState = { ...prevState };
        applyChanges(newState, update.changes);
        if (lastSyncedStateRef.current) {
          applyChanges(lastSyncedStateRef.current, update.changes);
        }
        return newState;
      });
    }

    // Ack-only event the broker sends to the client whose update
    // (partial or full) was just accepted, so it learns the resulting
    // version without needing the full state or changes replayed back at
    // itself (it already applied its own edit optimistically).
    function handleSocketVersionEvent(version: number) {
      versionRef.current = version;
    }

    session.socket?.on(eventName, handleSocketEvent);
    session.socket?.on(`${eventName}_update`, handleSocketUpdateEvent);
    if (versioned) {
      session.socket?.on(`${eventName}_version`, handleSocketVersionEvent);
    }
    return () => {
      session.socket?.off(eventName, handleSocketEvent);
      session.socket?.off(`${eventName}_update`, handleSocketUpdateEvent);
      if (versioned) {
        session.socket?.off(`${eventName}_version`, handleSocketVersionEvent);
      }
    };
  }, [session.socket, eventName, partialUpdatesKey, versioned, setState, versionRef, lastSyncedStateRef]);
}

/**
 * Helper to sync a react state to a `Session`
 *
 * @param {S} initialState
 * @param {Session} session `Session` instance
 * @param {string} eventName Name of the event to send to the session
 * @param {number} debounceRate Amount to debounce before sending to the session (ms)
 * @param {boolean} partialUpdates Allow sending of partial updates to the session
 * @param {string} partialUpdatesKey Key to lookup in the state to identify a partial update
 * @param {boolean} versioned Guard partial updates with a server-issued
 *   version so a stale update (raced by another client) is rejected by the
 *   broker instead of silently applied — see
 *   broker-go/internal/game/repository.go's ApplyMapStateUpdate. The broker
 *   replies with the canonical state on rejection, which this hook adopts
 *   wholesale; it does not attempt to replay the discarded local edit on
 *   top, matching the plan's explicit non-goal of fine-grained merging.
 */
function useNetworkedState<S extends { readonly [x: string]: any } | null>(
  initialState: S,
  session: Session,
  eventName: string,
  debounceRate: number = 500,
  partialUpdates: boolean = true,
  partialUpdatesKey: string = "id",
  versioned: boolean = false
): [S, SetNetworkedState<S>] {
  const [state, _setState] = useState(initialState);
  const dirtyRef = useRef(false);
  const forceUpdateRef = useRef(false);
  // Last version this client knows about for `eventName`. Only
  // meaningful when `versioned` is true; starts at 0 to match a freshly
  // created game's version on the broker.
  const versionRef = useRef(0);
  const lastSyncedStateRef = useRef<S>();
  const refs: SyncRefs<S> = { dirtyRef, forceUpdateRef, versionRef, lastSyncedStateRef };

  const setState = useCallback<SetNetworkedState<S>>(
    (update, sync = true, force = false) => {
      dirtyRef.current = sync;
      forceUpdateRef.current = force;
      _setState(update);
    },
    []
  );

  const debouncedState = useDebounce(state, debounceRate);

  useSyncOutgoingState({
    session,
    eventName,
    debouncedState,
    partialUpdates,
    partialUpdatesKey,
    versioned,
    refs,
  });

  useSyncIncomingState({
    session,
    eventName,
    partialUpdatesKey,
    versioned,
    refs,
    setState: _setState,
  });

  return [state, setState];
}

export default useNetworkedState;
