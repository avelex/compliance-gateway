//go:build e2e

// End-to-end run of the service against the dev stack (docker compose up -d):
//
//	DATABASE_URL=postgres://deflow:deflow@127.0.0.1:5432/deflow?sslmode=disable \
//	ANVIL_URL=http://127.0.0.1:8545 NATS_URL=nats://127.0.0.1:4222 go test -tags e2e ./e2e
package e2e

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/common/hexutil"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"

	"compliance-backend/internal/app"
	"compliance-backend/internal/config"
	"compliance-backend/internal/decision"
	"compliance-backend/internal/ingest"
	"compliance-backend/internal/store/storetest"
	"compliance-backend/internal/testchain"
)

const apiToken = "e2e-token"

type service struct {
	t    *testing.T
	base string
	stop func()
}

func start(t *testing.T, cfg *config.Config) *service {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	ready := make(chan string, 1)
	done := make(chan error, 1)
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	if os.Getenv("E2E_LOG") != "" {
		log = slog.New(slog.NewTextHandler(os.Stderr, nil))
	}
	go func() { done <- app.Run(ctx, cfg, log, ready) }()
	var addr string
	select {
	case addr = <-ready:
	case err := <-done:
		t.Fatalf("service did not start: %v", err)
	}
	s := &service{t: t, base: "http://" + addr, stop: func() {
		cancel()
		if err := <-done; err != nil {
			t.Errorf("service stopped with %v", err)
		}
	}}
	return s
}

func (s *service) call(method, path string, body any) (int, []byte) {
	s.t.Helper()
	var r io.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		r = bytes.NewReader(raw)
	}
	req, _ := http.NewRequest(method, s.base+path, r)
	req.Header.Set("Authorization", "Bearer "+apiToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		s.t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, b
}

func (s *service) json(method, path string, body any) map[string]any {
	s.t.Helper()
	code, b := s.call(method, path, body)
	if code >= 300 {
		s.t.Fatalf("%s %s: %d %s", method, path, code, b)
	}
	var out map[string]any
	json.Unmarshal(b, &out)
	return out
}

func waitFor(t *testing.T, what string, d time.Duration, cond func() bool) {
	t.Helper()
	for deadline := time.Now().Add(d); time.Now().Before(deadline); time.Sleep(250 * time.Millisecond) {
		if cond() {
			return
		}
	}
	t.Fatalf("timed out waiting for %s", what)
}

func signTyped(t *testing.T, key *ecdsa.PrivateKey, doc map[string]any) string {
	raw, _ := json.Marshal(doc)
	var td apitypes.TypedData
	if err := json.Unmarshal(raw, &td); err != nil {
		t.Fatal(err)
	}
	d, err := decision.Digest(td)
	if err != nil {
		t.Fatal(err)
	}
	sig, _ := decision.NewKeySigner(key).Sign(d)
	return hexutil.Encode(sig)
}

func writeKeys(t *testing.T, dir string) (policyFile, evidenceFile string) {
	pk, _ := crypto.GenerateKey()
	policyFile = filepath.Join(dir, "policy.hex")
	os.WriteFile(policyFile, []byte(common.Bytes2Hex(crypto.FromECDSA(pk))), 0o600)
	ek, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	der, _ := x509.MarshalPKCS8PrivateKey(ek)
	evidenceFile = filepath.Join(dir, "evidence.pem")
	os.WriteFile(evidenceFile, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}), 0o600)
	return
}

func TestEndToEnd(t *testing.T) {
	if os.Getenv("NATS_URL") == "" {
		t.Skip("NATS_URL not set")
	}
	dbURL := os.Getenv("DATABASE_URL")
	_ = storetest.URL(t)
	st := storetest.New(t) // a fresh database; the service connects to it by URL
	var dbName string
	st.QueryRow(context.Background(), `SELECT current_database()`).Scan(&dbName)
	dbURL = strings.Replace(dbURL, "/deflow?", "/"+dbName+"?", 1)

	chain := testchain.Dial(t)
	chain.PlaceToken(testchain.MUSD, "MockStable")
	goplus := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"code":1,"result":{"mixer":"0"}}`))
	}))
	defer goplus.Close()

	dir := t.TempDir()
	clean, sanctioned, listed := testchain.RandomAddress(), testchain.RandomAddress(), testchain.RandomAddress()
	sanctionsFile := filepath.Join(dir, "ofac.txt")
	os.WriteFile(sanctionsFile, []byte("# e2e list\n"+sanctioned.Hex()+"\n"), 0o600)
	policyFile, evidenceFile := writeKeys(t, dir)
	officerKey, _ := crypto.GenerateKey()
	mlroKey, _ := crypto.GenerateKey()
	deposit := testchain.RandomAddress()

	cfg := &config.Config{
		DatabaseURL: dbURL, Listen: "127.0.0.1:0", APIToken: apiToken, DataDir: dir, NATSURL: os.Getenv("NATS_URL"),
		Processor: config.Processor{LegalName: "ExamplePay GmbH (fictional)", RFIChannel: "compliance@examplepay.invalid"},
		Chains: []config.Chain{{ChainID: 31337, Name: "anvil", RPC: chain.URL, Confirmations: 30, Chunk: 500,
			ReconcileInterval: config.Duration{Duration: 500 * time.Millisecond}, EventscaleNetwork: "anvil",
			Tokens: []config.Token{{Symbol: "MUSD", Address: testchain.MUSD, Decimals: 6, EventscaleAlias: "MUSD",
				EURRate: "0.92", FXSource: "static reference rate (e2e)"}},
			Deposits: []config.Deposit{{Address: deposit, MerchantID: "m_e2e"}}}},
		Keys:           config.Keys{PolicyKeyFile: policyFile, EvidenceKeyFile: evidenceFile, EvidenceKID: "e2e-evidence"},
		Officers:       []config.Officer{{Address: crypto.PubkeyToAddress(officerKey.PublicKey), OfficerID: "officer-01", Mask: 0x0F}},
		MLRO:           []common.Address{crypto.PubkeyToAddress(mlroKey.PublicKey)},
		Sanctions:      []config.SanctionsList{{Name: "OFAC SDN (e2e)", Version: "2026-10-07", Path: sanctionsFile}},
		KYT:            config.KYT{GoPlusBaseURL: goplus.URL},
		CheckTimeout:   config.Duration{Duration: 5 * time.Second},
		DecisionTTL:    config.Duration{Duration: time.Hour},
		WorkerInterval: config.Duration{Duration: 300 * time.Millisecond},
		RetentionYears: 7,
	}
	if err := cfg.Validate(); err != nil {
		t.Fatal(err)
	}

	svc := start(t, cfg)
	waitFor(t, "healthy with hint and reconciler cursor", 30*time.Second, func() bool {
		h := svc.json("GET", "/healthz", nil)
		lag := h["reconciler_lag_blocks"].(map[string]any)["31337"]
		return h["hint"] == ingest.HintOK && lag != nil
	})

	raw, _ := os.ReadFile("../rulesets/2026.10-1.json")
	code, b := svc.call("POST", "/v1/rulesets?effective_from=2026-01-01T00:00:00Z", json.RawMessage(raw))
	if code != 201 {
		t.Fatalf("ruleset import: %d %s", code, b)
	}
	var imp map[string]any
	json.Unmarshal(b, &imp)
	svc.json("POST", "/v1/rulesets/2026.10-1/approve", map[string]any{"effective_from": "2026-01-01T00:00:00Z",
		"signature": signTyped(t, mlroKey, imp["approval_typed_data"].(map[string]any))})

	chain.Blacklist(testchain.MUSD, listed)
	pay := func(payer common.Address, amount int64) string {
		chain.Mint(testchain.MUSD, payer, big.NewInt(amount))
		tx, logIndex := chain.TransferLog(testchain.MUSD, payer, deposit, big.NewInt(amount))
		return ingest.PaymentID(31337, tx, logIndex).Hex()
	}
	cleanRef, sanctionedRef, listedRef := pay(clean, 120_000_000), pay(sanctioned, 40_000_000), pay(listed, 15_000_000)

	payment := func(ref string) map[string]any {
		code, b := svc.call("GET", "/v1/payments/"+ref, nil)
		if code != 200 {
			return nil
		}
		var out map[string]any
		json.Unmarshal(b, &out)
		return out
	}
	waitFor(t, "hint records the deposit before depth N", 15*time.Second, func() bool {
		p := payment(cleanRef)
		return p != nil && p["ingest"] == "seen"
	})

	chain.Mine(32)
	lastDecision := func(ref string) string {
		p := payment(ref)
		if p == nil {
			return ""
		}
		ds, _ := p["decisions"].([]any)
		if len(ds) == 0 {
			return p["stage"].(string)
		}
		return ds[len(ds)-1].(map[string]any)["decision"].(string)
	}
	waitFor(t, "clean CREDIT, listed HOLD, sanctioned case", 30*time.Second, func() bool {
		return lastDecision(cleanRef) == "CREDIT" && lastDecision(listedRef) == "HOLD" && lastDecision(sanctionedRef) == "in_review"
	})
	cases := svc.json("GET", "/v1/cases", nil)["cases"].([]any)
	recs := map[string]string{}
	for _, c := range cases {
		m := c.(map[string]any)
		recs[m["payment_ref"].(string)] = m["recommendation"].(string)
	}
	if recs[sanctionedRef] != "FREEZE" || recs[listedRef] != "HOLD" {
		t.Fatalf("cases: %v", recs)
	}

	td := svc.json("GET", "/v1/payments/"+sanctionedRef+"/typed-data?decision=FREEZE", nil)
	frozen := svc.json("POST", "/v1/payments/"+sanctionedRef+"/decisions", map[string]any{"decision": "FREEZE",
		"signature": signTyped(t, officerKey, td), "rationale": "Payer on OFAC list"})
	if lastDecision(sanctionedRef) != "FREEZE" || frozen["pack_version"] != float64(1) {
		t.Fatalf("freeze: %v", frozen)
	}

	packs := payment(cleanRef)["packs"].([]any)
	packID := packs[0].(map[string]any)["pack_id"].(string)
	code, proj := svc.call("POST", "/v1/packs/"+packID+"/projections", map[string]any{"profile": "OFF_RAMP",
		"prepared_for": "Example Exchange", "purpose": "Source-of-funds request"})
	if code != 201 {
		t.Fatalf("projection: %d %s", code, proj)
	}
	file := filepath.Join(dir, "passport_"+packID+"_OFF_RAMP.json")
	os.WriteFile(file, proj, 0o600)
	out, err := exec.Command("python3", "-B", "../../docs/evidence-pack/verify_pack.py", file).CombinedOutput()
	if err != nil || strings.Contains(string(out), "FAIL") {
		t.Fatalf("verify_pack.py: %v\n%s", err, out)
	}
	t.Logf("verifier:\n%s", out)

	// Restart: the reconciler cursor and the hint's durable consumer resume; nothing is duplicated.
	var before int
	st.QueryRow(context.Background(), `SELECT count(*) FROM payment`).Scan(&before)
	svc.stop()
	svc = start(t, cfg)
	defer svc.stop()
	waitFor(t, "hint ok after restart", 30*time.Second, func() bool { return svc.json("GET", "/healthz", nil)["hint"] == ingest.HintOK })
	afterRef := pay(clean, 1_000_000)
	waitFor(t, "deposit after restart", 20*time.Second, func() bool { return payment(afterRef) != nil })
	var after int
	st.QueryRow(context.Background(), `SELECT count(*) FROM payment`).Scan(&after)
	if after != before+1 {
		t.Fatalf("payments before restart %d, after one more deposit %d", before, after)
	}
	fmt.Println("e2e ok:", cleanRef, sanctionedRef, listedRef)
}
