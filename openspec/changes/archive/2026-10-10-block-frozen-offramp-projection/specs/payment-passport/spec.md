# Spec Delta

## ADDED Requirements

### Requirement: Off-ramp and bank copies are refused when they would reveal a freeze or a sanctions match
The service SHALL refuse an `OFF_RAMP` or `BANK` projection of a pack whose latest version has `decision.decision` `FREEZE` or `sanctions.result` `TRUE_MATCH`, with `409` and a detail saying the request goes to the MLRO. `MASTER`, `FIU_SUPERVISOR` and `AUDITOR` projections of the same pack SHALL be issued as before. The rule SHALL apply to every caller. It guards against a mistaken choice of profile and does not bind a profile to a recipient.

#### Scenario: Off-ramp RFI on a frozen payment
- **WHEN** an `OFF_RAMP` projection is requested for a payment whose latest decision is FREEZE
- **THEN** the response is 409, no projection record is written, and the refusal is in the service log

#### Scenario: Bank request on a frozen payment
- **WHEN** a `BANK` projection is requested for a payment whose latest decision is FREEZE
- **THEN** the response is 409 and no projection record is written

#### Scenario: Officer hold on a sanctions match
- **WHEN** an `OFF_RAMP` projection is requested for a payment whose sanctions result is TRUE_MATCH and whose latest decision is an officer's HOLD
- **THEN** the response is 409 and no projection record is written

#### Scenario: Supervisor copy of a frozen payment
- **WHEN** an `FIU_SUPERVISOR` projection is requested for a payment whose latest decision is FREEZE
- **THEN** the projection is issued and logged

#### Scenario: Frozen, then credited on an authority instruction
- **WHEN** an `OFF_RAMP` projection is requested for a payment whose decisions are FREEZE then CREDIT and whose sanctions result is not TRUE_MATCH
- **THEN** the projection is issued, its `decision.decision` is CREDIT, and `timeline.offchain` and `decision.return_blocked` are withheld

### Requirement: A refused projection is not a disclosure
A refused projection request SHALL write no projection record. It SHALL be written to the service log with the pack id, profile, recipient and issuer.

#### Scenario: Refused request is traceable
- **WHEN** an `OFF_RAMP` projection of a frozen payment is refused
- **THEN** the projection log has no entry for it, and the service log has a warning naming the pack, the profile, the recipient and the issuer

### Requirement: Withheld decision fields cannot be compared across versions
Each pack version SHALL salt every leaf under `decision` with fresh random bytes instead of reusing the previous version's salts, so a withheld decision field's hash does not show whether its value changed between versions. `evidence_root` SHALL stay the same across versions.

#### Scenario: Two copies of an unchanged field
- **WHEN** version 1 and version 2 of a pack both have `decision.return_blocked` false and both are projected for `OFF_RAMP`
- **THEN** the two `$withheld` hashes of `decision.return_blocked` differ, and both copies carry the same `evidence_root`

#### Scenario: Copies before and after a freeze
- **WHEN** an `OFF_RAMP` copy of version 1 (HOLD) and one of version 3 (CREDIT after a FREEZE) are compared
- **THEN** nothing in the withheld hashes distinguishes a changed `decision.return_blocked` from an unchanged one
