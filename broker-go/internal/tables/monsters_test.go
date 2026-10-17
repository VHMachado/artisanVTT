// Self check for per-Mesa homebrew/derived monsters: the
// GM-only authorization rule on BOTH the create and the edit path, the
// shared version guard, parent_index immutability, and the changes log /
// snapshot plumbing. See applyMonsterOp.
package tables

import (
	"testing"
)

// newTableOwnedBy creates a Mesa owned by ownerID, so a monster test can
// exercise the "only the table's owner" rule against a real row.
func newTableOwnedBy(t *testing.T, s *Store, tableID string, ownerID int64) {
	t.Helper()
	_, outcome, err := s.ApplyOp(ownerID, Op{
		EntityType:  EntityTable,
		ID:          tableID,
		BaseVersion: 0,
		Patch:       map[string]interface{}{"name": "Mesa"},
	})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("create table: outcome=%s err=%v", outcome, err)
	}
}

func TestCreateDerivedMonsterStoresParentAndOverrides(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)

	result, outcome, err := s.ApplyOp(1, Op{
		EntityType:  EntityMonster,
		ID:          "m1",
		BaseVersion: 0,
		Patch: map[string]interface{}{
			"tableId":     "t1",
			"name":        "Fulana, a Duergar Ladina",
			"parentIndex": "duergar",
			"overrides":   `{"hit_points":42}`,
		},
	})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("create monster: outcome=%s err=%v (%s)", outcome, err, result.Error)
	}
	if result.Version != 1 {
		t.Fatalf("first version should be 1, got %d", result.Version)
	}

	changes, _, _, err := s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	// [0] is the Mesa's own create; [1] is the monster.
	if len(changes) != 2 {
		t.Fatalf("expected 2 changes, got %d", len(changes))
	}
	last := changes[1]
	if last.EntityType != EntityMonster {
		t.Fatalf("expected a monster change, got %q", last.EntityType)
	}
	if last.TableID != "t1" {
		t.Fatalf("change should carry the Mesa id, got %q", last.TableID)
	}
	row, ok := last.Data.(MonsterRow)
	if !ok {
		t.Fatalf("expected a MonsterRow snapshot, got %T", last.Data)
	}
	if row.ParentIndex != "duergar" {
		t.Fatalf("parentIndex should round trip, got %q", row.ParentIndex)
	}
	if row.Overrides != `{"hit_points":42}` {
		t.Fatalf("overrides should round trip opaquely, got %q", row.Overrides)
	}
	if row.OwnerAccountID != 1 {
		t.Fatalf("author should be the caller, got %d", row.OwnerAccountID)
	}
}

func TestCreateMonsterFromScratchHasNoParent(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)

	if _, outcome, err := s.ApplyOp(1, Op{
		EntityType:  EntityMonster,
		ID:          "m1",
		BaseVersion: 0,
		Patch: map[string]interface{}{
			"tableId":   "t1",
			"name":      "Coisa do Pântano",
			"overrides": `{"hit_points":11}`,
		},
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("create: outcome=%s err=%v", outcome, err)
	}

	changes, _, _, err := s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	row := changes[1].Data.(MonsterRow)
	if row.ParentIndex != "" {
		t.Fatalf("a from-scratch monster should have no parent, got %q", row.ParentIndex)
	}
}

// The GM-only rule must hold on BOTH branches of applyMonsterOp: the
// create path (where there is no row to read an owner from, so the check
// runs against the Mesa) and the edit path.
func TestOnlyTableOwnerCanCreateAMonster(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)

	result, outcome, err := s.ApplyOp(2, Op{
		EntityType:  EntityMonster,
		ID:          "m1",
		BaseVersion: 0,
		Patch:       map[string]interface{}{"tableId": "t1", "name": "Intruso"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeRejected) {
		t.Fatalf("a non-GM create should be rejected, got %s", outcome)
	}
	if result.Error == "" {
		t.Fatal("a rejection should explain itself")
	}
}

func TestOnlyTableOwnerCanEditOrDeleteAMonster(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	if _, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 0,
		Patch: map[string]interface{}{"tableId": "t1", "name": "Duergar Chefe"},
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("create: %s %v", outcome, err)
	}

	for _, tc := range []struct {
		name string
		op   Op
	}{
		{"edit", Op{EntityType: EntityMonster, ID: "m1", BaseVersion: 1,
			Patch: map[string]interface{}{"name": "Sequestrado"}}},
		{"delete", Op{EntityType: EntityMonster, ID: "m1", BaseVersion: 1, Deleted: true}},
	} {
		result, outcome, err := s.ApplyOp(2, tc.op)
		if err != nil {
			t.Fatalf("%s: unexpected error: %v", tc.name, err)
		}
		if outcome != string(outcomeRejected) {
			t.Fatalf("%s by a non-GM should be rejected, got %s", tc.name, outcome)
		}
		if result.Error == "" {
			t.Fatalf("%s: a rejection should explain itself", tc.name)
		}
	}
}

func TestMonsterEditUsesTheSameVersionGuard(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	s.ApplyOp(1, Op{EntityType: EntityMonster, ID: "m1", BaseVersion: 0,
		Patch: map[string]interface{}{"tableId": "t1", "name": "Original"}})

	// A stale baseVersion is a conflict (resync), not a rejection.
	result, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 0,
		Patch: map[string]interface{}{"name": "Stale"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeConflict) {
		t.Fatalf("stale baseVersion should conflict, got %s", outcome)
	}
	canonical, ok := result.Canonical.(*MonsterRow)
	if !ok {
		t.Fatalf("a conflict should return the canonical row, got %T", result.Canonical)
	}
	if canonical.Name != "Original" {
		t.Fatalf("canonical should be the server's state, got %q", canonical.Name)
	}
}

func TestMonsterParentIndexIsImmutable(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	s.ApplyOp(1, Op{EntityType: EntityMonster, ID: "m1", BaseVersion: 0,
		Patch: map[string]interface{}{
			"tableId": "t1", "name": "Duergar+", "parentIndex": "duergar",
		}})

	if _, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 1,
		Patch: map[string]interface{}{"parentIndex": "adult-red-dragon"},
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("edit: %s %v", outcome, err)
	}

	changes, _, _, err := s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	row := changes[len(changes)-1].Data.(MonsterRow)
	if row.ParentIndex != "duergar" {
		// Re-parenting would silently reinterpret every stored override
		// against a different base stat block.
		t.Fatalf("parentIndex must not be editable, got %q", row.ParentIndex)
	}
}

func TestMonsterRequiresAKnownTable(t *testing.T) {
	s := newTestStore(t)

	result, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 0,
		Patch: map[string]interface{}{"tableId": "ghost", "name": "Órfão"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeRejected) || result.Error == "" {
		t.Fatalf("an unknown table should be rejected with a reason, got %s %q", outcome, result.Error)
	}

	result, outcome, err = s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m2", BaseVersion: 0,
		Patch: map[string]interface{}{"name": "Sem mesa"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeRejected) || result.Error == "" {
		t.Fatalf("a missing tableId should be rejected with a reason, got %s %q", outcome, result.Error)
	}
}

func TestMonsterNameIsRequiredOnCreate(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)

	result, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 0,
		Patch: map[string]interface{}{"tableId": "t1"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if outcome != string(outcomeRejected) || result.Error == "" {
		t.Fatalf("a nameless monster should be rejected, got %s %q", outcome, result.Error)
	}
}

func TestMonsterDeleteIsTombstonedInChanges(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	s.ApplyOp(1, Op{EntityType: EntityMonster, ID: "m1", BaseVersion: 0,
		Patch: map[string]interface{}{"tableId": "t1", "name": "Efêmero"}})

	result, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 1, Deleted: true,
	})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("delete: %s %v", outcome, err)
	}
	if result.Version != 2 {
		t.Fatalf("delete should bump the version, got %d", result.Version)
	}

	changes, _, _, err := s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	last := changes[len(changes)-1]
	if !last.Deleted || last.Data != nil {
		t.Fatalf("a tombstone carries deleted=true and nil data, got %v/%v", last.Deleted, last.Data)
	}
}

func TestMonsterOverridesSurviveANameOnlyEdit(t *testing.T) {
	// A patch that names only `name` must not wipe `overrides` — the
	// same "absent key keeps the current value" contract the table and
	// character paths already follow via stringFromPatch.
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	s.ApplyOp(1, Op{EntityType: EntityMonster, ID: "m1", BaseVersion: 0,
		Patch: map[string]interface{}{
			"tableId": "t1", "name": "Antes", "overrides": `{"hit_points":42}`,
		}})

	if _, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 1,
		Patch: map[string]interface{}{"name": "Depois"},
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("edit: %s %v", outcome, err)
	}

	changes, _, _, err := s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	row := changes[len(changes)-1].Data.(MonsterRow)
	if row.Name != "Depois" {
		t.Fatalf("name should have changed, got %q", row.Name)
	}
	if row.Overrides != `{"hit_points":42}` {
		t.Fatalf("overrides should be untouched, got %q", row.Overrides)
	}
}

// portraitAssetId and tokenAssetIds round-trip through create,
// edit and the sync snapshot, same discipline as overrides above — a
// patch that only names `name` must not wipe them either.
func TestMonsterArtRoundTripsThroughCreateEditAndSync(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)

	if _, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 0,
		Patch: map[string]interface{}{
			"tableId":         "t1",
			"name":            "Goblin Variado",
			"portraitAssetId": "aaaa",
			"tokenAssetIds":   `["bbbb","cccc"]`,
		},
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("create: %s %v", outcome, err)
	}

	changes, _, _, err := s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	created := changes[len(changes)-1].Data.(MonsterRow)
	if created.PortraitAssetID != "aaaa" {
		t.Fatalf("portraitAssetId should round trip on create, got %q", created.PortraitAssetID)
	}
	if created.TokenAssetIDs != `["bbbb","cccc"]` {
		t.Fatalf("tokenAssetIds should round trip on create, got %q", created.TokenAssetIDs)
	}

	// A name-only edit must not wipe either field.
	if _, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 1,
		Patch: map[string]interface{}{"name": "Goblin Renomeado"},
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("edit: %s %v", outcome, err)
	}
	changes, _, _, err = s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	edited := changes[len(changes)-1].Data.(MonsterRow)
	if edited.PortraitAssetID != "aaaa" || edited.TokenAssetIDs != `["bbbb","cccc"]` {
		t.Fatalf("a name-only edit must not wipe art fields, got portrait=%q tokens=%q",
			edited.PortraitAssetID, edited.TokenAssetIDs)
	}

	// An explicit edit of the art fields does take effect.
	if _, outcome, err := s.ApplyOp(1, Op{
		EntityType: EntityMonster, ID: "m1", BaseVersion: 2,
		Patch: map[string]interface{}{
			"portraitAssetId": "dddd",
			"tokenAssetIds":   `["eeee"]`,
		},
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("art edit: %s %v", outcome, err)
	}
	changes, _, _, err = s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	reedited := changes[len(changes)-1].Data.(MonsterRow)
	if reedited.PortraitAssetID != "dddd" || reedited.TokenAssetIDs != `["eeee"]` {
		t.Fatalf("art fields should update, got portrait=%q tokens=%q",
			reedited.PortraitAssetID, reedited.TokenAssetIDs)
	}
}
