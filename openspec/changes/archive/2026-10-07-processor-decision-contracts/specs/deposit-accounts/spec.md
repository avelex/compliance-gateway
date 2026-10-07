# Spec Delta

## Purpose

Gives every payer a deposit address that is unique to that payer, owned by the processor's hub, and known before deployment. Funds in a deposit account can only ever reach the processor's pool or go back to that payer.

## ADDED Requirements

### Requirement: Deposit address is deterministic per payer
The hub SHALL expose `accountOf(payer)`, which returns the CREATE2 address of the payer's deposit account. The address SHALL depend only on the hub and the payer, and SHALL be the same before and after deployment. A plain ERC-20 transfer to that address SHALL count as a deposit.

#### Scenario: Funding before deployment
- **WHEN** a payer transfers 100 USDC to `accountOf(payer)` before any account is deployed there
- **THEN** a later decision for that payer can move those 100 USDC

#### Scenario: Different payers, different addresses
- **WHEN** `accountOf` is called for two different payers
- **THEN** it returns two different addresses

### Requirement: Accounts deploy lazily and idempotently
Anyone SHALL be able to deploy a payer's account at `accountOf(payer)`. The hub SHALL also deploy the account itself when it executes the first decision for that payer. Deploying an account that already exists SHALL not revert and SHALL not create a second account. Each deployment SHALL emit `AccountDeployed(payer, account)`.

#### Scenario: First decision deploys
- **WHEN** a decision is executed for a payer with no deployed account
- **THEN** the account is deployed at `accountOf(payer)` and the decision executes in the same transaction

#### Scenario: Repeat deploy
- **WHEN** a payer's account is deployed a second time
- **THEN** the call succeeds and the address is unchanged

### Requirement: Funds leave only to the pool or the payer
A deposit account SHALL move tokens only when its hub calls it. It SHALL send them only to the hub's current pool or to the payer it was created for. This SHALL be enforced in the account's own code, not only in the hub.

#### Scenario: Direct call by an outsider
- **WHEN** any address other than the hub calls the account's transfer function
- **THEN** the call reverts

#### Scenario: No third destination
- **WHEN** the hub calls the account
- **THEN** the only destinations it can express are "pool" and "payer"

### Requirement: Held amounts are reserved
The first decision for a `paymentId` SHALL revert if its amount is greater than the account's free balance of that token. The free balance is the token balance minus the amounts of that account's `HELD` payments in that token. HOLD and FREEZE SHALL reserve the amount. CREDIT and RETURN of a held payment SHALL release the reservation as they move the funds.

#### Scenario: Two deposits, one frozen
- **WHEN** an account holds 100 USDC frozen and 50 USDC newly deposited, and a CREDIT for 120 USDC arrives for a new `paymentId`
- **THEN** the call reverts because only 50 USDC is free

#### Scenario: Release on credit
- **WHEN** a held payment of 100 USDC is credited
- **THEN** the account's reserved amount for that token decreases by 100 USDC

### Requirement: Unattributed funds move only by decision
Tokens in a deposit account that no decision has reserved SHALL move only through a processor-signed decision. This covers stray transfers and tokens the processor does not otherwise use. No owner-only sweep SHALL exist.

#### Scenario: Stray token
- **WHEN** a payer mistakenly sends a token the processor does not use
- **THEN** it leaves the account only through a signed RETURN or CREDIT naming that token
