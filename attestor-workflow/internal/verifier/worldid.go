package verifier

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"attestor-workflow/contracts/evm/src/generated/attestation_registry"
	"attestor-workflow/internal/domain"
	"attestor-workflow/internal/httpx"
	"attestor-workflow/internal/nullifier"
)

const WorldIDLevel uint8 = 1

type WorldIDProvider struct {
	BaseURL    string
	AppID      string
	HTTPClient httpx.Doer
	TTL        time.Duration
}

var _ VerificationProvider = (*WorldIDProvider)(nil)

type worldIDVerifyRequest struct {
	MerkleRoot        string `json:"merkle_root"`
	NullifierHash     string `json:"nullifier_hash"`
	Proof             string `json:"proof"`
	VerificationLevel string `json:"verification_level"`
	Action            string `json:"action"`
	Signal            string `json:"signal"`
}

type worldIDVerifyResponse struct {
	Success bool   `json:"success"`
	Code    string `json:"code"`
	Detail  string `json:"detail"`
}

func (p *WorldIDProvider) Verify(ctx context.Context, req domain.VerificationRequest) (attestation_registry.Attestation, error) {
	if req.WorldID == nil {
		return attestation_registry.Attestation{}, fmt.Errorf("worldid: missing proof")
	}

	payload, err := json.Marshal(worldIDVerifyRequest{
		MerkleRoot:        req.WorldID.MerkleRoot,
		NullifierHash:     req.WorldID.NullifierHash,
		Proof:             req.WorldID.Proof,
		VerificationLevel: req.WorldID.VerificationLevel,
		Action:            req.WorldID.Action,
		Signal:            req.Wallet.Hex(),
	})
	if err != nil {
		return attestation_registry.Attestation{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.BaseURL+"/api/v2/verify/"+p.AppID, bytes.NewReader(payload))
	if err != nil {
		return attestation_registry.Attestation{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := p.HTTPClient.Do(httpReq)
	if err != nil {
		return attestation_registry.Attestation{}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return attestation_registry.Attestation{}, err
	}

	var result worldIDVerifyResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return attestation_registry.Attestation{}, err
	}

	if resp.StatusCode != http.StatusOK || !result.Success {
		return attestation_registry.Attestation{}, fmt.Errorf("worldid: verify failed: %s %s", result.Code, result.Detail)
	}

	return attestation_registry.Attestation{
		Nullifier: nullifier.Derive([]byte(req.WorldID.NullifierHash), req.Gate),
		Level:     WorldIDLevel,
		Expiry:    uint64(time.Now().Add(p.TTL).Unix()),
	}, nil
}
