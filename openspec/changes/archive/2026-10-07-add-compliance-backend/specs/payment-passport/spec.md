# Spec Delta

## Purpose

Issues a tamper-evident Payment Passport (`deflow-evidence/1.0`) for every decided deposit, and hands out per-recipient projections that still verify against the same roots with the published open-source verifier.

## ADDED Requirements

### Requirement: Pack follows the deflow-evidence/1.0 data layout
A pack's `data` SHALL contain these top-level keys, in the same shapes as the specimens:
- `pack_id`, `pack_version`, `schema_version`, `created_at`, `payment_ref`, `merchant_id`, `processor`;
- `onchain`, `travel_rule`, `wallet_ownership`, `kyt`, `sanctions`, `structuring`, `issuer`, `rules`;
- `timeline`, `decision`, `retention`.

All amounts, rates and scores SHALL be decimal strings, and no non-integer JSON number SHALL appear.

#### Scenario: Float rejected
- **WHEN** a builder input contains the JSON number `0.5`
- **THEN** pack assembly fails rather than emitting it

### Requirement: Mode (b) packs state what Deflow did not collect
In mode (b) without checkout integration:
- `travel_rule` and `wallet_ownership` SHALL state that the data was not collected and was gathered outside Deflow;
- `onchain.deposit_contract` SHALL hold the deposit address;
- `decision.execution_tx` SHALL state that execution happened outside Deflow.

#### Scenario: Mode (b) sections
- **WHEN** a pack is built for a mode (b) deposit
- **THEN** `travel_rule.completeness` is `NOT_COLLECTED` and `onchain.deposit_contract` holds the deposit address

### Requirement: Integrity roots match the verifier
Every leaf SHALL be salted with 32 random bytes per path, and empty containers count as leaves. `master_root` SHALL be the tree root over `data`. `evidence_root` SHALL be the SHA-256 of the canonical object of the evidence keys' node hashes:
`pack_id, payment_ref, onchain, travel_rule, wallet_ownership, kyt, sanctions, structuring, issuer, rules`.

Canonical JSON SHALL be byte-identical to `json.dumps(sort_keys=True, separators=(",",":"), ensure_ascii=False)` encoded as UTF-8.

#### Scenario: Specimens reproduce
- **WHEN** the builder recomputes the two specimen packs from their `data` and `salts`
- **THEN** it reproduces their `master_root`, `evidence_root` and `projection_hash`

#### Scenario: Edge vectors agree with the verifier
- **WHEN** the non-ASCII, numeric-string and empty-container vectors are hashed
- **THEN** the results equal those of `verify_pack.py`

### Requirement: Decision signs the evidence root
A decision's `packHash` SHALL equal the `evidence_root` of the pack version it was taken on. A later pack version that only adds decisions or timeline entries SHALL keep the same `evidence_root`.

#### Scenario: Auto hold then officer freeze
- **WHEN** an auto HOLD creates pack version 1 and an officer FREEZE creates version 2
- **THEN** both decisions carry the same `packHash`, and version 2 references version 1

### Requirement: Pack is signed and journalled
The service SHALL sign each pack version with the processor evidence key, as a detached JWS (ES256) over the canonical `data`. The integrity block SHALL record the key id. Each pack SHALL record `prev_pack_hash`, the hash of the previously issued pack, so the journal is a hash chain. Pack versions SHALL never be modified after issue.

#### Scenario: JWS verifies
- **WHEN** the JWS of a pack is checked with the processor's public evidence key over the canonical `data`
- **THEN** it verifies

#### Scenario: Journal gap detectable
- **WHEN** packs are listed in issue order
- **THEN** each pack's `prev_pack_hash` equals the hash of the one before it

### Requirement: Projections withhold by profile and keep the roots
For profiles `MASTER`, `FIU_SUPERVISOR`, `AUDITOR`, `OFF_RAMP` and `BANK`, the service SHALL produce a projection in which the profile's withheld paths are replaced by `{"$withheld": <subtree hash>}`. Salts for withheld paths SHALL be removed. `master_root` and `evidence_root` SHALL be unchanged. `projection_hash` SHALL be the hash of the canonical projection without its integrity block. `MASTER` and `FIU_SUPERVISOR` SHALL withhold nothing.

#### Scenario: Off-ramp copy
- **WHEN** an `OFF_RAMP` projection is issued
- **THEN** structuring details, KYT references and officer fields are withheld, and the master and evidence roots still verify

#### Scenario: Profile not known
- **WHEN** a projection is requested for profile `PRESS`
- **THEN** the request is rejected

### Requirement: Every projection issue is logged
Each projection SHALL be recorded with the profile, `prepared_for`, purpose, `projection_hash` and issue time. The recipient fields SHALL appear in the projection itself.

#### Scenario: Audit of disclosures
- **WHEN** an `OFF_RAMP` projection is issued to "Example Exchange" for a source-of-funds request
- **THEN** a projection record with that recipient, purpose and hash exists

### Requirement: Published verifier accepts JSON passports
`docs/evidence-pack/verify_pack.py` SHALL accept a projection JSON file as well as a PDF. For JSON input it SHALL check the copy hash, the master root and the evidence root, and skip the PDF-text check.

#### Scenario: Verify a service projection
- **WHEN** `verify_pack.py passport.json` runs on a projection issued by the service
- **THEN** it prints OK for the copy hash, master root and evidence root and exits 0
