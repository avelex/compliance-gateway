package queue

import (
	"context"

	"attestor-workflow/internal/domain"
)

type RequestQueue interface {
	Pending(ctx context.Context) ([]domain.VerificationRequest, error)
}
