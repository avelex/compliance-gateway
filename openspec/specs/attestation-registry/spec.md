# attestation-registry Specification

## Purpose
The on-chain source of truth for payer verification verdicts, revocations by nullifier, and monitoring liveness. Gateways read it to admit payments. Only the DON writes to it.

## Requirements

### Requirement: Only the DON writes the registry
The registry SHALL accept reports only through the configured Chainlink forwarder. A report SHALL carry a heartbeat timestamp and a batch of entries. Each entry is an attestation for `(gate, wallet)`, a revocation of a nullifier, or an un-revocation of a nullifier.

#### Scenario: Direct call by an EOA
- **WHEN** an EOA calls `onReport` directly
- **THEN** the call reverts with `InvalidSender`

### Requirement: Attestations are scoped per gateway and wallet
An attestation SHALL be stored under the key `keccak256(abi.encode(gate, wallet))` and SHALL contain only a nullifier, a level (1 = World ID, 2 = full KYC + AML), and an expiry. A new attestation for the same key SHALL replace the previous one. Each write SHALL emit `Attested(key, nullifier, level, expiry)`.

#### Scenario: Same wallet at another gateway
- **WHEN** a wallet is attested for gateway A
- **THEN** it holds no attestation for gateway B

#### Scenario: Re-attestation replaces
- **WHEN** a second attestation with a different nullifier is written for the same `(gate, wallet)`
- **THEN** reads return the second attestation

### Requirement: Revocation is by nullifier
A revoke entry SHALL mark a nullifier as revoked and an unrevoke entry SHALL clear the mark. Both SHALL emit `RevocationSet(nullifier, revoked)`. A revoked nullifier SHALL invalidate every attestation that carries it, across all wallets.

#### Scenario: Revocation kills all wallets of a person
- **WHEN** a nullifier shared by two attested wallets is revoked
- **THEN** `isValid` returns false for both wallets

### Requirement: Heartbeat is monotonic and never in the future
The registry SHALL update `lastHeartbeat` only when the reported heartbeat is greater than the stored value and not later than the block timestamp. Each update SHALL emit `Heartbeat(at)`. A report whose heartbeat is ignored SHALL still apply its entries.

#### Scenario: Future heartbeat ignored
- **WHEN** a report carries a heartbeat later than `block.timestamp`
- **THEN** `lastHeartbeat` is unchanged and the batch entries are still applied

### Requirement: Validity is fail-closed
`isValid(gate, wallet, minLevel)` SHALL return true only when all of these hold: the attestation level is at least `minLevel` and above 0; its nullifier is not revoked; the current time is before its expiry; and less than 48 hours have passed since `lastHeartbeat`. A registry that has never received a heartbeat SHALL treat every attestation as invalid.

#### Scenario: Monitoring stale
- **WHEN** 48 hours have passed since the last heartbeat
- **THEN** `isValid` returns false for every attestation

#### Scenario: Expired attestation
- **WHEN** the current time is at or past the attestation's expiry
- **THEN** `isValid` returns false

### Requirement: Read access to attestation and nullifier
The registry SHALL expose `attestationOf(gate, wallet)` and `nullifierOf(gate, wallet)` for public reads. An absent attestation reads as zero values.

#### Scenario: Unknown pair
- **WHEN** `nullifierOf` is called for a pair that was never attested
- **THEN** it returns the zero bytes32
