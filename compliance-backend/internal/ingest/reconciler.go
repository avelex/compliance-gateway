package ingest

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"

	"compliance-backend/internal/config"
	"compliance-backend/internal/store"
)

// Reconciler is the source of truth for deposits on one chain.
type Reconciler struct {
	st  *store.Store
	ch  *config.Chain
	eth *ethclient.Client
	log *slog.Logger
}

func NewReconciler(st *store.Store, ch *config.Chain, eth *ethclient.Client, log *slog.Logger) *Reconciler {
	return &Reconciler{st: st, ch: ch, eth: eth, log: log.With("chain", ch.ChainID)}
}

// Run reconciles until ctx ends, catching up chunk by chunk and then waiting one interval.
func (r *Reconciler) Run(ctx context.Context) {
	for ctx.Err() == nil {
		more, err := r.Step(ctx)
		if err != nil && ctx.Err() == nil {
			r.log.Error("reconcile", "err", err)
		}
		if more && err == nil {
			continue
		}
		select {
		case <-ctx.Done():
		case <-time.After(r.ch.ReconcileInterval.Duration):
		}
	}
}

// Backfill restarts reconciliation at fromBlock. Payments confirmed up to the current safe head are
// marked as reconstructions, since they predate the service watching them live.
func Backfill(ctx context.Context, st *store.Store, eth *ethclient.Client, ch *config.Chain, fromBlock uint64) (until uint64, err error) {
	head, err := eth.BlockNumber(ctx)
	if err != nil {
		return 0, err
	}
	if head < ch.Confirmations || fromBlock == 0 {
		return 0, errors.New("from block must be at least 1 and below the safe head")
	}
	until = head - ch.Confirmations
	_, err = st.Exec(ctx, `
		INSERT INTO chain_cursor (chain_id, last_reconciled, backfill_until) VALUES ($1, $2, $3)
		ON CONFLICT (chain_id) DO UPDATE SET last_reconciled = $2, backfill_until = $3`,
		ch.ChainID, fromBlock-1, until)
	return until, err
}

// Step reconciles one range [last+1, min(head-N, last+chunk)]. It reports whether more ranges are ready.
func (r *Reconciler) Step(ctx context.Context) (more bool, err error) {
	head, err := r.eth.BlockNumber(ctx)
	if err != nil {
		return false, err
	}
	if head < r.ch.Confirmations {
		return false, nil
	}
	safe := head - r.ch.Confirmations

	// First start without a backfill: watch from the current safe head on.
	if _, err := r.st.Exec(ctx, `INSERT INTO chain_cursor (chain_id, last_reconciled) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		r.ch.ChainID, safe); err != nil {
		return false, err
	}
	var last, backfillUntil uint64
	if err := r.st.QueryRow(ctx, `SELECT last_reconciled, backfill_until FROM chain_cursor WHERE chain_id = $1`,
		r.ch.ChainID).Scan(&last, &backfillUntil); err != nil {
		return false, err
	}
	from := last + 1
	if from > safe {
		return false, nil
	}
	to := min(safe, from+r.ch.Chunk-1)

	deposits, err := r.fetch(ctx, from, to)
	if err != nil {
		return false, err
	}

	tx, err := r.st.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	for _, d := range deposits {
		if err := upsertConfirmed(ctx, tx, d, d.BlockNumber <= backfillUntil); err != nil {
			return false, err
		}
	}
	// Any hint left unconfirmed in a fully reconciled range is not on the canonical chain.
	tag, err := tx.Exec(ctx, `UPDATE payment SET ingest = 'orphaned'
		WHERE chain_id = $1 AND ingest = 'seen' AND block_number BETWEEN $2 AND $3`, r.ch.ChainID, from, to)
	if err != nil {
		return false, err
	}
	if _, err := tx.Exec(ctx, `UPDATE chain_cursor SET last_reconciled = $2 WHERE chain_id = $1`, r.ch.ChainID, to); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, err
	}
	if len(deposits) > 0 || tag.RowsAffected() > 0 {
		r.log.Info("reconciled", "from", from, "to", to, "deposits", len(deposits), "orphaned", tag.RowsAffected())
	}
	return to < safe, nil
}

func (r *Reconciler) fetch(ctx context.Context, from, to uint64) ([]Deposit, error) {
	tokens := make([]common.Address, len(r.ch.Tokens))
	for i, t := range r.ch.Tokens {
		tokens[i] = t.Address
	}
	recipients := make([]common.Hash, len(r.ch.Deposits))
	for i, d := range r.ch.Deposits {
		recipients[i] = common.BytesToHash(d.Address.Bytes())
	}
	logs, err := r.eth.FilterLogs(ctx, ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(from),
		ToBlock:   new(big.Int).SetUint64(to),
		Addresses: tokens,
		// The deposit address is the indexed `to`, so the node does the filtering.
		Topics: [][]common.Hash{{TransferTopic}, nil, recipients},
	})
	if err != nil {
		return nil, err
	}
	headers := map[uint64]*types.Header{}
	out := make([]Deposit, 0, len(logs))
	for _, l := range logs {
		if l.Removed || len(l.Topics) != 3 || len(l.Data) != 32 {
			continue
		}
		h, ok := headers[l.BlockNumber]
		if !ok {
			if h, err = r.eth.HeaderByNumber(ctx, new(big.Int).SetUint64(l.BlockNumber)); err != nil {
				return nil, err
			}
			headers[l.BlockNumber] = h
		}
		if h.Hash() != l.BlockHash {
			return nil, fmt.Errorf("block %d changed during reconciliation", l.BlockNumber)
		}
		out = append(out, Deposit{
			ChainID: r.ch.ChainID, TxHash: l.TxHash, LogIndex: uint64(l.Index),
			BlockNumber: l.BlockNumber, BlockHash: l.BlockHash, BlockTime: time.Unix(int64(h.Time), 0).UTC(),
			Token: l.Address, Payer: common.BytesToAddress(l.Topics[1].Bytes()), To: common.BytesToAddress(l.Topics[2].Bytes()),
			Amount: new(big.Int).SetBytes(l.Data),
		})
	}
	return out, nil
}
