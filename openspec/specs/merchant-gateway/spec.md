# merchant-gateway Specification

## Purpose
A per-merchant escrow contract. It admits payments under the merchant's compliance policy and holds the funds through one screening window. The funds then leave through exactly one of two exits: to the merchant's payout address, or back to the payer.

## Requirements

### Requirement: One gateway settles one immutable token
A gateway SHALL accept and pay out exactly one ERC20 token, fixed at deployment. The gateway SHALL record the merchant as its owner, a non-zero payout address, and the factory that deployed it.

#### Scenario: Zero payout address rejected
- **WHEN** a gateway is deployed with `payoutTo` equal to the zero address
- **THEN** deployment reverts

#### Scenario: Token cannot change
- **WHEN** a gateway has been deployed with USDC
- **THEN** no function exists that changes the gateway's token

### Requirement: Policy is four bounded numbers
A policy SHALL consist of `levelBelow`, `levelAbove`, `threshold` (token base units), and `maxRisk` (0..100). The gateway SHALL reject any policy where a level exceeds 2, `threshold` exceeds 10,000 tokens (`10_000e6`), or `maxRisk` exceeds 80. It SHALL also reject a policy that sets a non-zero `levelAbove` together with `levelBelow` of 0.

#### Scenario: Identity above threshold without identity below
- **WHEN** a policy has `levelAbove = 2` and `levelBelow = 0`
- **THEN** validation reverts with "threshold without identity"

#### Scenario: Risk cap above maximum
- **WHEN** a policy has `maxRisk = 81`
- **THEN** validation reverts with "risk cap too high"

### Requirement: Only the owner changes policy
`setPolicy` SHALL be callable only by the gateway owner. It SHALL validate the new policy and emit `PolicyChanged(levelBelow, levelAbove, threshold, maxRisk)`. The constructor SHALL emit the same event for the initial policy.

#### Scenario: Non-owner attempts policy change
- **WHEN** an address other than the owner calls `setPolicy`
- **THEN** the call reverts

### Requirement: Required identity level depends on amount
On `pay(amount)`, the required level SHALL be `levelAbove` when `amount >= threshold`, and `levelBelow` otherwise. A zero amount SHALL revert. When the required level is above 0, the payer SHALL hold a valid attestation at that level for this gateway, or the call reverts with `NotVerified`.

#### Scenario: Unverified payer above level 0
- **WHEN** the policy requires level 1 and the payer has no valid attestation for this gateway
- **THEN** `pay` reverts with `NotVerified`

#### Scenario: Level 0 policy
- **WHEN** the required level is 0
- **THEN** `pay` proceeds without consulting the registry

### Requirement: Daily spend is tracked per person
When the required level is above 0, the gateway SHALL add the amount to a 24-hour running total keyed by the payer's nullifier, not by the wallet. The window SHALL reset once 24 hours have passed since it opened. When the running total reaches `threshold` and the payer lacks a valid `levelAbove` attestation, the call SHALL revert with `CumulativeThreshold`.

#### Scenario: Splitting across wallets
- **WHEN** one person, holding two wallets attested under the same nullifier, pays below-threshold amounts whose sum reaches the threshold
- **THEN** the payment that reaches the threshold reverts with `CumulativeThreshold` unless that wallet holds a `levelAbove` attestation

#### Scenario: Window expiry
- **WHEN** 24 hours or more have passed since the spend window opened
- **THEN** the next payment starts a new window with only its own amount counted

### Requirement: Payments are escrowed pending screening
An admitted payment SHALL pull the amount from the payer into the gateway. It SHALL be recorded as `Pending` with the payer, the open time, the amount, and a snapshot of the current `maxRisk`. The gateway SHALL emit `PaymentOpened(id, payer, amount)` and SHALL have the factory emit its own `PaymentOpened`.

#### Scenario: Policy changes after payment opens
- **WHEN** the merchant lowers `maxRisk` after a payment opened
- **THEN** the screening of that payment uses the `maxRisk` snapshot taken at `pay()`

### Requirement: DON verdict settles or refunds
The gateway SHALL accept a settlement report `(id, ok)` only through the configured Chainlink forwarder. For a `Pending` payment, `ok = true` SHALL transfer the amount to `payoutTo` and mark the payment `Settled`. `ok = false` SHALL refund the payer and mark the payment `Refunded`. Both outcomes SHALL emit `PaymentSettled(id, ok)`.

#### Scenario: Report from non-forwarder
- **WHEN** any address other than the forwarder delivers a report
- **THEN** the call reverts

#### Scenario: Report for non-pending payment
- **WHEN** a report arrives for a payment that is already `Settled` or `Refunded`
- **THEN** the call reverts with `PaymentNotPending`

### Requirement: Anyone may reclaim after timeout
After 15 minutes from opening, anyone SHALL be able to call `reclaim(id)` on a `Pending` payment. The call returns the amount to the payer and marks the payment `Refunded`. Before the timeout, the call SHALL revert with `ReclaimTooEarly`. `reclaim` emits no event.

#### Scenario: Reclaim before timeout
- **WHEN** `reclaim` is called 10 minutes after the payment opened
- **THEN** the call reverts with `ReclaimTooEarly`

#### Scenario: Reclaim after timeout without a verdict
- **WHEN** 15 minutes have passed and no settlement report has arrived
- **THEN** `reclaim` refunds the payer in full
