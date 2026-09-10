package provenance

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/ethereum/go-ethereum/common"

	"attestor-workflow/internal/httpx"
)

// Risk weights per GoPlus address_security flag. Highest matching flag wins.
var goPlusWeights = map[string]uint8{
	"sanctioned":               100,
	"money_laundering":         90,
	"stealing_attack":          90,
	"mixer":                    80,
	"darkweb_transactions":     80,
	"cybercrime":               70,
	"financial_crime":          70,
	"blackmail_activities":     70,
	"phishing_activities":      60,
	"blacklist_doubt":          50,
	"fake_kyc":                 40,
	"honeypot_related_address": 30,
}

const GoPlusBaseURL = "https://api.gopluslabs.io"

type GoPlusScreener struct {
	BaseURL string
	Client  httpx.Doer
}

var _ ProvenanceScreener = (*GoPlusScreener)(nil)

type goPlusResponse struct {
	Code   int               `json:"code"`
	Result map[string]string `json:"result"`
}

// Score returns a 0-100 risk score for the wallet's on-chain reputation on
// mainnet (chain_id=1 always — an EOA's reputation lives there regardless of
// which chain the payment itself is on). Fails closed: any error or
// unparseable response returns the maximum risk score, matching the rest of
// the compliance flow.
func (s *GoPlusScreener) Score(ctx context.Context, wallet common.Address) (uint8, error) {
	url := fmt.Sprintf("%s/api/v1/address_security/%s?chain_id=1", s.BaseURL, wallet.Hex())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 100, err
	}

	resp, err := s.Client.Do(req)
	if err != nil {
		return 100, nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 100, nil
	}

	var parsed goPlusResponse
	if err := json.Unmarshal(body, &parsed); err != nil || parsed.Code != 1 {
		return 100, nil
	}

	var score uint8
	for flag, weight := range goPlusWeights {
		if parsed.Result[flag] == "1" && weight > score {
			score = weight
		}
	}
	return score, nil
}
