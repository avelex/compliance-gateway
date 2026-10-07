# processor-decisions Specification

## Purpose
Accepts processor-signed EIP-712 decisions for deposits and executes them under a neutral status machine. An executor can deliver a decision but never forge or alter one, and a frozen payment can never be returned.

## Requirements

### Requirement: Decision is an EIP-712 struct bound to one deposit account
A decision SHALL be the EIP-712 struct `Decision(bytes32 paymentId,uint8 decision,address token,uint256 amount,bytes32 packHash,uint64 nonce,uint64 deadline)` under domain `{name: "Deflow Decision", version: "1", chainId, verifyingContract: <payer's deposit account>}`. Decision kinds are 1 CREDIT, 2 HOLD, 3 FREEZE and 4 RETURN. Any other value SHALL revert.

#### Scenario: Matches an independent signer
- **WHEN** the shared test vector is signed with `cast wallet sign --data`
- **THEN** the hub accepts that signature and computes the same digest

#### Scenario: Signature not portable to another payer
- **WHEN** a decision signed for payer `A`'s deposit account is delivered naming payer `B`
- **THEN** the recovered signer is not in the signer set and the call reverts

#### Scenario: Unknown decision kind
- **WHEN** a correctly signed decision has `decision = 5`
- **THEN** the call reverts

### Requirement: Delivery carries payer, decision and signature
An executor SHALL deliver through `onReport(bytes metadata, bytes report)`, where `report = abi.encode(address payer, Decision decision, bytes signature)`. The hub SHALL ignore `metadata`, because authority comes from the processor signature, not from the workflow identity.

#### Scenario: Deflow submitter delivers with empty metadata
- **WHEN** an authorised submitter calls `onReport` with empty metadata and a valid report
- **THEN** the decision executes

### Requirement: Only a permitted signer's fresh decision is accepted
The hub SHALL accept a decision only when all of the following hold:
- the recovered signer's mask contains the decision kind;
- `block.timestamp <= deadline`;
- `nonce` is greater than the last accepted nonce for that `paymentId`.

Otherwise the call SHALL revert with no state change. A redelivered decision therefore changes nothing.

#### Scenario: Expired decision
- **WHEN** a decision is delivered after its `deadline`
- **THEN** the call reverts

#### Scenario: Redelivery
- **WHEN** an already executed decision is delivered a second time
- **THEN** the call reverts and balances are unchanged

#### Scenario: Signer without FREEZE permission
- **WHEN** a signer with mask 3 signs a FREEZE decision
- **THEN** the call reverts

### Requirement: Token and amount are fixed by the first decision
The first accepted decision for a `paymentId` SHALL record its payer, token and amount. Every later decision for that `paymentId` SHALL carry the same payer, token and amount, or the call SHALL revert.

#### Scenario: Amount changed between HOLD and CREDIT
- **WHEN** a HOLD for 100 USDC was accepted and a CREDIT for 150 USDC arrives for the same `paymentId`
- **THEN** the call reverts

### Requirement: Decisions map to neutral statuses
From no record (implicitly `PENDING`):
- CREDIT SHALL set `CREDITED` and move the amount to the pool;
- RETURN SHALL set `RETURNED` and move the amount to the payer;
- HOLD SHALL set `HELD`;
- FREEZE SHALL set `HELD` and store `lockCommitment = keccak256(abi.encode(packHash, nonce))`.

`CREDITED` and `RETURNED` are terminal: any further decision SHALL revert.

#### Scenario: Direct credit
- **WHEN** CREDIT is accepted for a new `paymentId` of 100 USDC
- **THEN** the status is `CREDITED` and the pool balance grows by 100 USDC

#### Scenario: Freeze looks like hold on chain
- **WHEN** FREEZE is accepted for a new `paymentId`
- **THEN** the status is `HELD` and the lock commitment is non-zero

#### Scenario: Terminal payment
- **WHEN** any decision arrives for a `CREDITED` payment
- **THEN** the call reverts

### Requirement: A held payment can be resolved
A `HELD` payment without a lock commitment SHALL accept:
- CREDIT, which moves the amount to the pool;
- RETURN, which moves the amount to the payer;
- HOLD, which updates `packHash` and `nonce` and leaves the status unchanged;
- FREEZE, which sets the lock commitment.

#### Scenario: Hold resolved by return
- **WHEN** a payment is `HELD` without a lock and RETURN is accepted
- **THEN** the status is `RETURNED` and the payer receives the amount

### Requirement: Frozen funds can never be returned
A `HELD` payment with a lock commitment SHALL accept only:
- CREDIT, for example on an authority instruction;
- FREEZE, which replaces the lock commitment.

RETURN and HOLD SHALL revert. No function, timeout or role SHALL move frozen funds to the payer.

#### Scenario: Return after freeze
- **WHEN** a frozen payment receives a correctly signed RETURN from a signer with every permission
- **THEN** the call reverts and the funds stay in the deposit account

#### Scenario: Hold cannot unfreeze
- **WHEN** a frozen payment receives a HOLD
- **THEN** the call reverts and the lock commitment is unchanged

#### Scenario: Re-freeze with updated evidence
- **WHEN** a frozen payment receives FREEZE with a new `packHash` and a higher nonce
- **THEN** the lock commitment becomes `keccak256(abi.encode(newPackHash, newNonce))`

### Requirement: Every executed decision is observable
Each accepted decision SHALL emit `DecisionExecuted` from the hub, carrying `paymentId` (indexed), payer (indexed), the deposit account, the decision kind, the new status, `packHash`, `nonce` and the lock commitment. The event SHALL carry no reasons and no personal data. The hub SHALL expose each payment's current record for reading.

#### Scenario: Ingestion sees execution
- **WHEN** a HOLD is executed
- **THEN** one `DecisionExecuted` log is emitted at the hub address with status `HELD`

### Requirement: No public reclaim
Configuration (a) contracts SHALL expose no function that lets a payer or any third party take funds from a deposit account without a processor-signed decision. A deposit with no decision SHALL stay in the account.

#### Scenario: Payer waits indefinitely
- **WHEN** a deposit has received no decision for any length of time
- **THEN** no call by the payer or any other address moves it
