package ingest

import (
	"context"
	"io"
	"log/slog"
	"math/big"
	"os"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"compliance-backend/internal/config"
	"compliance-backend/internal/store"
	"compliance-backend/internal/store/storetest"
	"compliance-backend/internal/testchain"
)

var quiet = slog.New(slog.NewTextHandler(io.Discard, nil))

func TestDecodeGoldenEnvelope(t *testing.T) {
	raw, err := os.ReadFile("testdata/eventscale-transfer.json")
	if err != nil {
		t.Fatal(err)
	}
	d, err := decodeEnvelope(raw)
	if err != nil {
		t.Fatal(err)
	}
	if d.ChainID != 31337 || d.Token != testchain.MUSD || d.To != goldenDeposit || d.Amount.Sign() <= 0 ||
		d.TxHash == (common.Hash{}) || d.BlockHash == (common.Hash{}) || d.BlockTime.Year() < 2026 {
		t.Fatalf("decoded %+v", d)
	}
}

func TestPaymentIDMatchesContractsRule(t *testing.T) {
	// Same inputs as contracts/test/processor/fixtures/gen.sh, which computes it with cast.
	id := PaymentID(84532, common.HexToHash("0x9d3c8f0e5b2a71c4d6e8f0a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1"), 7)
	if id != common.HexToHash("0x272e0803a390f0f5181926192d4ac099ce5d65e4b414cbb08c48af2a3bd12b0f") {
		t.Fatalf("paymentId %s", id.Hex())
	}
}

type env struct {
	st      *store.Store
	c       *testchain.Chain
	cfg     *config.Config
	deposit common.Address
}

func setup(t *testing.T, confirmations uint64) *env {
	st := storetest.New(t)
	c := testchain.Dial(t)
	c.PlaceToken(testchain.MUSD, "MockStable")
	dep := testchain.RandomAddress()
	cfg := &config.Config{NATSURL: os.Getenv("NATS_URL"), Chains: []config.Chain{{
		ChainID: 31337, Name: "anvil", Confirmations: confirmations, Chunk: 50, EventscaleNetwork: "anvil",
		ReconcileInterval: config.Duration{Duration: 200 * time.Millisecond},
		Tokens:            []config.Token{{Symbol: "MUSD", Address: testchain.MUSD, Decimals: 6, EventscaleAlias: "MUSD"}},
		Deposits:          []config.Deposit{{Address: dep, MerchantID: "m_test"}},
	}}}
	return &env{st, c, cfg, dep}
}

func (e *env) reconcileAll(t *testing.T) {
	t.Helper()
	r := NewReconciler(e.st, &e.cfg.Chains[0], e.c.Eth, quiet)
	for i := 0; i < 100; i++ {
		more, err := r.Step(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		if !more {
			return
		}
	}
	t.Fatal("reconciler did not catch up")
}

func (e *env) count(t *testing.T, where string, args ...any) int {
	t.Helper()
	var n int
	if err := e.st.QueryRow(context.Background(), "SELECT count(*) FROM payment WHERE "+where, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func (e *env) pay(t *testing.T, to common.Address, amount int64) common.Hash {
	payer := testchain.RandomAddress()
	e.c.Mint(testchain.MUSD, payer, big.NewInt(amount))
	return e.c.Transfer(testchain.MUSD, payer, to, big.NewInt(amount))
}

func TestReconcilerConfirmsAtDepthAndIgnoresOthers(t *testing.T) {
	e := setup(t, 3)
	e.reconcileAll(t) // cursor starts at the current safe head
	tx := e.pay(t, e.deposit, 1_500_000)
	e.pay(t, testchain.RandomAddress(), 2_000_000) // unwatched recipient

	e.reconcileAll(t)
	if n := e.count(t, "true"); n != 0 {
		t.Fatalf("confirmed %d payments before depth N", n)
	}
	e.c.Mine(4)
	e.reconcileAll(t)
	if n := e.count(t, "ingest = 'confirmed' AND tx_hash = $1 AND deposit = $2 AND amount = 1500000", tx.Bytes(), e.deposit.Bytes()); n != 1 {
		t.Fatalf("want the deposit confirmed once, got %d", n)
	}
	if n := e.count(t, "true"); n != 1 {
		t.Fatalf("unwatched transfer recorded: %d rows", n)
	}

	// Restart: a new reconciler resumes from the stored cursor and never duplicates.
	var last uint64
	e.st.QueryRow(context.Background(), `SELECT last_reconciled FROM chain_cursor WHERE chain_id = 31337`).Scan(&last)
	e.pay(t, e.deposit, 700_000)
	e.c.Mine(4)
	e.reconcileAll(t)
	if n := e.count(t, "ingest = 'confirmed'"); n != 2 {
		t.Fatalf("after restart want 2 payments, got %d", n)
	}
	var after uint64
	e.st.QueryRow(context.Background(), `SELECT last_reconciled FROM chain_cursor WHERE chain_id = 31337`).Scan(&after)
	if after <= last {
		t.Fatalf("cursor did not advance: %d -> %d", last, after)
	}
}

func TestBackfillMarksReconstruction(t *testing.T) {
	e := setup(t, 2)
	e.pay(t, e.deposit, 990_000)
	e.c.Mine(3)
	head := e.c.Head()
	// A service started now would never see that deposit; a backfill from 20 blocks back does.
	if _, err := Backfill(context.Background(), e.st, e.c.Eth, &e.cfg.Chains[0], head-20); err != nil {
		t.Fatal(err)
	}
	e.reconcileAll(t)
	if n := e.count(t, "ingest = 'confirmed' AND reconstruction"); n != 1 {
		t.Fatalf("want 1 reconstructed payment, got %d", n)
	}
	e.pay(t, e.deposit, 10_000)
	e.c.Mine(3)
	e.reconcileAll(t)
	if n := e.count(t, "ingest = 'confirmed' AND NOT reconstruction"); n != 1 {
		t.Fatalf("live payment after the backfill marked as reconstruction")
	}
}

func TestSeenRowsMissingFromReconciledRangeAreOrphaned(t *testing.T) {
	e := setup(t, 2)
	e.reconcileAll(t)
	head := e.c.Head()
	ctx := context.Background()
	fake := Deposit{ChainID: 31337, TxHash: common.HexToHash("0xdead01"), LogIndex: 0, BlockNumber: head + 1,
		BlockHash: common.HexToHash("0xbeef"), BlockTime: time.Now(), Token: testchain.MUSD,
		Payer: testchain.RandomAddress(), To: e.deposit, Amount: big.NewInt(5)}
	if err := upsertSeen(ctx, e.st, fake); err != nil {
		t.Fatal(err)
	}
	if n := e.count(t, "ingest = 'seen'"); n != 1 {
		t.Fatal("hint not recorded as seen")
	}
	e.c.Mine(4)
	e.reconcileAll(t)
	if n := e.count(t, "ingest = 'orphaned'"); n != 1 {
		t.Fatal("seen row absent from the canonical range was not orphaned")
	}

	// A late hint for a block the reconciler already passed lands as orphaned straight away.
	late := fake
	late.TxHash, late.BlockNumber = common.HexToHash("0xdead02"), head
	upsertSeen(ctx, e.st, late)
	if n := e.count(t, "ingest = 'orphaned'"); n != 2 {
		t.Fatal("late hint for a reconciled block not orphaned")
	}
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	for deadline := time.Now().Add(20 * time.Second); time.Now().Before(deadline); time.Sleep(200 * time.Millisecond) {
		if cond() {
			return
		}
	}
	t.Fatalf("timed out waiting for %s", what)
}

func TestHintSeesDepositsAndResumesBacklog(t *testing.T) {
	if os.Getenv("NATS_URL") == "" {
		t.Skip("NATS_URL not set")
	}
	e := setup(t, 1000) // the reconciler stays far behind; only the hint can record these
	h := NewHint(e.st, e.cfg, quiet)
	ctx, stop := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { h.Run(ctx); close(done) }()
	waitFor(t, "hint ok", func() bool { return h.Status() == HintOK })

	e.pay(t, e.deposit, 100)
	waitFor(t, "first hint", func() bool { return e.count(t, "ingest = 'seen'") == 1 })

	stop()
	<-done
	for i := 0; i < 3; i++ {
		e.pay(t, e.deposit, int64(200+i))
	}
	ctx, stop = context.WithCancel(context.Background())
	defer stop()
	go NewHint(e.st, e.cfg, quiet).Run(ctx)
	waitFor(t, "backlog of 3", func() bool { return e.count(t, "ingest = 'seen'") == 4 })
}

func TestHintDegradedWithoutNATS(t *testing.T) {
	cfg := &config.Config{NATSURL: "nats://127.0.0.1:1"}
	h := NewHint(nil, cfg, quiet)
	ctx, stop := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer stop()
	h.Run(ctx)
	if h.Status() != HintDegraded {
		t.Fatalf("status %s", h.Status())
	}
	if NewHint(nil, &config.Config{}, quiet).Status() != HintDisabled {
		t.Fatal("empty nats_url should disable the hint")
	}
}
