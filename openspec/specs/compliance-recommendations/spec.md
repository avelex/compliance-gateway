# compliance-recommendations Specification

## Purpose
Turns check results into a reproducible recommendation under an MLRO-approved ruleset. The outcome becomes a signed decision, taken automatically by policy or by an officer, in the same EIP-712 format the processor contracts accept.

## Requirements

### Requirement: Ruleset is an ordered list of rules
A ruleset SHALL be a JSON document with a version and an ordered list of rules. Each rule has:
- an id;
- conditions;
- a recommendation, one of `CREDIT`, `HOLD`, `FREEZE` or `RETURN`;
- reason codes;
- an `auto` flag.

The last rule SHALL have no conditions. `ruleset_hash` SHALL be the SHA-256 of the canonical JSON.

#### Scenario: Missing default rule
- **WHEN** the last rule has conditions
- **THEN** import fails

### Requirement: Conditions use a fixed vocabulary
Conditions SHALL use only these fields: `kyt.risk_level`, `sanctions.result`, `structuring.result`, `issuer.result`, `any_unavailable` and `amount_eur`. They SHALL use only these operators: `eq`, `in` and `gte`. Import SHALL reject any other field or operator.

#### Scenario: Unknown field rejected
- **WHEN** a ruleset uses the condition field `kyt.score`
- **THEN** import fails and names the field

### Requirement: Only approved rulesets run
An imported ruleset SHALL be used only after the MLRO approves it. Approval is an EIP-712 signature over `RulesetApproval(bytes32 rulesetHash,string version,uint64 effectiveFrom)` by an address in the configured MLRO set. Once approved, a ruleset SHALL be immutable. A payment SHALL be evaluated under the approved ruleset with the latest `effectiveFrom` at or before the payment's block time.

#### Scenario: Signature from a non-MLRO
- **WHEN** a ruleset approval is signed by an address outside the MLRO set
- **THEN** approval is rejected and the ruleset never runs

#### Scenario: No approved ruleset
- **WHEN** a confirmed payment exists and no ruleset is effective
- **THEN** the payment opens an officer case with reason `NO_RULESET` and no automatic decision is made

### Requirement: Recommendation is a pure, replayable function
The engine SHALL take the normalised check results, the EUR amount and the ruleset, and return the first matching rule's recommendation, reason codes and `policy_ref` (ruleset version and rule id). It SHALL store the result with the ruleset version, `inputs_hash` (SHA-256 of the canonical inputs) and `engine_version`. Re-running the engine on the stored inputs SHALL return the same output.

#### Scenario: Replay
- **WHEN** the stored inputs of a recommendation are evaluated again under the same ruleset
- **THEN** the recommendation, reason codes and `inputs_hash` are identical

#### Scenario: Unavailable check
- **WHEN** any check result is `UNAVAILABLE` and the ruleset's first rule is `any_unavailable eq true -> HOLD`
- **THEN** the recommendation is `HOLD`

### Requirement: Decision mode follows the rule
A recommendation of `CREDIT` or `HOLD` from a rule with `auto: true` SHALL be decided `AUTO_BY_POLICY` and signed by the policy key. Every other recommendation, and every `FREEZE` or `RETURN`, SHALL open an officer case.

#### Scenario: Auto credit
- **WHEN** a clean payment matches an `auto: true` CREDIT rule
- **THEN** a CREDIT decision in mode `AUTO_BY_POLICY` is recorded with the policy signer's address and signature

#### Scenario: Sanctions hit goes to an officer
- **WHEN** a payment matches a rule recommending `FREEZE`
- **THEN** no decision is signed automatically and the payment appears in the case list

### Requirement: Decisions are EIP-712 Decision structs
Every decision SHALL be the EIP-712 struct `Decision(bytes32 paymentId,uint8 decision,address token,uint256 amount,bytes32 packHash,uint64 nonce,uint64 deadline)` under domain `{name: "Deflow Decision", version: "1", chainId, verifyingContract}`. A decision signed by the service SHALL verify against the same struct in the processor contracts.

#### Scenario: Contract-compatible digest
- **WHEN** the service builds the digest for the shared `cast` test vector
- **THEN** signing it with the vector's key reproduces the vector's signature

### Requirement: Decision fields bind the deposit and its evidence
- In mode (b), `verifyingContract` SHALL be the deposit address.
- `packHash` SHALL be the `evidence_root` of the pack version decided on.
- `nonce` SHALL increase by one per decision on the same payment.
- `deadline` SHALL be the decision time plus the configured time to live.

#### Scenario: Second decision nonce
- **WHEN** a payment already has a HOLD with nonce 1 and an officer decides FREEZE
- **THEN** the FREEZE carries nonce 2

### Requirement: Officer decisions are submitted as signatures
For a payment in review, the API SHALL return the EIP-712 typed data to sign for a requested decision kind. The service SHALL accept an officer's signature over exactly that typed data, with a rationale. It SHALL accept the signature only if the signer is in the configured officer set with permission for that kind. The service SHALL never hold an officer's key.

#### Scenario: Officer freeze
- **WHEN** an authorised officer posts a signed FREEZE with a rationale
- **THEN** a decision in mode `OFFICER_REVIEW` is recorded with the officer's pseudonymous id and signature

#### Scenario: Signature over different data
- **WHEN** the posted signature does not recover to an authorised officer for the returned typed data
- **THEN** the request is rejected and no decision is recorded

### Requirement: Decision sequence obeys the freeze rule
The service SHALL apply the same transitions as the processor contracts:
- `CREDITED` and `RETURNED` are final;
- a payment with a FREEZE accepts only `CREDIT` or a new `FREEZE`.

In mode (b) decisions SHALL be recorded and not executed. `execution_tx` SHALL be "n/a, executed by the processor outside Deflow".

#### Scenario: Return after freeze rejected
- **WHEN** an officer posts a RETURN for a frozen payment
- **THEN** the request is rejected

### Requirement: API is authenticated
Every API endpoint SHALL require the configured bearer token, and SHALL return 401 without it. Responses for checkout or payer audiences are out of scope. Case and payment endpoints are for processor staff only.

#### Scenario: Missing token
- **WHEN** `GET /v1/cases` is called without a bearer token
- **THEN** the response is 401
