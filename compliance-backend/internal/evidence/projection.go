package evidence

import (
	"fmt"
	"strings"
	"time"
)

// Recipient names who a projection was prepared for and why; both are printed into the copy.
type Recipient struct {
	Profile     string
	PreparedFor string
	Purpose     string
}

// Project builds the copy of p handed to one recipient: withheld subtrees carry their hash, their salts
// are dropped, and the integrity block states the unchanged roots plus the copy's own projection_hash.
func Project(p *Pack, r Recipient, now time.Time) (map[string]any, error) {
	paths, ok := Profiles[r.Profile]
	if !ok {
		return nil, fmt.Errorf("unknown profile %q", r.Profile)
	}
	if strings.TrimSpace(r.PreparedFor) == "" || strings.TrimSpace(r.Purpose) == "" {
		return nil, fmt.Errorf("prepared_for and purpose are required")
	}
	data := deepCopy(p.Data).(map[string]any)
	salts := make(map[string]string, len(p.Salts))
	for k, v := range p.Salts {
		salts[k] = v
	}
	for _, path := range paths {
		if err := withhold(data, salts, path); err != nil {
			return nil, err
		}
	}
	copy := map[string]any{
		"schema_version": SchemaVersion,
		"pack_id":        p.PackID,
		"profile":        r.Profile,
		"prepared_for":   r.PreparedFor,
		"purpose":        r.Purpose,
		"generated_at":   now.UTC().Format(time.RFC3339),
		"data":           data,
		"salts":          toAny(salts),
	}
	b, err := Canon(copy)
	if err != nil {
		return nil, err
	}
	copy["integrity"] = map[string]any{
		"sig_alg":         "ES256, detached JWS",
		"key_id":          p.KID,
		"signature":       p.JWS,
		"tsa":             nil, // RFC 3161 timestamp: follow-up change
		"ts_time":         nil,
		"ts_serial":       nil,
		"anchor_root":     nil, // Merkle anchor: follow-up change
		"anchor_tx":       nil,
		"prev_pack_hash":  p.PrevPackHash,
		"master_root":     p.MasterRoot,
		"evidence_root":   p.EvidenceRoot,
		"projection_hash": SHA(b),
	}
	return copy, nil
}

// withhold replaces the subtree at a dotted path with its hash. A path absent from this pack is skipped.
func withhold(data map[string]any, salts map[string]string, path string) error {
	parts := strings.Split(path, ".")
	parent := data
	for _, k := range parts[:len(parts)-1] {
		next, ok := parent[k].(map[string]any)
		if !ok {
			return nil
		}
		parent = next
	}
	last := parts[len(parts)-1]
	v, ok := parent[last]
	if !ok {
		return nil
	}
	h, err := NodeHash(v, salts, path)
	if err != nil {
		return err
	}
	parent[last] = map[string]any{"$withheld": h}
	for k := range salts {
		if k == path || strings.HasPrefix(k, path+".") {
			delete(salts, k)
		}
	}
	return nil
}

func deepCopy(v any) any {
	switch x := v.(type) {
	case map[string]any:
		m := make(map[string]any, len(x))
		for k, c := range x {
			m[k] = deepCopy(c)
		}
		return m
	case []any:
		l := make([]any, len(x))
		for i, c := range x {
			l[i] = deepCopy(c)
		}
		return l
	default:
		return v
	}
}

func toAny(m map[string]string) map[string]any {
	out := make(map[string]any, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}
