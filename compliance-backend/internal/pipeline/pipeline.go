// Package pipeline advances each payment: checks, then (once confirmed) the evidence snapshot and the
// recommendation, then an automatic decision or an officer case (design D2). State lives in Postgres,
// so a crash just reruns the step that did not commit.
package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/jackc/pgx/v5"

	"compliance-backend/internal/checks"
	"compliance-backend/internal/config"
	"compliance-backend/internal/decision"
	"compliance-backend/internal/evidence"
	"compliance-backend/internal/rules"
	"compliance-backend/internal/store"
)

type Pipeline struct {
	St       *store.Store
	Cfg      *config.Config
	Checks   []checks.Check
	Raw      checks.RawStore
	Policy   decision.Signer
	Evidence *evidence.JWSSigner
	Log      *slog.Logger
	Now      func() time.Time
}

func (p *Pipeline) now() time.Time {
	if p.Now != nil {
		return p.Now().UTC()
	}
	return time.Now().UTC()
}

// Run ticks until ctx ends.
func (p *Pipeline) Run(ctx context.Context) {
	t := time.NewTicker(p.Cfg.WorkerInterval.Duration)
	defer t.Stop()
	for {
		if err := p.Tick(ctx); err != nil && ctx.Err() == nil {
			p.Log.Error("pipeline", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// Tick runs every step that is due once.
func (p *Pipeline) Tick(ctx context.Context) error {
	if err := p.runChecks(ctx); err != nil {
		return fmt.Errorf("checks: %w", err)
	}
	if err := p.recommendAll(ctx); err != nil {
		return fmt.Errorf("recommend: %w", err)
	}
	return nil
}

// row is a payment as the pipeline reads it.
type row struct {
	ID             common.Hash
	ChainID        uint64
	TxHash         common.Hash
	LogIndex       uint64
	BlockNumber    uint64
	BlockTime      time.Time
	Token          common.Address
	Payer          common.Address
	Deposit        common.Address
	Amount         *big.Int
	Reconstruction bool
}

const rowCols = `id, chain_id, tx_hash, log_index, block_number, block_time, token, payer, deposit, amount::text, reconstruction`

func scanRow(r pgx.Row) (row, error) {
	var x row
	var id, tx, token, payer, dep []byte
	var amount string
	if err := r.Scan(&id, &x.ChainID, &tx, &x.LogIndex, &x.BlockNumber, &x.BlockTime, &token, &payer, &dep, &amount, &x.Reconstruction); err != nil {
		return x, err
	}
	x.ID, x.TxHash = common.BytesToHash(id), common.BytesToHash(tx)
	x.Token, x.Payer, x.Deposit = common.BytesToAddress(token), common.BytesToAddress(payer), common.BytesToAddress(dep)
	x.Amount, _ = new(big.Int).SetString(amount, 10)
	x.BlockTime = x.BlockTime.UTC()
	return x, nil
}

func (p *Pipeline) due(ctx context.Context, where string) ([]row, error) {
	rows, err := p.St.Query(ctx, `SELECT `+rowCols+` FROM payment WHERE `+where+` ORDER BY block_number, log_index LIMIT 50`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []row
	for rows.Next() {
		r, err := scanRow(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// token resolves the payment's chain and token config.
func (p *Pipeline) token(r row) (*config.Chain, *config.Token, error) {
	ch, ok := p.Cfg.Chain(r.ChainID)
	if !ok {
		return nil, nil, fmt.Errorf("chain %d not configured", r.ChainID)
	}
	t, ok := ch.Token(r.Token)
	if !ok {
		return nil, nil, fmt.Errorf("token %s not configured on chain %d", r.Token, r.ChainID)
	}
	return ch, t, nil
}

func (p *Pipeline) amountEUR(r row) (string, error) {
	_, t, err := p.token(r)
	if err != nil {
		return "", err
	}
	return checks.EUR(r.Amount, t.Decimals, t.EURRate)
}

// Checks may start as soon as a deposit is seen; orphaned ones are skipped.
func (p *Pipeline) runChecks(ctx context.Context) error {
	due, err := p.due(ctx, `stage = 'checks_pending' AND ingest IN ('seen', 'confirmed')`)
	if err != nil {
		return err
	}
	for _, r := range due {
		eur, err := p.amountEUR(r)
		if err != nil {
			return err
		}
		cp := checks.Payment{ID: r.ID, ChainID: r.ChainID, BlockNumber: r.BlockNumber, BlockTime: r.BlockTime,
			Token: r.Token, Payer: r.Payer, Deposit: r.Deposit, Amount: r.Amount, AmountEUR: eur}
		results := checks.RunAll(ctx, p.Checks, cp, p.Cfg.CheckTimeout.Duration, p.Raw)
		tx, err := p.St.Begin(ctx)
		if err != nil {
			return err
		}
		for _, res := range results {
			section, _ := json.Marshal(res.Section)
			if _, err := tx.Exec(ctx, `INSERT INTO check_result (payment_id, kind, provider, product, outcome, result, raw_sha256, performed_at)
				VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, ''), $8) ON CONFLICT (payment_id, kind) DO NOTHING`,
				r.ID.Bytes(), res.Kind, res.Provider, res.Product, res.Outcome, section, res.RawSHA256, res.PerformedAt); err != nil {
				tx.Rollback(ctx)
				return err
			}
		}
		if _, err := tx.Exec(ctx, `UPDATE payment SET stage = 'checks_done' WHERE id = $1 AND stage = 'checks_pending'`, r.ID.Bytes()); err != nil {
			tx.Rollback(ctx)
			return err
		}
		if err := tx.Commit(ctx); err != nil {
			return err
		}
	}
	return nil
}

type effectiveRuleset struct {
	rs            *rules.Ruleset
	version       string
	hash          string
	approvedBy    common.Address
	effectiveFrom time.Time
}

func (p *Pipeline) rulesetAt(ctx context.Context, q pgx.Tx, at time.Time) (*effectiveRuleset, error) {
	var canonical, version, hash string
	var by []byte
	var from time.Time
	err := q.QueryRow(ctx, `SELECT canonical, version, ruleset_hash, approved_by, effective_from FROM ruleset
		WHERE approved_at IS NOT NULL AND effective_from <= $1 ORDER BY effective_from DESC LIMIT 1`, at).
		Scan(&canonical, &version, &hash, &by, &from)
	if err == pgx.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rs, _, _, err := rules.Parse([]byte(canonical))
	if err != nil {
		return nil, fmt.Errorf("stored ruleset %s: %w", version, err)
	}
	return &effectiveRuleset{rs, version, hash, common.BytesToAddress(by), from.UTC()}, nil
}

func (p *Pipeline) recommendAll(ctx context.Context) error {
	due, err := p.due(ctx, `stage = 'checks_done' AND ingest = 'confirmed'`)
	if err != nil {
		return err
	}
	for _, r := range due {
		if err := p.recommend(ctx, r); err != nil {
			return fmt.Errorf("payment %s: %w", r.ID.Hex(), err)
		}
	}
	return nil
}

type checkRow struct {
	kind, provider, product, outcome string
	section                          map[string]any
	rawSHA                           *string
	performedAt                      time.Time
}

func loadChecks(ctx context.Context, q pgx.Tx, id common.Hash) (map[string]checkRow, error) {
	rows, err := q.Query(ctx, `SELECT kind, provider, product, outcome, result, raw_sha256, performed_at FROM check_result WHERE payment_id = $1`, id.Bytes())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]checkRow{}
	for rows.Next() {
		var c checkRow
		var raw []byte
		if err := rows.Scan(&c.kind, &c.provider, &c.product, &c.outcome, &raw, &c.rawSHA, &c.performedAt); err != nil {
			return nil, err
		}
		if err := evidence.Decode(raw, &c.section); err != nil {
			return nil, err
		}
		out[c.kind] = c
	}
	return out, rows.Err()
}

func (p *Pipeline) recommend(ctx context.Context, r row) error {
	tx, err := p.St.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// Lock the payment so an API call cannot race the pipeline on it.
	var stage string
	if err := tx.QueryRow(ctx, `SELECT stage FROM payment WHERE id = $1 FOR UPDATE`, r.ID.Bytes()).Scan(&stage); err != nil || stage != "checks_done" {
		return err
	}
	cs, err := loadChecks(ctx, tx, r.ID)
	if err != nil {
		return err
	}
	eur, err := p.amountEUR(r)
	if err != nil {
		return err
	}
	in := rules.Inputs{KYT: outcome(cs, "kyt"), Sanctions: outcome(cs, "sanctions"), Structuring: outcome(cs, "structuring"),
		Issuer: outcome(cs, "issuer"), AmountEUR: eur}
	for _, k := range []string{"kyt", "sanctions", "structuring", "issuer"} {
		if outcome(cs, k) == checks.Unavailable {
			in.AnyUnavailable = true
		}
	}

	eff, err := p.rulesetAt(ctx, tx, r.BlockTime)
	if err != nil {
		return err
	}
	rec := rules.Recommendation{Recommendation: "HOLD", Reasons: []string{"NO_RULESET"}, PolicyRef: "none", RuleID: "none"}
	var rulesetVersion *string
	if eff != nil {
		rec = eff.rs.Recommend(in)
		rulesetVersion = &eff.version
	}
	inputs, _ := json.Marshal(in.Map())
	if _, err := tx.Exec(ctx, `INSERT INTO recommendation (payment_id, ruleset_version, recommendation, reason_codes, policy_ref, auto, inputs, inputs_hash, engine_version)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, r.ID.Bytes(), rulesetVersion, rec.Recommendation, rec.Reasons, rec.PolicyRef,
		rec.Auto, inputs, in.Hash(), rules.EngineVersion()); err != nil {
		return err
	}

	snap, packID, err := p.snapshot(r, cs, eur, eff, rec, in)
	if err != nil {
		return err
	}
	data, _ := json.Marshal(snap.Data)
	salts, _ := json.Marshal(snap.Salts)
	if _, err := tx.Exec(ctx, `INSERT INTO evidence_snapshot (payment_id, pack_id, data, salts, evidence_root) VALUES ($1, $2, $3, $4, $5)`,
		r.ID.Bytes(), packID, data, salts, snap.EvidenceRoot); err != nil {
		return err
	}

	kind, _ := decision.Kind(rec.Recommendation)
	if eff != nil && rec.Auto && (kind == decision.Credit || kind == decision.Hold) {
		if err := p.decideAuto(ctx, tx, r, kind, rec); err != nil {
			return err
		}
	} else if _, err := tx.Exec(ctx, `UPDATE payment SET stage = 'in_review' WHERE id = $1`, r.ID.Bytes()); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func outcome(cs map[string]checkRow, kind string) string {
	if c, ok := cs[kind]; ok {
		return c.outcome
	}
	return checks.Unavailable
}
