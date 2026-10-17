// Tests for Hub.HandleMessage's peer_message relay, which replaced an
// earlier WebRTC signalling relay: map/token image bytes now travel as
// arbitrary payloads addressed by session id instead of a P2P data channel.
package game

import (
	"reflect"
	"testing"
	"time"
)

type fakeClient struct {
	id   string
	sent []sentMessage
}

type sentMessage struct {
	event   string
	payload interface{}
}

func (c *fakeClient) ID() string { return c.id }
func (c *fakeClient) Send(event string, payload interface{}) {
	c.sent = append(c.sent, sentMessage{event, payload})
}

func TestHandlePeerMessageRelaysToTarget(t *testing.T) {
	h := NewHub(nil)
	sender := &fakeClient{id: "sender-1"}
	target := &fakeClient{id: "target-1"}
	h.Connect(sender)
	h.Connect(target)

	h.HandleMessage(sender, "peer_message", []interface{}{
		map[string]interface{}{
			"to":      "target-1",
			"payload": map[string]interface{}{"id": "chunk-1", "index": 0.0},
		},
	})

	if len(target.sent) != 1 {
		t.Fatalf("expected 1 message delivered to target, got %d", len(target.sent))
	}
	if target.sent[0].event != "peer_message" {
		t.Fatalf("expected event peer_message, got %q", target.sent[0].event)
	}
	got, ok := target.sent[0].payload.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map payload, got %T", target.sent[0].payload)
	}
	want := map[string]interface{}{
		"from":    "sender-1",
		"payload": map[string]interface{}{"id": "chunk-1", "index": 0.0},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected relayed payload: got %v, want %v", got, want)
	}
	if len(sender.sent) != 0 {
		t.Fatalf("sender should not receive its own message back, got %v", sender.sent)
	}
}

func TestHandlePeerMessageIgnoresMissingTo(t *testing.T) {
	h := NewHub(nil)
	sender := &fakeClient{id: "sender-1"}
	target := &fakeClient{id: "target-1"}
	h.Connect(sender)
	h.Connect(target)

	h.HandleMessage(sender, "peer_message", []interface{}{
		map[string]interface{}{"payload": "x"},
	})

	if len(target.sent) != 0 {
		t.Fatalf("malformed peer_message must not be delivered, got %v", target.sent)
	}
}

func TestHandlePeerMessageIgnoresUnknownTarget(t *testing.T) {
	h := NewHub(nil)
	sender := &fakeClient{id: "sender-1"}
	h.Connect(sender)

	// Should not panic even though "ghost" was never connected.
	h.HandleMessage(sender, "peer_message", []interface{}{
		map[string]interface{}{"to": "ghost", "payload": "y"},
	})
}

// joinRoom connects and joins c into gameID via the real join_game handler
// so currentGame(c) resolves, mirroring how a real client reaches the
// point of sending map_state/map_state_update. No password argument —
// join_game no longer takes one.
func joinRoom(h *Hub, c Client, gameID string) {
	h.Connect(c)
	h.HandleMessage(c, "join_game", []interface{}{gameID})
}

// TestVersionedMapStateUpdateFlow is the regression test for a bug where
// an undo racing a remote edit could silently overwrite it, exercised
// through the full Hub.HandleMessage path (not just
// Game.ApplyVersionedUpdate directly): A and B join the same
// game, A pushes the initial mapState, B applies a partial update, then A's
// stale undo (still carrying the pre-B baseVersion) must be rejected and
// resynced instead of clobbering B's edit — and everyone else in the room
// must see B's update, not A's.
func TestVersionedMapStateUpdateFlow(t *testing.T) {
	h := NewHub(nil)
	a := &fakeClient{id: "a"}
	b := &fakeClient{id: "b"}
	joinRoom(h, a, "game-1")
	joinRoom(h, b, "game-1")

	// A pushes the initial full map state (version 0 -> 1).
	a.sent = nil
	b.sent = nil
	h.HandleMessage(a, "map_state", []interface{}{
		map[string]interface{}{"mapId": "m1", "x": 0.0},
	})
	aVersionMsgs := sentEvents(a.sent, "map_state_version")
	if len(aVersionMsgs) != 1 || aVersionMsgs[0] != 1 {
		t.Fatalf("expected A to be acked with version 1, got %v", aVersionMsgs)
	}
	bStateMsgs := sentEvents(b.sent, "map_state")
	if len(bStateMsgs) != 1 {
		t.Fatalf("expected B to receive the broadcast map_state, got %v", b.sent)
	}

	// B applies a partial update against version 1 -> 2.
	a.sent = nil
	b.sent = nil
	h.HandleMessage(b, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{"kind": "E", "path": []interface{}{"x"}, "rhs": 10.0},
			},
		},
	})
	bVersionMsgs := sentEvents(b.sent, "map_state_version")
	if len(bVersionMsgs) != 1 || bVersionMsgs[0] != 2 {
		t.Fatalf("expected B to be acked with version 2, got %v", bVersionMsgs)
	}
	if len(sentEvents(a.sent, "map_state_update")) != 1 {
		t.Fatalf("expected A to receive B's broadcast map_state_update, got %v", a.sent)
	}

	// A's stale undo, still baseVersion 1 (computed before B's update),
	// must be rejected and resynced instead of applied.
	a.sent = nil
	b.sent = nil
	h.HandleMessage(a, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{"kind": "E", "path": []interface{}{"x"}, "rhs": 0.0},
			},
		},
	})
	if len(sentEvents(a.sent, "map_state_update")) != 0 {
		t.Fatal("A's stale update must not be echoed back as accepted")
	}
	resync := findPayload(a.sent, "map_state")
	if resync == nil {
		t.Fatalf("expected A to be resynced with the canonical map_state, got %v", a.sent)
	}
	resyncMap := resync.(map[string]interface{})
	if resyncMap["version"] != 2 {
		t.Fatalf("resync should carry the canonical version 2, got %v", resyncMap["version"])
	}
	canonicalState := resyncMap["state"].(map[string]interface{})
	if canonicalState["x"] != 10.0 {
		t.Fatalf("B's edit must survive A's rejected undo, got x=%v", canonicalState["x"])
	}
	// B must not see anything from A's rejected update.
	if len(b.sent) != 0 {
		t.Fatalf("B should receive nothing from A's rejected update, got %v", b.sent)
	}
}

func sentEvents(sent []sentMessage, event string) []interface{} {
	var out []interface{}
	for _, m := range sent {
		if m.event == event {
			out = append(out, m.payload)
		}
	}
	return out
}

func findPayload(sent []sentMessage, event string) interface{} {
	for _, m := range sent {
		if m.event == event {
			return m.payload
		}
	}
	return nil
}

// fakeTableAccess is a minimal in-memory TableAccess for the
// authorization tests, avoiding a dependency on internal/tables (and its
// SQLite backing) from this package's test suite.
type fakeTableAccess struct {
	owners  map[string]*int64 // characterId -> ownerAccountId (nil = unowned)
	deleted map[string]bool
	gms     map[string]int64 // tableId -> owner accountId
}

func (f *fakeTableAccess) ResolveCharacterOwner(characterID string) (*int64, bool, error) {
	if f.deleted[characterID] {
		return nil, false, nil
	}
	owner, exists := f.owners[characterID]
	if !exists {
		return nil, false, nil
	}
	return owner, true, nil
}

func (f *fakeTableAccess) IsTableOwner(tableID string, accountID int64) (bool, error) {
	return f.gms[tableID] == accountID, nil
}

func int64p(v int64) *int64 { return &v }

// pushInitialMapStateWithToken seeds gameID's mapState with a single
// character-linked token, as the map owner's initial full replace (not an
// update — full replaces aren't authorization-checked, only
// map_state_update is, matching handleMap's pre-existing "map owner
// controls the map" trust).
func pushInitialMapStateWithToken(h *Hub, owner Client, gameID, tokenID, characterID string) {
	h.HandleMessage(owner, "map_state", []interface{}{
		map[string]interface{}{
			"mapId": "m1",
			"tokens": map[string]interface{}{
				tokenID: map[string]interface{}{
					"id":          tokenID,
					"characterId": characterID,
					"x":           0.0,
				},
			},
		},
	})
}

// TestCharacterTokenMoveByNonOwnerIsRejected is the core authorization
// regression ("Permissões"): a player who is neither the table's GM nor the
// character's owner cannot move that character's token, even by crafting
// a direct map_state_update — the check happens in the broker, not just
// hidden behind a UI button.
func TestCharacterTokenMoveByNonOwnerIsRejected(t *testing.T) {
	access := &fakeTableAccess{
		owners: map[string]*int64{"char-1": int64p(2)}, // owned by account 2
		gms:    map[string]int64{"table-1": 1},         // account 1 is GM
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	outsider := &fakeClient{id: "outsider"}
	joinRoom(h, gm, "table-1")
	joinRoom(h, outsider, "table-1")
	h.SetClientAccount(outsider.id, 3) // neither GM (1) nor owner (2)

	pushInitialMapStateWithToken(h, gm, "table-1", "tok-1", "char-1")

	outsider.sent = nil
	h.HandleMessage(outsider, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"tokens", "tok-1", "x"}, "rhs": 5.0,
				},
			},
		},
	})

	if len(sentEvents(outsider.sent, "map_state_update")) != 0 {
		t.Fatal("non-owner, non-GM move must not be echoed back as accepted")
	}
	resync := findPayload(outsider.sent, "map_state")
	if resync == nil {
		t.Fatalf("expected the rejected mover to be resynced with canonical state, got %v", outsider.sent)
	}
	resyncMap := resync.(map[string]interface{})
	state := resyncMap["state"].(map[string]interface{})
	tokens := state["tokens"].(map[string]interface{})
	tok := tokens["tok-1"].(map[string]interface{})
	if tok["x"] != 0.0 {
		t.Fatalf("token must not have moved, got x=%v", tok["x"])
	}
}

// TestCharacterTokenMoveByOwnerIsAccepted: "Jogador move só o
// próprio personagem" — the character's own owner CAN move it.
func TestCharacterTokenMoveByOwnerIsAccepted(t *testing.T) {
	access := &fakeTableAccess{
		owners: map[string]*int64{"char-1": int64p(2)},
		gms:    map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	owner := &fakeClient{id: "owner"}
	joinRoom(h, gm, "table-1")
	joinRoom(h, owner, "table-1")
	h.SetClientAccount(owner.id, 2)

	pushInitialMapStateWithToken(h, gm, "table-1", "tok-1", "char-1")

	owner.sent = nil
	h.HandleMessage(owner, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"tokens", "tok-1", "x"}, "rhs": 5.0,
				},
			},
		},
	})

	if len(sentEvents(owner.sent, "map_state_version")) != 1 {
		t.Fatalf("expected the owner's move to be accepted, got %v", owner.sent)
	}
}

// TestCharacterTokenMoveByGMIsAccepted: "Mestre move e edita
// todos" — the table's GM can move anyone's character token.
func TestCharacterTokenMoveByGMIsAccepted(t *testing.T) {
	access := &fakeTableAccess{
		owners: map[string]*int64{"char-1": int64p(2)},
		gms:    map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	joinRoom(h, gm, "table-1")
	h.SetClientAccount(gm.id, 1)

	pushInitialMapStateWithToken(h, gm, "table-1", "tok-1", "char-1")

	gm.sent = nil
	h.HandleMessage(gm, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"tokens", "tok-1", "x"}, "rhs": 5.0,
				},
			},
		},
	})

	if len(sentEvents(gm.sent, "map_state_version")) != 1 {
		t.Fatalf("expected the GM's move to be accepted, got %v", gm.sent)
	}
}

// TestUnownedCharacterTokenCannotBeMovedByPlayer: an unowned (adoptable)
// character isn't "free for anyone" — only the GM can touch it until
// someone actually adopts it via POST /sync ("pode ou não ser atribuído a
// um Jogador na criação; personagem sem dono pode ser adotado depois").
func TestUnownedCharacterTokenCannotBeMovedByPlayer(t *testing.T) {
	access := &fakeTableAccess{
		owners: map[string]*int64{"char-1": nil}, // unowned
		gms:    map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	player := &fakeClient{id: "player"}
	joinRoom(h, gm, "table-1")
	joinRoom(h, player, "table-1")
	h.SetClientAccount(player.id, 2)

	pushInitialMapStateWithToken(h, gm, "table-1", "tok-1", "char-1")

	player.sent = nil
	h.HandleMessage(player, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"tokens", "tok-1", "x"}, "rhs": 5.0,
				},
			},
		},
	})

	if len(sentEvents(player.sent, "map_state_update")) != 0 {
		t.Fatal("an unowned character's token must not be movable by a random player")
	}
}

// TestUnauthenticatedClientCannotMoveCharacterToken: a WebSocket
// connection with no valid bearer token (see httpapi.RegisterGameSocket)
// must not be able to move a character-linked token at all.
func TestUnauthenticatedClientCannotMoveCharacterToken(t *testing.T) {
	access := &fakeTableAccess{
		owners: map[string]*int64{"char-1": int64p(2)},
		gms:    map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	anon := &fakeClient{id: "anon"}
	joinRoom(h, gm, "table-1")
	joinRoom(h, anon, "table-1")
	// anon never had SetClientAccount called — unauthenticated.

	pushInitialMapStateWithToken(h, gm, "table-1", "tok-1", "char-1")

	anon.sent = nil
	h.HandleMessage(anon, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"tokens", "tok-1", "x"}, "rhs": 5.0,
				},
			},
		},
	})

	if len(sentEvents(anon.sent, "map_state_update")) != 0 {
		t.Fatal("an unauthenticated connection must not move a character token")
	}
}

func TestNonCharacterTokenMoveIsUnrestricted(t *testing.T) {
	// A plain prop/monster token (no characterId) keeps working for
	// anyone, exactly as before the character-token authorization check
	// existed.
	access := &fakeTableAccess{
		owners: map[string]*int64{},
		gms:    map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	player := &fakeClient{id: "player"}
	joinRoom(h, gm, "table-1")
	joinRoom(h, player, "table-1")
	h.SetClientAccount(player.id, 2)

	h.HandleMessage(gm, "map_state", []interface{}{
		map[string]interface{}{
			"mapId": "m1",
			"tokens": map[string]interface{}{
				"tok-1": map[string]interface{}{"id": "tok-1", "x": 0.0},
			},
		},
	})

	player.sent = nil
	h.HandleMessage(player, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"tokens", "tok-1", "x"}, "rhs": 5.0,
				},
			},
		},
	})

	if len(sentEvents(player.sent, "map_state_version")) != 1 {
		t.Fatalf("a non-character token move should be unrestricted, got %v", player.sent)
	}
}

// TestInitiativeFullReplaceVersionsAndBroadcasts is the initiative
// tracker's basic round-trip: a full "initiative" replace (the tracker's
// a whole-list reorder) bumps the field's own version — separate from
// mapState's/manifest's, see Game.stateVersions — and reaches every other
// room member, mirroring join_game's own initiative resync above.
func TestInitiativeFullReplaceVersionsAndBroadcasts(t *testing.T) {
	h := NewHub(nil)
	a := &fakeClient{id: "a"}
	b := &fakeClient{id: "b"}
	joinRoom(h, a, "table-1")
	joinRoom(h, b, "table-1")

	a.sent = nil
	b.sent = nil
	h.HandleMessage(a, "initiative", []interface{}{
		map[string]interface{}{
			"tableId": "table-1",
			"entries": []interface{}{
				map[string]interface{}{"id": "e1", "name": "Goblin", "initiative": 12.0, "hp": 7.0, "maxHp": 7.0},
			},
		},
	})

	aVersionMsgs := sentEvents(a.sent, "initiative_version")
	if len(aVersionMsgs) != 1 || aVersionMsgs[0] != 1 {
		t.Fatalf("expected A to be acked with version 1, got %v", aVersionMsgs)
	}
	bStateMsgs := sentEvents(b.sent, "initiative")
	if len(bStateMsgs) != 1 {
		t.Fatalf("expected B to receive the broadcast initiative, got %v", b.sent)
	}
}

// TestInitiativeUpdateStaleBaseVersionIsRejectedAndResynced mirrors
// TestVersionedMapStateUpdateFlow for the initiative field: a partial HP
// edit computed against a stale version must be rejected with a canonical
// resync rather than silently clobbering a change made in between —
// exactly the version guarantee the mapState/manifest fields reuse here
// ("com a mesma disciplina de versão").
func TestInitiativeUpdateStaleBaseVersionIsRejectedAndResynced(t *testing.T) {
	h := NewHub(nil)
	a := &fakeClient{id: "a"}
	b := &fakeClient{id: "b"}
	joinRoom(h, a, "table-1")
	joinRoom(h, b, "table-1")

	// A pushes the initial full initiative state (version 0 -> 1).
	h.HandleMessage(a, "initiative", []interface{}{
		map[string]interface{}{
			"tableId": "table-1",
			"entries": []interface{}{
				map[string]interface{}{"id": "e1", "name": "Goblin", "initiative": 12.0, "hp": 7.0, "maxHp": 7.0},
			},
		},
	})

	// B applies a partial HP update against version 1 -> 2.
	a.sent = nil
	b.sent = nil
	h.HandleMessage(b, "initiative_update", []interface{}{
		map[string]interface{}{
			"id":          "table-1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"entries", 0.0, "hp"}, "rhs": 4.0,
				},
			},
		},
	})
	if len(sentEvents(b.sent, "initiative_version")) != 1 {
		t.Fatalf("expected B's update to be accepted, got %v", b.sent)
	}
	if len(sentEvents(a.sent, "initiative_update")) != 1 {
		t.Fatalf("expected A to receive B's broadcast initiative_update, got %v", a.sent)
	}

	// A's stale update, still baseVersion 1, must be rejected and
	// resynced rather than applied on top of B's already-accepted edit.
	a.sent = nil
	b.sent = nil
	h.HandleMessage(a, "initiative_update", []interface{}{
		map[string]interface{}{
			"id":          "table-1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"entries", 0.0, "hp"}, "rhs": 999.0,
				},
			},
		},
	})
	if len(sentEvents(a.sent, "initiative_update")) != 0 {
		t.Fatal("A's stale update must not be echoed back as accepted")
	}
	resync := findPayload(a.sent, "initiative")
	if resync == nil {
		t.Fatalf("expected A to be resynced with the canonical initiative state, got %v", a.sent)
	}
	resyncMap := resync.(map[string]interface{})
	if resyncMap["version"] != 2 {
		t.Fatalf("resync should carry the canonical version 2, got %v", resyncMap["version"])
	}
	if len(b.sent) != 0 {
		t.Fatalf("B should receive nothing from A's rejected update, got %v", b.sent)
	}
}

// pushInitialMapStateWithDarkness seeds gameID's mapState with a darkness
// layer plus one plain (non-character) token, as the map owner's initial
// full replace — same trust model as pushInitialMapStateWithToken above.
func pushInitialMapStateWithDarkness(h *Hub, owner Client, gameID string) {
	h.HandleMessage(owner, "map_state", []interface{}{
		map[string]interface{}{
			"mapId": "m1",
			"tokens": map[string]interface{}{
				"tok-1": map[string]interface{}{
					"id": "tok-1",
					"x":  0.0,
				},
			},
			"darkness": map[string]interface{}{
				"enabled": false,
			},
		},
	})
}

// TestDarknessChangeByPlayerIsRejected is the authorization floor on
// darkness: darkness decides what the whole table can SEE, so only the Mesa's GM may
// change it. Deliberately NOT gated behind mapState.editFlags the way
// fog/drawings/notes are — there is no "let players edit darkness" switch.
// Enforced in the broker, not just by hiding the button.
func TestDarknessChangeByPlayerIsRejected(t *testing.T) {
	access := &fakeTableAccess{
		gms: map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	player := &fakeClient{id: "player"}
	joinRoom(h, gm, "table-1")
	joinRoom(h, player, "table-1")
	h.SetClientAccount(player.id, 2) // not the GM (1)

	pushInitialMapStateWithDarkness(h, gm, "table-1")

	player.sent = nil
	h.HandleMessage(player, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"darkness", "enabled"}, "rhs": true,
				},
			},
		},
	})

	if len(sentEvents(player.sent, "map_state_update")) != 0 {
		t.Fatal("a player's darkness change must not be echoed back as accepted")
	}
	resync := findPayload(player.sent, "map_state")
	if resync == nil {
		t.Fatalf("expected the rejected player to be resynced with canonical state, got %v", player.sent)
	}
	state := resync.(map[string]interface{})["state"].(map[string]interface{})
	darkness := state["darkness"].(map[string]interface{})
	if darkness["enabled"] != false {
		t.Fatalf("darkness must not have changed, got enabled=%v", darkness["enabled"])
	}
}

// TestDarknessChangeByGMIsAccepted: the counterpart — the Mesa's GM can
// switch the lights off.
func TestDarknessChangeByGMIsAccepted(t *testing.T) {
	access := &fakeTableAccess{
		gms: map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	joinRoom(h, gm, "table-1")
	h.SetClientAccount(gm.id, 1)

	pushInitialMapStateWithDarkness(h, gm, "table-1")

	gm.sent = nil
	h.HandleMessage(gm, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"darkness", "enabled"}, "rhs": true,
				},
			},
		},
	})

	if len(sentEvents(gm.sent, "map_state_version")) != 1 {
		t.Fatalf("expected the GM's darkness change to be accepted, got %v", gm.sent)
	}
}

// TestUnauthenticatedClientCannotChangeDarkness: a client that never
// authenticated can't be the GM, so it can't change darkness either —
// same floor the character-token rules apply.
func TestUnauthenticatedClientCannotChangeDarkness(t *testing.T) {
	access := &fakeTableAccess{
		gms: map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	anon := &fakeClient{id: "anon"}
	joinRoom(h, gm, "table-1")
	joinRoom(h, anon, "table-1")
	// deliberately no SetClientAccount for anon

	pushInitialMapStateWithDarkness(h, gm, "table-1")

	anon.sent = nil
	h.HandleMessage(anon, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "E", "path": []interface{}{"darkness", "enabled"}, "rhs": true,
				},
			},
		},
	})

	if len(sentEvents(anon.sent, "map_state_update")) != 0 {
		t.Fatal("an unauthenticated client's darkness change must be rejected")
	}
	if findPayload(anon.sent, "map_state") == nil {
		t.Fatalf("expected the rejected client to be resynced, got %v", anon.sent)
	}
}

// TestTokenLightChangeFollowsTokenPermissions: a token's own `light` field
// is NOT darkness — it's an ordinary TokenState field, so it rides the
// regular character-token authorization rules rather than the GM-only
// darkness rule. A
// plain token with no characterId stays unrestricted, which is what lets a
// player light their own torch prop.
func TestTokenLightChangeFollowsTokenPermissions(t *testing.T) {
	access := &fakeTableAccess{
		gms: map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	player := &fakeClient{id: "player"}
	joinRoom(h, gm, "table-1")
	joinRoom(h, player, "table-1")
	h.SetClientAccount(player.id, 2)

	pushInitialMapStateWithDarkness(h, gm, "table-1")

	player.sent = nil
	h.HandleMessage(player, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "N",
					"path": []interface{}{"tokens", "tok-1", "light"},
					"rhs": map[string]interface{}{
						"radius":  4.0,
						"shape":   "circle",
						"angle":   90.0,
						"enabled": true,
					},
				},
			},
		},
	})

	if len(sentEvents(player.sent, "map_state_version")) != 1 {
		t.Fatalf("a light change on an unrestricted token should be accepted, got %v", player.sent)
	}
}

// TestOcclusionChangeByPlayerIsRejected: darkness.occlusion controls
// whether light stops at fog's walls (a luz para nas paredes do fog).
// Como ele vive DENTRO de `darkness`, touchesDarkness já o cobre e a
// regra GM-only de darkness vale sem nenhuma linha de broker nova — este
// teste fixa isso, para que um refactor futuro de touchesDarkness não
// abra o campo por acidente. Decide o que a mesa inteira vê, igual ao resto de darkness.
func TestOcclusionChangeByPlayerIsRejected(t *testing.T) {
	access := &fakeTableAccess{
		gms: map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	player := &fakeClient{id: "player"}
	joinRoom(h, gm, "table-1")
	joinRoom(h, player, "table-1")
	h.SetClientAccount(player.id, 2) // não é o GM (1)

	pushInitialMapStateWithDarkness(h, gm, "table-1")

	player.sent = nil
	h.HandleMessage(player, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "N", "path": []interface{}{"darkness", "occlusion"}, "rhs": false,
				},
			},
		},
	})

	if len(sentEvents(player.sent, "map_state_update")) != 0 {
		t.Fatal("a player's occlusion change must not be echoed back as accepted")
	}
	if findPayload(player.sent, "map_state") == nil {
		t.Fatalf("expected the rejected player to be resynced, got %v", player.sent)
	}
}

// TestOcclusionChangeByGMIsAccepted: a contraparte — o GM pode desligar a
// oclusão num mapa cujo fog não acompanha paredes.
func TestOcclusionChangeByGMIsAccepted(t *testing.T) {
	access := &fakeTableAccess{
		gms: map[string]int64{"table-1": 1},
	}
	h := NewHub(access)
	gm := &fakeClient{id: "gm"}
	joinRoom(h, gm, "table-1")
	h.SetClientAccount(gm.id, 1)

	pushInitialMapStateWithDarkness(h, gm, "table-1")

	gm.sent = nil
	h.HandleMessage(gm, "map_state_update", []interface{}{
		map[string]interface{}{
			"id":          "m1",
			"baseVersion": 1,
			"changes": []interface{}{
				map[string]interface{}{
					"kind": "N", "path": []interface{}{"darkness", "occlusion"}, "rhs": false,
				},
			},
		},
	})

	if len(sentEvents(gm.sent, "map_state_version")) != 1 {
		t.Fatalf("expected the GM's occlusion change to be accepted, got %v", gm.sent)
	}
}

// TestHandleDiceRollBroadcastsToRoom covers the dice_roll relay: a dice
// throw reaches the other players in the room and nobody else.
//
// The point of the test is the SHAPE of the contract, not plumbing: a dice
// roll is a request to animate, so it must be rebroadcast verbatim and
// never stored — if a later change made it versioned or persisted, a
// client joining afterwards would see dice tumbling from a roll that
// already finished.
func TestHandleDiceRollBroadcastsToRoom(t *testing.T) {
	h := NewHub(nil)
	roller := &fakeClient{id: "roller"}
	watcher := &fakeClient{id: "watcher"}
	stranger := &fakeClient{id: "stranger"}
	joinRoom(h, roller, "game-1")
	joinRoom(h, watcher, "game-1")
	joinRoom(h, stranger, "game-2")

	roller.sent = nil
	watcher.sent = nil
	stranger.sent = nil

	payload := map[string]interface{}{
		"counts": map[string]interface{}{"d6": 2.0, "d20": 1.0},
		"seed":   1234.0,
	}
	h.HandleMessage(roller, "dice_roll", []interface{}{payload})

	if len(watcher.sent) != 1 {
		t.Fatalf("expected the roll to reach the other player once, got %d", len(watcher.sent))
	}
	if watcher.sent[0].event != "dice_roll" {
		t.Fatalf("expected event dice_roll, got %q", watcher.sent[0].event)
	}
	if !reflect.DeepEqual(watcher.sent[0].payload, payload) {
		t.Fatalf("payload must be relayed verbatim: got %v, want %v", watcher.sent[0].payload, payload)
	}
	if len(roller.sent) != 0 {
		t.Fatalf("roller must not receive its own roll back, got %v", roller.sent)
	}
	if len(stranger.sent) != 0 {
		t.Fatalf("a client in another game must not see the roll, got %v", stranger.sent)
	}
}

// TestHandleDiceRollNotReplayedOnJoin pins the volatile half of the
// contract: the roll is a momentary event, so a client joining later must
// NOT be sent it as part of the room resync (unlike mapState/initiative,
// which are state and ARE resynced on join).
func TestHandleDiceRollNotReplayedOnJoin(t *testing.T) {
	h := NewHub(nil)
	roller := &fakeClient{id: "roller"}
	joinRoom(h, roller, "game-1")

	h.HandleMessage(roller, "dice_roll", []interface{}{
		map[string]interface{}{
			"counts": map[string]interface{}{"d20": 1.0},
			"seed":   99.0,
		},
	})

	latecomer := &fakeClient{id: "latecomer"}
	joinRoom(h, latecomer, "game-1")

	for _, m := range latecomer.sent {
		if m.event == "dice_roll" {
			t.Fatalf("a dice roll must not be replayed to a joining client, got %v", m.payload)
		}
	}
}

// TestHandleDiceRollOutsideRoomIsIgnored: a client that never joined has no
// room to broadcast into. Must be dropped, not panic.
func TestHandleDiceRollOutsideRoomIsIgnored(t *testing.T) {
	h := NewHub(nil)
	lonely := &fakeClient{id: "lonely"}
	h.Connect(lonely)

	h.HandleMessage(lonely, "dice_roll", []interface{}{
		map[string]interface{}{
			"counts": map[string]interface{}{"d6": 1.0},
			"seed":   7.0,
		},
	})

	if len(lonely.sent) != 0 {
		t.Fatalf("expected no delivery for a roomless client, got %v", lonely.sent)
	}
}

// TestHandleDiceRollRateLimitsEachClient pins the abuse boundary around the
// volatile animation event. A player can click quickly without friction, but
// one socket cannot enqueue unlimited physics work on every other client.
func TestHandleDiceRollRateLimitsEachClient(t *testing.T) {
	h := NewHub(nil)
	now := time.Unix(100, 0)
	h.now = func() time.Time { return now }
	roller := &fakeClient{id: "roller"}
	otherRoller := &fakeClient{id: "other-roller"}
	watcher := &fakeClient{id: "watcher"}
	joinRoom(h, roller, "game-1")
	joinRoom(h, otherRoller, "game-1")
	joinRoom(h, watcher, "game-1")

	roller.sent = nil
	otherRoller.sent = nil
	watcher.sent = nil
	payload := map[string]interface{}{
		"counts": map[string]interface{}{"d20": 1.0},
		"seed":   1.0,
	}
	for i := 0; i < diceRollBurstLimit; i++ {
		h.HandleMessage(roller, "dice_roll", []interface{}{payload})
	}
	if got := len(sentEvents(watcher.sent, "dice_roll")); got != diceRollBurstLimit {
		t.Fatalf("expected the normal burst of %d rolls to pass, got %d", diceRollBurstLimit, got)
	}

	h.HandleMessage(roller, "dice_roll", []interface{}{payload})
	if got := len(sentEvents(watcher.sent, "dice_roll")); got != diceRollBurstLimit {
		t.Fatalf("roll above the per-client burst must be dropped, got %d deliveries", got)
	}

	// The limiter is per client, not per room.
	h.HandleMessage(otherRoller, "dice_roll", []interface{}{payload})
	if got := len(sentEvents(watcher.sent, "dice_roll")); got != diceRollBurstLimit+1 {
		t.Fatalf("a second client should retain its own allowance, got %d deliveries", got)
	}

	// A fresh window restores the first client's allowance.
	now = now.Add(diceRollRateWindow)
	h.HandleMessage(roller, "dice_roll", []interface{}{payload})
	if got := len(sentEvents(watcher.sent, "dice_roll")); got != diceRollBurstLimit+2 {
		t.Fatalf("allowance should reset after %s, got %d deliveries", diceRollRateWindow, got)
	}
}

func TestDisconnectDropsDiceRollLimiterState(t *testing.T) {
	h := NewHub(nil)
	client := &fakeClient{id: "roller"}
	joinRoom(h, client, "game-1")

	for i := 0; i < diceRollBurstLimit; i++ {
		h.HandleMessage(client, "dice_roll", []interface{}{map[string]interface{}{}})
	}
	if _, ok := h.diceRollRates[client.id]; !ok {
		t.Fatal("expected rate-limit state for the active client")
	}

	h.Disconnect(client.id)
	if _, ok := h.diceRollRates[client.id]; ok {
		t.Fatal("disconnect must remove per-client rate-limit state")
	}
}
