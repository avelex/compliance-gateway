// Package rules is the recommendation engine: a ruleset is data with a fixed condition vocabulary, and
// recommend() is a pure function of normalised check outcomes (design-compliance-backend D6).
package rules

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"runtime/debug"
	"slices"

	"compliance-backend/internal/evidence"
)

type Condition struct {
	Field string `json:"field"`
	Op    string `json:"op"`
	Value any    `json:"value"`
}

type Rule struct {
	ID        string      `json:"id"`
	When      []Condition `json:"when"`
	Recommend string      `json:"recommend"`
	Reasons   []string    `json:"reasons"`
	Auto      bool        `json:"auto"`
}

type Ruleset struct {
	Version string `json:"version"`
	Rules   []Rule `json:"rules"`
}

// Inputs are the normalised outcomes a recommendation depends on, and nothing else.
type Inputs struct {
	KYT            string `json:"kyt.risk_level"`
	Sanctions      string `json:"sanctions.result"`
	Structuring    string `json:"structuring.result"`
	Issuer         string `json:"issuer.result"`
	AnyUnavailable bool   `json:"any_unavailable"`
	AmountEUR      string `json:"amount_eur"`
}

type Recommendation struct {
	Recommendation string
	Reasons        []string
	PolicyRef      string // "<ruleset version>/<rule id>"
	RuleID         string
	Auto           bool
}

var enums = map[string][]string{
	"kyt.risk_level":     {"LOW", "MEDIUM", "HIGH", "SEVERE", "UNAVAILABLE"},
	"sanctions.result":   {"NO_MATCH", "TRUE_MATCH", "UNAVAILABLE"},
	"structuring.result": {"PASS", "FLAG", "UNAVAILABLE"},
	"issuer.result":      {"NOT_LISTED", "LISTED", "UNAVAILABLE"},
}

var Decisions = []string{"CREDIT", "HOLD", "FREEZE", "RETURN"}

// Parse strictly decodes and validates a ruleset, and returns its canonical form and hash.
func Parse(raw []byte) (*Ruleset, []byte, string, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	dec.UseNumber()
	var rs Ruleset
	if err := dec.Decode(&rs); err != nil {
		return nil, nil, "", fmt.Errorf("ruleset: %w", err)
	}
	if err := rs.validate(); err != nil {
		return nil, nil, "", err
	}
	var generic map[string]any
	if err := evidence.Decode(raw, &generic); err != nil {
		return nil, nil, "", err
	}
	canon, err := evidence.Canon(generic)
	if err != nil {
		return nil, nil, "", fmt.Errorf("ruleset: %w", err)
	}
	return &rs, canon, evidence.SHA(canon), nil
}

func (rs *Ruleset) validate() error {
	var errs []error
	if rs.Version == "" {
		errs = append(errs, errors.New("version is required"))
	}
	if len(rs.Rules) == 0 {
		return errors.Join(append(errs, errors.New("at least one rule is required"))...)
	}
	ids := map[string]bool{}
	for i, r := range rs.Rules {
		p := fmt.Sprintf("rules[%d] (%s)", i, r.ID)
		if r.ID == "" || ids[r.ID] {
			errs = append(errs, fmt.Errorf("%s: id missing or duplicated", p))
		}
		ids[r.ID] = true
		if !slices.Contains(Decisions, r.Recommend) {
			errs = append(errs, fmt.Errorf("%s: recommend %q is not one of %v", p, r.Recommend, Decisions))
		}
		if len(r.Reasons) == 0 {
			errs = append(errs, fmt.Errorf("%s: at least one reason code is required", p))
		}
		for j, c := range r.When {
			if err := c.validate(); err != nil {
				errs = append(errs, fmt.Errorf("%s.when[%d]: %w", p, j, err))
			}
		}
	}
	if last := rs.Rules[len(rs.Rules)-1]; len(last.When) != 0 {
		errs = append(errs, fmt.Errorf("the last rule (%s) must have no conditions: it is the default", last.ID))
	}
	return errors.Join(errs...)
}

func (c Condition) validate() error {
	switch {
	case enums[c.Field] != nil:
		allowed := enums[c.Field]
		switch c.Op {
		case "eq":
			s, ok := c.Value.(string)
			if !ok || !slices.Contains(allowed, s) {
				return fmt.Errorf("field %s eq needs one of %v", c.Field, allowed)
			}
		case "in":
			l, ok := c.Value.([]any)
			if !ok || len(l) == 0 {
				return fmt.Errorf("field %s in needs a non-empty list", c.Field)
			}
			for _, v := range l {
				if s, ok := v.(string); !ok || !slices.Contains(allowed, s) {
					return fmt.Errorf("field %s in: %v is not one of %v", c.Field, v, allowed)
				}
			}
		default:
			return fmt.Errorf("field %s does not support operator %q (use eq or in)", c.Field, c.Op)
		}
	case c.Field == "any_unavailable":
		if _, ok := c.Value.(bool); !ok || c.Op != "eq" {
			return errors.New("field any_unavailable takes eq with a boolean")
		}
	case c.Field == "amount_eur":
		s, ok := c.Value.(string)
		if _, okr := new(big.Rat).SetString(s); !ok || !okr || c.Op != "gte" {
			return errors.New(`field amount_eur takes gte with a decimal string, e.g. "1000.00"`)
		}
	default:
		return fmt.Errorf("unknown field %q", c.Field)
	}
	return nil
}

func (in Inputs) get(field string) string {
	switch field {
	case "kyt.risk_level":
		return in.KYT
	case "sanctions.result":
		return in.Sanctions
	case "structuring.result":
		return in.Structuring
	case "issuer.result":
		return in.Issuer
	}
	return ""
}

func (c Condition) match(in Inputs) bool {
	switch c.Field {
	case "any_unavailable":
		return in.AnyUnavailable == c.Value.(bool)
	case "amount_eur":
		a, ok1 := new(big.Rat).SetString(in.AmountEUR)
		b, ok2 := new(big.Rat).SetString(c.Value.(string))
		return ok1 && ok2 && a.Cmp(b) >= 0
	}
	v := in.get(c.Field)
	if c.Op == "eq" {
		return v == c.Value.(string)
	}
	for _, x := range c.Value.([]any) {
		if v == x.(string) {
			return true
		}
	}
	return false
}

// Recommend returns the first rule whose conditions all match. Validation guarantees a default rule.
func (rs *Ruleset) Recommend(in Inputs) Recommendation {
	for _, r := range rs.Rules {
		ok := true
		for _, c := range r.When {
			if !c.match(in) {
				ok = false
				break
			}
		}
		if ok {
			return Recommendation{Recommendation: r.Recommend, Reasons: r.Reasons, RuleID: r.ID,
				PolicyRef: rs.Version + "/" + r.ID, Auto: r.Auto}
		}
	}
	panic("validated ruleset without a default rule")
}

// Map is the canonical-JSON-ready form of the inputs, as stored and hashed.
func (in Inputs) Map() map[string]any {
	return map[string]any{"kyt.risk_level": in.KYT, "sanctions.result": in.Sanctions, "structuring.result": in.Structuring,
		"issuer.result": in.Issuer, "any_unavailable": in.AnyUnavailable, "amount_eur": in.AmountEUR}
}

// Hash is sha256 of the canonical inputs, so a replay can prove it used the same ones.
func (in Inputs) Hash() string {
	b, _ := evidence.Canon(in.Map())
	return evidence.SHA(b)
}

// EngineVersion names the engine build, e.g. "deflow-core@1a2b3c4".
func EngineVersion() string {
	rev := "dev"
	if bi, ok := debug.ReadBuildInfo(); ok {
		for _, s := range bi.Settings {
			if s.Key == "vcs.revision" && len(s.Value) >= 7 {
				rev = s.Value[:7]
			}
		}
	}
	return "deflow-core@" + rev
}
