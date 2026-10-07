# merchant-dashboard Specification

## Purpose
The merchant's browser dashboard. It onboards a merchant onto a Privy organization wallet governed by a key quorum, deploys and lists gateways, and changes gateway policy only with the quorum's approval. The server never holds a key that can move the merchant's funds.

## Requirements

### Requirement: Privy-authenticated access
Every dashboard page and server route SHALL require a Privy-authenticated merchant. A server route SHALL respond `401` for a missing or invalid session and `503` when Privy is not configured. The payer checkout SHALL NOT load Privy.

#### Scenario: Unauthenticated API call
- **WHEN** a request without a valid Privy token reaches a dashboard route
- **THEN** the route responds `401`

### Requirement: Setup creates organization, quorum, and wallet
Setup SHALL require a non-empty organization name. It SHALL idempotently create a Privy key quorum (threshold 1, the merchant as sole member) and an organization named after it, and record the organization id on the merchant's user metadata. It SHALL also create one Ethereum wallet owned by the quorum and assigned to the organization. Concurrent setup calls for the same merchant SHALL NOT create duplicates.

#### Scenario: Two tabs onboarding at once
- **WHEN** two setup requests for the same merchant run concurrently
- **THEN** exactly one quorum and one organization wallet exist afterwards

#### Scenario: Empty organization name
- **WHEN** setup is called with a blank name
- **THEN** the route responds `400`

### Requirement: Gateway deployment signed in the merchant's browser
Deploy SHALL accept a token (USDC or EURC only) and a policy that passes the same validation as the contract. The server SHALL prepare a factory `deploy` transaction that names the organization wallet as both merchant and payout address, and return the bytes to sign. A second call SHALL send the transaction with the browser's signature.

#### Scenario: Unknown token
- **WHEN** the deploy request names a token other than USDC or EURC
- **THEN** the route responds `400`

#### Scenario: Deploy before setup
- **WHEN** a merchant without an organization requests a deploy
- **THEN** the route responds with an error telling them to complete setup

### Requirement: Deploy result identifies the merchant's own gateway
After the deploy transaction lands, the server SHALL pick the `GatewayDeployed` address whose `owner()` is the merchant's organization wallet, because a sponsored bundle may contain other merchants' deployments. When the transaction cannot be confirmed, the server SHALL tell the merchant not to retry.

#### Scenario: Unconfirmed send
- **WHEN** the deploy is sent but no hash or receipt is obtained in time
- **THEN** the response says the gateway will appear when it lands and not to retry

### Requirement: Gateway list read from chain by owner
The gateway list SHALL be derived from the factory's `GatewayDeployed` logs since the configured deploy block, filtered to gateways whose owner is the organization wallet. Gateways that cannot be read SHALL be skipped rather than fail the list.

#### Scenario: Junk gateway naming the merchant
- **WHEN** someone deploys a gateway with an unknown token naming the merchant as owner
- **THEN** that gateway is omitted and the rest of the list still renders

### Requirement: Payment link builder
The dashboard SHALL build a checkout link `/checkout?gate=<address>&amount=<decimal>`. The amount SHALL be included only when it is a valid non-zero amount.

#### Scenario: Link with amount
- **WHEN** the merchant enters `25.50` for a gateway
- **THEN** the link carries `gate` and `amount=25.50`

### Requirement: Policy change requires quorum signatures
Only the account that owns the organization SHALL start a policy change, and only for a gateway owned by the organization wallet. The server SHALL prepare one `setPolicy` transaction and hold it for the request's expiry (10 minutes). Each team member SHALL sign those exact bytes in their own browser. The transaction SHALL be sent once, when the signature count reaches the quorum threshold.

#### Scenario: Teammate approves from link
- **WHEN** a quorum member opens `/approve/<id>` and signs
- **THEN** their signature is recorded, and the change is sent once the threshold is met

#### Scenario: Duplicate signature
- **WHEN** the same member signs the same change twice
- **THEN** the second signature is rejected with `409`

#### Scenario: Gateway not owned
- **WHEN** a merchant starts a change for a gateway their organization wallet does not own
- **THEN** the route responds `403`

### Requirement: Pending approvals are private to the team
An approval SHALL be readable and signable only by its requester or a member of the requester's quorum. Unknown, expired, and foreign approval ids SHALL return one indistinguishable `404`.

#### Scenario: Stranger probes an id
- **WHEN** a non-member requests an existing approval id
- **THEN** the response is the same `404` as for a non-existent id

### Requirement: Team management limited to safe quorum updates
The team route SHALL list quorum members, threshold, and organization wallet. It SHALL allow adding a member by Privy DID and raising the threshold up to the member count. It SHALL refuse to lower the threshold, and it SHALL refuse to add members once the threshold is above 1.

#### Scenario: Threshold above member count
- **WHEN** a merchant sets the threshold higher than the number of members
- **THEN** the route responds `400`

#### Scenario: Lowering threshold
- **WHEN** a merchant requests a lower threshold
- **THEN** the route responds `409` explaining it is not supported

### Requirement: Demo data is labeled
Recent payments on the gateway page, plus the "held in screening" and recent settlements sections on the wallet page, SHALL be labeled as demo data because they come from fixtures, not chain reads.

#### Scenario: Wallet page
- **WHEN** the merchant opens the wallet page
- **THEN** the "held in screening" and "recent settlements" sections are marked as demo data
