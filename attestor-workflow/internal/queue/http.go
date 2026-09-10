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

type PendingQueueClient struct {
	BaseURL            string
	authorizationToken string
	Client             httpx.Doer
}

func NewClient(baseURL, fetchToken string, client httpx.Doer) *PendingQueueClient {
	return &PendingQueueClient{
		BaseURL:            baseURL,
		authorizationToken: fetchToken,
		Client:             client,
	}
}

var _ RequestQueue = (*PendingQueueClient)(nil)

type wireRequest struct {
	Gate    string               `json:"gate"`
	Wallet  string               `json:"wallet"`
	Level   uint8                `json:"level"`
	WorldID *domain.WorldIDProof `json:"worldId,omitempty"`
}

type wireResponse struct {
	Minute int64         `json:"minute"`
	Items  []wireRequest `json:"items"`
}

func (q *PendingQueueClient) Pending(ctx context.Context, minute int64) ([]domain.VerificationRequest, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("%s/api/relay/queue?minute=%d", q.BaseURL, minute), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+q.authorizationToken)

	resp, err := q.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("queue: unexpected status %d", resp.StatusCode)
	}

	var wire wireResponse
	if err := json.NewDecoder(resp.Body).Decode(&wire); err != nil {
		return nil, err
	}

	out := make([]domain.VerificationRequest, len(wire.Items))
	for i, w := range wire.Items {
		out[i] = domain.VerificationRequest{
			Gate:    common.HexToAddress(w.Gate),
			Wallet:  common.HexToAddress(w.Wallet),
			Level:   w.Level,
			WorldID: w.WorldID,
		}
	}
	return out, nil
}
