package provenance

import (
	"context"

	"github.com/ethereum/go-ethereum/common"
)

type ProvenanceScreener interface {
	Score(ctx context.Context, wallet common.Address) (uint8, error)
}
