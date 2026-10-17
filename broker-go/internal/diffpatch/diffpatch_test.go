package diffpatch

import (
	"reflect"
	"testing"
)

func change(kind string, path []interface{}, fields map[string]interface{}) map[string]interface{} {
	c := map[string]interface{}{"kind": kind, "path": path}
	for k, v := range fields {
		c[k] = v
	}
	return c
}

func TestApplyChangesEdit(t *testing.T) {
	target := map[string]interface{}{
		"tokens": map[string]interface{}{
			"tok1": map[string]interface{}{"x": 1.0, "y": 2.0},
		},
	}
	changes := []interface{}{
		change("E", []interface{}{"tokens", "tok1", "x"}, map[string]interface{}{"rhs": 5.0}),
	}
	ApplyChanges(target, changes)
	tok1 := target["tokens"].(map[string]interface{})["tok1"].(map[string]interface{})
	if tok1["x"] != 5.0 {
		t.Fatalf("expected x=5, got %v", tok1["x"])
	}
	if tok1["y"] != 2.0 {
		t.Fatalf("y should be untouched, got %v", tok1["y"])
	}
}

func TestApplyChangesEditSkippedWhenPathMissing(t *testing.T) {
	// Mirrors diff.ts's guard: an E/A change to a path that no longer
	// exists (e.g. a token another player deleted) must be silently
	// skipped, not create the path.
	target := map[string]interface{}{"tokens": map[string]interface{}{}}
	changes := []interface{}{
		change("E", []interface{}{"tokens", "tok1", "x"}, map[string]interface{}{"rhs": 5.0}),
	}
	ApplyChanges(target, changes)
	tokens := target["tokens"].(map[string]interface{})
	if _, exists := tokens["tok1"]; exists {
		t.Fatal("edit to a missing path must not create it")
	}
}

func TestApplyChangesNew(t *testing.T) {
	target := map[string]interface{}{"tokens": map[string]interface{}{}}
	changes := []interface{}{
		change("N", []interface{}{"tokens", "tok1"}, map[string]interface{}{
			"rhs": map[string]interface{}{"id": "tok1", "x": 1.0},
		}),
	}
	ApplyChanges(target, changes)
	tokens := target["tokens"].(map[string]interface{})
	tok1, ok := tokens["tok1"].(map[string]interface{})
	if !ok {
		t.Fatal("new token should have been created")
	}
	if tok1["id"] != "tok1" {
		t.Fatalf("unexpected new value: %v", tok1)
	}
}

func TestApplyChangesDeleted(t *testing.T) {
	target := map[string]interface{}{
		"tokens": map[string]interface{}{
			"tok1": map[string]interface{}{"id": "tok1"},
		},
	}
	changes := []interface{}{
		change("D", []interface{}{"tokens", "tok1"}, map[string]interface{}{
			"lhs": map[string]interface{}{"id": "tok1"},
		}),
	}
	ApplyChanges(target, changes)
	tokens := target["tokens"].(map[string]interface{})
	if _, exists := tokens["tok1"]; exists {
		t.Fatal("deleted token should be gone")
	}
}

func TestApplyChangesArrayPush(t *testing.T) {
	target := map[string]interface{}{
		"drawings": []interface{}{
			map[string]interface{}{"id": "d1"},
		},
	}
	changes := []interface{}{
		change("A", nil, map[string]interface{}{
			"path":  []interface{}{"drawings"},
			"index": 1,
			"item": map[string]interface{}{
				"kind": "N",
				"rhs":  map[string]interface{}{"id": "d2"},
			},
		}),
	}
	ApplyChanges(target, changes)
	drawings := target["drawings"].([]interface{})
	if len(drawings) != 2 {
		t.Fatalf("expected 2 drawings, got %d", len(drawings))
	}
	d2 := drawings[1].(map[string]interface{})
	if d2["id"] != "d2" {
		t.Fatalf("unexpected second drawing: %v", d2)
	}
}

func TestApplyChangesArrayEditNested(t *testing.T) {
	// Editing arr[0].x via an array-kind change with its own nested path,
	// exercising applyArrayChange's path-aware branch.
	target := map[string]interface{}{
		"drawings": []interface{}{
			map[string]interface{}{"x": 1.0},
		},
	}
	changes := []interface{}{
		change("A", nil, map[string]interface{}{
			"path":  []interface{}{"drawings"},
			"index": 0,
			"item": map[string]interface{}{
				"kind": "E",
				"path": []interface{}{"x"},
				"rhs":  9.0,
			},
		}),
	}
	ApplyChanges(target, changes)
	drawings := target["drawings"].([]interface{})
	d0 := drawings[0].(map[string]interface{})
	if d0["x"] != 9.0 {
		t.Fatalf("expected x=9, got %v", d0["x"])
	}
}

func TestApplyChangesNoPathAppliesUnconditionally(t *testing.T) {
	// A change with no path (root replacement) has kind "E"/"N" but no
	// `path`; diff.ts applies these unconditionally, not through the
	// exists-guard (len(path) == 0 skips the guard).
	target := map[string]interface{}{"mapId": "old"}
	changes := []interface{}{
		map[string]interface{}{"kind": "E", "rhs": "new"},
	}
	// No path means nothing to set on target itself in this port (the root
	// object can't be replaced in place) — this just verifies it doesn't
	// panic and leaves target untouched, matching applyChange's `last := 0`
	// no-op when path is empty and kind isn't A.
	ApplyChanges(target, changes)
	if !reflect.DeepEqual(target, map[string]interface{}{"mapId": "old"}) {
		t.Fatalf("unexpected mutation: %v", target)
	}
}
