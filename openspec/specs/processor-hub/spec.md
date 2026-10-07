# processor-hub Specification

## Purpose
One on-chain hub per processor. It records who may sign decisions, who may deliver them, and where credited funds go, so that configuration (a) runs without Deflow holding any key.

## Requirements

### Requirement: Factory deploys hubs from one fixed address
The hub factory SHALL deploy a new hub for any caller from a given owner and pool. The factory SHALL record the hub as deployed by it and SHALL emit `HubDeployed(hub, owner)`. It SHALL reject a zero owner or a zero pool. The factory holds no role in any hub it deploys.

#### Scenario: Hub deployed
- **WHEN** a caller deploys a hub with owner `O` and pool `P`
- **THEN** a hub exists whose owner is `O` and whose pool is `P`
- **AND** the factory emits `HubDeployed(hub, O)` and reports the hub as one of its own

#### Scenario: Zero pool rejected
- **WHEN** a caller deploys a hub with a zero pool address
- **THEN** the deployment reverts

#### Scenario: Factory has no authority
- **WHEN** the factory address calls any administrative function of a hub it deployed
- **THEN** the call reverts

### Requirement: Signers carry a decision-kind mask
The hub owner SHALL set or clear a signer with a mask of the decision kinds the signer may sign. The bits are CREDIT=1, HOLD=2, FREEZE=4 and RETURN=8. A mask of 0 removes the signer. Every change SHALL emit `SignerSet(signer, mask)`. Only the owner may change signers.

#### Scenario: Auto-signer limited to CREDIT and HOLD
- **WHEN** the owner sets signer `S` with mask 3
- **THEN** `S` can sign CREDIT and HOLD decisions and cannot sign FREEZE or RETURN decisions

#### Scenario: Signer revoked
- **WHEN** the owner sets signer `S` with mask 0
- **THEN** no decision signed by `S` is accepted from then on

#### Scenario: Non-owner cannot add a signer
- **WHEN** an address other than the owner sets a signer
- **THEN** the call reverts

### Requirement: Only authorised executors deliver decisions
The hub owner SHALL authorise or revoke executor addresses and SHALL emit `ExecutorSet(executor, allowed)`. An executor is either the Chainlink CRE forwarder or a `deflow-workflow` submitter. Both kinds use the same delivery entry point. A delivery from any other address SHALL revert.

#### Scenario: CRE forwarder and deflow submitter side by side
- **WHEN** the owner authorises both the CRE forwarder and a submitter address
- **THEN** a validly signed decision delivered by either address is accepted

#### Scenario: Unknown sender
- **WHEN** an address that is not an authorised executor delivers a validly signed decision
- **THEN** the call reverts and no state changes

### Requirement: Owner sets the credit pool
The hub owner SHALL be able to change the pool address that receives credited funds, and the hub SHALL emit `PoolSet(pool)`. The hub SHALL reject a zero pool address.

#### Scenario: Pool changed
- **WHEN** the owner sets pool `P2`
- **THEN** every CREDIT executed after that moves funds to `P2`

#### Scenario: Zero pool rejected on update
- **WHEN** the owner sets the pool to the zero address
- **THEN** the call reverts

### Requirement: Hub reports the receiver interface
The hub SHALL report support for the Chainlink CRE `IReceiver` interface and for ERC-165 through `supportsInterface`, so that the CRE forwarder accepts it as a report target.

#### Scenario: Interface query
- **WHEN** `supportsInterface` is called with the `IReceiver` interface id
- **THEN** it returns true
