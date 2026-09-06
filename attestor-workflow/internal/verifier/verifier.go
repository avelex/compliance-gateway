package verifier

import (
	"context"

	"attestor-workflow/contracts/evm/src/generated/attestation_registry"
	"attestor-workflow/internal/domain"
)

type VerificationProvider interface {
	Verify(ctx context.Context, req domain.VerificationRequest) (attestation_registry.Attestation, error)
}
