# gateway-factory Specification

## Purpose
Deploys merchant gateways wired to the shared registry and forwarder. It is the single fixed-address emitter of payment events, so the workflow's log trigger covers gateways deployed after the workflow.

## Requirements

### Requirement: Permissionless gateway deployment
`deploy(merchConfig)` SHALL be callable by anyone. It SHALL create a gateway with the given merchant, payout address, token, and policy, wired to the factory's registry, forwarder, workflow owner, and workflow name. The factory SHALL record the gateway as its own and emit `GatewayDeployed(gate)`.

#### Scenario: Deployment emits event
- **WHEN** `deploy` succeeds
- **THEN** `GatewayDeployed` is emitted with the new gateway address

#### Scenario: Owner named by caller
- **WHEN** a caller deploys with `merchant` set to another address
- **THEN** that other address becomes the gateway's owner

### Requirement: Factory is the sole PaymentOpened emitter for the workflow
`emitPaymentOpened(id, payer, amount)` SHALL be callable only by gateways this factory deployed. It SHALL emit `PaymentOpened(gate, id, payer, amount)` with the calling gateway as `gate`.

#### Scenario: Forged event attempt
- **WHEN** an address that is not a factory-deployed gateway calls `emitPaymentOpened`
- **THEN** the call reverts with "not a gate"
