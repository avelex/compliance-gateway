package pipeline_test

import (
	"context"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"

	"compliance-backend/internal/decision"
	"compliance-backend/internal/evidence"
	"compliance-backend/internal/pipeline/pipelinetest"
)

func TestPipelineOutcomes(t *testing.T) {
	f := pipelinetest.New(t)
	f.ApproveExample(t)
	clean := f.Deposit(t, common.HexToAddress("0xc1"), 120_000_000, "confirmed", 1)
	sanctioned := f.Deposit(t, f.Sanctioned, 50_000_000, "confirmed", 2)
	orphan := f.Deposit(t, common.HexToAddress("0xc3"), 10_000_000, "orphaned", 3)
	seen := f.Deposit(t, common.HexToAddress("0xc4"), 10_000_000, "seen", 4)
	f.Tick(t)

	if f.Stage(t, clean) != "decided" || f.Count(t, "pack", clean) != 1 {
		t.Fatalf("clean payment: stage %s, packs %d", f.Stage(t, clean), f.Count(t, "pack", clean))
	}
	ctx := context.Background()
	var kind int16
	var mode string
	f.P.St.QueryRow(ctx, `SELECT decision, mode FROM decision WHERE payment_id = $1`, clean.Bytes()).Scan(&kind, &mode)
	if uint8(kind) != decision.Credit || mode != "AUTO_BY_POLICY" {
		t.Fatalf("clean decision %d %s", kind, mode)
	}
	if f.Stage(t, sanctioned) != "in_review" || f.Count(t, "decision", sanctioned) != 0 || f.Count(t, "pack", sanctioned) != 0 {
		t.Fatal("sanctions hit must open a case with no automatic decision")
	}
	if f.Count(t, "check_result", orphan) != 0 || f.Count(t, "pack", orphan) != 0 {
		t.Fatal("orphaned payment was processed")
	}
	if f.Stage(t, seen) != "checks_done" || f.Count(t, "recommendation", seen) != 0 {
		t.Fatalf("seen payment: checks may run, nothing more (stage %s)", f.Stage(t, seen))
	}
	cases, _ := f.P.Cases(ctx)
	if len(cases) != 1 || cases[0].PaymentRef != sanctioned.Hex() || cases[0].Recommendation != "FREEZE" {
		t.Fatalf("cases %+v", cases)
	}

	// The issued pack verifies from what is stored.
	var packID string
	f.P.St.QueryRow(ctx, `SELECT pack_id::text FROM pack WHERE payment_id = $1`, clean.Bytes()).Scan(&packID)
	pk, err := f.P.LoadPack(ctx, packID, 0)
	if err != nil {
		t.Fatal(err)
	}
	payload, _ := evidence.Canon(pk.Data)
	if err := evidence.VerifyJWS(f.P.Evidence.Public(), pk.JWS, payload); err != nil {
		t.Fatal(err)
	}
	if m, _ := evidence.MasterRoot(pk.Data, pk.Salts); m != pk.MasterRoot {
		t.Fatal("stored master root does not recompute")
	}
	dec := pk.Data["decision"].(map[string]any)
	if dec["pack_hash"] != pk.EvidenceRoot || dec["execution_tx"] != "n/a, executed by the processor outside Deflow" {
		t.Fatalf("decision section: %v", dec)
	}
	if tr := pk.Data["travel_rule"].(map[string]any); tr["completeness"] != "NOT_COLLECTED" {
		t.Fatal("mode (b) travel rule section")
	}
	if oc := pk.Data["onchain"].(map[string]any); oc["deposit_contract"] != pipelinetest.DepositAddress.Hex() || oc["amount_eur"] != "110.40" {
		t.Fatalf("onchain section: %v", oc)
	}
}

func TestNoRulesetOpensCase(t *testing.T) {
	f := pipelinetest.New(t)
	id := f.Deposit(t, common.HexToAddress("0xc1"), 1_000_000, "confirmed", 1)
	f.Tick(t)
	var reasons []string
	f.P.St.QueryRow(context.Background(), `SELECT reason_codes FROM recommendation WHERE payment_id = $1`, id.Bytes()).Scan(&reasons)
	if f.Stage(t, id) != "in_review" || len(reasons) != 1 || reasons[0] != "NO_RULESET" || f.Count(t, "decision", id) != 0 {
		t.Fatalf("stage %s reasons %v", f.Stage(t, id), reasons)
	}
}

func TestAutoHoldThenOfficerFreeze(t *testing.T) {
	f := pipelinetest.New(t)
	f.ApproveExample(t)
	id := f.Deposit(t, f.Risky, 30_000_000, "confirmed", 1)
	f.Tick(t)
	if f.Stage(t, id) != "in_review" || f.Count(t, "pack", id) != 1 {
		t.Fatal("auto HOLD should issue pack v1 and leave a case")
	}
	ctx := context.Background()
	doc, err := f.P.OfficerTypedData(ctx, id, decision.Freeze)
	if err != nil {
		t.Fatal(err)
	}
	sig := pipelinetest.SignTypedJSON(t, f.Officer, doc)
	packID, version, err := f.P.OfficerDecide(ctx, id, decision.Freeze, sig, "Funds traced to a mixer; FIU informed")
	if err != nil {
		t.Fatal(err)
	}
	if version != 2 || f.Stage(t, id) != "decided" {
		t.Fatalf("version %d stage %s", version, f.Stage(t, id))
	}
	v1, _ := f.P.LoadPack(ctx, packID, 1)
	v2, _ := f.P.LoadPack(ctx, packID, 2)
	if v1.EvidenceRoot != v2.EvidenceRoot || v2.PrevPackHash != v1.PackHash {
		t.Fatal("v2 must keep the evidence root and chain to v1")
	}
	if d := v2.Data["decision"].(map[string]any); d["decision"] != "FREEZE" || d["officer_id"] != "officer-01" || d["return_blocked"] != true {
		t.Fatalf("v2 decision: %v", d)
	}
	var hashes []string
	rows, _ := f.P.St.Query(ctx, `SELECT pack_hash FROM decision WHERE payment_id = $1 ORDER BY nonce`, id.Bytes())
	for rows.Next() {
		var h string
		rows.Scan(&h)
		hashes = append(hashes, h)
	}
	rows.Close()
	if len(hashes) != 2 || hashes[0] != hashes[1] || hashes[0] != v1.EvidenceRoot {
		t.Fatalf("both decisions must sign the same evidence root: %v", hashes)
	}

	// RETURN after FREEZE is refused before anything is signed.
	if _, err := f.P.OfficerTypedData(ctx, id, decision.Return); err == nil {
		t.Fatal("RETURN after FREEZE accepted")
	}
}

func TestForgedOfficerSignatureRejected(t *testing.T) {
	f := pipelinetest.New(t)
	f.ApproveExample(t)
	id := f.Deposit(t, f.Sanctioned, 1_000_000, "confirmed", 1)
	f.Tick(t)
	doc, _ := f.P.OfficerTypedData(context.Background(), id, decision.Freeze)
	k, _ := crypto.GenerateKey()
	sig := pipelinetest.SignTypedJSON(t, decision.NewKeySigner(k), doc)
	if _, _, err := f.P.OfficerDecide(context.Background(), id, decision.Freeze, sig, "x"); err == nil {
		t.Fatal("signature by a stranger accepted")
	}
	if f.Count(t, "decision", id) != 0 {
		t.Fatal("decision recorded")
	}
}
