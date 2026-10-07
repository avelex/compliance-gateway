package evidence

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strconv"
)

const SchemaVersion = "deflow-evidence/1.0"

// ZeroHash is prev_pack_hash of the first pack in a journal.
var ZeroHash = hex.EncodeToString(make([]byte, 32))

// Snapshot is the evidence part of a pack, fixed when the recommendation is made. Officers sign
// over its EvidenceRoot before any pack exists (design D7).
type Snapshot struct {
	Data         map[string]any // exactly the EvidenceKeys
	Salts        map[string]string
	EvidenceRoot string
}

// NewSnapshot salts the evidence sections and computes their root.
func NewSnapshot(sections map[string]any) (*Snapshot, error) {
	for _, k := range EvidenceKeys {
		if _, ok := sections[k]; !ok {
			return nil, fmt.Errorf("evidence section %q missing", k)
		}
	}
	if len(sections) != len(EvidenceKeys) {
		return nil, fmt.Errorf("snapshot takes only the %d evidence keys", len(EvidenceKeys))
	}
	sections, err := normalize(sections)
	if err != nil {
		return nil, err
	}
	salts := map[string]string{}
	for _, k := range EvidenceKeys {
		Salt(sections[k], salts, k)
	}
	root, err := EvidenceRoot(sections, salts)
	if err != nil {
		return nil, err
	}
	return &Snapshot{Data: sections, Salts: salts, EvidenceRoot: root}, nil
}

// Pack is one issued, signed pack version.
type Pack struct {
	PackID       string
	Version      int
	Data         map[string]any
	Salts        map[string]string
	MasterRoot   string
	EvidenceRoot string
	JWS          string
	KID          string
	PrevPackHash string
	PackHash     string
}

// BuildPack assembles pack version n from the snapshot plus the non-evidence sections (timeline,
// decision, ...). Salts from prevSalts are reused for paths that still exist, so the evidence_root
// stays the snapshot's and unchanged sections keep their hashes; new leaves get fresh salts.
func BuildPack(snap *Snapshot, version int, rest map[string]any, prevSalts map[string]string, prevPackHash string, signer *JWSSigner) (*Pack, error) {
	rest, err := normalize(rest)
	if err != nil {
		return nil, err
	}
	data := make(map[string]any, len(snap.Data)+len(rest)+2)
	for k, v := range rest {
		data[k] = v
	}
	for k, v := range snap.Data { // evidence wins over anything in rest
		data[k] = v
	}
	data["pack_version"] = strconv.Itoa(version)
	data["schema_version"] = SchemaVersion

	payload, err := Canon(data)
	if err != nil {
		return nil, err
	}
	salts := map[string]string{}
	for k, v := range snap.Salts {
		salts[k] = v
	}
	for k, v := range data {
		if _, ev := snap.Data[k]; ev {
			continue
		}
		carry(v, prevSalts, salts, k)
		Salt(v, salts, k)
	}
	master, err := MasterRoot(data, salts)
	if err != nil {
		return nil, err
	}
	evidence, err := EvidenceRoot(data, salts)
	if err != nil {
		return nil, err
	}
	if evidence != snap.EvidenceRoot {
		return nil, fmt.Errorf("evidence root changed: %s != %s", evidence, snap.EvidenceRoot)
	}
	jws, err := signer.Sign(payload)
	if err != nil {
		return nil, err
	}
	ph, err := PackHash(prevPackHash, master)
	if err != nil {
		return nil, err
	}
	packID, _ := snap.Data["pack_id"].(string)
	return &Pack{PackID: packID, Version: version, Data: data, Salts: salts, MasterRoot: master,
		EvidenceRoot: evidence, JWS: jws, KID: signer.KID, PrevPackHash: prevPackHash, PackHash: ph}, nil
}

// normalize gives v the shape it has after a JSON round trip ([]string becomes []any, integers become
// json.Number), so what is hashed in memory is exactly what is stored and later re-verified.
func normalize(v map[string]any) (map[string]any, error) {
	b, err := Canon(v)
	if err != nil {
		return nil, err
	}
	var out map[string]any
	return out, Decode(b, &out)
}

// carry copies prev salts for every leaf path under v that prev already salted.
func carry(v any, prev, out map[string]string, path string) {
	switch x := v.(type) {
	case map[string]any:
		if _, ok := isWithheld(v); !ok && len(x) > 0 {
			for k, c := range x {
				carry(c, prev, out, join(path, k))
			}
			return
		}
	case []any:
		if len(x) > 0 {
			for i, c := range x {
				carry(c, prev, out, join(path, strconv.Itoa(i)))
			}
			return
		}
	}
	if s, ok := prev[path]; ok {
		out[path] = s
	}
}

// PackHash chains the journal: sha256(prev_pack_hash || master_root), both as raw 32 bytes.
func PackHash(prevPackHash, masterRoot string) (string, error) {
	p, err := hex.DecodeString(prevPackHash)
	if err != nil || len(p) != 32 {
		return "", fmt.Errorf("bad prev_pack_hash %q", prevPackHash)
	}
	m, err := hex.DecodeString(masterRoot)
	if err != nil || len(m) != 32 {
		return "", fmt.Errorf("bad master_root %q", masterRoot)
	}
	h := sha256.Sum256(append(p, m...))
	return hex.EncodeToString(h[:]), nil
}
