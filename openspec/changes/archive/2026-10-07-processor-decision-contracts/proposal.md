# Proposal

## Why

Configuration (a) of composable Deflow needs contracts in which a processor, not a DON, makes the decision on each deposit. The current `MerchantGateway` settles on a DON-signed `(id, ok)` and lets anyone `reclaim()` after 15 minutes. It therefore cannot express HOLD or FREEZE, and it cannot let a payer's frozen funds stay frozen. `design-compliance-backend` D7 fixed the interface. This change implements it, so that `add-compliance-backend` (mode a) and `add-deflow-workflow` have a target.

## What Changes

- **New `ProcessorHub` contract**, one per processor. It is owned by the processor's admin and holds:
  - the signer set, where each signer has a mask of the decision kinds it may sign;
  - the authorised executors, either the CRE forwarder or `deflow-workflow` submitters;
  - the credit pool address;
  - the per-payment state.
- **New `DepositAccount` contract**, one per payer, at a CREATE2 address derived from the hub and the payer.
  - Payers fund it with a plain ERC-20 transfer, so the address works before the account is deployed.
  - Its code can send funds only to the hub's pool or back to its own payer.
- **Signed decisions.** The hub accepts an EIP-712 `Decision{paymentId, decision, token, amount, packHash, nonce, deadline}`:
  - signed by the processor and verified against the signer set;
  - delivered by an executor through one entry point, `onReport(metadata, report)`, used by both executor kinds.
- **Struct change, against design D7: `token` and `amount` are added.** A plain transfer leaves no per-payment record on chain, so the decision must say how much to move. The domain is unchanged: `{name: "Deflow Decision", version: "1", chainId, verifyingContract: <deposit account>}`. The test vector is regenerated with `cast`.
- **Neutral status machine** per payment: `PENDING` (implicit), `HELD`, `CREDITED`, `RETURNED`.
  - FREEZE is `HELD` plus `lockCommitment = keccak256(packHash, nonce)`.
  - A frozen payment accepts only `CREDIT` or a new FREEZE. RETURN, HOLD and any timeout are impossible.
- **No public `reclaim` and no payer timeout in version 1.** A deposit with no decision does not move. This is a documented limitation.
- **New `ProcessorHubFactory`**: a fixed address that deploys hubs and emits `HubDeployed`, for indexers and executors to discover.
- **Fix the `forge-std` import paths** so that `forge test` runs. On `main` the remapping and the test imports disagree.
- The existing `MerchantGateway`, `GatewayFactory` and `AttestationRegistry` are not changed (D12).

## Capabilities

### New Capabilities
- `processor-hub`: deploying a processor's hub through the factory and its administration: signer set with per-decision masks, executors, pool, ownership.
- `processor-decisions`: accepting and executing processor-signed EIP-712 decisions. Covers signature, nonce, deadline, executor checks, the status machine, FREEZE irreversibility and events.
- `deposit-accounts`: per-payer CREATE2 deposit addresses, lazy deployment, free-balance reservation, and the invariant that funds leave only to the pool or the payer.

### Modified Capabilities
None. The beta `merchant-gateway` and `gateway-factory` behaviour is unchanged.

## Impact

- **New code:**
  - `contracts/src/processor/ProcessorHub.sol`, `DepositAccount.sol`, `ProcessorHubFactory.sol` and `libs/Decision.sol`;
  - tests under `contracts/test/processor/`;
  - a deploy script.
- **Test imports:** `contracts/test/*.t.sol` and `script/Sandbox.s.sol` move to `forge-std/*.sol` imports.
- **Downstream:**
  - `add-compliance-backend` must sign the extended struct.
  - `add-deflow-workflow` calls `onReport` from a registered submitter.
  - Ingestion reads `DecisionExecuted` from the hub address and ERC-20 `Transfer` to deposit accounts.
- **Docs:** the README roadmap entry, and a note that D7's struct is superseded by this change.
- No new dependencies. OpenZeppelin 5.6.1 provides `ECDSA`, `Create2` and `SafeERC20`.
