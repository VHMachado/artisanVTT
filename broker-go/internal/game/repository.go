// Package game is a port of backend/src/entities/{GameServer,GameState,
// GameRepository,Game}.ts: in-memory game rooms keyed by game id, each with
// a password hash, per-field state (map/mapState/manifest) and a party
// state (session id -> player state), broadcast to every connected client
// in the room.
package game

import (
	"sync"
)

// Game mirrors backend/src/entities/Game.ts.
//
// Removed the per-game password (the tailnet is now the perimeter).
// A "game" room here is now keyed by the Mesa's id (tables.Store), joined
// by anyone who reaches the broker.
type Game struct {
	mu         sync.RWMutex
	ID         string
	PartyState map[string]interface{} // sessionId -> PlayerState
	State      map[string]interface{} // "map" | "mapState" | "manifest" -> value

	// stateVersions holds a per-field counter backing the
	// authoritative-version guard: only "mapState"
	// and "manifest" use it, since those are the only fields clients send
	// `${field}_update` partial diffs for. A field with no entry has
	// implicit version 0, matching a freshly created game and a freshly
	// mounted client's initial versionRef. Guarded by mu, same as State.
	stateVersions map[string]int
}

func newGame(id string) *Game {
	return &Game{
		ID:            id,
		PartyState:    map[string]interface{}{},
		State:         map[string]interface{}{},
		stateVersions: map[string]int{},
	}
}

func (g *Game) GetPartyState() map[string]interface{} {
	g.mu.RLock()
	defer g.mu.RUnlock()
	out := make(map[string]interface{}, len(g.PartyState))
	for k, v := range g.PartyState {
		out[k] = v
	}
	return out
}

func (g *Game) SetPlayerState(playerID string, state interface{}) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.PartyState[playerID] = state
}

func (g *Game) DeletePlayer(playerID string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.PartyState, playerID)
}

// SetState mirrors Game.ts's setState: a nil value clears the field instead
// of storing nil, matching `if (!value) delete this.state[field]`. Used
// only for the "map" field, which is not version-guarded (its owner is
// always the map's owner client, pushing whole-object replaces rather than
// diffed partial updates, so there is no concurrent-edit race to guard).
func (g *Game) SetState(field string, value interface{}) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if value == nil {
		delete(g.State, field)
		return
	}
	g.State[field] = value
}

func (g *Game) GetState(field string) interface{} {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.State[field]
}

// SetVersionedState is SetState plus a version bump, for the "mapState" and
// "manifest" fields that support versioned partial updates. A full
// replace (map_state/manifest events, e.g. loading a new map) establishes a
// new baseline version just like an accepted partial update does, since it
// invalidates any in-flight partial update a client computed against the
// old state.
func (g *Game) SetVersionedState(field string, value interface{}) (version int) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if value == nil {
		delete(g.State, field)
	} else {
		g.State[field] = value
	}
	g.stateVersions[field]++
	return g.stateVersions[field]
}

func (g *Game) GetStateVersion(field string) int {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.stateVersions[field]
}

// VersionedUpdateResult reports what ApplyVersionedUpdate did, so the
// caller (hub.go's handleMapStateUpdate/handleManifestUpdate) knows whether
// to broadcast the update, and whether to push a resync back to the sender.
type VersionedUpdateResult struct {
	// Applied is true if mutate ran and the stored state changed.
	Applied bool
	// Conflict is true if the update was rejected because baseVersion did
	// not match the field's current version — the sender needs the
	// canonical state to recover ("rejeita e devolve estado canônico").
	Conflict bool
	// Version is the field's version after this call (unchanged from
	// before the call if Applied is false).
	Version int
	// State is the field's current stored value after this call, for
	// resyncing a rejected sender.
	State interface{}
}

// ApplyVersionedUpdate is the authoritative-state guard that fixes a bug
// where a partial update needs to only apply if its baseVersion matches
// the field's current version, compared and applied
// atomically under a single lock so two racing updates can't both read the
// same "current" version and both believe they're first. mutate performs
// the actual diff application (see updateState in hub.go, which wraps
// diffpatch.ApplyChanges) and should return false for reasons unrelated to
// versioning (e.g. the update's mapId no longer matches the stored state) —
// that case is reported as neither Applied nor Conflict, matching the
// original silent-drop behaviour for a stale/foreign update.
func (g *Game) ApplyVersionedUpdate(
	field string,
	baseVersion int,
	mutate func(state map[string]interface{}) bool,
) VersionedUpdateResult {
	g.mu.Lock()
	defer g.mu.Unlock()

	current := g.stateVersions[field]
	state, _ := g.State[field].(map[string]interface{})

	if baseVersion != current {
		return VersionedUpdateResult{Conflict: true, Version: current, State: state}
	}
	if state == nil || !mutate(state) {
		return VersionedUpdateResult{Version: current, State: state}
	}

	g.stateVersions[field]++
	return VersionedUpdateResult{Applied: true, Version: g.stateVersions[field], State: state}
}

// Repository mirrors backend/src/entities/GameRepository.ts.
type Repository struct {
	mu    sync.RWMutex
	games map[string]*Game
}

func newRepository() *Repository {
	return &Repository{games: map[string]*Game{}}
}

func (r *Repository) IsGameCreated(gameID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.games[gameID]
	return ok
}

func (r *Repository) Create(gameID string) *Game {
	r.mu.Lock()
	defer r.mu.Unlock()
	g := newGame(gameID)
	r.games[gameID] = g
	return g
}

func (r *Repository) Get(gameID string) *Game {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.games[gameID]
}
