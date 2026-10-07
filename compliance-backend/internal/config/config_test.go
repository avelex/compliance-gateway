package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestExampleConfigLoads(t *testing.T) {
	c, err := Load("../../config.example.json")
	if err != nil {
		t.Fatal(err)
	}
	if c.Chains[0].Confirmations == 0 || c.CheckTimeout.Seconds() != 10 {
		t.Fatalf("unexpected defaults: %+v", c)
	}
}

func TestInvalidConfigNamesEveryProblem(t *testing.T) {
	_, err := Load(write(t, `{"chains":[{"chain_id":1,"tokens":[{"symbol":"USDC","eur_rate":"abc"}]}],"officers":[{"mask":16}]}`))
	if err == nil {
		t.Fatal("expected error")
	}
	for _, want := range []string{"database_url is required", "chains[0].rpc is required",
		`eur_rate "abc" is not a positive decimal`, "officers[0].mask 16 must be 1..15", "at least one mlro"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not mention %q", err, want)
		}
	}
}

func TestUnknownFieldRejected(t *testing.T) {
	_, err := Load(write(t, `{"databse_url":"x"}`))
	if err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("want unknown field error, got %v", err)
	}
}
