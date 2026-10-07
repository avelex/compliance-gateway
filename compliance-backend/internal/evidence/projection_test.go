package evidence

import (
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"
)

// specimenPack turns specimen B (FIU_SUPERVISOR: nothing withheld) back into a master pack.
func specimenPack(t *testing.T) *Pack {
	t.Helper()
	b := load(t, "testdata/passport_f2a90c4d_FIU_SUPERVISOR.json")
	integ := b["integrity"].(map[string]any)
	return &Pack{
		PackID: b["pack_id"].(string), Data: b["data"].(map[string]any), Salts: saltsOf(b),
		MasterRoot: integ["master_root"].(string), EvidenceRoot: integ["evidence_root"].(string),
		JWS: integ["signature"].(string), KID: integ["key_id"].(string), PrevPackHash: integ["prev_pack_hash"].(string),
	}
}

func withheldPaths(v any, path string, out *[]string) {
	if _, ok := isWithheld(v); ok {
		*out = append(*out, path)
		return
	}
	if m, ok := v.(map[string]any); ok {
		for k, c := range m {
			withheldPaths(c, join(path, k), out)
		}
	}
}

func TestOffRampProjectionMatchesSpecimenAndKeepsRoots(t *testing.T) {
	p := specimenPack(t)
	copy, err := Project(p, Recipient{"OFF_RAMP", "Example Exchange", "Source-of-funds request"}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	withheldPaths(copy["data"], "", &got)
	sort.Strings(got)

	var want []string
	a := load(t, "testdata/passport_8c1e6f2a_OFF_RAMP.json")
	withheldPaths(a["data"], "", &want)
	sort.Strings(want)
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("withheld paths differ from specimen A:\n got %v\nwant %v", got, want)
	}

	integ := copy["integrity"].(map[string]any)
	delete(copy, "integrity")
	m, e, ph := roots(t, copy)
	if m != p.MasterRoot || e != p.EvidenceRoot || ph != integ["projection_hash"] {
		t.Fatalf("roots changed: %s %s %s", m, e, ph)
	}
	for k := range copy["salts"].(map[string]any) {
		if strings.HasPrefix(k, "structuring.features") {
			t.Fatalf("salt %s of a withheld path leaked", k)
		}
	}
}

func TestMasterWithholdsNothingAndUnknownProfileFails(t *testing.T) {
	p := specimenPack(t)
	copy, err := Project(p, Recipient{"MASTER", "Processor archive", "Retention"}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	withheldPaths(copy["data"], "", &got)
	if len(got) != 0 {
		t.Fatalf("MASTER withheld %v", got)
	}
	if _, err := Project(p, Recipient{"PRESS", "x", "y"}, time.Now()); err == nil {
		t.Fatal("unknown profile accepted")
	}
}

// The published verifier must accept what the service issues.
func TestVerifierAcceptsProjectionJSON(t *testing.T) {
	py, err := exec.LookPath("python3")
	if err != nil {
		t.Skip("python3 not installed")
	}
	p := specimenPack(t)
	for _, profile := range []string{"OFF_RAMP", "BANK", "AUDITOR", "FIU_SUPERVISOR"} {
		copy, err := Project(p, Recipient{profile, "Recipient", "Test"}, time.Now())
		if err != nil {
			t.Fatal(err)
		}
		b, _ := Canon(copy)
		f := filepath.Join(t.TempDir(), "passport_"+profile+".json")
		os.WriteFile(f, b, 0o600)
		out, err := exec.Command(py, "-B", "../../../docs/evidence-pack/verify_pack.py", f).CombinedOutput()
		if err != nil || strings.Contains(string(out), "FAIL") {
			t.Fatalf("%s: verify_pack.py: %v\n%s", profile, err, out)
		}
	}
}
