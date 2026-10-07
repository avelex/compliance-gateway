package pipeline

import (
	"crypto/rand"
	"fmt"
	"time"

	"compliance-backend/internal/checks"
	"compliance-backend/internal/evidence"
	"compliance-backend/internal/rules"
)

const notCollected = "Not collected: gathered outside Deflow (configuration b, no checkout integration)"

func uuid4() string {
	b := make([]byte, 16)
	rand.Read(b)
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// snapshot fills the ten evidence sections, the part a decision is taken on (packHash = evidence_root).
func (p *Pipeline) snapshot(r row, cs map[string]checkRow, eur string, eff *effectiveRuleset, rec rules.Recommendation, in rules.Inputs) (*evidence.Snapshot, string, error) {
	ch, tok, err := p.token(r)
	if err != nil {
		return nil, "", err
	}
	packID := uuid4()
	section := func(kind string) map[string]any {
		c, ok := cs[kind]
		if !ok {
			return map[string]any{"result": checks.Unavailable, "error": "no result stored"}
		}
		s := c.section
		if kind == "kyt" {
			if c.rawSHA != nil {
				s["raw_response_sha256"] = *c.rawSHA
			} else {
				s["raw_response_sha256"] = nil
			}
		}
		return s
	}
	rulesSection := map[string]any{
		"rules_version": nil, "ruleset_hash": nil, "approved_by": nil, "effective_from": nil,
		"engine_version": rules.EngineVersion(), "thresholds": nil,
		"recommendation": map[string]any{"recommendation": rec.Recommendation, "reason_codes": rec.Reasons,
			"policy_ref": rec.PolicyRef, "inputs": in.Map(), "inputs_hash": in.Hash()},
	}
	if eff != nil {
		rulesSection["rules_version"] = eff.version
		rulesSection["ruleset_hash"] = eff.hash
		rulesSection["approved_by"] = eff.approvedBy.Hex()
		rulesSection["effective_from"] = eff.effectiveFrom.Format(time.RFC3339)
		rulesSection["thresholds"] = "See ruleset " + eff.version + " (sha256 " + eff.hash + "); matched rule " + rec.RuleID
	}
	bt := r.BlockTime.Format(time.RFC3339)
	sections := map[string]any{
		"pack_id":     packID,
		"payment_ref": r.ID.Hex(),
		"onchain": map[string]any{
			"chain_name": ch.Name, "chain_id": r.ChainID, "token": tok.Symbol, "token_contract": r.Token.Hex(),
			"amount": checks.FormatUnits(r.Amount, tok.Decimals), "fx_rate_eur": tok.EURRate, "amount_eur": eur,
			"fx_source": tok.FXSource, "fx_at": bt, "payer_address": r.Payer.Hex(), "deposit_contract": r.Deposit.Hex(),
			"tx_hash": r.TxHash.Hex(), "block_number": r.BlockNumber, "block_timestamp": bt, "log_index": r.LogIndex,
			"confirmations": ch.Confirmations,
		},
		"travel_rule": map[string]any{
			"standard": "IVMS101.2023", "collected_at": nil, "collected_before_payment": false,
			"originator": nil, "originator_vasp": nil, "protocol": nil, "beneficiary": nil,
			"wallet_type": "UNKNOWN", "wallet_type_method": "not determined", "completeness": "NOT_COLLECTED", "note": notCollected,
		},
		"wallet_ownership": map[string]any{
			"required": false, "reason": notCollected, "method": nil, "message": nil, "message_sha256": nil, "domain": nil,
			"nonce": nil, "chain_id": nil, "issued_at": nil, "expires_at": nil, "signature": nil, "result": "NOT_COLLECTED",
			"verified_at": nil, "verified_block": nil, "prior_pack_id": nil,
		},
		"kyt":         section("kyt"),
		"sanctions":   section("sanctions"),
		"structuring": section("structuring"),
		"issuer":      section("issuer"),
		"rules":       rulesSection,
	}
	snap, err := evidence.NewSnapshot(sections)
	return snap, packID, err
}
