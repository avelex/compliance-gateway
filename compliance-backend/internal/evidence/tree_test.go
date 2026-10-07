package evidence

import (
	"os"
	"path/filepath"
	"testing"
)

func load(t *testing.T, path string) map[string]any {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var v map[string]any
	if err := Decode(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func saltsOf(copy map[string]any) map[string]string {
	s := map[string]string{}
	for k, v := range copy["salts"].(map[string]any) {
		s[k] = v.(string)
	}
	return s
}

func roots(t *testing.T, copy map[string]any) (master, evidence, projection string) {
	t.Helper()
	data := copy["data"].(map[string]any)
	salts := saltsOf(copy)
	var err error
	if master, err = MasterRoot(data, salts); err != nil {
		t.Fatal(err)
	}
	if evidence, err = EvidenceRoot(data, salts); err != nil {
		t.Fatal(err)
	}
	b, err := Canon(copy)
	if err != nil {
		t.Fatal(err)
	}
	return master, evidence, SHA(b)
}

func TestSpecimensReproduce(t *testing.T) {
	files, _ := filepath.Glob("testdata/passport_*.json")
	if len(files) != 2 {
		t.Fatalf("want 2 specimens, got %d", len(files))
	}
	for _, f := range files {
		copy := load(t, f)
		integ := copy["integrity"].(map[string]any)
		delete(copy, "integrity")
		m, e, p := roots(t, copy)
		if m != integ["master_root"] || e != integ["evidence_root"] || p != integ["projection_hash"] {
			t.Errorf("%s: got %s %s %s, want %v %v %v", f, m, e, p, integ["master_root"], integ["evidence_root"], integ["projection_hash"])
		}
	}
}

// Expected values come from verify_pack.py's own functions (spike vectors.py roots).
func TestEdgeVectorsMatchVerifier(t *testing.T) {
	want := load(t, "testdata/edge-roots.json")
	for name, w := range want {
		m, e, p := roots(t, load(t, filepath.Join("testdata", name)))
		wm := w.(map[string]any)
		if m != wm["master_root"] || e != wm["evidence_root"] || p != wm["projection_hash"] {
			t.Errorf("%s: got %s %s %s, want %v", name, m, e, p, wm)
		}
	}
}

func TestFloatRejected(t *testing.T) {
	var v map[string]any
	Decode([]byte(`{"amount":0.5}`), &v)
	if _, err := Canon(v); err == nil {
		t.Fatal("json number 0.5 accepted")
	}
	if _, err := Canon(map[string]any{"amount": 0.5}); err == nil {
		t.Fatal("float64 accepted")
	}
}

func TestSaltKeepsExistingAndCoversEmptyContainers(t *testing.T) {
	data := map[string]any{"a": "x", "b": []any{}, "c": map[string]any{"d": map[string]any{}}}
	salts := map[string]string{"a": "00"}
	Salt(data, salts, "")
	if salts["a"] != "00" {
		t.Fatal("existing salt replaced")
	}
	for _, p := range []string{"b", "c.d"} {
		if len(salts[p]) != 64 {
			t.Errorf("no fresh salt for %s", p)
		}
	}
	if _, err := MasterRoot(data, salts); err != nil {
		t.Fatal(err)
	}
}
