# Spec Delta

## ADDED Requirements

### Requirement: Staff can search payments
Processor staff SHALL be able to list payments, newest block time first, filtered by any combination of: transaction hash or payment reference, payer or deposit address, exact amount in token units, block-time range, stage, ingest status, and last decision. The list SHALL be paginated with a page size of at most 200. Block-time range filters SHALL take RFC3339 instants and select block times from `from` inclusive to `to` exclusive.

#### Scenario: Search by transaction hash
- **WHEN** staff search for the hash of a transaction with one deposit to a processor address
- **THEN** exactly that payment is returned

#### Scenario: Address matches payer or deposit
- **WHEN** staff search for an address
- **THEN** payments where that address is the payer or the deposit address are returned

#### Scenario: Amount in token units
- **WHEN** staff search for amount `1240.00` and a 6-decimals token has a payment of `1240000000` base units
- **THEN** that payment is returned

#### Scenario: Frozen payments
- **WHEN** staff filter by last decision FREEZE
- **THEN** only payments whose highest-nonce decision is FREEZE are returned

#### Scenario: No match
- **WHEN** a transaction hash matches no payment
- **THEN** the response is an empty list, not an error

### Requirement: Payment list entries are self-describing
Each listed payment SHALL carry its payment reference, chain id, transaction hash, block time, payer, deposit address, token address and symbol, amount in base units and in token units, ingest status, stage, reconstruction flag and last decision.

#### Scenario: Undecided payment
- **WHEN** a payment has no decision yet
- **THEN** its entry carries a null last decision

### Requirement: Staff can read one payment's record
Reading one payment SHALL return its list entry fields plus first-seen time, every check result, the recommendation, every decision with mode, author and time, every pack version with its roots and creation time, the payment's decision state: its status (PENDING, HELD, CREDITED or RETURNED) and whether it is frozen, and the profiles a projection of the latest pack would be refused for, each with its reason.

#### Scenario: Decided payment
- **WHEN** staff read a payment that has two decisions and two pack versions
- **THEN** the response carries both decisions in nonce order and both pack versions with their creation times

#### Scenario: Frozen then credited
- **WHEN** staff read a payment whose decisions are FREEZE then CREDIT
- **THEN** its state is CREDITED and frozen, and its last decision is CREDIT

#### Scenario: Refused profiles of a frozen payment
- **WHEN** staff read a payment whose latest decision is FREEZE
- **THEN** the response lists `OFF_RAMP` and `BANK` as refused, each with a reason, and no other profile
