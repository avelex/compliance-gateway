// Package config loads the single-tenant service configuration from one JSON file.
package config

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"os"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
)

// Duration is a time.Duration written as a Go duration string ("30s") in JSON.
type Duration struct{ time.Duration }

func (d *Duration) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return fmt.Errorf("duration must be a string like \"30s\": %w", err)
	}
	v, err := time.ParseDuration(s)
	if err != nil {
		return err
	}
	d.Duration = v
	return nil
}

type Config struct {
	DatabaseURL string `json:"database_url"`
	Listen      string `json:"listen"`
	APIToken    string `json:"api_token"`
	DataDir     string `json:"data_dir"` // raw provider responses live under DataDir/raw
	NATSURL     string `json:"nats_url"` // empty disables the eventscale hint

	Processor Processor        `json:"processor"`
	Chains    []Chain          `json:"chains"`
	Keys      Keys             `json:"keys"`
	Officers  []Officer        `json:"officers"`
	MLRO      []common.Address `json:"mlro"`
	Sanctions []SanctionsList  `json:"sanctions_lists"`
	KYT       KYT              `json:"kyt"`

	CheckTimeout   Duration `json:"check_timeout"`
	DecisionTTL    Duration `json:"decision_ttl"`
	WorkerInterval Duration `json:"worker_interval"`
	RetentionYears int      `json:"retention_years"`
}

type Processor struct {
	LegalName  string `json:"legal_name"`
	LEI        string `json:"lei"`
	CASPID     string `json:"casp_id"`
	NCA        string `json:"nca"`
	RFIChannel string `json:"rfi_channel"`
	CertURL    string `json:"cert_url"`
}

type Chain struct {
	ChainID           uint64    `json:"chain_id"`
	Name              string    `json:"name"`
	RPC               string    `json:"rpc"`
	Confirmations     uint64    `json:"confirmations"`
	ReconcileInterval Duration  `json:"reconcile_interval"`
	Chunk             uint64    `json:"chunk"`
	EventscaleNetwork string    `json:"eventscale_network"`
	Tokens            []Token   `json:"tokens"`
	Deposits          []Deposit `json:"deposit_addresses"`
}

type Token struct {
	Symbol          string         `json:"symbol"`
	Address         common.Address `json:"address"`
	Decimals        uint8          `json:"decimals"`
	EventscaleAlias string         `json:"eventscale_alias"`
	EURRate         string         `json:"eur_rate"` // decimal string; "1" for EURC
	FXSource        string         `json:"fx_source"`
}

type Deposit struct {
	Address    common.Address `json:"address"`
	MerchantID string         `json:"merchant_id"`
}

type Keys struct {
	PolicyKeyFile   string `json:"policy_key_file"`   // hex secp256k1 private key
	EvidenceKeyFile string `json:"evidence_key_file"` // PEM P-256 private key
	EvidenceKID     string `json:"evidence_kid"`
}

type Officer struct {
	Address   common.Address `json:"address"`
	OfficerID string         `json:"officer_id"` // pseudonymous, printed in packs
	Mask      uint8          `json:"mask"`       // CREDIT=1 HOLD=2 FREEZE=4 RETURN=8, as in ProcessorHub
}

type SanctionsList struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Path    string `json:"path"`
}

type KYT struct {
	GoPlusBaseURL string `json:"goplus_base_url"`
}

// Load reads and validates path. Unknown fields are rejected so a typo is not silently ignored.
func Load(path string) (*Config, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	var c Config
	if err := dec.Decode(&c); err != nil {
		return nil, fmt.Errorf("config %s: %w", path, err)
	}
	c.defaults()
	if err := c.Validate(); err != nil {
		return nil, fmt.Errorf("config %s: %w", path, err)
	}
	return &c, nil
}

func (c *Config) defaults() {
	if c.Listen == "" {
		c.Listen = ":8080"
	}
	if c.DataDir == "" {
		c.DataDir = "data"
	}
	if c.KYT.GoPlusBaseURL == "" {
		c.KYT.GoPlusBaseURL = "https://api.gopluslabs.io"
	}
	if c.CheckTimeout.Duration == 0 {
		c.CheckTimeout.Duration = 10 * time.Second
	}
	if c.DecisionTTL.Duration == 0 {
		c.DecisionTTL.Duration = 24 * time.Hour
	}
	if c.WorkerInterval.Duration == 0 {
		c.WorkerInterval.Duration = 2 * time.Second
	}
	if c.RetentionYears == 0 {
		c.RetentionYears = 7
	}
	for i := range c.Chains {
		ch := &c.Chains[i]
		if ch.ReconcileInterval.Duration == 0 {
			ch.ReconcileInterval.Duration = 30 * time.Second
		}
		if ch.Chunk == 0 {
			ch.Chunk = 2000
		}
	}
}

func (c *Config) Validate() error {
	var errs []error
	req := func(v, name string) {
		if strings.TrimSpace(v) == "" {
			errs = append(errs, fmt.Errorf("%s is required", name))
		}
	}
	req(c.DatabaseURL, "database_url")
	req(c.APIToken, "api_token")
	req(c.Processor.LegalName, "processor.legal_name")
	req(c.Keys.PolicyKeyFile, "keys.policy_key_file")
	req(c.Keys.EvidenceKeyFile, "keys.evidence_key_file")
	req(c.Keys.EvidenceKID, "keys.evidence_kid")
	if len(c.Chains) == 0 {
		errs = append(errs, errors.New("at least one chain is required"))
	}
	if len(c.MLRO) == 0 {
		errs = append(errs, errors.New("at least one mlro address is required"))
	}
	seen := map[uint64]bool{}
	for i, ch := range c.Chains {
		p := fmt.Sprintf("chains[%d]", i)
		if ch.ChainID == 0 {
			errs = append(errs, fmt.Errorf("%s.chain_id is required", p))
		}
		if seen[ch.ChainID] {
			errs = append(errs, fmt.Errorf("%s.chain_id %d is duplicated", p, ch.ChainID))
		}
		seen[ch.ChainID] = true
		req(ch.Name, p+".name")
		req(ch.RPC, p+".rpc")
		if len(ch.Tokens) == 0 {
			errs = append(errs, fmt.Errorf("%s.tokens is empty", p))
		}
		if len(ch.Deposits) == 0 {
			errs = append(errs, fmt.Errorf("%s.deposit_addresses is empty", p))
		}
		for j, t := range ch.Tokens {
			tp := fmt.Sprintf("%s.tokens[%d]", p, j)
			req(t.Symbol, tp+".symbol")
			req(t.FXSource, tp+".fx_source")
			if t.Address == (common.Address{}) {
				errs = append(errs, fmt.Errorf("%s.address is required", tp))
			}
			if r, ok := new(big.Rat).SetString(t.EURRate); !ok || r.Sign() <= 0 {
				errs = append(errs, fmt.Errorf("%s.eur_rate %q is not a positive decimal", tp, t.EURRate))
			}
		}
		for j, d := range ch.Deposits {
			dp := fmt.Sprintf("%s.deposit_addresses[%d]", p, j)
			if d.Address == (common.Address{}) {
				errs = append(errs, fmt.Errorf("%s.address is required", dp))
			}
			req(d.MerchantID, dp+".merchant_id")
		}
	}
	for i, o := range c.Officers {
		if o.Mask == 0 || o.Mask > 0x0F {
			errs = append(errs, fmt.Errorf("officers[%d].mask %d must be 1..15", i, o.Mask))
		}
		req(o.OfficerID, fmt.Sprintf("officers[%d].officer_id", i))
	}
	for i, s := range c.Sanctions {
		p := fmt.Sprintf("sanctions_lists[%d]", i)
		req(s.Name, p+".name")
		req(s.Version, p+".version")
		req(s.Path, p+".path")
	}
	return errors.Join(errs...)
}

// Chain returns the chain config for id.
func (c *Config) Chain(id uint64) (*Chain, bool) {
	for i := range c.Chains {
		if c.Chains[i].ChainID == id {
			return &c.Chains[i], true
		}
	}
	return nil, false
}

// Token returns the configured token at addr.
func (ch *Chain) Token(addr common.Address) (*Token, bool) {
	for i := range ch.Tokens {
		if ch.Tokens[i].Address == addr {
			return &ch.Tokens[i], true
		}
	}
	return nil, false
}

// Deposit returns the deposit config for addr.
func (ch *Chain) Deposit(addr common.Address) (*Deposit, bool) {
	for i := range ch.Deposits {
		if ch.Deposits[i].Address == addr {
			return &ch.Deposits[i], true
		}
	}
	return nil, false
}
