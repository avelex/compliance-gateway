# Spec Delta

## Purpose

The payer-facing page where a payer meets a merchant's gateway once. It explains what the gateway requires, verifies the payer when needed, takes the payment, and reports the outcome truthfully, including the payer's own way to take funds back.

## ADDED Requirements

### Requirement: Payment link format
The checkout SHALL be reachable at `/checkout?gate=<address>[&amount=<decimal>][&payment=<id>]`. A missing or invalid `gate` SHALL be a dead end with nothing to pay. An unreadable, zero, or over-precise amount (more than 12 integer or 6 fractional digits) SHALL become an empty amount field rather than an error. Both supported tokens use 6 decimals.

#### Scenario: Bad amount in link
- **WHEN** the link carries `amount=0` or `amount=abc`
- **THEN** the checkout opens with an empty amount field

#### Scenario: No gate
- **WHEN** the link has no valid `gate`
- **THEN** the checkout shows that there is nothing to pay

### Requirement: Gateway load distinguishes missing from unreachable
The checkout SHALL read the gateway's token, payout address, policy, and timeout from chain. It SHALL report a gateway that does not exist differently from one it could not read because of an RPC failure.

#### Scenario: RPC failure
- **WHEN** the chain read fails for a reason other than a missing gateway
- **THEN** the checkout says the gateway could not be read and does not say it does not exist

### Requirement: Injected wallet on Base Sepolia
The checkout SHALL connect an injected EIP-1193 wallet. It SHALL switch the wallet to Base Sepolia (chain 84532), adding the chain when it is unknown, before any transaction. No injected wallet SHALL be a screen state, not an error.

#### Scenario: Wallet on wrong chain
- **WHEN** the connected wallet is on another chain
- **THEN** the checkout requests a switch to Base Sepolia before continuing

### Requirement: Next step mirrors the contract
The checkout SHALL decide the payer's next step in this order: connect, enter an amount, verify, approve, then pay. The required level SHALL use the contract rule `amount >= threshold ? levelAbove : levelBelow`. When the level is above 0 and the payer is not verified, the verify step SHALL come before any token approval.

#### Scenario: Unverified payer with no allowance
- **WHEN** the required level is 2, the payer is unverified, and allowance is zero
- **THEN** the step is "verify", not "approve"

#### Scenario: Insufficient allowance
- **WHEN** the payer is verified and the allowance is below the amount
- **THEN** the step is "approve" for exactly the amount, and the shortfall is computed from the current allowance

### Requirement: Remaining daily headroom shown
When the gateway has a non-zero threshold and the payer has a nullifier, the checkout SHALL show how much the payer can still send before the higher level applies, and when the 24-hour window resets. It SHALL apply the same window roll as the contract.

#### Scenario: Expired window
- **WHEN** the payer's spend window opened more than 24 hours ago
- **THEN** the headroom shown is the full threshold

### Requirement: Level 2 verification through Sumsub WebSDK
For level 2, the checkout SHALL obtain a WebSDK token from the relay and refresh it on expiry. After the WebSDK reports that the applicant submitted, the checkout SHALL enqueue `{kind: "verify", gate, wallet, level}` at most once per minute and re-read `isValid` every 5 seconds. It SHALL report a timeout after 5 minutes without an attestation.

#### Scenario: Attestation lands late
- **WHEN** the attestation appears after the 5-minute deadline but before the next read
- **THEN** the checkout reports the payer as verified, not timed out

#### Scenario: Relay rate limit
- **WHEN** the relay responds `429`
- **THEN** the checkout tells the payer to try again later

### Requirement: Level 1 is not available
When the required level is 1, the checkout SHALL tell the payer that the selfie check is not built yet. It SHALL also say that nothing was sent and the wallet was not charged.

#### Scenario: Level 1 policy
- **WHEN** the policy requires level 1 for the entered amount
- **THEN** no verification starts and no transaction is offered

### Requirement: Payment tracked across reloads
After a successful `pay()`, the checkout SHALL read the payment id from the gateway's `PaymentOpened` log in the receipt and write it into the URL as `payment`. It SHALL poll `payments(id)` every 3 seconds until the status is settled or refunded. A mined revert SHALL be reported as a failed payment.

#### Scenario: Reload during screening
- **WHEN** the payer reloads the page while the payment is pending
- **THEN** the checkout resumes polling that payment from the URL

### Requirement: Refund cause stated truthfully
For a refunded payment, the checkout SHALL report a screening refusal only when a `PaymentSettled` log exists for the id. A refund without such a log SHALL be reported as the payer's own reclaim. When the cause cannot be determined, the checkout SHALL not claim either cause.

#### Scenario: Reclaimed payment after reload
- **WHEN** a refunded payment has no `PaymentSettled` log
- **THEN** the checkout says the payer took the funds back, not that screening rejected them

### Requirement: Reclaim offered after timeout
While a payment is pending, the checkout SHALL show a reclaim action with a countdown to the gateway's timeout. The action SHALL stay disabled until the timeout passes and SHALL remain reachable even when status polling fails.

#### Scenario: Timeout reached without verdict
- **WHEN** the gateway timeout has passed and the payment is still pending
- **THEN** the payer can submit `reclaim(id)` from the checkout
