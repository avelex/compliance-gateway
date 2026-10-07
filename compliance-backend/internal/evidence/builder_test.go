package evidence

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"testing"
)

func testSigner(t *testing.T) *JWSSigner {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return NewJWSSigner(k, "test-kid")
}

func sections() map[string]any {
	return map[string]any{
		"pack_id": "11111111-2222-4333-8444-555555555555", "payment_ref": "0xabc",
		"onchain":          map[string]any{"chain_id": 84532, "amount": "100.00", "token": "USDC"},
		"travel_rule":      map[string]any{"completeness": "NOT_COLLECTED"},
		"wallet_ownership": map[string]any{"required": false, "result": "NOT_COLLECTED"},
		"kyt":              map[string]any{"risk_level": "LOW", "alerts": []any{}},
		"sanctions":        map[string]any{"result": "NO_MATCH", "lists": []any{}},
		"structuring":      map[string]any{"result": "PASS"},
		"issuer":           map[string]any{"result": "NOT_LISTED"},
		"rules":            map[string]any{"rules_version": "v1"},
	}
}

func rest(decisions ...string) map[string]any {
	tl := []any{}
	for _, d := range decisions {
		tl = append(tl, map[string]any{"event": "Decision " + d})
	}
	return map[string]any{
		"timeline": map[string]any{"onchain": []any{}, "offchain": tl},
		"decision": map[string]any{"decision": decisions[len(decisions)-1]},
	}
}

func TestPackVersionsKeepEvidenceRootAndChain(t *testing.T) {
	s := testSigner(t)
	snap, err := NewSnapshot(sections())
	if err != nil {
		t.Fatal(err)
	}
	v1, err := BuildPack(snap, 1, rest("HOLD"), nil, ZeroHash, s)
	if err != nil {
		t.Fatal(err)
	}
	v2, err := BuildPack(snap, 2, rest("HOLD", "FREEZE"), v1.Salts, v1.PackHash, s)
	if err != nil {
		t.Fatal(err)
	}
	if v1.EvidenceRoot != snap.EvidenceRoot || v2.EvidenceRoot != snap.EvidenceRoot {
		t.Fatal("evidence root changed across versions")
	}
	if v1.MasterRoot == v2.MasterRoot {
		t.Fatal("master root did not change with the new decision")
	}
	if v1.Salts["timeline.offchain.0.event"] != v2.Salts["timeline.offchain.0.event"] {
		t.Fatal("salt of an unchanged path was not reused")
	}
	if v2.PrevPackHash != v1.PackHash {
		t.Fatal("journal does not chain")
	}
	if h, _ := PackHash(v1.PrevPackHash, v1.MasterRoot); h != v1.PackHash {
		t.Fatal("pack hash not reproducible")
	}
	if v2.Data["pack_version"] != "2" || v2.Data["schema_version"] != SchemaVersion {
		t.Fatalf("header fields: %v %v", v2.Data["pack_version"], v2.Data["schema_version"])
	}
}

func TestJWSVerifiesOverCanonicalData(t *testing.T) {
	s := testSigner(t)
	snap, _ := NewSnapshot(sections())
	p, err := BuildPack(snap, 1, rest("CREDIT"), nil, ZeroHash, s)
	if err != nil {
		t.Fatal(err)
	}
	payload, _ := Canon(p.Data)
	if err := VerifyJWS(s.Public(), p.JWS, payload); err != nil {
		t.Fatal(err)
	}
	payload[len(payload)-2] ^= 1
	if VerifyJWS(s.Public(), p.JWS, payload) == nil {
		t.Fatal("tampered data verified")
	}
}

func TestSnapshotRejectsMissingOrExtraSection(t *testing.T) {
	s := sections()
	delete(s, "kyt")
	if _, err := NewSnapshot(s); err == nil {
		t.Fatal("missing kyt accepted")
	}
	s = sections()
	s["decision"] = map[string]any{}
	if _, err := NewSnapshot(s); err == nil {
		t.Fatal("non-evidence key accepted")
	}
}
