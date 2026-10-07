# Tasks

## 1. Test toolchain

- [x] 1.1 Change the `forge-std/src/*.sol` imports in `contracts/test/*.t.sol` and `contracts/script/Sandbox.s.sol` to `forge-std/*.sol` (design D10). Verify that `forge build` and `forge test` in `contracts/` pass the existing suite.

## 2. Shared types and deposit account

- [x] 2.1 Add `contracts/src/processor/libs/Decision.sol` (design D4, D6). It holds the `Decision` struct, the decision constants 1–4, the `Status` enum, the `DECISION_TYPEHASH` string and the domain typehash. Verify with `forge build`.
- [x] 2.2 Add `contracts/src/processor/DepositAccount.sol` (design D1). It has immutable `hub` and `payer`, plus `release(token, amount, toPool)`, which only the hub can call and which sends only to `hub.pool()` or `payer`. Add tests showing that an outsider call reverts and that both destinations work. Verify with `forge test --match-path test/processor/DepositAccount.t.sol`.

## 3. Hub administration and factory

- [x] 3.1 Add `contracts/src/processor/ProcessorHub.sol` with the following, per the processor-hub spec and design D5 and D7:
  - Ownable admin;
  - `setSigner(addr, mask)`, `setExecutor(addr, allowed)` and `setPool(pool)`, with their events and non-zero checks;
  - `supportsInterface` for `IReceiver` and ERC-165.

  Add tests for owner-only access, zero-pool rejection and the interface query.
- [x] 3.2 Add `accountOf(payer)` and the idempotent `deployAccount(payer)`, which emits `AccountDeployed` (deposit-accounts spec, design D2). Add tests showing that the predicted address equals the deployed address, that funds sent before deployment are visible, that two payers get different addresses, and that a repeat deploy does not revert.
- [x] 3.3 Add `contracts/src/processor/ProcessorHubFactory.sol` (design D8). It provides `deploy(owner, pool)`, `isHub` and `HubDeployed`. Add tests for deployment, zero-owner and zero-pool rejection, and showing that the factory has no admin rights on the hub. Verify with `forge test --match-path 'test/processor/*'`.

## 4. Decision execution

- [x] 4.1 Add the per-account EIP-712 digest and `ECDSA.recover` (design D3). Add `contracts/test/processor/fixtures/decision-eip712.json` with one case per decision kind, plus `gen.sh`, which produces the digest and signature with `cast wallet sign --data` and anvil key 0 (design D9). Add a test that, for every case, `vm.sign` over the hub's digest reproduces cast's signature byte for byte and that cast's signature recovers to the fixture signer.
- [x] 4.2 Implement `onReport(metadata, report)` with the following, per the processor-decisions spec and design D5 and D6:
  - the executor check;
  - decoding of `(payer, Decision, sig)`;
  - the signer-mask, deadline, nonce and decision-kind checks;
  - the first-decision record and the payer, token and amount match;
  - the free-balance reservation;
  - the full status table;
  - lazy account deployment;
  - the `DecisionExecuted` event.

  Add tests covering each spec scenario:
  - direct CREDIT and RETURN;
  - HOLD then CREDIT, and HOLD then RETURN;
  - FREEZE then RETURN and FREEZE then HOLD, both reverting;
  - re-FREEZE with a new commitment;
  - terminal records reverting;
  - redelivery, expiry, a wrong executor and a signer without the permission bit;
  - a signature replayed onto another payer;
  - an amount mismatch, and the free-balance reservation with one frozen deposit and one new deposit;
  - an unknown decision kind.

  Verify with `forge test --match-path 'test/processor/*'`.
- [x] 4.3 Add a fuzz or invariant test. Over random sequences of signed decisions on one account, the account's tokens only ever reach the pool or the payer, and a payment that was ever frozen never ends `RETURNED`. Verify with `forge test --match-path 'test/processor/*'` at the default fuzz runs.

## 5. Deploy script and docs

- [x] 5.1 Add `contracts/script/DeployProcessorHub.s.sol`. It deploys the factory and one hub from environment variables (`HUB_OWNER`, `HUB_POOL`, optional `SIGNER`, `SIGNER_MASK`, `EXECUTOR`). Verify with a dry run against a local `anvil` (`forge script ... --rpc-url http://127.0.0.1:8545 --broadcast`), and confirm that the hub's owner, pool, signer and executor are set.
- [x] 5.2 Update `README.md`:
  - tick `processor-decision-contracts` in the roadmap;
  - note that the D7 struct is superseded and now includes `token, amount`;
  - add the new contracts to the Components table.

  Verify that the README renders and that its links resolve.

## 6. Integration check

- [x] 6.1 Run the whole suite with `forge test` in `contracts/`, beta and processor tests together, and confirm that it is green. Also confirm that `git diff main -- contracts/src/MerchantGateway.sol contracts/src/GatewayFactory.sol contracts/src/AttestationRegistry.sol` is empty.
