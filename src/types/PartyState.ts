import type { PlayerState } from "./PlayerState";

/**
 * Snapshot of every OTHER connected player, keyed by their Socket.IO
 * session id. Broadcast over the socket as the `player_state` /
 * `player_state_update` events and consumed through `useNetworkedState`
 * (see `src/hooks/useNetworkedState.ts`) so each client's copy stays in
 * sync without a shared database — there is no server-side persistence
 * for this beyond the in-memory `GameRepository` on the broker.
 */
export type PartyState = { [sessionId: string]: PlayerState };
