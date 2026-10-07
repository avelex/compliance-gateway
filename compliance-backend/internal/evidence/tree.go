package evidence

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strconv"
)

// EvidenceKeys are the sections a decision is taken on: packHash = evidence_root.
var EvidenceKeys = []string{"pack_id", "payment_ref", "onchain", "travel_rule", "wallet_ownership",
	"kyt", "sanctions", "structuring", "issuer", "rules"}

func join(path, k string) string {
	if path == "" {
		return k
	}
	return path + "." + k
}

func isWithheld(v any) (string, bool) {
	m, ok := v.(map[string]any)
	if !ok || len(m) != 1 {
		return "", false
	}
	w, ok := m["$withheld"].(string)
	return w, ok
}

// node hashes a subtree: a salted hash per leaf, the hash of the canonical child map or list above it.
// A {"$withheld": h} node stands for a redacted subtree and contributes h unchanged, so a projection
// still reproduces the master root. Empty containers are leaves.
func node(v any, salts map[string]string, path string) string {
	if w, ok := isWithheld(v); ok {
		return w
	}
	switch x := v.(type) {
	case map[string]any:
		if len(x) == 0 {
			return leaf(v, salts, path)
		}
		m := make(map[string]any, len(x))
		for k, c := range x {
			m[k] = node(c, salts, join(path, k))
		}
		return SHA(mustCanon(m))
	case []any:
		if len(x) == 0 {
			return leaf(v, salts, path)
		}
		l := make([]any, len(x))
		for i, c := range x {
			l[i] = node(c, salts, join(path, strconv.Itoa(i)))
		}
		return SHA(mustCanon(l))
	default:
		return leaf(v, salts, path)
	}
}

func leaf(v any, salts map[string]string, path string) string {
	s, ok := salts[path]
	if !ok {
		panic(fmt.Sprintf("no salt for %q", path))
	}
	salt, err := hex.DecodeString(s)
	if err != nil {
		panic(fmt.Sprintf("salt for %q: %v", path, err))
	}
	return SHA(append(salt, mustCanon(v)...))
}

func safe(f func() string) (out string, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("evidence tree: %v", r)
		}
	}()
	return f(), nil
}

// NodeHash is the tree hash of v at path.
func NodeHash(v any, salts map[string]string, path string) (string, error) {
	return safe(func() string { return node(v, salts, path) })
}

// MasterRoot is the tree root over the whole data object.
func MasterRoot(data map[string]any, salts map[string]string) (string, error) {
	return NodeHash(data, salts, "")
}

// EvidenceRoot is the hash of the canonical object of the evidence keys' node hashes.
func EvidenceRoot(data map[string]any, salts map[string]string) (string, error) {
	return safe(func() string {
		ev := make(map[string]any, len(EvidenceKeys))
		for _, k := range EvidenceKeys {
			ev[k] = node(data[k], salts, k)
		}
		return SHA(mustCanon(ev))
	})
}

// Salt adds a fresh 32-byte salt for every leaf path in v that has none yet; existing salts are kept,
// so a later pack version reproduces the earlier evidence_root.
func Salt(v any, salts map[string]string, path string) {
	if _, ok := isWithheld(v); ok {
		return
	}
	switch x := v.(type) {
	case map[string]any:
		if len(x) > 0 {
			for k, c := range x {
				Salt(c, salts, join(path, k))
			}
			return
		}
	case []any:
		if len(x) > 0 {
			for i, c := range x {
				Salt(c, salts, join(path, strconv.Itoa(i)))
			}
			return
		}
	}
	if _, ok := salts[path]; !ok {
		b := make([]byte, 32)
		rand.Read(b)
		salts[path] = hex.EncodeToString(b)
	}
}
