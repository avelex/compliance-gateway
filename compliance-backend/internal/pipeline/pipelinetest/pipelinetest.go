// Package pipelinetest builds a pipeline with stubbed checks on a throwaway database, for tests of the
// pipeline and the API.
package pipelinetest

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/json"
	"io"
	"log/slog"
	"math/big"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/signer/core/apitypes"

	"compliance-backend/internal/checks"
	"compliance-backend/internal/config"
	"compliance-backend/internal/decision"
	"compliance-backend/internal/evidence"
	"compliance-backend/internal/pipeline"
	"compliance-backend/internal/store/storetest"
)

func root() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "..")
}

var (
	Token          = common.HexToAddress("0x000000000000000000000000000000000000b0b5")
	DepositAddress = common.HexToAddress("0x000000000000000000000000000000000000dEaD")
)

// stub returns a fixed outcome per payer, defaulting to the clean one.
type stub struct {
	kind, clean string
	byPayer     map[common.Address]string
}

func (s stub) Kind() string { return s.kind }
func (s stub) Run(_ context.Context, p checks.Payment) (checks.Result, []byte, error) {
	o := s.clean
	if v, ok := s.byPayer[p.Payer]; ok {
		o = v
	}
	sec := map[string]any{"result": o}
	if s.kind == "kyt" {
		sec = map[string]any{"risk_level": o}
	}
	return checks.Result{Provider: "stub", Product: "stub", Outcome: o, Section: sec}, []byte(`{"stub":true}`), nil
}

// Fixture is a pipeline on a throwaway database with stubbed checks: Sanctioned gets TRUE_MATCH, Risky gets KYT HIGH.
type Fixture struct {
	P          *pipeline.Pipeline
	MLRO       *decision.KeySigner
	Officer    *decision.KeySigner
	Sanctioned common.Address
	Risky      common.Address
}

func New(t *testing.T) *Fixture {
	st := storetest.New(t)
	key := func() *decision.KeySigner { k, _ := crypto.GenerateKey(); return decision.NewKeySigner(k) }
	ek, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	f := &Fixture{MLRO: key(), Officer: key(), Sanctioned: common.HexToAddress("0x5a"), Risky: common.HexToAddress("0x6b")}
	cfg := &config.Config{
		Processor: config.Processor{LegalName: "ExamplePay GmbH (fictional)"},
		Chains: []config.Chain{{ChainID: 31337, Name: "anvil", Confirmations: 3,
			Tokens:   []config.Token{{Symbol: "MUSD", Address: Token, Decimals: 6, EURRate: "0.92", FXSource: "static"}},
			Deposits: []config.Deposit{{Address: DepositAddress, MerchantID: "m_7f3a"}}}},
		Officers:       []config.Officer{{Address: f.Officer.Address(), OfficerID: "officer-01", Mask: 0x0F}},
		MLRO:           []common.Address{f.MLRO.Address()},
		CheckTimeout:   config.Duration{Duration: time.Second},
		DecisionTTL:    config.Duration{Duration: 24 * time.Hour},
		RetentionYears: 7,
	}
	f.P = &pipeline.Pipeline{St: st, Cfg: cfg, Raw: checks.RawStore{Dir: t.TempDir()}, Policy: key(),
		Evidence: evidence.NewJWSSigner(ek, "test-evidence"), Log: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Checks: []checks.Check{
			stub{kind: "kyt", clean: "LOW", byPayer: map[common.Address]string{f.Risky: "HIGH"}},
			stub{kind: "sanctions", clean: "NO_MATCH", byPayer: map[common.Address]string{f.Sanctioned: "TRUE_MATCH"}},
			stub{kind: "structuring", clean: "PASS"},
			stub{kind: "issuer", clean: "NOT_LISTED"},
		}}
	return f
}

// ApproveExample imports rulesets/2026.10-1.json and approves it from 2026-01-01.
func (f *Fixture) ApproveExample(t *testing.T) {
	ctx := context.Background()
	raw, _ := os.ReadFile(filepath.Join(root(), "rulesets", "2026.10-1.json"))
	version, _, err := f.P.ImportRuleset(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	td, err := f.P.ApprovalTypedData(ctx, version, from)
	if err != nil {
		t.Fatal(err)
	}
	sig := SignTypedJSON(t, f.MLRO, td)
	if _, err := f.P.ApproveRuleset(ctx, version, from, sig); err != nil {
		t.Fatal(err)
	}
}

// SignTypedJSON signs a typed-data document the way a wallet would: from its JSON.
func SignTypedJSON(t *testing.T, s *decision.KeySigner, doc map[string]any) []byte {
	t.Helper()
	raw, _ := json.Marshal(doc)
	var td apitypes.TypedData
	if err := json.Unmarshal(raw, &td); err != nil {
		t.Fatal(err)
	}
	d, err := decision.Digest(td)
	if err != nil {
		t.Fatal(err)
	}
	sig, _ := s.Sign(d)
	return sig
}

// Deposit inserts a payment to the deposit address.
func (f *Fixture) Deposit(t *testing.T, payer common.Address, amount int64, ingest string, n int) common.Hash {
	id := common.BigToHash(big.NewInt(int64(n)))
	_, err := f.P.St.Exec(context.Background(), `INSERT INTO payment (id, chain_id, tx_hash, log_index, block_number, block_hash, block_time,
		token, payer, deposit, amount, ingest) VALUES ($1, 31337, $1, 0, $2, '\x01', $3, $4, $5, $6, $7, $8)`,
		id.Bytes(), 100+n, time.Date(2026, 10, 7, 12, n, 0, 0, time.UTC), Token.Bytes(), payer.Bytes(), DepositAddress.Bytes(), amount, ingest)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

// Stage is the payment's pipeline stage.
func (f *Fixture) Stage(t *testing.T, id common.Hash) string {
	var s string
	f.P.St.QueryRow(context.Background(), `SELECT stage FROM payment WHERE id = $1`, id.Bytes()).Scan(&s)
	return s
}

// Count counts rows of table for the payment.
func (f *Fixture) Count(t *testing.T, table string, id common.Hash) int {
	var n int
	f.P.St.QueryRow(context.Background(), `SELECT count(*) FROM `+table+` WHERE payment_id = $1`, id.Bytes()).Scan(&n)
	return n
}

// Tick runs the pipeline until quiet.
func (f *Fixture) Tick(t *testing.T) {
	t.Helper()
	for i := 0; i < 3; i++ {
		if err := f.P.Tick(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
}
