// Package ingest records deposits to the processor's addresses: eventscale is the low-latency hint,
// the eth_getLogs reconciler is the truth (design D3, design-compliance-backend D4).
package ingest

import (
	"context"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/jackc/pgx/v5"

	"compliance-backend/internal/store"
)

// TransferTopic is keccak256("Transfer(address,address,uint256)").
var TransferTopic = crypto.Keccak256Hash([]byte("Transfer(address,address,uint256)"))

// Deposit is one ERC-20 Transfer into a deposit address.
type Deposit struct {
	ChainID     uint64
	TxHash      common.Hash
	LogIndex    uint64
	BlockNumber uint64
	BlockHash   common.Hash
	BlockTime   time.Time
	Token       common.Address
	Payer       common.Address
	To          common.Address
	Amount      *big.Int
}

// PaymentID = keccak256(abi.encode(uint256 chainId, bytes32 txHash, uint256 logIndex)), as the
// processor contracts and the evidence pack define it.
func PaymentID(chainID uint64, tx common.Hash, logIndex uint64) common.Hash {
	return crypto.Keccak256Hash(
		common.LeftPadBytes(new(big.Int).SetUint64(chainID).Bytes(), 32),
		tx.Bytes(),
		common.LeftPadBytes(new(big.Int).SetUint64(logIndex).Bytes(), 32),
	)
}

func (d Deposit) ID() common.Hash { return PaymentID(d.ChainID, d.TxHash, d.LogIndex) }

// upsertConfirmed records d as on the canonical chain at depth N. A row first seen through the hint,
// or earlier marked orphaned, is (re)confirmed with the reconciled block.
func upsertConfirmed(ctx context.Context, tx pgx.Tx, d Deposit, reconstruction bool) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO payment (id, chain_id, tx_hash, log_index, block_number, block_hash, block_time,
		                     token, payer, deposit, amount, ingest, reconstruction)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::numeric, 'confirmed', $12)
		ON CONFLICT (id) DO UPDATE SET block_number = EXCLUDED.block_number, block_hash = EXCLUDED.block_hash,
		    block_time = EXCLUDED.block_time, ingest = 'confirmed',
		    reconstruction = payment.reconstruction OR EXCLUDED.reconstruction`,
		d.ID().Bytes(), d.ChainID, d.TxHash.Bytes(), d.LogIndex, d.BlockNumber, d.BlockHash.Bytes(), d.BlockTime,
		d.Token.Bytes(), d.Payer.Bytes(), d.To.Bytes(), d.Amount.String(), reconstruction)
	return err
}

// upsertSeen records a hint. It never downgrades a confirmed row. A hint for a block the reconciler has
// already passed without finding the log is from a replaced block, so it lands as orphaned.
func upsertSeen(ctx context.Context, st *store.Store, d Deposit) error {
	_, err := st.Exec(ctx, `
		INSERT INTO payment (id, chain_id, tx_hash, log_index, block_number, block_hash, block_time,
		                     token, payer, deposit, amount, ingest)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::numeric,
		        CASE WHEN $5 <= COALESCE((SELECT last_reconciled FROM chain_cursor WHERE chain_id = $2), -1)
		             THEN 'orphaned' ELSE 'seen' END)
		ON CONFLICT (id) DO NOTHING`,
		d.ID().Bytes(), d.ChainID, d.TxHash.Bytes(), d.LogIndex, d.BlockNumber, d.BlockHash.Bytes(), d.BlockTime,
		d.Token.Bytes(), d.Payer.Bytes(), d.To.Bytes(), d.Amount.String())
	return err
}
