package checks

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"time"
)

// goPlusWeights are the attestor-workflow risk weights per GoPlus address_security flag.
var goPlusWeights = map[string]int{
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

// GoPlus is the demo KYT provider. It scores an address's reputation on Ethereum mainnet, where an
// EOA's history lives regardless of the payment chain. Not a production KYT (design-compliance-backend risks).
type GoPlus struct {
	BaseURL string
	Client  *http.Client
}

func (GoPlus) Kind() string { return "kyt" }

func riskLevel(score int) string {
	switch {
	case score >= 80:
		return "SEVERE"
	case score >= 60:
		return "HIGH"
	case score >= 30:
		return "MEDIUM"
	default:
		return "LOW"
	}
}

func (g GoPlus) Run(ctx context.Context, p Payment) (Result, []byte, error) {
	res := Result{Provider: "GoPlus", Product: "address_security (demo, not for production)"}
	url := fmt.Sprintf("%s/api/v1/address_security/%s?chain_id=1", g.BaseURL, p.Payer.Hex())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return res, nil, err
	}
	client := g.Client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return res, nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return res, nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return res, nil, fmt.Errorf("goplus http %d", resp.StatusCode)
	}
	var parsed struct {
		Code   int               `json:"code"`
		Result map[string]string `json:"result"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil || parsed.Code != 1 {
		return res, nil, fmt.Errorf("goplus response not usable (code %d): %v", parsed.Code, err)
	}
	score := 0
	categories := []any{}
	var flags []string
	for flag, w := range goPlusWeights {
		if parsed.Result[flag] == "1" {
			flags = append(flags, flag)
			score = max(score, w)
		}
	}
	sort.Strings(flags)
	alerts := []any{}
	for _, f := range flags {
		categories = append(categories, f)
		alerts = append(alerts, map[string]any{"category": f, "severity": riskLevel(goPlusWeights[f])})
	}
	now := time.Now().UTC()
	level := riskLevel(score)
	res.Outcome = level
	res.PerformedAt = now
	res.Section = map[string]any{
		"provider":     res.Provider,
		"product":      res.Product,
		"api_version":  "v1 address_security, chain_id=1",
		"external_ref": nil,
		"screened_at":  now.Format(time.RFC3339),
		"risk_level":   level,
		"categories":   categories,
		"alerts":       alerts,
		"exposures":    []any{},
		"score":        fmt.Sprint(score),
	}
	return res, body, nil
}
