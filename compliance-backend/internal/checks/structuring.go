package checks

import (
	"context"
	"fmt"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum/common"

	"compliance-backend/internal/config"
	"compliance-backend/internal/store"
)

// SPLIT-03 thresholds.
var (
	splitWindow       = 72 * time.Hour
	splitAggregateEUR = big.NewRat(5000, 1)
	splitBandLow      = big.NewRat(900, 1)  // 10% below EUR 1,000
	splitBandHigh     = big.NewRat(1000, 1) // exclusive
	splitBandCount    = 3
)

// Structuring evaluates rule SPLIT-03 over the payer's confirmed payments in the 72 hours up to and
// including this one. Clusters come from KYT in production; version 1 uses the address alone.
type Structuring struct {
	St  *store.Store
	Cfg *config.Config
}

func (Structuring) Kind() string { return "structuring" }

func (s Structuring) Run(ctx context.Context, p Payment) (Result, []byte, error) {
	res := Result{Provider: "Deflow", Product: "SPLIT-03"}
	rows, err := s.St.Query(ctx, `
		SELECT p.id, p.chain_id, p.token, p.amount::text, s.pack_id::text
		FROM payment p LEFT JOIN evidence_snapshot s ON s.payment_id = p.id
		WHERE p.payer = $1 AND p.block_time > $2 AND p.block_time <= $3
		  AND (p.ingest = 'confirmed' OR p.id = $4)`,
		p.Payer.Bytes(), p.BlockTime.Add(-splitWindow), p.BlockTime, p.ID.Bytes())
	if err != nil {
		return res, nil, err
	}
	defer rows.Close()
	aggregate := new(big.Rat)
	band := 0
	linked := 0
	packIDs := []any{}
	seenSelf := false
	for rows.Next() {
		var id, token []byte
		var chainID uint64
		var amount string
		var packID *string
		if err := rows.Scan(&id, &chainID, &token, &amount, &packID); err != nil {
			return res, nil, err
		}
		eur, err := s.eur(chainID, common.BytesToAddress(token), amount)
		if err != nil {
			return res, nil, err
		}
		aggregate.Add(aggregate, eur)
		if eur.Cmp(splitBandLow) >= 0 && eur.Cmp(splitBandHigh) < 0 {
			band++
		}
		linked++
		if common.BytesToHash(id) == p.ID {
			seenSelf = true
		} else if packID != nil {
			packIDs = append(packIDs, *packID)
		}
	}
	if err := rows.Err(); err != nil {
		return res, nil, err
	}
	if !seenSelf { // the payment itself is always part of its own window
		eur, err := ParseDecimal(p.AmountEUR)
		if err != nil {
			return res, nil, err
		}
		aggregate.Add(aggregate, eur)
		if eur.Cmp(splitBandLow) >= 0 && eur.Cmp(splitBandHigh) < 0 {
			band++
		}
		linked++
	}
	res.Outcome = "PASS"
	if aggregate.Cmp(splitAggregateEUR) >= 0 || band >= splitBandCount {
		res.Outcome = "FLAG"
	}
	score := new(big.Rat).Quo(aggregate, splitAggregateEUR)
	if c := big.NewRat(int64(band), int64(splitBandCount)); c.Cmp(score) > 0 {
		score = c
	}
	if score.Cmp(big.NewRat(1, 1)) > 0 {
		score = big.NewRat(1, 1)
	}
	now := time.Now().UTC()
	res.PerformedAt = now
	res.Section = map[string]any{
		"rule_id": "SPLIT-03",
		"window":  "72h",
		"thresholds": map[string]any{
			"aggregate_eur": "5000.00", "band_eur": "900.00-999.99", "band_count": fmt.Sprint(splitBandCount),
		},
		"linked_count":    linked,
		"linked_pack_ids": packIDs,
		"features":        map[string]any{"aggregate_eur": aggregate.FloatString(2), "band_count": fmt.Sprint(band), "cluster": "address"},
		"score":           score.FloatString(2),
		"result":          res.Outcome,
		"evaluated_at":    now.Format(time.RFC3339),
	}
	return res, nil, nil
}

func (s Structuring) eur(chainID uint64, token common.Address, amount string) (*big.Rat, error) {
	ch, ok := s.Cfg.Chain(chainID)
	if !ok {
		return nil, fmt.Errorf("chain %d not configured", chainID)
	}
	t, ok := ch.Token(token)
	if !ok {
		return nil, fmt.Errorf("token %s not configured", token)
	}
	a, ok := new(big.Int).SetString(amount, 10)
	if !ok {
		return nil, fmt.Errorf("bad amount %q", amount)
	}
	e, err := EUR(a, t.Decimals, t.EURRate)
	if err != nil {
		return nil, err
	}
	return ParseDecimal(e)
}
