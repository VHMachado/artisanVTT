// Self check for per-Mesa homebrew subraces and subclasses:
// the authorship rule that distinguishes this entity from a monster (any
// MEMBER creates; the AUTHOR or the GM edits), kind/parentIndex
// validation, their immutability after creation, the shared version guard
// and the changes log / snapshot plumbing.
//
// The entity exists because the vendored SRD is a thin sample — 4 subraces
// and one subclass per class — so Drow, Wood Elf and College of Valor can
// never ship with the app. See applyRuleOptionOp.
package tables

import (
	"testing"
)

// joinTable makes accountID a plain member of tableID, which is the floor
// for authoring a rule option (and what separates a player at the table
// from an authenticated stranger who knows its id).
func joinTable(t *testing.T, s *Store, tableID string, accountID int64) {
	t.Helper()
	if _, err := s.Join(tableID, accountID); err != nil {
		t.Fatalf("join table: %v", err)
	}
}

func createOption(t *testing.T, s *Store, callerID int64, id string, patch map[string]interface{}) (OpResult, string) {
	t.Helper()
	result, outcome, err := s.ApplyOp(callerID, Op{
		EntityType:  EntityRuleOption,
		ID:          id,
		BaseVersion: 0,
		Patch:       patch,
	})
	if err != nil {
		t.Fatalf("create option %s: %v", id, err)
	}
	return result, outcome
}

func drowPatch() map[string]interface{} {
	return map[string]interface{}{
		"tableId":     "t1",
		"kind":        "subrace",
		"name":        "Drow",
		"parentIndex": "elf",
		"payload":     `{"abilityBonuses":{"cha":1},"traits":[{"name":"Superior Darkvision","desc":"120 ft."}]}`,
	}
}

func TestPlayerCanAuthorRuleOptionAtTheirTable(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	joinTable(t, s, "t1", 2)

	result, outcome := createOption(t, s, 2, "o1", drowPatch())
	if outcome != string(outcomeAccepted) {
		t.Fatalf("a member should be able to author an option, got %s (%s)", outcome, result.Error)
	}
	if result.Version != 1 {
		t.Fatalf("first version should be 1, got %d", result.Version)
	}

	// The snapshot must carry the author, so the UI can say whose it is.
	changes, _, _, err := s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	last := changes[len(changes)-1]
	if last.EntityType != EntityRuleOption {
		t.Fatalf("expected a rule_option change, got %q", last.EntityType)
	}
	row, ok := last.Data.(RuleOptionRow)
	if !ok {
		t.Fatalf("expected a RuleOptionRow snapshot, got %T", last.Data)
	}
	if row.OwnerAccountID != 2 {
		t.Fatalf("author should be 2, got %d", row.OwnerAccountID)
	}
	if row.Kind != "subrace" || row.ParentIndex != "elf" || row.Name != "Drow" {
		t.Fatalf("unexpected snapshot: %+v", row)
	}
}

func TestNonMemberCannotAuthorRuleOption(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	// Account 3 never joined.

	result, outcome := createOption(t, s, 3, "o1", drowPatch())
	if outcome != string(outcomeRejected) {
		t.Fatalf("a non-member must not author an option, got %s", outcome)
	}
	if result.Error == "" {
		t.Fatal("a rejection must explain itself")
	}
}

func TestAuthorCanEditOwnOptionAndOthersCannot(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	joinTable(t, s, "t1", 2)
	joinTable(t, s, "t1", 3)
	createOption(t, s, 2, "o1", drowPatch())

	// The author edits their own: allowed.
	_, outcome, err := s.ApplyOp(2, Op{
		EntityType:  EntityRuleOption,
		ID:          "o1",
		BaseVersion: 1,
		Patch:       map[string]interface{}{"name": "Drow (revisado)"},
	})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("author should edit their own option: %s %v", outcome, err)
	}

	// Another player edits it: rejected. This is the line that makes the
	// entity "cada um no que é seu" rather than a free-for-all.
	result, outcome, err := s.ApplyOp(3, Op{
		EntityType:  EntityRuleOption,
		ID:          "o1",
		BaseVersion: 2,
		Patch:       map[string]interface{}{"name": "Sequestrada"},
	})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if outcome != string(outcomeRejected) {
		t.Fatalf("another member must not edit someone else's option, got %s", outcome)
	}
	if result.Error == "" {
		t.Fatal("a rejection must explain itself")
	}
}

func TestTableOwnerCanEditAnyOption(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	joinTable(t, s, "t1", 2)
	createOption(t, s, 2, "o1", drowPatch())

	// The GM edits a player's option: allowed, mirroring "Mestre move e
	// edita todos" for characters.
	_, outcome, err := s.ApplyOp(1, Op{
		EntityType:  EntityRuleOption,
		ID:          "o1",
		BaseVersion: 1,
		Patch:       map[string]interface{}{"name": "Drow (ajustada pelo Mestre)"},
	})
	if err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("the GM should edit any option: %s %v", outcome, err)
	}
}

func TestRuleOptionRequiresValidKindAndParent(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)

	// A bad kind would produce an option that can never be matched to
	// either SRD list.
	patch := drowPatch()
	patch["kind"] = "subspecies"
	result, outcome := createOption(t, s, 1, "bad-kind", patch)
	if outcome != string(outcomeRejected) || result.Error == "" {
		t.Fatalf("an unknown kind must be rejected, got %s", outcome)
	}

	// A missing parent would produce an option nobody could ever be
	// offered, since eligibility is looked up BY parent.
	patch = drowPatch()
	delete(patch, "parentIndex")
	result, outcome = createOption(t, s, 1, "no-parent", patch)
	if outcome != string(outcomeRejected) || result.Error == "" {
		t.Fatalf("a missing parentIndex must be rejected, got %s", outcome)
	}

	patch = drowPatch()
	delete(patch, "name")
	result, outcome = createOption(t, s, 1, "no-name", patch)
	if outcome != string(outcomeRejected) || result.Error == "" {
		t.Fatalf("a missing name must be rejected, got %s", outcome)
	}
}

func TestRuleOptionKindAndParentAreImmutable(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	createOption(t, s, 1, "o1", drowPatch())

	// Every ability bonus and trait in the payload was written against
	// "elf"/"subrace"; re-parenting would silently reinterpret all of it.
	if _, outcome, err := s.ApplyOp(1, Op{
		EntityType:  EntityRuleOption,
		ID:          "o1",
		BaseVersion: 1,
		Patch: map[string]interface{}{
			"kind":        "subclass",
			"parentIndex": "bard",
			"name":        "Tentativa",
		},
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("the edit itself should succeed: %s %v", outcome, err)
	}

	changes, _, _, err := s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	row := changes[len(changes)-1].Data.(RuleOptionRow)
	if row.Kind != "subrace" {
		t.Fatalf("kind must stay subrace, got %q", row.Kind)
	}
	if row.ParentIndex != "elf" {
		t.Fatalf("parentIndex must stay elf, got %q", row.ParentIndex)
	}
	if row.Name != "Tentativa" {
		t.Fatalf("name should still update, got %q", row.Name)
	}
}

func TestRuleOptionVersionGuard(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	createOption(t, s, 1, "o1", drowPatch())

	result, outcome, err := s.ApplyOp(1, Op{
		EntityType:  EntityRuleOption,
		ID:          "o1",
		BaseVersion: 0, // stale
		Patch:       map[string]interface{}{"name": "Atrasada"},
	})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if outcome != string(outcomeConflict) {
		t.Fatalf("a stale baseVersion must conflict, got %s", outcome)
	}
	if result.Canonical == nil {
		t.Fatal("a conflict must return the canonical state to resync from")
	}
}

func TestDeleteRuleOptionRecordsTombstone(t *testing.T) {
	s := newTestStore(t)
	newTableOwnedBy(t, s, "t1", 1)
	joinTable(t, s, "t1", 2)
	createOption(t, s, 2, "o1", drowPatch())

	if _, outcome, err := s.ApplyOp(2, Op{
		EntityType:  EntityRuleOption,
		ID:          "o1",
		BaseVersion: 1,
		Deleted:     true,
	}); err != nil || outcome != string(outcomeAccepted) {
		t.Fatalf("author should delete their own option: %s %v", outcome, err)
	}

	changes, _, _, err := s.GetChangesSince(0)
	if err != nil {
		t.Fatalf("GetChangesSince: %v", err)
	}
	last := changes[len(changes)-1]
	if !last.Deleted {
		t.Fatal("the last change should be a tombstone")
	}
	if last.Data != nil {
		t.Fatal("a tombstone carries no snapshot")
	}
}

func TestRuleOptionRequiresKnownTable(t *testing.T) {
	s := newTestStore(t)
	patch := drowPatch()
	patch["tableId"] = "does-not-exist"
	result, outcome := createOption(t, s, 1, "o1", patch)
	if outcome != string(outcomeRejected) || result.Error == "" {
		t.Fatalf("an unknown table must be rejected, got %s", outcome)
	}
}
