# Spec Delta

## Purpose

The enclave-side verification loop. It turns completed identity checks into on-chain attestations that carry only a per-merchant nullifier, a level, and an expiry. It also proves on every run that monitoring is alive.

## ADDED Requirements

### Requirement: Cron drain of the relay queue
On each cron tick (every minute in the shipped config), the workflow SHALL run inside the TEE. It SHALL fetch the relay snapshot for the current unix minute with its bearer token, which it reads from enclave secrets. If the fetch fails, the run SHALL abort without writing a report.

#### Scenario: Relay unreachable
- **WHEN** the relay queue request fails
- **THEN** the run returns an error and no report or heartbeat is written for that tick

### Requirement: Level routes to provider
Each queued request SHALL be verified by World ID when its level is 1 and by Sumsub when its level is 2. Requests with any other level SHALL be skipped.

#### Scenario: Unknown level
- **WHEN** a queued request has level 3
- **THEN** it produces no attestation entry

### Requirement: Valid existing attestations are not rewritten
Before verifying a request, the workflow SHALL read the registry's attestation for `(gate, wallet)`. It SHALL skip the request when that attestation has a non-zero level and an expiry in the future.

#### Scenario: Duplicate queue deliveries
- **WHEN** the same pair is drained on several consecutive ticks after it was attested
- **THEN** only the first tick writes an attestation for it

### Requirement: Sumsub verification recomputes the session id
For level 2, the workflow SHALL recompute the session user id from the queued `(gate, wallet)` with the shared secret and never trust a client-supplied id. It SHALL look up the applicant by that external id. It SHALL attest only when the review status is `completed` with answer `GREEN` and at least one identity document is present.

#### Scenario: Applicant not approved
- **WHEN** the applicant's review answer is not `GREEN` or the review is not completed
- **THEN** no attestation entry is produced and the request is silently skipped

#### Scenario: No documents
- **WHEN** an approved applicant has no identity documents
- **THEN** no attestation entry is produced

### Requirement: Sumsub nullifier is per document and per gateway
For level 2, the nullifier SHALL be `HMAC-SHA256(enclaveSecret, docNumber + docCountry + lower(gateHex))`. It uses the first document after sorting by `(country, idDocType, number)`. The same person at two gateways SHALL therefore get unlinkable nullifiers.

#### Scenario: Same document, different gateways
- **WHEN** one person verifies at gateways A and B with the same document
- **THEN** the two attestations carry different nullifiers

### Requirement: World ID verification binds proof to wallet
For level 1, the workflow SHALL verify the request's World ID proof against the World ID developer API, using the wallet address as the signal. It SHALL derive the nullifier as `keccak256(nullifierHash, gate)`. A request without a proof SHALL be skipped.

#### Scenario: Missing proof
- **WHEN** a level 1 request carries no World ID proof
- **THEN** no attestation entry is produced

### Requirement: Attestation expiry from configured TTL
Each produced attestation SHALL expire at its issuance time plus the configured attestation TTL (30 days in the shipped configs).

#### Scenario: Default TTL
- **WHEN** an attestation is issued with `attestationTtlSeconds = 2592000`
- **THEN** its expiry is 30 days after issuance

### Requirement: Every successful run reports a heartbeat
After processing the snapshot, the workflow SHALL write one DON-signed report to the registry with the current runtime time as the heartbeat and all produced entries as the batch. It SHALL write the report even when the batch is empty.

#### Scenario: Empty queue
- **WHEN** the snapshot contains no items
- **THEN** a report with an empty batch and a fresh heartbeat is written
