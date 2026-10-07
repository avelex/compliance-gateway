# Design

## Context

- **Interface source.** `design-compliance-backend` D7 fixed the decision vocabulary, the EIP-712 domain, the `paymentId` rule and the FREEZE rules. The archived spike T1 (`spikes/decision-eip712/`) proved that go-ethereum and `cast` agree on the digest of the original five-field struct.
- **Deposits are plain ERC-20 transfers.** The evidence pack template records a deposit as `tx_hash` plus `log_index` in a payer-specific deposit contract. So the contract has no per-payment record until a decision arrives. This is why `token` and `amount` join the struct (proposal).
- **Existing code.**
  - `MerchantGateway` inherits `ReceiverTemplate`. That template gates `onReport` on the forwarder and on optional workflow metadata, and it opens `onReport` to anyone if the forwarder is set to zero.
  - The beta stays as it is (D12 of the backend design).
- **Tests do not compile on `main`.** The remapping `forge-std/=dependencies/forge-std-1.16.2/src/` turns the tests' `forge-std/src/Test.sol` into `.../src/src/Test.sol`.
- **No payer timeout in version 1.** This was confirmed with the user during proposal.

## Goals / Non-Goals

**Goals:**
- The payer-safety invariants live in code that a reviewer can read in one sitting: funds go to the pool or the payer only, and frozen funds can never be returned.
- One hub address per processor for executors, indexers and the CRE forwarder.
- The digest is identical to an independent EIP-712 implementation (`cast`).

**Non-Goals:**
- Upgradeability. Hubs and accounts are immutable code, so a new version is a new hub.
- Multi-chain address equality, meaning the same deposit address on every chain.
- Fee-on-transfer or rebasing tokens.
- On-chain proof that a `paymentId` matches a real `Transfer` log. The evidence pack carries that link.
- Owner key custody: a multisig or a Privy quorum. That is deployment configuration.

## Decisions

### D1. The hub holds all state; accounts are dumb vaults

`ProcessorHub` stores the signer masks, executors, pool, payments and reservations. `DepositAccount` stores only `hub` (the deployer) and `payer`, both immutable. Its one function is:

```
release(address token, uint256 amount, bool toPool)
```

It is callable only by `hub`, and it sends to `toPool ? hub.pool() : payer`.

- **Why:**
  - Executors and ingestion watch one address.
  - Signer rotation is one transaction, not one per account.
  - The account is small enough to audit at a glance.
- **Destinations are enforced by the account.** The account has no `to` parameter, so even a buggy hub cannot send funds to a third address.
- **Alternative rejected:** state inside each account. This multiplies storage and configuration per payer, and events would come from thousands of addresses.

### D2. Accounts are `new DepositAccount{salt}(payer)` with salt = `bytes32(uint256(uint160(payer)))`

`accountOf(payer)` uses `Create2.computeAddress(salt, keccak256(creationCode ++ abi.encode(payer)))`. The deployer is the hub, so the address depends on the hub and the payer only. `deployAccount(payer)` is public and returns early if `account.code.length > 0`. `_execute` calls it on the first decision.

- **Alternative rejected:** `Clones.cloneDeterministicWithImmutableArgs`. It is cheaper per payer, but it adds a proxy layer and a second address-derivation path to test. Each payer deploys once, and at Base gas prices that is negligible.
- `ponytail:` full bytecode per payer. Switch to clones if deployment cost shows up in executor budgets.

### D3. EIP-712 domain per account, built by the hub

OpenZeppelin `EIP712` binds the domain to `address(this)`, but D7 binds it to the deposit account. The hub therefore builds the digest by hand:

```
domain = keccak256(abi.encode(
  keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
  keccak256("Deflow Decision"), keccak256("1"), block.chainid, accountOf(payer)))
digest = MessageHashUtils.toTypedDataHash(domain, structHash)
signer = ECDSA.recover(digest, signature)        // rejects malleable s and bad v
```

Binding to the account means that a signature for payer A delivered as payer B recovers a different address and fails the signer check. No separate `payer` field is needed in the struct.

### D4. The extended struct

```
Decision(bytes32 paymentId,uint8 decision,address token,uint256 amount,bytes32 packHash,uint64 nonce,uint64 deadline)
```

- **Field order.** D7's fields keep their order, and `token, amount` are inserted after `decision`, so the payment's identity and value come before the evidence and replay fields. The order is part of the typehash, so it is now frozen.
- **`amount` is in token base units.** Decimal strings belong to the evidence pack, not to the contract.
- **The struct lives in `src/processor/libs/Decision.sol`,** together with the decision constants, the `Status` enum and the typehash, so the hub, the tests and the deploy script share one definition.

### D5. One entry point, `onReport(metadata, report)`, gated by an executor set

- The hub implements `IReceiver` directly with OpenZeppelin `Ownable`. It does not inherit `ReceiverTemplate`.
- `onReport` requires `executors[msg.sender]`. It then decodes `(address payer, Decision d, bytes sig)` and ignores `metadata`.
- **Why not `ReceiverTemplate`:**
  - **The template trusts the wrong thing.** It authenticates the forwarder and the workflow identity, but here authority is the processor's signature, and the executor only delivers it.
  - **One signature check for both paths.** The deflow submitter calls the same function with empty metadata, so there is one code path and one set of tests.
  - **No fail-open state.** In the template, a zero forwarder opens `onReport` to anyone. The executor set has no such state.
- **The executor set** is defence in depth against spam and front-running. It is not the authority.

### D6. Payment record and status machine

```
enum Status { None, Held, Credited, Returned }   // None is reported as PENDING
struct Payment { address payer; uint64 nonce; Status status; address token; uint256 amount; bytes32 packHash; bytes32 lockCommitment; }
mapping(bytes32 => Payment) payments;
mapping(address account => mapping(address token => uint256)) reserved;
```

| From \ decision | CREDIT | HOLD | FREEZE | RETURN |
|---|---|---|---|---|
| None | Credited, release to pool | Held, reserve | Held + lock, reserve | Returned, release to payer |
| Held, no lock | Credited, unreserve + release | Held (update packHash, nonce) | Held + lock | Returned, unreserve + release |
| Held + lock | Credited, unreserve + release | revert | Held + new lock | revert |
| Credited / Returned | revert | revert | revert | revert |

- **First decision:** record `payer, token, amount`, then check `amount <= balanceOf(account) - reserved[account][token]`.
- **Later decisions:** require the same payer, token and amount.
- **Lock commitment:** `keccak256(abi.encode(packHash, nonce))`.
- **Effects before interactions.** The status, nonce and reservations are written before `account.release`. Tokens are the processor's chosen stablecoins, called through `SafeERC20`, so there is no `ReentrancyGuard`.
  - `ponytail:` CEI only. Add a guard if hooked tokens (ERC-777 style) are ever allowed.

### D7. Signer masks

`mapping(address => uint8) signerMask`. Bit `1 << (decision - 1)` must be set. Per the backend design, the owner gives the `AUTO_BY_POLICY` key mask `0x03` and officer keys `0x0F`. A stolen auto-key can then only CREDIT or HOLD, and only up to the free balance.

### D8. Minimal factory

`ProcessorHubFactory.deploy(owner, pool)` does `new ProcessorHub(owner, pool)`, sets `isHub[hub] = true`, and emits `HubDeployed(hub, owner)`. Its only purpose is a fixed address that eventscale and `deflow-workflow` can watch to learn about new hubs, the same role `GatewayFactory` plays for CRE today. It keeps no role in any hub.

### D9. Test vector by `cast`, not by Go

- `contracts/test/processor/fixtures/decision-eip712.json` holds the typed data and the signature produced by `cast wallet sign --data` with anvil key 0, one case per decision kind. `cast` has no command that prints an EIP-712 digest, so the fixture stores signatures only.
- `gen.sh` next to it regenerates the file.
- The forge test signs the hub's `decisionDigest(verifyingContract, d)` with the same key through `vm.sign`. It asserts that the signature is byte-equal to cast's, and that cast's signature recovers to the fixture signer. Both sides use RFC 6979 deterministic ECDSA, so equal signatures prove equal digests.
- `decisionDigest` takes the account address rather than the payer. The vector can then use a fixed `verifyingContract` that does not depend on the `DepositAccount` bytecode.
- **Why `cast`:** it is an implementation independent of both Solidity and the future Go signer. The Go-side parity test belongs to `add-compliance-backend`, which will reuse this fixture.

### D10. Fix `forge-std` imports at the import site

- Change `forge-std/src/Test.sol` to `forge-std/Test.sol` in the three tests and in `Sandbox.s.sol`. That matches the remapping and the two deploy scripts that already work.
- **Alternative rejected:** change the remapping. The scripts that already use `forge-std/Script.sol` would then break.

## Risks / Trade-offs

- **[A compromised hub owner can add a signer and CREDIT any free or held balance to the pool.]** → This is the processor's own custody risk, by the one-pager design. The owner should be a multisig. FREEZE still cannot become a return.
- **[No payer timeout: if the processor disappears, deposits stay in the accounts.]** → Documented limitation, accepted for version 1. The processor is a regulated entity with an off-chain obligation. A future change could add a payer sweep of *unreserved* balance only.
- **[A `paymentId` is not checked on chain against a real `Transfer`.]** → The damage is bounded:
  - a fabricated id can only move this payer's own free balance, to the pool or back to the payer;
  - the reservation rule stops a held amount from being spent twice;
  - the evidence pack ties each id to a tx hash and log index.
- **[Out-of-order delivery.]** For example, CREDIT with nonce 2 lands before HOLD with nonce 1. → HOLD then reverts against a terminal or higher-nonce record, and the final state follows the newest decision. The backend must sign strictly increasing nonces (D7 of the backend design).
- **[An executor can censor, by never delivering.]** → Several executors can be authorised, and the processor can register its own submitter.
- **[The issuer blacklists a deposit account, which USDC can do.]** → The contract cannot prevent it. Section G of the evidence pack records the issuer check.
- **[The struct differs from the archived D7 and spike T1.]** → This proposal and the README state the change. The new fixture is the source of truth from now on.

## Migration Plan

1. Fix the imports, and confirm that the existing suite passes.
2. Add the new contracts and tests. The beta contracts are not touched.
3. The deploy script deploys the factory and one hub to Base Sepolia when it is run by hand. Running it is not part of apply.
4. Rollback: stop using the hub. Nothing in the beta path refers to it.
