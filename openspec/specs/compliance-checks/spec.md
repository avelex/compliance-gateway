# compliance-checks Specification

## Purpose
Screens each deposit for KYT risk, sanctions, structuring and issuer controls. It records reproducible, normalised results that feed the recommendation and sections D–G of the Payment Passport.

## Requirements

### Requirement: Every check produces a stored result
For each payment, the service SHALL run the KYT, sanctions, structuring and issuer checks. For each one it SHALL store a check result with:
- the kind, the provider and the provider product;
- the normalised outcome;
- `performed_at`;
- the SHA-256 of the raw provider response, and the raw response itself, retrievable by that hash.

#### Scenario: Raw response retrievable
- **WHEN** the KYT check has completed for a payment
- **THEN** its stored raw response hashes to the recorded `raw_response_sha256`

### Requirement: Failed checks fail closed
A check that errors or exceeds its timeout SHALL produce the outcome `UNAVAILABLE`. A check SHALL never be silently skipped. A payment SHALL get a recommendation only after every check has a result.

#### Scenario: KYT provider down
- **WHEN** the KYT provider returns an error
- **THEN** the KYT result is `UNAVAILABLE` and the payment still gets a recommendation

### Requirement: KYT reports a risk level and categories
The KYT check SHALL map the provider response to:
- a risk level, one of `LOW`, `MEDIUM`, `HIGH` or `SEVERE`;
- the list of risk categories it flagged.

The demo provider SHALL be GoPlus `address_security` on the payer, recorded with provider `GoPlus` and product `address_security (demo, not for production)`.

#### Scenario: Mixer flag
- **WHEN** GoPlus flags the payer with `mixer`
- **THEN** the KYT result has risk level `SEVERE` and the category `mixer`

### Requirement: Sanctions screening uses versioned lists
The sanctions check SHALL compare the payer address with every configured sanctions address list. The comparison is exact and case-insensitive. The outcome SHALL be `NO_MATCH` or `TRUE_MATCH`, plus the matched list entry. Every result SHALL record the name, version and content hash of each list it used. Name screening SHALL be reported as not performed, because mode (b) has no Travel Rule data.

#### Scenario: Listed payer
- **WHEN** the payer address appears in the loaded OFAC list
- **THEN** the sanctions result is `TRUE_MATCH` and names that list and its version

#### Scenario: List reload
- **WHEN** a list file changes and is reloaded
- **THEN** later results reference the new version, and earlier results keep the old one

### Requirement: Structuring rule SPLIT-03
The structuring check SHALL evaluate the payer's confirmed payments in the 72 hours up to and including this payment. It SHALL `FLAG` when either of these holds:
- the aggregate EUR amount is 5,000 or more;
- 3 or more payments each fall within 10% below EUR 1,000.

Otherwise it SHALL `PASS`. The result SHALL record the rule id, window, thresholds, linked payment count, linked pack ids, features and score.

#### Scenario: Three just-under payments
- **WHEN** a payer sends EUR 950, 960 and 990 within 72 hours
- **THEN** the third payment's structuring result is `FLAG` with linked count 3

### Requirement: Issuer controls read at the payment block
The issuer check SHALL call the token's `isBlacklisted(address)` for the payer and for the deposit address at the payment's block. The outcome SHALL be `NOT_LISTED` if neither is blacklisted, and `LISTED` otherwise, as in the specimens.

#### Scenario: Blacklisted payer
- **WHEN** the token reports the payer as blacklisted at the payment block
- **THEN** the issuer result is `LISTED`

### Requirement: EUR amount is recorded with its source
Each payment SHALL carry an EUR amount, a rate, a rate source and a rate time, all as decimal strings. EURC SHALL use rate 1. USDC SHALL use the configured reference rate.

#### Scenario: EURC payment
- **WHEN** a payment of 250 EURC is recorded
- **THEN** its EUR amount is "250.00" at rate "1"
