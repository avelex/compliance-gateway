package rules

import (
	"os"
	"strings"
	"testing"
)

func example(t *testing.T) *Ruleset {
	raw, err := os.ReadFile("../../rulesets/2026.10-1.json")
	if err != nil {
		t.Fatal(err)
	}
	rs, _, _, err := Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return rs
}

var clean = Inputs{KYT: "LOW", Sanctions: "NO_MATCH", Structuring: "PASS", Issuer: "NOT_LISTED", AmountEUR: "120.00"}

func TestRejectsUnknownFieldAndMissingDefault(t *testing.T) {
	_, _, _, err := Parse([]byte(`{"version":"x","rules":[{"id":"A","when":[{"field":"kyt.score","op":"gte","value":"5"}],"recommend":"HOLD","reasons":["R"]},{"id":"D","when":[],"recommend":"CREDIT","reasons":["C"]}]}`))
	if err == nil || !strings.Contains(err.Error(), `unknown field "kyt.score"`) {
		t.Fatalf("unknown field: %v", err)
	}
	_, _, _, err = Parse([]byte(`{"version":"x","rules":[{"id":"A","when":[{"field":"issuer.result","op":"eq","value":"LISTED"}],"recommend":"HOLD","reasons":["R"]}]}`))
	if err == nil || !strings.Contains(err.Error(), "must have no conditions") {
		t.Fatalf("missing default: %v", err)
	}
	_, _, _, err = Parse([]byte(`{"version":"x","rules":[{"id":"D","when":[],"recommend":"MAYBE","reasons":["C"]}],"extra":1}`))
	if err == nil {
		t.Fatal("unknown top-level key accepted")
	}
}

func TestFirstMatchWins(t *testing.T) {
	rs := example(t)
	in := clean
	in.Sanctions, in.KYT = "TRUE_MATCH", "SEVERE"
	if r := rs.Recommend(in); r.Recommendation != "FREEZE" || r.RuleID != "SANC-01" || r.Auto {
		t.Fatalf("got %+v", r)
	}
	in.AnyUnavailable = true
	if r := rs.Recommend(in); r.Recommendation != "HOLD" || r.PolicyRef != "2026.10-1/UNAV-01" {
		t.Fatalf("unavailable first: %+v", r)
	}
	if r := rs.Recommend(clean); r.Recommendation != "CREDIT" || !r.Auto {
		t.Fatalf("clean: %+v", r)
	}
}

func TestAmountEURGteOnDecimals(t *testing.T) {
	rs, _, _, err := Parse([]byte(`{"version":"v","rules":[{"id":"BIG","when":[{"field":"amount_eur","op":"gte","value":"1000.00"}],"recommend":"HOLD","reasons":["LARGE"]},{"id":"D","when":[],"recommend":"CREDIT","reasons":["C"],"auto":true}]}`))
	if err != nil {
		t.Fatal(err)
	}
	for amt, want := range map[string]string{"999.99": "CREDIT", "1000.00": "HOLD", "1000": "HOLD", "25000.10": "HOLD"} {
		in := clean
		in.AmountEUR = amt
		if got := rs.Recommend(in).Recommendation; got != want {
			t.Errorf("%s -> %s, want %s", amt, got, want)
		}
	}
	if _, _, _, err := Parse([]byte(`{"version":"v","rules":[{"id":"BIG","when":[{"field":"amount_eur","op":"gte","value":1000.5}],"recommend":"HOLD","reasons":["L"]},{"id":"D","when":[],"recommend":"CREDIT","reasons":["C"]}]}`)); err == nil {
		t.Fatal("numeric amount threshold accepted; it must be a decimal string")
	}
}

func TestReplayIsIdentical(t *testing.T) {
	raw, _ := os.ReadFile("../../rulesets/2026.10-1.json")
	rs1, c1, h1, _ := Parse(raw)
	rs2, c2, h2, _ := Parse(c1) // re-parsing the stored canonical form
	if string(c1) != string(c2) || h1 != h2 {
		t.Fatal("canonical form or hash not stable")
	}
	in := clean
	in.Structuring = "FLAG"
	a, b := rs1.Recommend(in), rs2.Recommend(in)
	if a.Recommendation != b.Recommendation || strings.Join(a.Reasons, ",") != strings.Join(b.Reasons, ",") || in.Hash() != in.Hash() {
		t.Fatal("replay differs")
	}
	if !strings.HasPrefix(EngineVersion(), "deflow-core@") {
		t.Fatal(EngineVersion())
	}
}
