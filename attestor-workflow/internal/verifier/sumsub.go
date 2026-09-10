package verifier

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"attestor-workflow/contracts/evm/src/generated/attestation_registry"
	"attestor-workflow/internal/domain"
	"attestor-workflow/internal/nullifier"
	"attestor-workflow/internal/sessionid"
	"attestor-workflow/internal/sumsubapi"
)

const SumsubLevel uint8 = 2

type SumsubProvider struct {
	Client        *sumsubapi.Client
	TTL           time.Duration
	SessionSecret string
	EnclaveSecret []byte
}

var _ VerificationProvider = (*SumsubProvider)(nil)

type sumsubIDDoc struct {
	Country   string `json:"country"`
	IDDocType string `json:"idDocType"`
	Number    string `json:"number"`
}

type sumsubApplicant struct {
	ID     string `json:"id"`
	Review struct {
		ReviewStatus string `json:"reviewStatus"`
		ReviewResult struct {
			ReviewAnswer string `json:"reviewAnswer"`
		} `json:"reviewResult"`
	} `json:"review"`
	Info struct {
		IDDocs []sumsubIDDoc `json:"idDocs"`
	} `json:"info"`
}

func firstDoc(docs []sumsubIDDoc) (sumsubIDDoc, bool) {
	if len(docs) == 0 {
		return sumsubIDDoc{}, false
	}
	sorted := make([]sumsubIDDoc, len(docs))
	copy(sorted, docs)
	sort.Slice(sorted, func(i, j int) bool {
		if sorted[i].Country != sorted[j].Country {
			return sorted[i].Country < sorted[j].Country
		}
		if sorted[i].IDDocType != sorted[j].IDDocType {
			return sorted[i].IDDocType < sorted[j].IDDocType
		}
		return sorted[i].Number < sorted[j].Number
	})
	return sorted[0], true
}

func (p *SumsubProvider) Verify(ctx context.Context, req domain.VerificationRequest) (attestation_registry.Attestation, error) {
	uid := sessionid.SessionUserID(p.SessionSecret, strings.ToLower(req.Gate.Hex()), strings.ToLower(req.Wallet.Hex()))
	path := fmt.Sprintf("/resources/applicants/-;externalUserId=%s/one", uid)

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

	doc, ok := firstDoc(applicant.Info.IDDocs)
	if !ok {
		return attestation_registry.Attestation{}, fmt.Errorf("sumsub: applicant %s has no id docs", applicant.ID)
	}

	return attestation_registry.Attestation{
		Nullifier: nullifier.DeriveFromDoc(p.EnclaveSecret, doc.Number, doc.Country, req.Gate),
		Level:     SumsubLevel,
		Expiry:    uint64(time.Now().Add(p.TTL).Unix()),
	}, nil
}
