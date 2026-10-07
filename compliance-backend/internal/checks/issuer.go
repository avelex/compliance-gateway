package checks

import (
	"context"
	"fmt"
	"math/big"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

var isBlacklistedSel = crypto.Keccak256([]byte("isBlacklisted(address)"))[:4]

// Issuer reads the token's own blacklist (USDC and EURC expose isBlacklisted) at the payment block.
type Issuer struct {
	Clients map[uint64]*ethclient.Client // by chain id
}

func (Issuer) Kind() string { return "issuer" }

func (i Issuer) Run(ctx context.Context, p Payment) (Result, []byte, error) {
	res := Result{Provider: "Token contract", Product: "isBlacklisted(address)"}
	eth, ok := i.Clients[p.ChainID]
	if !ok {
		return res, nil, fmt.Errorf("no RPC for chain %d", p.ChainID)
	}
	listed := map[string]bool{}
	for name, who := range map[string]common.Address{"payer": p.Payer, "deposit": p.Deposit} {
		out, err := eth.CallContract(ctx, ethereum.CallMsg{To: &p.Token,
			Data: append(append([]byte{}, isBlacklistedSel...), common.LeftPadBytes(who.Bytes(), 32)...)},
			new(big.Int).SetUint64(p.BlockNumber))
		if err != nil {
			return res, nil, fmt.Errorf("isBlacklisted(%s): %w", name, err)
		}
		if len(out) != 32 {
			return res, nil, fmt.Errorf("isBlacklisted(%s): token returned %d bytes, not a bool", name, len(out))
		}
		listed[name] = new(big.Int).SetBytes(out).Sign() != 0
	}
	res.Outcome = "NOT_LISTED"
	if listed["payer"] || listed["deposit"] {
		res.Outcome = "LISTED"
	}
	now := time.Now().UTC()
	res.PerformedAt = now
	res.Section = map[string]any{
		"checked":        "Payer address and deposit address",
		"block":          p.BlockNumber,
		"payer_listed":   listed["payer"],
		"deposit_listed": listed["deposit"],
		"result":         res.Outcome,
		"checked_at":     now.Format(time.RFC3339),
	}
	return res, nil, nil
}
