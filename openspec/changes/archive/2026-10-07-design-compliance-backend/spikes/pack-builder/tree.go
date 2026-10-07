package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
)

// evidenceKeys are the sections the processor's decision is taken on (design.md D7: packHash = evidence_root).
var evidenceKeys = []string{"pack_id", "payment_ref", "onchain", "travel_rule", "wallet_ownership",
	"kyt", "sanctions", "structuring", "issuer", "rules"}

func sha(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func join(path, k string) string {
	if path == "" {
		return k
	}
	return path + "." + k
}

// node hashes a subtree: a salted hash per leaf, the hash of the canonical child map or list above it.
// A {"$withheld": h} node stands for a redacted subtree and contributes h unchanged, so a projection
// still reproduces the master root.
func node(v interface{}, salts map[string]string, path string) string {
	switch x := v.(type) {
	case map[string]interface{}:
		if w, ok := x["$withheld"]; ok && len(x) == 1 {
			return w.(string)
		}
		if len(x) == 0 {
			return leaf(v, salts, path)
		}
		m := make(map[string]interface{}, len(x))
		for k, c := range x {
			m[k] = node(c, salts, join(path, k))
		}
		return sha(canon(m))
	case []interface{}:
		if len(x) == 0 {
			return leaf(v, salts, path)
		}
		l := make([]interface{}, len(x))
		for i, c := range x {
			l[i] = node(c, salts, join(path, strconv.Itoa(i)))
		}
		return sha(canon(l))
	default:
		return leaf(v, salts, path)
	}
}

func leaf(v interface{}, salts map[string]string, path string) string {
	s, ok := salts[path]
	if !ok {
		panic(fmt.Sprintf("no salt for %q", path))
	}
	salt, err := hex.DecodeString(s)
	if err != nil {
		panic(err)
	}
	return sha(append(salt, canon(v)...))
}

type roots struct {
	Master, Evidence, Projection string
}

// computeRoots takes a pack copy (data, salts and metadata, without integrity) and returns its three hashes.
func computeRoots(copy map[string]interface{}) roots {
	data := copy["data"].(map[string]interface{})
	salts := map[string]string{}
	for k, v := range copy["salts"].(map[string]interface{}) {
		salts[k] = v.(string)
	}
	ev := map[string]interface{}{}
	for _, k := range evidenceKeys {
		ev[k] = node(data[k], salts, k)
	}
	return roots{
		Master:     node(data, salts, ""),
		Evidence:   sha(canon(ev)),
		Projection: sha(canon(copy)),
	}
}
