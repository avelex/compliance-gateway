package checks

import (
	"context"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"

	"compliance-backend/internal/config"
	"compliance-backend/internal/evidence"
	"compliance-backend/internal/store"
	"compliance-backend/internal/store/storetest"
	"compliance-backend/internal/testchain"
)

type slowCheck struct{}

func (slowCheck) Kind() string { return "kyt" }
func (slowCheck) Run(ctx context.Context, _ Payment) (Result, []byte, error) {
	<-ctx.Done()
	time.Sleep(50 * time.Millisecond)
	return Result{}, nil, ctx.Err()
}

type rawCheck struct{}

func (rawCheck) Kind() string { return "kyt" }
func (rawCheck) Run(context.Context, Payment) (Result, []byte, error) {
	return Result{Provider: "p", Product: "q", Outcome: "LOW", Section: map[string]any{"risk_level": "LOW"}}, []byte(`{"raw":true}`), nil
}

func TestRunnerTimeoutIsUnavailableAndRawIsStored(t *testing.T) {
	raw := RawStore{Dir: t.TempDir()}
	got := RunAll(context.Background(), []Check{slowCheck{}, rawCheck{}}, Payment{}, 100*time.Millisecond, raw)
	if got[0].Outcome != Unavailable || got[0].Section["result"] != Unavailable {
		t.Fatalf("timed-out check: %+v", got[0])
	}
	b, err := raw.Get(got[1].RawSHA256)
	if err != nil || evidence.SHA(b) != got[1].RawSHA256 {
		t.Fatalf("raw response not retrievable by its hash: %v", err)
	}
}

func TestFX(t *testing.T) {
	eur, err := EUR(big.NewInt(250_000_000), 6, "1")
	if err != nil || eur != "250.00" {
		t.Fatalf("EURC 250 -> %q %v", eur, err)
	}
	if eur, _ := EUR(big.NewInt(1_000_005), 6, "0.92"); eur != "0.92" {
		t.Fatalf("USDC 1.000005 at 0.92 -> %q", eur)
	}
	if eur, _ := EUR(big.NewInt(5_000), 2, "0.925"); eur != "46.25" {
		t.Fatalf("half-up rounding: %q", eur)
	}
	for in, want := range map[int64]string{250_000_000: "250.00", 1_234_567: "1.234567", 1_500_000: "1.50", 0: "0.00"} {
		if got := FormatUnits(big.NewInt(in), 6); got != want {
			t.Errorf("FormatUnits(%d) = %q, want %q", in, got, want)
		}
	}
}

func goplus(t *testing.T, status int, body string) GoPlus {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return GoPlus{BaseURL: srv.URL}
}

func TestGoPlus(t *testing.T) {
	raw := RawStore{Dir: t.TempDir()}
	p := Payment{Payer: common.HexToAddress("0x01")}
	run := func(g GoPlus) Result { return RunAll(context.Background(), []Check{g}, p, time.Second, raw)[0] }

	r := run(goplus(t, 200, `{"code":1,"result":{"mixer":"1","cybercrime":"0"}}`))
	if r.Outcome != "SEVERE" || len(r.Section["categories"].([]any)) != 1 || r.Section["categories"].([]any)[0] != "mixer" {
		t.Fatalf("mixer: %+v", r)
	}
	if r.Product != "address_security (demo, not for production)" || r.RawSHA256 == "" {
		t.Fatalf("labelling or raw hash missing: %+v", r)
	}
	if r := run(goplus(t, 200, `{"code":1,"result":{"mixer":"0"}}`)); r.Outcome != "LOW" {
		t.Fatalf("clean: %s", r.Outcome)
	}
	if r := run(goplus(t, 500, `oops`)); r.Outcome != Unavailable || r.Provider != "GoPlus" {
		t.Fatalf("http 500: %+v", r)
	}
}

func writeList(t *testing.T, dir, body string) string {
	p := filepath.Join(dir, "list.txt")
	os.WriteFile(p, []byte(body), 0o600)
	return p
}

func TestSanctions(t *testing.T) {
	st := storetest.New(t)
	ctx := context.Background()
	dir := t.TempDir()
	listed := testchain.RandomAddress()
	path := writeList(t, dir, "# OFAC test list\n"+listed.Hex()+"\n")
	s := &Sanctions{}
	if err := s.Load(ctx, st, []config.SanctionsList{{Name: "OFAC SDN (ETH)", Version: "2026-10-01", Path: path}}); err != nil {
		t.Fatal(err)
	}
	r, _, _ := s.Run(ctx, Payment{Payer: listed})
	if r.Outcome != "TRUE_MATCH" || r.Section["name_screening"] != "NOT_PERFORMED" {
		t.Fatalf("listed payer: %+v", r)
	}
	lists := r.Section["lists"].([]any)
	if l := lists[0].(map[string]any); l["name"] != "OFAC SDN (ETH)" || l["version"] != "2026-10-01" {
		t.Fatalf("list reference: %v", l)
	}
	if r, _, _ := s.Run(ctx, Payment{Payer: testchain.RandomAddress()}); r.Outcome != "NO_MATCH" {
		t.Fatalf("clean payer: %s", r.Outcome)
	}

	writeList(t, dir, "# OFAC test list\n")
	if err := s.Load(ctx, st, []config.SanctionsList{{Name: "OFAC SDN (ETH)", Version: "2026-10-08", Path: path}}); err != nil {
		t.Fatal(err)
	}
	r2, _, _ := s.Run(ctx, Payment{Payer: listed})
	if r2.Outcome != "NO_MATCH" || r2.Section["lists"].([]any)[0].(map[string]any)["version"] != "2026-10-08" {
		t.Fatalf("after reload: %+v", r2)
	}
	if lists[0].(map[string]any)["version"] != "2026-10-01" {
		t.Fatal("earlier result changed by reload")
	}
	var n int
	st.QueryRow(ctx, `SELECT count(*) FROM sanctions_list_version`).Scan(&n)
	if n != 2 {
		t.Fatalf("want 2 list versions recorded, got %d", n)
	}
}

var eurc = common.HexToAddress("0x00000000000000000000000000000000000E0BC0")

func insertPayment(t *testing.T, st *store.Store, payer common.Address, eurUnits int64, at time.Time, i int) common.Hash {
	id := common.BigToHash(big.NewInt(int64(1000 + i)))
	_, err := st.Exec(context.Background(), `INSERT INTO payment (id, chain_id, tx_hash, log_index, block_number, block_hash,
		block_time, token, payer, deposit, amount, ingest) VALUES ($1, 1, $1, 0, $2, '\x00', $3, $4, $5, '\x01', $6, 'confirmed')`,
		id.Bytes(), i, at, eurc.Bytes(), payer.Bytes(), eurUnits*1_000_000)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func TestStructuringSplit03(t *testing.T) {
	st := storetest.New(t)
	cfg := &config.Config{Chains: []config.Chain{{ChainID: 1, Tokens: []config.Token{{Symbol: "EURC", Address: eurc, Decimals: 6, EURRate: "1"}}}}}
	s := Structuring{St: st, Cfg: cfg}
	payer := testchain.RandomAddress()
	t0 := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	insertPayment(t, st, payer, 950, t0, 1)
	id2 := insertPayment(t, st, payer, 960, t0.Add(24*time.Hour), 2)
	id3 := insertPayment(t, st, payer, 990, t0.Add(48*time.Hour), 3)

	r2, _, err := s.Run(context.Background(), Payment{ID: id2, Payer: payer, BlockTime: t0.Add(24 * time.Hour), AmountEUR: "960.00"})
	if err != nil || r2.Outcome != "PASS" {
		t.Fatalf("second payment: %s %v", r2.Outcome, err)
	}
	r3, _, err := s.Run(context.Background(), Payment{ID: id3, Payer: payer, BlockTime: t0.Add(48 * time.Hour), AmountEUR: "990.00"})
	if err != nil || r3.Outcome != "FLAG" || r3.Section["linked_count"] != 3 {
		t.Fatalf("third payment: %+v %v", r3, err)
	}
	// Outside the 72 h window the first payment no longer counts.
	id4 := insertPayment(t, st, payer, 999, t0.Add(73*time.Hour), 4)
	r4, _, _ := s.Run(context.Background(), Payment{ID: id4, Payer: payer, BlockTime: t0.Add(73 * time.Hour), AmountEUR: "999.00"})
	if r4.Section["linked_count"] != 3 {
		t.Fatalf("window: linked %v", r4.Section["linked_count"])
	}
}

func TestIssuer(t *testing.T) {
	c := testchain.Dial(t)
	c.PlaceToken(testchain.MUSD, "MockStable")
	plain := common.HexToAddress("0x000000000000000000000000000000000000b0b6")
	c.PlaceToken(plain, "PlainToken")
	payer, clean := testchain.RandomAddress(), testchain.RandomAddress()
	c.Blacklist(testchain.MUSD, payer)
	eth, _ := ethclient.Dial(c.URL)
	is := Issuer{Clients: map[uint64]*ethclient.Client{31337: eth}}
	head := c.Head()
	raw := RawStore{Dir: t.TempDir()}
	run := func(token, who common.Address) Result {
		p := Payment{ChainID: 31337, BlockNumber: head, Token: token, Payer: who, Deposit: testchain.RandomAddress()}
		return RunAll(context.Background(), []Check{is}, p, 5*time.Second, raw)[0]
	}
	if r := run(testchain.MUSD, payer); r.Outcome != "LISTED" || r.Section["payer_listed"] != true {
		t.Fatalf("blacklisted payer: %+v", r)
	}
	if r := run(testchain.MUSD, clean); r.Outcome != "NOT_LISTED" {
		t.Fatalf("clean payer: %s", r.Outcome)
	}
	if r := run(plain, clean); r.Outcome != Unavailable {
		t.Fatalf("token without isBlacklisted: %s", r.Outcome)
	}
}
