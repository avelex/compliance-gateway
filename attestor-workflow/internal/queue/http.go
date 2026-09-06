package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/ethereum/go-ethereum/common"

	"attestor-workflow/internal/domain"
	"attestor-workflow/internal/httpx"
)

type HTTPQueue struct {
	BaseURL string
	Client  httpx.Doer
}

func NewHTTPQueue(baseURL string, client httpx.Doer) *HTTPQueue {
	return &HTTPQueue{BaseURL: baseURL, Client: client}
}

var _ RequestQueue = (*HTTPQueue)(nil)

type wireRequest struct {
	Gate    string               `json:"gate"`
	Wallet  string               `json:"wallet"`
	Level   uint8                `json:"level"`
	WorldID *domain.WorldIDProof `json:"worldId,omitempty"`
}

func (q *HTTPQueue) Pending(ctx context.Context) ([]domain.VerificationRequest, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, q.BaseURL+"/api/verify/queue", nil)
	if err != nil {
		return nil, err
	}

	resp, err := q.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("queue: unexpected status %d", resp.StatusCode)
	}

	var wire []wireRequest
	if err := json.NewDecoder(resp.Body).Decode(&wire); err != nil {
		return nil, err
	}

	out := make([]domain.VerificationRequest, len(wire))
	for i, w := range wire {
		out[i] = domain.VerificationRequest{
			Gate:    common.HexToAddress(w.Gate),
			Wallet:  common.HexToAddress(w.Wallet),
			Level:   w.Level,
			WorldID: w.WorldID,
		}
	}
	return out, nil
}
