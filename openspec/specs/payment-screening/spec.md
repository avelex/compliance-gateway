# payment-screening Specification

## Purpose
Screens where an escrowed payment's funds came from, inside the enclave, and sends back only a yes/no verdict. The verdict releases the payment to the merchant or refunds the payer. The risk score never leaves the enclave.

## Requirements

### Requirement: Triggered by factory PaymentOpened
The workflow SHALL run a TEE handler for every `PaymentOpened(gate, id, payer, amount)` log from the configured factory, at the `LATEST` confidence level. It SHALL read the payment's stored `maxRisk` from the gateway, pinned to the block of the triggering log.

#### Scenario: Read pinned to log block
- **WHEN** a `PaymentOpened` log from block B triggers the handler
- **THEN** the gateway's `payments(id)` is read at block B

### Requirement: GoPlus risk score
The workflow SHALL score the payer address with GoPlus address security on Ethereum mainnet (`chain_id=1`), whatever chain the payment is on. The score SHALL be the highest weight among the flags set, and 0 when no flag is set.

#### Scenario: Flag weights
- **WHEN** GoPlus sets exactly one flag
- **THEN** the score is: `sanctioned` 100; `money_laundering` and `stealing_attack` 90; `mixer` and `darkweb_transactions` 80; `cybercrime`, `financial_crime`, and `blackmail_activities` 70; `phishing_activities` 60; `blacklist_doubt` 50; `fake_kyc` 40; `honeypot_related_address` 30

#### Scenario: Several flags
- **WHEN** GoPlus sets `blacklist_doubt` and `stealing_attack`
- **THEN** the score is 90

#### Scenario: Sanctioned payer
- **WHEN** GoPlus flags the payer as `sanctioned`
- **THEN** the score is 100

#### Scenario: Clean payer
- **WHEN** GoPlus returns no flags
- **THEN** the score is 0

### Requirement: Screening fails closed
If the GoPlus request fails, the body cannot be read or parsed, or the response code is not 1, the score SHALL be 100.

#### Scenario: Provider outage
- **WHEN** GoPlus is unreachable
- **THEN** the score is 100 and the payment is refunded for any `maxRisk` up to the cap of 80

### Requirement: Verdict reported to the gateway
The workflow SHALL report `(id, ok)` to the triggering gateway through the DON, with `ok = score <= maxRisk`. The score SHALL NOT appear in the report.

#### Scenario: Score at ceiling
- **WHEN** the score equals the payment's `maxRisk`
- **THEN** the verdict is `ok = true`

#### Scenario: Score above ceiling
- **WHEN** the score exceeds the payment's `maxRisk`
- **THEN** the verdict is `ok = false` and the gateway refunds the payer
