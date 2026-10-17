// Tests for the authoritative-version guard (see
// repository.go's package-level discussion): Game.ApplyVersionedUpdate/
// SetVersionedState, the mechanism that stops a stale undo from silently
// overwriting another client's edit.
package game

import "testing"

func TestSetVersionedStateStartsAtOneAndIncrements(t *testing.T) {
	g := newGame("g1")
	v1 := g.SetVersionedState("mapState", map[string]interface{}{"mapId": "m1"})
	if v1 != 1 {
		t.Fatalf("expected version 1 after first set, got %d", v1)
	}
	v2 := g.SetVersionedState("mapState", map[string]interface{}{"mapId": "m1"})
	if v2 != 2 {
		t.Fatalf("expected version 2 after second set, got %d", v2)
	}
	if g.GetStateVersion("mapState") != 2 {
		t.Fatalf("GetStateVersion should reflect last set, got %d", g.GetStateVersion("mapState"))
	}
	// A field never set has implicit version 0, matching a fresh client's
	// initial versionRef.
	if g.GetStateVersion("manifest") != 0 {
		t.Fatalf("unset field should report version 0, got %d", g.GetStateVersion("manifest"))
	}
}

func TestApplyVersionedUpdateAppliesOnMatchingBaseVersion(t *testing.T) {
	g := newGame("g1")
	g.SetVersionedState("mapState", map[string]interface{}{"mapId": "m1", "x": 1.0})

	result := g.ApplyVersionedUpdate("mapState", 1, func(state map[string]interface{}) bool {
		state["x"] = 2.0
		return true
	})

	if !result.Applied || result.Conflict {
		t.Fatalf("expected apply with matching baseVersion, got %+v", result)
	}
	if result.Version != 2 {
		t.Fatalf("expected version bumped to 2, got %d", result.Version)
	}
	state := g.GetState("mapState").(map[string]interface{})
	if state["x"] != 2.0 {
		t.Fatalf("mutate should have run against the live state, got %v", state["x"])
	}
}

// TestApplyVersionedUpdateRejectsStaleBaseVersion is the core regression
// test for a bug where A moves a token (v1->v2), B moves the
// same token (v2->v3), A undoes against its stale v1 baseline. Without the
// guard, deep-diff's absolute-value revert would silently clobber B's
// edit; with it, A's update must be rejected and told the canonical state.
func TestApplyVersionedUpdateRejectsStaleBaseVersion(t *testing.T) {
	g := newGame("g1")
	g.SetVersionedState("mapState", map[string]interface{}{"mapId": "m1", "x": 0.0}) // v1

	// B's move: applied against the correct current version (1).
	bResult := g.ApplyVersionedUpdate("mapState", 1, func(state map[string]interface{}) bool {
		state["x"] = 10.0 // B moved the token to x=10
		return true
	})
	if !bResult.Applied || bResult.Version != 2 {
		t.Fatalf("B's update should have applied cleanly, got %+v", bResult)
	}

	// A's undo: still carries baseVersion 1 (computed before B's move was
	// known), which is now stale — must be rejected, not applied.
	mutateCalled := false
	aResult := g.ApplyVersionedUpdate("mapState", 1, func(state map[string]interface{}) bool {
		mutateCalled = true
		state["x"] = 0.0 // this must never run
		return true
	})

	if !aResult.Conflict {
		t.Fatalf("expected A's stale update to be rejected as a conflict, got %+v", aResult)
	}
	if mutateCalled {
		t.Fatal("mutate must not run when baseVersion is stale — B's edit would be silently clobbered")
	}

	state := g.GetState("mapState").(map[string]interface{})
	if state["x"] != 10.0 {
		t.Fatalf("B's edit must survive A's rejected undo, got x=%v", state["x"])
	}
	if aResult.Version != 2 {
		t.Fatalf("conflict result should report the current version for resync, got %d", aResult.Version)
	}
	gotState, _ := aResult.State.(map[string]interface{})
	if gotState == nil || gotState["x"] != 10.0 {
		t.Fatalf("conflict result should carry the canonical state for resync, got %v", aResult.State)
	}
}

func TestApplyVersionedUpdateDropsMismatchedMapIDWithoutBumpingVersion(t *testing.T) {
	// Mirrors the original GameState.ts guard: an update targeting a map
	// that's no longer current is dropped silently, distinct from a
	// version conflict (neither Applied nor Conflict).
	g := newGame("g1")
	g.SetVersionedState("mapState", map[string]interface{}{"mapId": "m1", "x": 1.0})

	result := g.ApplyVersionedUpdate("mapState", 1, func(state map[string]interface{}) bool {
		return false // simulates the id-mismatch guard inside the mutator
	})

	if result.Applied || result.Conflict {
		t.Fatalf("id-mismatch should be neither applied nor a version conflict, got %+v", result)
	}
	if g.GetStateVersion("mapState") != 1 {
		t.Fatalf("version must not bump when mutate declines, got %d", g.GetStateVersion("mapState"))
	}
}

func TestApplyVersionedUpdateOnNeverSetFieldIsNotApplied(t *testing.T) {
	g := newGame("g1")
	result := g.ApplyVersionedUpdate("mapState", 0, func(state map[string]interface{}) bool {
		t.Fatal("mutate must not run against a nil state")
		return true
	})
	if result.Applied {
		t.Fatalf("expected no-op on a field that was never set, got %+v", result)
	}
}
