package evidence

// Disclosure profiles (Annex 1 of the evidence pack template). Each profile is the list of paths whose
// subtrees are replaced by {"$withheld": <subtree hash>} in that recipient's copy.
//
// ponytail: AUDITOR withholds instead of pseudonymising; revisit when checkout intake brings PII.
var Profiles = map[string][]string{
	"MASTER":         {},
	"FIU_SUPERVISOR": {},
	"OFF_RAMP":       offRamp,
	"BANK": append(append([]string{}, offRamp...),
		"travel_rule.originator", "travel_rule.beneficiary",
		"wallet_ownership.required", "wallet_ownership.reason", "wallet_ownership.method",
		"wallet_ownership.message", "wallet_ownership.message_sha256", "wallet_ownership.domain",
		"wallet_ownership.nonce", "wallet_ownership.chain_id", "wallet_ownership.issued_at",
		"wallet_ownership.expires_at", "wallet_ownership.signature", "wallet_ownership.verified_at",
		"wallet_ownership.verified_block", "wallet_ownership.prior_pack_id"),
	"AUDITOR": {"travel_rule.originator", "travel_rule.beneficiary"},
}

// offRamp is exactly the withheld path set of specimen A (passport_8c1e6f2a_OFF_RAMP).
var offRamp = []string{
	"travel_rule.originator.identifier", "travel_rule.originator.identifier_type", "travel_rule.beneficiary.name",
	"kyt.api_version", "kyt.external_ref", "kyt.raw_response_sha256",
	"sanctions.algorithm", "sanctions.threshold", "sanctions.calibration_version", "sanctions.matched_on",
	"sanctions.alert_analysis", "sanctions.reviewer", "sanctions.second_reviewer",
	"structuring.rule_id", "structuring.window", "structuring.thresholds", "structuring.linked_count",
	"structuring.linked_pack_ids", "structuring.features", "structuring.score",
	"rules.approved_by", "rules.engine_version", "rules.thresholds", "rules.recommendation",
	"timeline.offchain",
	"decision.mode", "decision.policy_ref", "decision.reason_codes", "decision.rationale",
	"decision.officer_id", "decision.second_reviewer", "decision.return_blocked",
	"retention.legal_hold",
}
