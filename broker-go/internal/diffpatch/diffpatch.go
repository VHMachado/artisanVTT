// Package diffpatch is a Go port of backend/src/helpers/diff.ts's
// applyChanges, which itself wraps deep-diff's applyChange/applyArrayChange
// (see node_modules/deep-diff/index.js). It mutates a generic JSON-like tree
// (map[string]interface{} / []interface{} / primitives, the shape produced
// by decoding msgpack into interface{}) using the same [{kind, path, rhs,
// index, item}, ...] change format the frontend already computes with the
// `deep-diff` npm package and sends over the wire unchanged.
//
// Unlike JS arrays, Go slices don't mutate their length in place — resizing
// one always risks producing a new backing array invisible to whoever holds
// the old slice header. Every navigation step here therefore carries a
// writeBack closure so a resized/created container is always propagated up
// into its parent, however deep the path.
package diffpatch

// ApplyChanges is the port of diff.ts's applyChanges: an E(dit) or A(rray)
// change is only applied if the value at its path currently exists (the
// lodash.get(...) !== undefined guard upstream uses to silently skip edits
// to paths that no longer exist, e.g. a token deleted by someone else).
// Every other change (N(ew), D(eleted), or one with no path) is applied
// unconditionally, exactly mirroring the TS implementation.
func ApplyChanges(target map[string]interface{}, changes []interface{}) {
	for _, raw := range changes {
		change, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		kind, _ := change["kind"].(string)
		path := asPath(change["path"])
		if len(path) > 0 && (kind == "E" || kind == "A") {
			if _, exists := getByPath(target, path); !exists {
				continue
			}
		}
		applyChange(target, change)
	}
}

// node is a container (map[string]interface{} or []interface{}) reached
// while walking a change's path, plus a way to replace it in its own
// parent.
type node struct {
	container interface{}
	writeBack func(interface{})
}

func rootNode(m map[string]interface{}) node {
	return node{container: m, writeBack: func(interface{}) {}}
}

// child descends into n.container[key], growing n.container first if it's
// a slice too short to hold a numeric key, and auto-vivifying the child (as
// a map or slice, depending on whether the key after it looks numeric) if
// it doesn't exist yet — mirroring deep-diff's
// `it[path[i]] = typeof path[i+1] === 'number' ? [] : {}`.
func (n node) child(key interface{}, nextKeyNumeric bool) node {
	if arr, ok := n.container.([]interface{}); ok {
		if idx := asInt(key); idx >= len(arr) {
			grown := make([]interface{}, idx+1)
			copy(grown, arr)
			n.container = grown
			n.writeBack(grown)
		}
	}

	val, exists := containerGet(n.container, key)
	if !exists || val == nil {
		if nextKeyNumeric {
			val = []interface{}{}
		} else {
			val = map[string]interface{}{}
		}
		containerSet(n.container, key, val)
	}

	parent := n.container
	return node{
		container: val,
		writeBack: func(newVal interface{}) {
			if arr, ok := parent.([]interface{}); ok {
				if idx := asInt(key); idx >= 0 && idx < len(arr) {
					arr[idx] = newVal
				}
			} else if m, ok := parent.(map[string]interface{}); ok {
				if k, ok := key.(string); ok {
					m[k] = newVal
				}
			}
		},
	}
}

// applyChange is the port of deep-diff's applyChange.
func applyChange(target map[string]interface{}, change map[string]interface{}) {
	kind, _ := change["kind"].(string)
	if kind == "" {
		return
	}
	path := asPath(change["path"])

	n := rootNode(target)
	last := 0
	if len(path) > 0 {
		last = len(path) - 1
	}
	for i := 0; i < last; i++ {
		nextNumeric := i+1 < len(path) && isNumericKey(path[i+1])
		n = n.child(path[i], nextNumeric)
	}

	switch kind {
	case "A":
		item, _ := change["item"].(map[string]interface{})
		index := asInt(change["index"])
		if len(path) > 0 {
			key := path[last]
			val, exists := containerGet(n.container, key)
			var arr []interface{}
			if exists {
				arr, _ = val.([]interface{})
			}
			containerSet(n.container, key, applyArrayChange(arr, index, item))
		} else {
			arr, _ := n.container.([]interface{})
			n.writeBack(applyArrayChange(arr, index, item))
		}
	case "D":
		if len(path) > 0 {
			containerDelete(n.container, path[last])
		}
	case "E", "N":
		if len(path) > 0 {
			containerSet(n.container, path[last], change["rhs"])
		}
	}
}

// applyArrayChange is the port of deep-diff's applyArrayChange. It returns
// the resulting slice; callers must store it back into whatever held the
// original (see the writeBack propagation above) since Go slices, unlike JS
// arrays, don't mutate their length in place.
func applyArrayChange(arr []interface{}, index int, change map[string]interface{}) []interface{} {
	if change == nil {
		return arr
	}
	kind, _ := change["kind"].(string)
	path := asPath(change["path"])

	if len(path) > 0 {
		if index < 0 || index >= len(arr) {
			return arr
		}
		n := node{
			container: arr[index],
			writeBack: func(newVal interface{}) { arr[index] = newVal },
		}
		last := len(path) - 1
		for i := 0; i < last; i++ {
			nextNumeric := i+1 < len(path) && isNumericKey(path[i+1])
			n = n.child(path[i], nextNumeric)
		}
		key := path[last]
		switch kind {
		case "A":
			item, _ := change["item"].(map[string]interface{})
			nestedIndex := asInt(change["index"])
			val, exists := containerGet(n.container, key)
			var nested []interface{}
			if exists {
				nested, _ = val.([]interface{})
			}
			containerSet(n.container, key, applyArrayChange(nested, nestedIndex, item))
		case "D":
			containerDelete(n.container, key)
		case "E", "N":
			containerSet(n.container, key, change["rhs"])
		}
		return arr
	}

	switch kind {
	case "A":
		if index >= 0 && index < len(arr) {
			nested, _ := arr[index].([]interface{})
			item, _ := change["item"].(map[string]interface{})
			nestedIndex := asInt(change["index"])
			arr[index] = applyArrayChange(nested, nestedIndex, item)
		}
	case "D":
		arr = arrayRemove(arr, index)
	case "E", "N":
		if index >= 0 && index < len(arr) {
			arr[index] = change["rhs"]
		} else if index == len(arr) {
			arr = append(arr, change["rhs"])
		}
	}
	return arr
}

func arrayRemove(arr []interface{}, index int) []interface{} {
	if index < 0 || index >= len(arr) {
		return arr
	}
	out := make([]interface{}, 0, len(arr)-1)
	out = append(out, arr[:index]...)
	out = append(out, arr[index+1:]...)
	return out
}

func containerGet(container interface{}, key interface{}) (interface{}, bool) {
	switch c := container.(type) {
	case map[string]interface{}:
		k, ok := key.(string)
		if !ok {
			return nil, false
		}
		v, exists := c[k]
		return v, exists
	case []interface{}:
		idx := asInt(key)
		if idx < 0 || idx >= len(c) {
			return nil, false
		}
		return c[idx], true
	}
	return nil, false
}

func containerSet(container interface{}, key interface{}, value interface{}) {
	switch c := container.(type) {
	case map[string]interface{}:
		if k, ok := key.(string); ok {
			c[k] = value
		}
	case []interface{}:
		idx := asInt(key)
		if idx >= 0 && idx < len(c) {
			c[idx] = value
		}
	}
}

func containerDelete(container interface{}, key interface{}) {
	switch c := container.(type) {
	case map[string]interface{}:
		if k, ok := key.(string); ok {
			delete(c, k)
		}
	case []interface{}:
		// JS `delete arr[i]` leaves a hole (index stays, becomes undefined)
		// rather than shortening the array — match that, not arrayRemove.
		idx := asInt(key)
		if idx >= 0 && idx < len(c) {
			c[idx] = nil
		}
	}
}

func getByPath(target map[string]interface{}, path []interface{}) (interface{}, bool) {
	var current interface{} = target
	for _, key := range path {
		val, exists := containerGet(current, key)
		if !exists {
			return nil, false
		}
		current = val
	}
	return current, true
}

func asPath(raw interface{}) []interface{} {
	arr, _ := raw.([]interface{})
	return arr
}

func isNumericKey(key interface{}) bool {
	switch key.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return true
	default:
		return false
	}
}

func asInt(v interface{}) int {
	switch n := v.(type) {
	case int:
		return n
	case int8:
		return int(n)
	case int16:
		return int(n)
	case int32:
		return int(n)
	case int64:
		return int(n)
	case uint:
		return int(n)
	case uint8:
		return int(n)
	case uint16:
		return int(n)
	case uint32:
		return int(n)
	case uint64:
		return int(n)
	case float32:
		return int(n)
	case float64:
		return int(n)
	}
	return -1
}
