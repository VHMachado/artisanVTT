package game

import (
	"log"
	"sync"
	"time"

	"artisan-broker/internal/diffpatch"
)

// Client is anything the Hub can send a [event, payload] message to and
// identify by a stable id, implemented by the websocket connection wrapper
// in httpapi. Kept as an interface so this package has no net/http or
// gorilla/websocket import, matching how GameServer.ts only depends on
// socket.io's Socket type.
type Client interface {
	ID() string
	Send(event string, payload interface{})
}

// TableAccess resolves the Mesa/Personagem ownership facts the
// character-token authorization check needs, without this package
// depending on database/sql or internal/tables' storage details directly
// — same reasoning as Client abstracting the websocket wrapper away.
// *tables.Store satisfies this directly.
type TableAccess interface {
	// ResolveCharacterOwner reports characterID's current owner (nil if
	// unowned/adoptable). ok is false if the character doesn't exist (or
	// is deleted) — callers treat that as "nothing to enforce" rather
	// than a hard failure, since a dangling characterId (e.g. the
	// character was deleted after the token referenced it) shouldn't
	// freeze the token in place forever.
	ResolveCharacterOwner(characterID string) (ownerAccountID *int64, ok bool, err error)
	// IsTableOwner reports whether accountID is tableID's owner (GM), who
	// may move/edit any character's token at their own table.
	IsTableOwner(tableID string, accountID int64) (bool, error)
}

// Hub is a port of backend/src/entities/GameServer.ts: it owns the game
// repository and every connected client's room membership, and implements
// the same message handlers (join_game, map, map_state, map_state_update,
// player_state, manifest, manifest_update, player_pointer, player_camera,
// dice_roll,
// signal) with identical broadcast semantics.
//
// An authoritative-version guard on "mapState" and "manifest" closes a
// bug where an undo racing a remote edit could silently overwrite it,
// because deep-diff's revertChange restores by absolute value with no
// notion of "since when". Every full replace (map_state/manifest) and
// every accepted partial update (map_state_update/manifest_update) now
// bumps a per-field version number on Game (see repository.go's
// ApplyVersionedUpdate/SetVersionedState); a partial update whose
// baseVersion doesn't match the field's current version is rejected and
// the sender is resynced with the canonical state instead of having its
// stale diff applied.
//
// A second, orthogonal guard on mapState specifically controls who may
// touch a character-linked token at all — this needs to be enforced in
// the broker, not just by hiding a button in the UI. See TableAccess and
// authorizeMapStateUpdate below. A "game" room is keyed by the Mesa's own
// id (tables.id), which is what lets this check reuse gameID as the
// tableID a character's ownership is checked against.
type Hub struct {
	repo *Repository

	mu      sync.RWMutex
	clients map[string]Client   // socket id -> client
	rooms   map[string]string   // socket id -> game id (a client is in at most one room)
	members map[string][]string // game id -> socket ids, for broadcast
	// accountIDs holds the authenticated account id for every client that
	// connected with a valid bearer token (see
	// httpapi.RegisterGameSocket / Hub.SetClientAccount). A client id
	// absent from this map is unauthenticated — never able to satisfy
	// authorizeMapStateUpdate, since 0 is never a real account id
	// (accounts.id is AUTOINCREMENT starting at 1).
	accountIDs map[string]int64
	// diceRollRates limita apenas o evento volátil de animação. O resultado
	// autoritativo continua em player_state; este teto só impede que um socket
	// faça os demais clientes criarem trabalho de física sem limite.
	diceRollRates map[string]diceRollRate
	now           func() time.Time

	tableAccess TableAccess
}

const (
	// Dez rolagens no mesmo segundo ainda acomodam cliques humanos muito
	// rápidos, mas cortam floods antes que virem filas de física nos clientes.
	diceRollBurstLimit = 10
	diceRollRateWindow = time.Second
)

type diceRollRate struct {
	windowStart time.Time
	count       int
}

// NewHub constructs a Hub. tableAccess backs the character-token
// authorization check; it may be nil (every call site nil-checks first),
// which simply means no character-linked token is ever restricted —
// existing tests exercising only pre-authorization behaviour pass nil.
func NewHub(tableAccess TableAccess) *Hub {
	return &Hub{
		repo:          newRepository(),
		clients:       map[string]Client{},
		rooms:         map[string]string{},
		members:       map[string][]string{},
		accountIDs:    map[string]int64{},
		diceRollRates: map[string]diceRollRate{},
		now:           time.Now,
		tableAccess:   tableAccess,
	}
}

func (h *Hub) Connect(c Client) {
	h.mu.Lock()
	h.clients[c.ID()] = c
	h.mu.Unlock()
}

// SetClientAccount records the authenticated account id behind a client
// connection, established once at WebSocket-upgrade time from the bearer
// token (see httpapi.RegisterGameSocket) — the server stamps identity,
// the client never gets to assert it, same discipline HTTP ops apply.
func (h *Hub) SetClientAccount(clientID string, accountID int64) {
	h.mu.Lock()
	h.accountIDs[clientID] = accountID
	h.mu.Unlock()
}

func (h *Hub) accountOf(clientID string) (int64, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	id, ok := h.accountIDs[clientID]
	return id, ok
}

// Disconnect mirrors the "disconnecting" handler in GameServer.ts: tell the
// room, drop the player from party state, and broadcast the updated party.
func (h *Hub) Disconnect(id string) {
	h.mu.Lock()
	gameID, inRoom := h.rooms[id]
	if inRoom {
		delete(h.rooms, id)
		h.members[gameID] = removeString(h.members[gameID], id)
	}
	delete(h.clients, id)
	delete(h.accountIDs, id)
	delete(h.diceRollRates, id)
	h.mu.Unlock()

	if !inRoom {
		return
	}

	h.broadcastToRoom(gameID, id, "player_left", id)

	g := h.repo.Get(gameID)
	if g == nil {
		return
	}
	g.DeletePlayer(id)
	h.broadcastToRoom(gameID, id, "party_state", g.GetPartyState())
}

func (h *Hub) roomOf(clientID string) (string, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	gameID, ok := h.rooms[clientID]
	return gameID, ok
}

func (h *Hub) join(clientID, gameID string) {
	h.mu.Lock()
	h.rooms[clientID] = gameID
	h.members[gameID] = append(h.members[gameID], clientID)
	h.mu.Unlock()
}

// broadcastToRoom sends to every member of gameID except the given sender
// (pass "" to include everyone). Mirrors socket.to(id)/socket.broadcast.to(id).
func (h *Hub) broadcastToRoom(gameID, exceptClientID, event string, payload interface{}) {
	h.mu.RLock()
	members := append([]string(nil), h.members[gameID]...)
	h.mu.RUnlock()
	for _, id := range members {
		if id == exceptClientID {
			continue
		}
		h.mu.RLock()
		client := h.clients[id]
		h.mu.RUnlock()
		if client != nil {
			client.Send(event, payload)
		}
	}
}

func (h *Hub) sendTo(clientID, event string, payload interface{}) {
	h.mu.RLock()
	client := h.clients[clientID]
	h.mu.RUnlock()
	if client != nil {
		client.Send(event, payload)
	}
}

// OnlineCounts reports, for every game room with at least one connected
// client, how many clients are currently in it. Rooms are keyed by the
// Mesa's own id (tables.id) — see the join_game handler and the Hub doc
// comment above — so this is exactly "quantos jogadores estão online em
// cada Mesa agora" (the table card's online-count badge). A Mesa
// absent from the returned map has zero connected clients; there is
// nothing to persist here, this is inherently a live-only fact.
func (h *Hub) OnlineCounts() map[string]int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	counts := make(map[string]int, len(h.members))
	for gameID, ids := range h.members {
		if len(ids) > 0 {
			counts[gameID] = len(ids)
		}
	}
	return counts
}

// HandleMessage dispatches one decoded [event, ...args] frame from c,
// mirroring the socket.on(...) handlers in GameServer.ts one by one. args
// holds every element after the event name, matching socket.io's variadic
// emit (e.g. `socket.emit("join_game", gameId, password, version)` sends
// three); most events only ever carry one.
func (h *Hub) HandleMessage(c Client, event string, args []interface{}) {
	arg0 := func() interface{} {
		if len(args) > 0 {
			return args[0]
		}
		return nil
	}
	switch event {
	case "peer_message":
		h.handlePeerMessage(c, arg0())
	case "join_game":
		h.handleJoinGame(c, args)
	case "map":
		h.handleMap(c, arg0())
	case "map_state":
		h.handleMapState(c, arg0())
	case "map_state_update":
		h.handleMapStateUpdate(c, arg0())
	case "player_state":
		h.handlePlayerState(c, arg0())
	case "manifest":
		h.handleManifest(c, arg0())
	case "manifest_update":
		h.handleManifestUpdate(c, arg0())
	case "initiative":
		h.handleInitiative(c, arg0())
	case "initiative_update":
		h.handleInitiativeUpdate(c, arg0())
	case "player_pointer":
		h.handlePlayerPointer(c, arg0())
	case "dice_roll":
		h.handleDiceRoll(c, arg0())
	case "player_camera":
		h.handlePlayerCamera(c, arg0())
	default:
		log.Printf("unknown event %q from %s", event, c.ID())
	}
}

// handlePeerMessage relays an arbitrary payload from one client to another,
// identified by session id — this is how map/token image bytes now travel
// between players now that WebRTC is gone (see src/network/Session.ts's
// sendTo/_handlePeerMessage). The broker never inspects `payload`, exactly
// as it never inspected the old WebRTC signal data.
func (h *Hub) handlePeerMessage(c Client, payload interface{}) {
	m, ok := payload.(map[string]interface{})
	if !ok {
		return
	}
	to, _ := m["to"].(string)
	if to == "" {
		return
	}
	h.sendTo(to, "peer_message", map[string]interface{}{
		"from":    c.ID(),
		"payload": m["payload"],
	})
}

// handleJoinGame mirrors GameState.joinGame, minus the per-game password
// used in an earlier revision (removed once the tailnet became the
// perimeter — every account can join every Mesa's live session).
func (h *Hub) handleJoinGame(c Client, args []interface{}) {
	if len(args) < 1 {
		return
	}
	gameID, _ := args[0].(string)
	if gameID == "" {
		return
	}

	var g *Game
	if !h.repo.IsGameCreated(gameID) {
		g = h.repo.Create(gameID)
	} else {
		g = h.repo.Get(gameID)
	}

	h.join(c.ID(), gameID)

	// Mirror GameState.joinGame: send current state to the new joiner, then
	// tell the room a player joined. mapState/manifest are versioned so
	// the joiner starts tracking the same version the broker holds.
	c.Send("party_state", g.GetPartyState())
	c.Send("map_state", wrapVersionedState(g, "mapState"))
	c.Send("map", g.GetState("map"))
	c.Send("manifest", wrapVersionedState(g, "manifest"))
	// The Mesa's initiative/HP tracker, see handleInitiative.
	c.Send("initiative", wrapVersionedState(g, "initiative"))
	h.broadcastToRoom(gameID, c.ID(), "player_joined", c.ID())

	h.broadcastToRoom(gameID, "", "joined_game", c.ID())
}

func (h *Hub) currentGame(c Client) (string, *Game) {
	gameID, ok := h.roomOf(c.ID())
	if !ok {
		return "", nil
	}
	return gameID, h.repo.Get(gameID)
}

func (h *Hub) handleMap(c Client, payload interface{}) {
	gameID, g := h.currentGame(c)
	if g == nil {
		return
	}
	g.SetState("map", payload)
	h.broadcastToRoom(gameID, c.ID(), "map", g.GetState("map"))
}

// wrapVersionedState is the wire shape a versioned field (mapState,
// manifest) is always sent in, full or on join: {state, version}. The
// frontend's useNetworkedState only unwraps this shape when constructed
// with versioned=true (see src/hooks/useNetworkedState.ts), which is how
// NetworkedMapAndTokens.tsx configures both of these fields.
func wrapVersionedState(g *Game, field string) map[string]interface{} {
	return map[string]interface{}{
		"state":   g.GetState(field),
		"version": g.GetStateVersion(field),
	}
}

func (h *Hub) handleMapState(c Client, payload interface{}) {
	gameID, g := h.currentGame(c)
	if g == nil {
		return
	}
	version := g.SetVersionedState("mapState", payload)
	// The sender already applied this locally (it's the source of the
	// full replace); it only needs the resulting version to keep its
	// baseVersion tracking in sync for its next partial update.
	c.Send("map_state_version", version)
	h.broadcastToRoom(gameID, c.ID(), "map_state", map[string]interface{}{
		"state":   payload,
		"version": version,
	})
}

// versionedUpdateMutator builds the closure ApplyVersionedUpdate runs under
// its lock: apply update's diff to state only if update's id still matches
// state[idKey], exactly mirroring GameState.ts's `update.id ===
// state["mapId"]` guard (state here is always a mapState/manifest/
// initiative map, matching the original TS's `!(state instanceof Map)`
// exclusion of the bare "map" field, which never goes through this path).
// idKey is "mapId" for mapState/manifest and "tableId" for the initiative
// tracker (see handleInitiativeUpdate) — each versioned field
// names its own identity key, matching how useNetworkedState's
// partialUpdatesKey is configurable per field on the client
// (src/hooks/useNetworkedState.ts). Operates on state in place via
// diffpatch, so no explicit SetState/writeback is needed — Game.State[field]
// already points at the same map.
func versionedUpdateMutator(update map[string]interface{}, idKey string) func(state map[string]interface{}) bool {
	return func(state map[string]interface{}) bool {
		updateID, _ := update["id"].(string)
		stateID, _ := state[idKey].(string)
		if updateID != stateID {
			return false
		}
		changes, _ := update["changes"].([]interface{})
		diffpatch.ApplyChanges(state, changes)
		return true
	}
}

// baseVersionOf reads update["baseVersion"], defaulting to -1 (never equal
// to a real version, which starts at 0) when absent or unparseable, so an
// old/misbehaving client that omits it is always treated as a conflict
// rather than silently bypassing the guard. Covers every numeric type
// msgpack may decode a small non-negative integer into (vmihailenco's
// decoder picks int8/int16/int32/int64/uint8/... depending on the encoded
// width, not just int/int64/float64) — matching diffpatch.asInt's same
// concern for change.index.
func baseVersionOf(update map[string]interface{}) int {
	switch v := update["baseVersion"].(type) {
	case int:
		return v
	case int8:
		return int(v)
	case int16:
		return int(v)
	case int32:
		return int(v)
	case int64:
		return int(v)
	case uint:
		return int(v)
	case uint8:
		return int(v)
	case uint16:
		return int(v)
	case uint32:
		return int(v)
	case uint64:
		return int(v)
	case float32:
		return int(v)
	case float64:
		return int(v)
	default:
		return -1
	}
}

// tokenPaths extracts the distinct token ids a mapState update's changes
// touch — every change whose path starts with ["tokens", <tokenId>, ...],
// plus the path-less full-array/full-map replace case which conservatively
// reports every token currently in state (a change with no path only
// happens for a whole-field replace, which the authorization check has no
// need to allow bypassing for).
func tokenPaths(changes []interface{}, state map[string]interface{}) map[string]bool {
	ids := map[string]bool{}
	tokensField, _ := state["tokens"].(map[string]interface{})
	for _, raw := range changes {
		change, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		path, _ := change["path"].([]interface{})
		if len(path) == 0 {
			// No path: a change applying directly to the root (not
			// expected for "tokens", but fail safe by treating every
			// existing token as touched rather than silently skipping
			// the check).
			for id := range tokensField {
				ids[id] = true
			}
			continue
		}
		root, _ := path[0].(string)
		if root != "tokens" || len(path) < 2 {
			continue
		}
		if id, ok := path[1].(string); ok {
			ids[id] = true
		}
	}
	return ids
}

// touchesDarkness reports whether a mapState update's changes modify the
// map's darkness layer (types/MapState.ts's MapDarkness) — any
// change whose path starts with ["darkness", ...], plus the path-less
// whole-field replace case, which is treated conservatively as touching
// everything (same reasoning as tokenPaths above).
func touchesDarkness(changes []interface{}) bool {
	for _, raw := range changes {
		change, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		path, _ := change["path"].([]interface{})
		if len(path) == 0 {
			// A root-level replace rewrites darkness along with
			// everything else; fail safe by requiring GM rights.
			return true
		}
		if root, _ := path[0].(string); root == "darkness" {
			return true
		}
	}
	return false
}

// authorizeMapStateUpdate enforces that handleMapStateUpdate validates the
// author can touch a given token: every token this update touches that
// carries a characterId must be movable/editable by the caller — the
// table's GM (owner), or the character's own current owner. A token with
// no characterId (a prop, an NPC token with no linked Personagem, or a
// token predating this check) is unrestricted, same as today.
//
// A second rule on the same field: only the GM may change the map's
// `darkness` (whether the lights are off, and how dark). That one is
// about what the whole table can SEE, so unlike fog/drawings/notes it
// deliberately does not follow mapState.editFlags — there is no "let
// players edit darkness" switch to honour.
//
// Fails OPEN (returns true, i.e. authorized) whenever there isn't enough
// information to say no: no TableAccess wired up, the caller never
// authenticated at connect time, or the referenced character doesn't exist
// (e.g. it was deleted after the token was created) — this is an
// authorization floor, not a stricter-than-before default for setups that
// predate it or data that's gone stale.
func (h *Hub) authorizeMapStateUpdate(c Client, tableID string, update map[string]interface{}, state map[string]interface{}) bool {
	if h.tableAccess == nil {
		return true
	}
	changes, _ := update["changes"].([]interface{})
	touched := tokenPaths(changes, state)
	darknessTouched := touchesDarkness(changes)
	if len(touched) == 0 && !darknessTouched {
		return true
	}
	tokensField, _ := state["tokens"].(map[string]interface{})

	accountID, authenticated := h.accountOf(c.ID())

	var isGM *bool // memoized, IsTableOwner is only ever asked once per update
	callerIsGM := func() bool {
		if isGM != nil {
			return *isGM
		}
		result := false
		if authenticated {
			if ok, err := h.tableAccess.IsTableOwner(tableID, accountID); err == nil {
				result = ok
			}
		}
		isGM = &result
		return result
	}

	if darknessTouched && !callerIsGM() {
		return false
	}

	for tokenID := range touched {
		tokenState, _ := tokensField[tokenID].(map[string]interface{})
		if tokenState == nil {
			continue
		}
		characterID, _ := tokenState["characterId"].(string)
		if characterID == "" {
			continue
		}
		ownerAccountID, ok, err := h.tableAccess.ResolveCharacterOwner(characterID)
		if err != nil || !ok {
			continue
		}
		if callerIsGM() {
			continue
		}
		if !authenticated {
			return false
		}
		if ownerAccountID != nil && *ownerAccountID == accountID {
			continue
		}
		// Unowned characters (ownerAccountID == nil) can only be moved by
		// the GM at this point — an unowned character isn't "yours" to
		// move just because nobody else claimed it yet; the adoption
		// flow (POST /sync, "primeiro a chegar ganha") is the only path
		// that ever changes that.
		return false
	}
	return true
}

func (h *Hub) handleMapStateUpdate(c Client, payload interface{}) {
	h.handleVersionedUpdate(c, "mapState", "mapId", "map_state_update", "map_state_version", "map_state", payload, h.authorizeMapStateUpdate)
}

func (h *Hub) handleManifestUpdate(c Client, payload interface{}) {
	h.handleVersionedUpdate(c, "manifest", "mapId", "manifest_update", "manifest_version", "manifest", payload, nil)
}

// handleVersionedUpdate is the shared flow for map_state_update,
// manifest_update and initiative_update: try to apply the partial diff
// under the field's version guard, then either broadcast the accepted
// update (stamped with the resulting version) to the rest of the room
// and ack the sender with just the version, or — on a version conflict,
// OR (mapState only) a failed authorize check — resync only the sender
// with the canonical {state, version}, undoing whatever it already
// applied optimistically. An id mismatch (the update targets a map
// /table that's no longer current) is still dropped silently for everyone,
// matching the pre-existing behaviour. idKey is the field this state uses to
// self-identify (see versionedUpdateMutator).
func (h *Hub) handleVersionedUpdate(
	c Client,
	field, idKey, updateEvent, versionEvent, stateEvent string,
	payload interface{},
	authorize func(c Client, tableID string, update map[string]interface{}, state map[string]interface{}) bool,
) {
	gameID, g := h.currentGame(c)
	if g == nil {
		return
	}
	update, ok := payload.(map[string]interface{})
	if !ok {
		return
	}

	if authorize != nil {
		// Checked against the CURRENT state, under the same read
		// snapshot ApplyVersionedUpdate will use — a state that
		// changes between this check and the mutate call just means the
		// next update (or this one, if it loses the race) gets
		// re-checked against whatever is current then, same as the
		// pre-existing version guard's own race handling.
		if state := g.GetState(field); state != nil {
			if snapshot, ok := state.(map[string]interface{}); ok {
				if !authorize(c, gameID, update, snapshot) {
					c.Send(stateEvent, map[string]interface{}{
						"state":   snapshot,
						"version": g.GetStateVersion(field),
					})
					return
				}
			}
		}
	}

	result := g.ApplyVersionedUpdate(field, baseVersionOf(update), versionedUpdateMutator(update, idKey))

	if result.Conflict {
		c.Send(stateEvent, map[string]interface{}{
			"state":   result.State,
			"version": result.Version,
		})
		return
	}
	if !result.Applied {
		return
	}

	update["version"] = result.Version
	c.Send(versionEvent, result.Version)
	h.broadcastToRoom(gameID, c.ID(), updateEvent, update)
}

func (h *Hub) handlePlayerState(c Client, payload interface{}) {
	gameID, g := h.currentGame(c)
	if g == nil {
		return
	}
	g.SetPlayerState(c.ID(), payload)
	h.broadcastToRoom(gameID, c.ID(), "party_state", g.GetPartyState())
}

func (h *Hub) handleManifest(c Client, payload interface{}) {
	gameID, g := h.currentGame(c)
	if g == nil {
		return
	}
	version := g.SetVersionedState("manifest", payload)
	c.Send("manifest_version", version)
	h.broadcastToRoom(gameID, c.ID(), "manifest", map[string]interface{}{
		"state":   payload,
		"version": version,
	})
}

// handleInitiative/handleInitiativeUpdate implement the Mesa's
// initiative/HP tracker: a third field on Game following the exact SAME
// versioned-field discipline as mapState/manifest (full replace bumps the
// version, a partial update is rejected+resynced on a stale baseVersion).
// A dedicated field rather than living inside mapState was chosen
// deliberately: the tracker is a property of the Mesa's LIVE SESSION
// ("sincronizada por sessão"), not of whichever map happens to be loaded —
// switching maps mid-combat must not wipe or reset it. No authorization
// guard here (unlike map_state_update's character-token check): the
// tracker has no per-row ownership concept to enforce, matching
// manifest's own unrestricted handling.
func (h *Hub) handleInitiative(c Client, payload interface{}) {
	gameID, g := h.currentGame(c)
	if g == nil {
		return
	}
	version := g.SetVersionedState("initiative", payload)
	c.Send("initiative_version", version)
	h.broadcastToRoom(gameID, c.ID(), "initiative", map[string]interface{}{
		"state":   payload,
		"version": version,
	})
}

func (h *Hub) handleInitiativeUpdate(c Client, payload interface{}) {
	h.handleVersionedUpdate(c, "initiative", "tableId", "initiative_update", "initiative_version", "initiative", payload, nil)
}

func (h *Hub) handlePlayerPointer(c Client, payload interface{}) {
	gameID, ok := h.roomOf(c.ID())
	if !ok {
		return
	}
	h.broadcastToRoom(gameID, c.ID(), "player_pointer", payload)
}

// handleDiceRoll relays one dice throw to the rest of the room so the same
// roll animates on every screen.
//
// Deliberately a volatile rebroadcast like handlePlayerPointer: nothing is
// stored, versioned or authorization-gated. A small per-client rate limit is
// the only broker policy, because each accepted frame asks every peer to do
// GPU/physics work. The payload is {counts, seed} — a request to ANIMATE,
// not a fact about the table. The authoritative numbers still travel in
// player_state.dice, exactly as before, so a client that fakes a
// dice_roll frame can at worst make dice tumble on someone's screen; it
// cannot change a roll's result or persist anything.
//
// The broker does not inspect counts/seed: the receiving client validates
// and clamps them (see hooks/useSharedDiceRolls.ts) because it is the one
// that would pay for an absurd value by spawning meshes.
func (h *Hub) handleDiceRoll(c Client, payload interface{}) {
	gameID, ok := h.roomOf(c.ID())
	if !ok {
		return
	}
	if !h.allowDiceRoll(c.ID()) {
		return
	}
	h.broadcastToRoom(gameID, c.ID(), "dice_roll", payload)
}

func (h *Hub) allowDiceRoll(clientID string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	now := h.now()
	rate := h.diceRollRates[clientID]
	if rate.windowStart.IsZero() || now.Before(rate.windowStart) || now.Sub(rate.windowStart) >= diceRollRateWindow {
		rate = diceRollRate{windowStart: now}
	}
	if rate.count >= diceRollBurstLimit {
		h.diceRollRates[clientID] = rate
		return false
	}
	rate.count++
	h.diceRollRates[clientID] = rate
	return true
}

func (h *Hub) handlePlayerCamera(c Client, payload interface{}) {
	gameID, ok := h.roomOf(c.ID())
	if !ok {
		return
	}
	h.broadcastToRoom(gameID, c.ID(), "player_camera", payload)
}

func removeString(list []string, target string) []string {
	out := list[:0]
	for _, v := range list {
		if v != target {
			out = append(out, v)
		}
	}
	return out
}
