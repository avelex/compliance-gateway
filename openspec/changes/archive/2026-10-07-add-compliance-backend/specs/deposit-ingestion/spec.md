# Spec Delta

## Purpose

Detects every ERC-20 deposit to a processor's configured addresses exactly once and confirms it at a safe depth. eventscale is used for speed. An `eth_getLogs` reconciler is the source of truth.

## ADDED Requirements

### Requirement: Deposits are keyed by chain, transaction and log index
The service SHALL record each `Transfer` of a configured token to a configured deposit address as one payment. The key is `(chain_id, tx_hash, log_index)`, and `paymentId = keccak256(abi.encode(uint256 chainId, bytes32 txHash, uint256 logIndex))`. Seeing the same log again from any source SHALL NOT create a second payment.

#### Scenario: Same log from eventscale and reconciler
- **WHEN** a deposit is first received from eventscale and later found by the reconciler
- **THEN** exactly one payment exists for it

#### Scenario: Transfer to an unwatched address
- **WHEN** a configured token emits `Transfer` to an address that is not a configured deposit address
- **THEN** no payment is recorded

### Requirement: Reconciler confirms deposits at depth N
For each configured chain, the reconciler SHALL periodically query `eth_getLogs` for `Transfer` logs to the deposit addresses over `[last_reconciled + 1, head - N]`. N is the chain's configured confirmation depth. It SHALL mark every found payment `confirmed`, with its block number and block hash, and SHALL persist `last_reconciled` only after the range is stored.

#### Scenario: Deposit missed by eventscale
- **WHEN** a deposit never arrives through eventscale
- **THEN** the reconciler records it as `confirmed` once its block is at depth N

#### Scenario: Restart resumes
- **WHEN** the service restarts after reconciling up to block 100
- **THEN** the next pass starts at block 101

### Requirement: eventscale is consumed durably as a hint
The service SHALL read eventscale `Transfer` events through its own durable JetStream consumer with deliver-all and explicit acknowledgement. Events to deposit addresses SHALL be recorded as `seen`. An event SHALL be acknowledged only after it is stored. The service SHALL keep working when eventscale or NATS is unavailable.

#### Scenario: Backlog after downtime
- **WHEN** the service was stopped while eventscale published three deposit events
- **THEN** on restart it receives all three

#### Scenario: NATS down
- **WHEN** NATS is unreachable
- **THEN** the reconciler still records deposits and the service reports the hint source as degraded

### Requirement: Orphaned deposits are marked, not deleted
A payment that is `seen` but absent from the reconciled range that covers its block, or that has a different block hash there, SHALL be marked `orphaned`. An orphaned payment SHALL get no decision and no pack.

#### Scenario: Reorg removes a seen deposit
- **WHEN** eventscale reported a deposit in a block that a reorg later replaced
- **THEN** after reconciliation the payment is `orphaned` and stays visible with that status

### Requirement: Only confirmed deposits get decisions and packs
Checks MAY start when a payment is first `seen`. A recommendation, a decision and a Payment Passport SHALL be produced only for `confirmed` payments.

#### Scenario: Seen but not yet confirmed
- **WHEN** a payment is `seen` and its block is shallower than depth N
- **THEN** no decision or pack exists for it

### Requirement: Retro backfill uses the same path
An operator SHALL be able to start reconciliation from a given block, for example 90 days back. Payments found that way SHALL go through the same checks, recommendation and passport flow. Their packs SHALL carry `reconstruction: true`.

#### Scenario: Backfill marks reconstruction
- **WHEN** an operator backfills from a block before the service was deployed
- **THEN** each pack produced for those historical payments has `reconstruction: true`
