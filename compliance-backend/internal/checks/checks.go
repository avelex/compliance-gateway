// Package checks screens a deposit: KYT, sanctions, structuring and issuer controls (sections D–G).
// Every check yields a stored, normalised result; a failure or timeout is UNAVAILABLE, never a skip.
package checks

import (
	"context"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"compliance-backend/internal/evidence"
)

const Unavailable = "UNAVAILABLE"

// Payment is what a check sees of a deposit.
type Payment struct {
	ID          common.Hash
	ChainID     uint64
	BlockNumber uint64
	BlockTime   time.Time
	Token       common.Address
	Payer       common.Address
	Deposit     common.Address
	Amount      *big.Int
	AmountEUR   string
}

// Result is one check's normalised outcome. Section is the pack section (kyt, sanctions, ...) as
// it will appear in the Payment Passport.
type Result struct {
	Kind        string
	Provider    string
	Product     string
	Outcome     string
	Section     map[string]any
	RawSHA256   string
	PerformedAt time.Time
}

type Check interface {
	Kind() string
	// Run returns the normalised result and the raw provider response, if any.
	Run(ctx context.Context, p Payment) (Result, []byte, error)
}

// RawStore keeps raw provider responses under their SHA-256.
//
// ponytail: local directory; S3 with object lock when retention needs WORM (design D4).
type RawStore struct{ Dir string }

func (s RawStore) Put(b []byte) (string, error) {
	h := evidence.SHA(b)
	dir := filepath.Join(s.Dir, "raw")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", err
	}
	return h, os.WriteFile(filepath.Join(dir, h), b, 0o640)
}

func (s RawStore) Get(h string) ([]byte, error) { return os.ReadFile(filepath.Join(s.Dir, "raw", h)) }

// RunAll runs every check concurrently, each under timeout, and never drops one.
func RunAll(ctx context.Context, all []Check, p Payment, timeout time.Duration, raw RawStore) []Result {
	out := make([]Result, len(all))
	var wg sync.WaitGroup
	for i, c := range all {
		wg.Add(1)
		go func() {
			defer wg.Done()
			out[i] = runOne(ctx, c, p, timeout, raw)
		}()
	}
	wg.Wait()
	return out
}

func runOne(ctx context.Context, c Check, p Payment, timeout time.Duration, raw RawStore) Result {
	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	type ret struct {
		r   Result
		b   []byte
		err error
	}
	ch := make(chan ret, 1)
	go func() {
		defer func() {
			if v := recover(); v != nil {
				ch <- ret{err: fmt.Errorf("panic: %v", v)}
			}
		}()
		r, b, err := c.Run(cctx, p)
		ch <- ret{r, b, err}
	}()
	var got ret
	select {
	case got = <-ch:
	case <-cctx.Done():
		got.err = fmt.Errorf("timed out after %s", timeout)
	}
	if got.err == nil && got.b != nil {
		got.r.RawSHA256, got.err = raw.Put(got.b)
	}
	if got.err != nil {
		return unavailable(c.Kind(), got.r, got.err)
	}
	if got.r.PerformedAt.IsZero() {
		got.r.PerformedAt = time.Now().UTC()
	}
	got.r.Kind = c.Kind()
	return got.r
}

func unavailable(kind string, partial Result, err error) Result {
	now := time.Now().UTC()
	provider, product := partial.Provider, partial.Product
	if provider == "" {
		provider, product = "n/a", "n/a"
	}
	return Result{Kind: kind, Provider: provider, Product: product, Outcome: Unavailable, PerformedAt: now,
		Section: map[string]any{"result": Unavailable, "error": err.Error(), "checked_at": now.Format(time.RFC3339)}}
}
