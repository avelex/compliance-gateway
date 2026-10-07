package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"

	"compliance-backend/internal/decision"
	"compliance-backend/internal/pipeline/pipelinetest"
)

type client struct {
	t   *testing.T
	srv *httptest.Server
}

func (c client) do(method, path string, body any, token string) (int, map[string]any) {
	c.t.Helper()
	var r io.Reader
	switch b := body.(type) {
	case nil:
	case []byte:
		r = bytes.NewReader(b)
	default:
		raw, _ := json.Marshal(b)
		r = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(method, c.srv.URL+path, r)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	var out map[string]any
	json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

const token = "test-token"

func setup(t *testing.T) (*pipelinetest.Fixture, client) {
	f := pipelinetest.New(t)
	s := &Server{P: f.P, Token: token, Health: func() map[string]any { return map[string]any{"db": "ok"} }}
	srv := httptest.NewServer(s.Handler())
	t.Cleanup(srv.Close)
	return f, client{t, srv}
}

func TestAuthRequired(t *testing.T) {
	_, c := setup(t)
	if code, _ := c.do("GET", "/v1/cases", nil, ""); code != 401 {
		t.Fatalf("no token: %d", code)
	}
	if code, _ := c.do("GET", "/v1/cases", nil, "wrong"); code != 401 {
		t.Fatalf("wrong token: %d", code)
	}
	if code, _ := c.do("GET", "/healthz", nil, ""); code != 200 {
		t.Fatalf("healthz: %d", code)
	}
}

func TestRulesetImportAndApproval(t *testing.T) {
	f, c := setup(t)
	raw, _ := os.ReadFile("../../rulesets/2026.10-1.json")
	code, out := c.do("POST", "/v1/rulesets?effective_from=2026-01-01T00:00:00Z", raw, token)
	if code != 201 || out["ruleset_hash"] == "" {
		t.Fatalf("import: %d %v", code, out)
	}
	td := out["approval_typed_data"].(map[string]any)
	k, _ := crypto.GenerateKey()
	stranger := pipelinetest.SignTypedJSON(t, decision.NewKeySigner(k), td)
	if code, _ := c.do("POST", "/v1/rulesets/2026.10-1/approve", map[string]any{"effective_from": "2026-01-01T00:00:00Z",
		"signature": hexutil.Encode(stranger)}, token); code != 403 {
		t.Fatalf("non-MLRO approval: %d", code)
	}
	sig := pipelinetest.SignTypedJSON(t, f.MLRO, td)
	code, out = c.do("POST", "/v1/rulesets/2026.10-1/approve", map[string]any{"effective_from": "2026-01-01T00:00:00Z",
		"signature": hexutil.Encode(sig)}, token)
	if code != 200 || out["approved_by"] != f.MLRO.Address().Hex() {
		t.Fatalf("approve: %d %v", code, out)
	}
	if code, _ := c.do("POST", "/v1/rulesets/2026.10-1/approve", map[string]any{"effective_from": "2026-01-01T00:00:00Z",
		"signature": hexutil.Encode(sig)}, token); code != 409 {
		t.Fatalf("second approval: %d", code)
	}
	if code, _ := c.do("POST", "/v1/rulesets", []byte(`{"version":"x","rules":[{"id":"A","when":[{"field":"kyt.score","op":"eq","value":"1"}],"recommend":"HOLD","reasons":["R"]}]}`), token); code != 400 {
		t.Fatalf("invalid ruleset: %d", code)
	}
}

func TestOfficerFreezeThroughAPI(t *testing.T) {
	f, c := setup(t)
	f.ApproveExample(t)
	risky := f.Deposit(t, f.Risky, 30_000_000, "confirmed", 1) // auto HOLD, then a case
	f.Tick(t)

	code, out := c.do("GET", "/v1/cases", nil, token)
	cases := out["cases"].([]any)
	if code != 200 || len(cases) != 1 || cases[0].(map[string]any)["payment_ref"] != risky.Hex() {
		t.Fatalf("cases: %d %v", code, out)
	}
	ref := risky.Hex()
	code, td := c.do("GET", "/v1/payments/"+ref+"/typed-data?decision=FREEZE", nil, token)
	if code != 200 {
		t.Fatalf("typed data: %d %v", code, td)
	}

	k, _ := crypto.GenerateKey()
	forged := pipelinetest.SignTypedJSON(t, decision.NewKeySigner(k), td)
	if code, _ := c.do("POST", "/v1/payments/"+ref+"/decisions", map[string]any{"decision": "FREEZE",
		"signature": hexutil.Encode(forged), "rationale": "x"}, token); code != 403 {
		t.Fatalf("forged signature: %d", code)
	}

	sig := pipelinetest.SignTypedJSON(t, f.Officer, td)
	code, out = c.do("POST", "/v1/payments/"+ref+"/decisions", map[string]any{"decision": "FREEZE",
		"signature": hexutil.Encode(sig), "rationale": "Funds traced to a mixer"}, token)
	if code != 201 || out["pack_version"] != float64(2) {
		t.Fatalf("freeze: %d %v", code, out)
	}
	packID := out["pack_id"].(string)

	_, detail := c.do("GET", "/v1/payments/"+ref, nil, token)
	ds := detail["decisions"].([]any)
	if len(ds) != 2 || ds[0].(map[string]any)["pack_hash"] != ds[1].(map[string]any)["pack_hash"] {
		t.Fatalf("decisions: %v", ds)
	}
	if code, _ := c.do("GET", "/v1/payments/"+ref+"/typed-data?decision=RETURN", nil, token); code != 409 {
		t.Fatalf("RETURN after FREEZE: %d", code)
	}

	code, proj := c.do("POST", "/v1/packs/"+packID+"/projections", map[string]any{"profile": "OFF_RAMP",
		"prepared_for": "Example Exchange", "purpose": "Source-of-funds request"}, token)
	if code != 201 || proj["profile"] != "OFF_RAMP" || proj["prepared_for"] != "Example Exchange" {
		t.Fatalf("projection: %d %v", code, proj)
	}
	var who, why, hash string
	f.P.St.QueryRow(context.Background(), `SELECT prepared_for, purpose, projection_hash FROM projection WHERE pack_id = $1::uuid`, packID).Scan(&who, &why, &hash)
	if who != "Example Exchange" || why != "Source-of-funds request" || hash != proj["integrity"].(map[string]any)["projection_hash"] {
		t.Fatalf("projection log: %q %q %q", who, why, hash)
	}
	if code, _ := c.do("POST", "/v1/packs/"+packID+"/projections", map[string]any{"profile": "PRESS", "prepared_for": "x", "purpose": "y"}, token); code != 400 {
		t.Fatalf("unknown profile: %d", code)
	}
	if code, _ := c.do("GET", "/v1/payments/0x1234", nil, token); code != 400 {
		t.Fatalf("bad ref: %d", code)
	}
	if code, _ := c.do("GET", "/v1/payments/"+common.Hash{9}.Hex(), nil, token); code != 404 {
		t.Fatalf("unknown payment: %d", code)
	}
}
