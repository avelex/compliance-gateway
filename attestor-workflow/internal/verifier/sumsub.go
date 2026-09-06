package verifier

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"attestor-workflow/contracts/evm/src/generated/attestation_registry"
	"attestor-workflow/internal/domain"
	"attestor-workflow/internal/nullifier"
	"attestor-workflow/internal/sumsubapi"
)

const SumsubLevel uint8 = 2

type SumsubProvider struct {
	Client *sumsubapi.Client
	TTL    time.Duration
}

var _ VerificationProvider = (*SumsubProvider)(nil)

type sumsubApplicant struct {
	ID     string `json:"id"`
	Review struct {
		ReviewStatus string `json:"reviewStatus"`
		ReviewResult struct {
			ReviewAnswer string `json:"reviewAnswer"`
		} `json:"reviewResult"`
	} `json:"review"`
}

func (p *SumsubProvider) Verify(ctx context.Context, req domain.VerificationRequest) (attestation_registry.Attestation, error) {
	path := fmt.Sprintf("/resources/applicants/-;externalUserId=%s/one", req.Wallet.Hex())

	resp, err := p.Client.DoJSONOK(ctx, "GET", path, nil)
	if err != nil {
		return attestation_registry.Attestation{}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return attestation_registry.Attestation{}, err
	}

	var applicant sumsubApplicant
	if err := json.Unmarshal(body, &applicant); err != nil {
		return attestation_registry.Attestation{}, err
	}

	if applicant.Review.ReviewStatus != "completed" || applicant.Review.ReviewResult.ReviewAnswer != "GREEN" {
		return attestation_registry.Attestation{}, fmt.Errorf("sumsub: applicant %s not approved", applicant.ID)
	}

	return attestation_registry.Attestation{
		Nullifier: nullifier.Derive([]byte(applicant.ID), req.Gate),
		Level:     SumsubLevel,
		Expiry:    uint64(time.Now().Add(p.TTL).Unix()),
	}, nil
}
