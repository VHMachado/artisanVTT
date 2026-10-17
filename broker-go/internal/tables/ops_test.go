// Self check for the tables/characters store: ApplyOp's version
// guard, authorization rules, and the changes-log/sync cursor.
package tables

import (
	"testing"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	s := New(dir)
	t.Cleanup(func() { s.Close() })
	return s
}

func TestCreateTableStampsOwnerAndJoinsCreatorAsGM(t *testing.T) {
	s := newTestStore(t)

	result, outcome, err := s.ApplyOp(1, Op{
		EntityType:  EntityTable,
		ID:          "table-1",
		BaseVersion: 0,
		Patch:       map[string]interface{}{"name": "Mesa do Sino"},
	})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("create table: outcome=%s err=%v", outcome, err)
	}
	if result.Version != 1 {
		t.Fatalf("first version should be 1, got %d", result.Version)
	}

	role, err := s.Join("table-1", 1)
	if err != nil || role != "gm" {
		t.Fatalf("creator should already be gm on join: role=%q err=%v", role, err)
	}

	role, err = s.Join("table-1", 2)
	if err != nil || role != "player" {
		t.Fatalf("a different account joining should be player: role=%q err=%v", role, err)
	}
}

func TestCreateTableIgnoresClientSuppliedOwner(t *testing.T) {
	// "Quem é dono é sempre carimbado pelo servidor, nunca
	// aceito do cliente" — even if a patch smuggled an ownerId-like field,
	// only the authenticated caller (arg to ApplyOp) can end up as owner.
	s := newTestStore(t)
	result, outcome, err := s.ApplyOp(42, Op{
		EntityType:  EntityTable,
		ID:          "table-1",
		BaseVersion: 0,
		Patch:       map[string]interface{}{"name": "Mesa", "ownerId": float64(999)},
	})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("create: outcome=%s err=%v", outcome, err)
	}
	_ = result
	role, err := s.Join("table-1", 42)
	if err != nil || role != "gm" {
		t.Fatalf("real caller (42) should be gm regardless of patch: role=%q err=%v", role, err)
	}
	role, err = s.Join("table-1", 999)
	if err != nil || role != "player" {
		t.Fatalf("the id smuggled in patch must NOT become owner: role=%q err=%v", role, err)
	}
}

func TestTableEditRequiresOwnership(t *testing.T) {
	s := newTestStore(t)
	if _, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityTable, ID: "t1", BaseVersion: 0,
		Patch: map[string]interface{}{"name": "Original"},
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("create: %s %v", outcome, err)
	}

	// A different account cannot rename it.
	result, outcome, err := s.ApplyOp(2, Op{
		EntityType: EntityTable, ID: "t1", BaseVersion: 1,
		Patch: map[string]interface{}{"name": "Hijacked"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeRejected) {
		t.Fatalf("non-owner edit should be rejected, got %s", outcome)
	}
	if result.Error == "" {
		t.Fatal("rejection should carry an error message")
	}

	// The owner can.
	result, outcome, err = s.ApplyOp(1, Op{
		EntityType: EntityTable, ID: "t1", BaseVersion: 1,
		Patch: map[string]interface{}{"name": "Renamed"},
	})
	if err != nil || outcome != string(outcomeAccepted) || result.Version != 2 {
		t.Fatalf("owner edit should be accepted: outcome=%s version=%d err=%v", outcome, result.Version, err)
	}
}

func TestTableEditStaleVersionConflicts(t *testing.T) {
	// Mirrors the mapState ApplyVersionedUpdate guard, one level down (a SQLite
	// row instead of an in-memory map field).
	s := newTestStore(t)
	s.ApplyOp(1, Op{EntityType: EntityTable, ID: "t1", BaseVersion: 0, Patch: map[string]interface{}{"name": "A"}})
	s.ApplyOp(1, Op{EntityType: EntityTable, ID: "t1", BaseVersion: 1, Patch: map[string]interface{}{"name": "B"}})

	// Client B computed its edit against version 1, but the table is now
	// at version 2 — must be rejected as a conflict with the canonical
	// state, not silently applied.
	result, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityTable, ID: "t1", BaseVersion: 1,
		Patch: map[string]interface{}{"name": "Stale"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeConflict) {
		t.Fatalf("stale baseVersion should conflict, got %s", outcome)
	}
	canonical, ok := result.Canonical.(*TableRow)
	if !ok {
		t.Fatalf("conflict should carry the canonical TableRow, got %T", result.Canonical)
	}
	if canonical.Name != "B" {
		t.Fatalf("canonical name should be the latest accepted edit, got %q", canonical.Name)
	}
}

func TestCharacterCreateUnownedThenAdoptFirstWriterWins(t *testing.T) {
	s := newTestStore(t)
	s.ApplyOp(1, Op{EntityType: EntityTable, ID: "t1", BaseVersion: 0, Patch: map[string]interface{}{"name": "Mesa"}})

	// GM creates an unowned character.
	result, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 0,
		Patch: map[string]interface{}{"name": "Fulano", "tableId": "t1"},
	})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("create character: %s %v", outcome, err)
	}
	if result.Version != 1 {
		t.Fatalf("expected version 1, got %d", result.Version)
	}

	// Player 2 adopts it.
	result, outcome, err = s.ApplyOp(2, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 1,
		Patch: map[string]interface{}{"ownerAccountId": float64(2)},
	})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("adopt: %s %v", outcome, err)
	}

	// Player 3 tries to adopt the same character against the same stale
	// version 1 — must conflict, not silently overwrite player 2's claim.
	result, outcome, err = s.ApplyOp(3, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 1,
		Patch: map[string]interface{}{"ownerAccountId": float64(3)},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeConflict) {
		t.Fatalf("second adopt attempt should conflict, got %s", outcome)
	}
	canonical, ok := result.Canonical.(*CharacterRow)
	if !ok {
		t.Fatalf("conflict should carry canonical CharacterRow, got %T", result.Canonical)
	}
	if canonical.OwnerAccountID == nil || *canonical.OwnerAccountID != 2 {
		t.Fatalf("canonical owner should still be player 2, got %v", canonical.OwnerAccountID)
	}
}

func TestCharacterPlayerCannotEditSomeoneElses(t *testing.T) {
	s := newTestStore(t)
	s.ApplyOp(1, Op{EntityType: EntityTable, ID: "t1", BaseVersion: 0, Patch: map[string]interface{}{"name": "Mesa"}})
	s.ApplyOp(1, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 0,
		Patch: map[string]interface{}{"name": "Fulano", "tableId": "t1", "ownerAccountId": float64(2)},
	})

	// Player 3 (not the GM, not the owner) cannot edit player 2's character.
	_, outcome, err := s.ApplyOp(3, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 1,
		Patch: map[string]interface{}{"name": "Hijacked"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeRejected) {
		t.Fatalf("non-owner, non-GM edit should be rejected, got %s", outcome)
	}

	// The GM (table owner) can edit anyone's character.
	result, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 1,
		Patch: map[string]interface{}{"name": "GM Edit"},
	})
	if err != nil || outcome != string(outcomeAccepted) || result.Version != 2 {
		t.Fatalf("GM edit should be accepted: outcome=%s version=%d err=%v", outcome, result.Version, err)
	}

	// The owner (player 2) can edit their own character.
	result, outcome, err = s.ApplyOp(2, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 2,
		Patch: map[string]interface{}{"name": "Owner Edit"},
	})
	if err != nil || outcome != string(outcomeAccepted) || result.Version != 3 {
		t.Fatalf("owner edit should be accepted: outcome=%s version=%d err=%v", outcome, result.Version, err)
	}
}

func TestCharacterNonGMCannotAssignOwnerToSomeoneElse(t *testing.T) {
	s := newTestStore(t)
	s.ApplyOp(1, Op{EntityType: EntityTable, ID: "t1", BaseVersion: 0, Patch: map[string]interface{}{"name": "Mesa"}})
	s.ApplyOp(1, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 0,
		Patch: map[string]interface{}{"name": "Fulano", "tableId": "t1"},
	})

	// Player 2 tries to assign the unowned character straight to player 3.
	_, outcome, err := s.ApplyOp(2, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 1,
		Patch: map[string]interface{}{"ownerAccountId": float64(3)},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeRejected) {
		t.Fatalf("assigning to someone else should require being GM, got %s", outcome)
	}
}

func TestCharacterGMCannotAssignSelfAsOwner(t *testing.T) {
	s := newTestStore(t)
	s.ApplyOp(1, Op{EntityType: EntityTable, ID: "t1", BaseVersion: 0, Patch: map[string]interface{}{"name": "Mesa"}})

	// The GM (caller 1, table owner) tries to create a character claimed
	// by themselves — must be rejected even though a GM is otherwise
	// allowed to assign ownership to anyone.
	_, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 0,
		Patch: map[string]interface{}{"name": "Fulano", "tableId": "t1", "ownerAccountId": float64(1)},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeRejected) {
		t.Fatalf("GM self-assigning on create should be rejected, got %s", outcome)
	}

	// GM can still assign it to someone else, or leave it unowned.
	result, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: 0,
		Patch: map[string]interface{}{"name": "Fulano", "tableId": "t1", "ownerAccountId": float64(2)},
	})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("GM assigning to a player should be accepted: %s %v", outcome, err)
	}

	// Now the GM tries to reassign the existing (player-owned) character
	// to themselves via an edit — also must be rejected.
	_, outcome, err = s.ApplyOp(1, Op{
		EntityType: EntityCharacter, ID: "c1", BaseVersion: result.Version,
		Patch: map[string]interface{}{"ownerAccountId": float64(1)},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeRejected) {
		t.Fatalf("GM self-assigning on edit should be rejected, got %s", outcome)
	}
}

func TestDeleteIsTombstonedAndAppearsInChanges(t *testing.T) {
	s := newTestStore(t)
	s.ApplyOp(1, Op{EntityType: EntityTable, ID: "t1", BaseVersion: 0, Patch: map[string]interface{}{"name": "Mesa"}})

	result, outcome, err := s.ApplyOp(1, Op{EntityType: EntityTable, ID: "t1", BaseVersion: 1, Deleted: true})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("delete: %s %v", outcome, err)
	}
	if result.Version != 2 {
		t.Fatalf("delete should still bump version, got %d", result.Version)
	}

	changes, cursor, _, err := s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	if len(changes) != 2 {
		t.Fatalf("expected 2 changes (create + delete), got %d", len(changes))
	}
	last := changes[len(changes)-1]
	if !last.Deleted {
		t.Fatal("last change should be marked deleted")
	}
	if last.Data != nil {
		t.Fatalf("deleted change should carry nil data, got %v", last.Data)
	}
	if cursor != changes[len(changes)-1].Seq {
		t.Fatalf("cursor should be the last seq returned: cursor=%d last=%d", cursor, last.Seq)
	}
}

func TestGetChangesSinceOnlyReturnsNewerRows(t *testing.T) {
	s := newTestStore(t)
	s.ApplyOp(1, Op{EntityType: EntityTable, ID: "t1", BaseVersion: 0, Patch: map[string]interface{}{"name": "A"}})
	first, cursor1, _, err := s.GetChangesSince(0)
	if err != nil || len(first) != 1 {
		t.Fatalf("first page: len=%d err=%v", len(first), err)
	}

	s.ApplyOp(1, Op{EntityType: EntityTable, ID: "t1", BaseVersion: 1, Patch: map[string]interface{}{"name": "B"}})
	second, cursor2, _, err := s.GetChangesSince(cursor1)
	if err != nil || len(second) != 1 {
		t.Fatalf("second page: len=%d err=%v", len(second), err)
	}
	if cursor2 <= cursor1 {
		t.Fatalf("cursor should advance: %d -> %d", cursor1, cursor2)
	}

	// Re-fetching from the old cursor is idempotent-ish: still only the
	// new row, not a duplicate of the first.
	replay, _, _, err := s.GetChangesSince(cursor1)
	if err != nil || len(replay) != 1 {
		t.Fatalf("replay from cursor1: len=%d err=%v", len(replay), err)
	}
}

func TestJoinUnknownTableFails(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.Join("nope", 1); err == nil {
		t.Fatal("joining an unknown table should error")
	}
}

func TestAssetRoundTrip(t *testing.T) {
	s := newTestStore(t)
	hash := "abcdef0123456789"
	exists, err := s.AssetExists(hash)
	if err != nil || exists {
		t.Fatalf("asset should not exist yet: exists=%v err=%v", exists, err)
	}
	if err := s.RecordAsset(hash, "image/png", 1234); err != nil {
		t.Fatalf("record asset: %v", err)
	}
	exists, err = s.AssetExists(hash)
	if err != nil || !exists {
		t.Fatalf("asset should exist now: exists=%v err=%v", exists, err)
	}
	mime, err := s.AssetMime(hash)
	if err != nil || mime != "image/png" {
		t.Fatalf("mime should round trip: mime=%q err=%v", mime, err)
	}
}

func TestAssetPathRejectsInvalidHash(t *testing.T) {
	s := newTestStore(t)
	if _, err := s.AssetPath("not-hex!!"); err == nil {
		t.Fatal("non-hex hash should be rejected")
	}
	if _, err := s.AssetPath("a"); err == nil {
		t.Fatal("too-short hash should be rejected")
	}
	path, err := s.AssetPath("deadbeef")
	if err != nil {
		t.Fatalf("valid hash should be accepted: %v", err)
	}
	if path == "" {
		t.Fatal("expected a non-empty path")
	}
}
