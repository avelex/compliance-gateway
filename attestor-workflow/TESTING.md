# Sandbox Integration Test Report — Base Sepolia

Live end-to-end test campaign against real, verified contracts on Base Sepolia
(chain 84532), driven through `cre workflow simulate --broadcast` (real
Chainlink mock KeystoneForwarder) and real external compliance APIs
(GoPlus Labs, Sumsub sandbox). No test used a private key belonging to any
sanctioned entity — that's not something anyone should possess.

Date: 2026-09-07. Deployer/merchant/payoutTo/payer: `0x1d824544275E9F6d417aa14221EA6b52a77Bb337`
(funded testnet-only key, no real-world value).

## Deployments

| Contract | Address | Deploy tx | Verified |
|---|---|---|---|
| MockUSDC (test token) | `0x6B0E5c0d6d9192318971322826923AB38967d1FC` | [`0x829a54e7…0dda5a`](https://sepolia.basescan.org/tx/0x829a54e7ceb33e24986e9fac1ca40a6911f3f99987b6a3049ba06d1e1e0dda5a) | [Basescan](https://sepolia.basescan.org/address/0x6b0e5c0d6d9192318971322826923ab38967d1fc#code) / [Blockscout](https://base-sepolia.blockscout.com/address/0x6b0e5c0d6d9192318971322826923ab38967d1fc) |
| AttestationRegistry | `0x173981FE1BB8a839AF95e4b60bFcFA998e46c35d` | [`0x9cf23bf7…801f85`](https://sepolia.basescan.org/tx/0x9cf23bf7f26f492c062417f29ce3781276ca09afd287acb634981dd48b801f85) | [Basescan](https://sepolia.basescan.org/address/0x173981fe1bb8a839af95e4b60bfcfa998e46c35d#code) / [Blockscout](https://base-sepolia.blockscout.com/address/0x173981fe1bb8a839af95e4b60bfcfa998e46c35d) |
| GatewayFactory | `0xebbEA2FD5A32F4c3603E76Bd9c2Ea973d8aAF2dF` | [`0xfc8bc2c6…384fa`](https://sepolia.basescan.org/tx/0xfc8bc2c6ca83d92ccf50d37e9d216abda592eb0f1504904e76d6d4462b4384fa) | [Basescan](https://sepolia.basescan.org/address/0xebbea2fd5a32f4c3603e76bd9c2ea973d8aaf2df#code) / [Blockscout](https://base-sepolia.blockscout.com/address/0xebbea2fd5a32f4c3603e76bd9c2ea973d8aaf2df) |
| MerchantGateway (sandbox gate) | `0x5Abe6E7c1fE5d3F72a93c0f1Bf05cdA05F4161f6` | [`0x95e2c373…39806`](https://sepolia.basescan.org/tx/0x95e2c37330221e7bf56102685cf1740ca1b09bd84a5a09b3dcef1c8779739806) (via `GatewayFactory.deploy()`) | [Basescan](https://sepolia.basescan.org/address/0x5abe6e7c1fe5d3f72a93c0f1bf05cda05f4161f6#code) / [Blockscout](https://base-sepolia.blockscout.com/address/0x5abe6e7c1fe5d3f72a93c0f1bf05cda05f4161f6) |
| KeystoneForwarder (mock, Chainlink-owned) | `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` | n/a — pre-existing Chainlink infra | n/a |

Policy on the sandbox gate: `levelBelow=1, levelAbove=1, threshold=10,000 USDC, maxRisk=80`.

## Addresses that participated

| Address | Role |
|---|---|
| `0x1d824544275E9F6d417aa14221EA6b52a77Bb337` | deployer / merchant / payoutTo / payer (our key) |
| `0x82300bd7c3958625581cc2F77bC6464dcEcDF3e5` | Chainlink mock KeystoneForwarder (real, not ours) |
| `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` | Ronin Bridge exploiter, Lazarus Group, **OFAC SDN** — GoPlus test subject, read-only |
| `0xA160cdAB225685dA1d56aa342Ad8841c3b53f291` | Tornado Cash 100 ETH pool, **OFAC SDN** — GoPlus test subject, read-only |
| `0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b` | Tornado Cash 1000 ETH pool, **OFAC SDN** — GoPlus test subject, read-only |
| `0x0D043128146654C7683Fbf30ac98D7B2285DeD00` | Harmony Bridge exploiter, Lazarus Group — GoPlus test subject, read-only |
| `0xb66cd966670d962C227B3EABA30a872DbFF01e7` | Euler Finance exploiter — GoPlus test subject, read-only |
| `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | vitalik.eth — GoPlus clean control |
| `0x71660c4005BA85c37ccec55d0C4493E66Fe775d3` | Coinbase 1 hot wallet — GoPlus clean control |
| `0x2222222222222222222222222222222222222A` | fresh unknown wallet — real-Sumsub fail-closed test subject |

Sanctioned addresses were only ever used as **read-only lookup keys** against
GoPlus's public API — nobody controls their keys, none were used to sign
anything.

## Scenario results

### Layer 1 — on-chain, contract-level (Base Sepolia, real forwarder)

| # | Scenario | Expected | Result | Evidence |
|---|---|---|---|---|
| 1 | `pay()` before any attestation | revert `NotVerified` | ✅ PASS | rejected at gas estimation, no tx (client-side) |
| 2 | Attest wallet via real forwarder (cron trigger, `cre workflow simulate --broadcast`) | `Heartbeat` + `Attested`, `isValid=true` | ✅ PASS | tx [`0x385972f3…6601d`](https://sepolia.basescan.org/tx/0x385972f3312f0b5f5f689c67a98b2bafb0b346b9c8911e30e9dec565f106601d) |
| 3 | `onReport` called directly by an EOA (not the forwarder) | revert `InvalidSender` | ✅ PASS | mined revert, tx [`0x717bcfb5…3358b`](https://sepolia.basescan.org/tx/0x717bcfb5ab5194633c12260ddd504bd3bc1ddddd86a03c8a098ff2be1443358b), status=0 |
| 4 | Revoke nullifier via real HTTP-trigger webhook | `revokedNullifier=true`, `isValid=false` | ✅ PASS | tx [`0x7cc246f8…3e490d`](https://sepolia.basescan.org/tx/0x7cc246f86ddeed3de08b62c636b74ecc2185b53ccf31fbd4f9292476f23e490d) |
| 5 | `pay()` from revoked wallet | revert `NotVerified` | ✅ PASS | rejected at gas estimation, no tx (client-side) |
| 6 | Re-attest same wallet, fresh nullifier (new Sumsub applicant id) | new nullifier, `isValid=true` again | ✅ PASS | tx [`0x205047a0…d76a729`](https://sepolia.basescan.org/tx/0x205047a058f4fd66625461be3f975de52a7ba52730070f1a6c9e33917d76a729) — proves revocation is scoped per-nullifier, not per-wallet |
| 7 | Real `pay()` with valid attestation | funds held pending in gate | ✅ PASS | tx [`0xe7b78974…6cd1fc`](https://sepolia.basescan.org/tx/0xe7b78974bccaedff4cef91be4a4ba40a78b183c02ab72609ae095429546cd1fc) |
| 8 | Real settlement via log-trigger (`cre workflow simulate --evm-tx-hash ... --broadcast`), GoPlus-scored payer | `ok=true`, funds released, `status=Settled` | ✅ PASS | tx [`0xc1b7e7f2…37a2ab8`](https://sepolia.basescan.org/tx/0xc1b7e7f2df18a961060cbcdc90f48da7b4244430cef3d1337fc5f092e37a2ab8) — full attest→pay→settle loop closed live |
| 9 | Revoke current nullifier again | `isValid=false` | ✅ PASS | tx [`0x711a051f…78cae61`](https://sepolia.basescan.org/tx/0x711a051fa8c056d2f5813b14073a818b090a0d4e8531bf6e94099656378cae61) |
| 10 | `pay()` from now-revoked wallet (forced past gas estimation) | revert `NotVerified`, mined | ✅ PASS | mined revert, tx [`0x61e5a50f…f3672d`](https://sepolia.basescan.org/tx/0x61e5a50f72c9a428e10f170f9a81227432e87c2e3f524d50dcdb6b1d99f3672d), status=0 |

### Layer 2 — provenance screening (GoPlus, real API, `chain_id=1`)

| Address | Label | Flags returned | Score (our weights) |
|---|---|---|---|
| `0x098B716…2f96` | Ronin Bridge exploiter (Lazarus, **OFAC SDN**) | `sanctioned, stealing_attack, blacklist_doubt` | **100** |
| `0x0D04312…eD00` | Harmony Bridge exploiter (Lazarus) | `stealing_attack` | **90** |
| `0xA160cdA…f291` | Tornado Cash 100 ETH pool (**OFAC SDN**) | none | 0 ⚠️ |
| `0xd90e2f9…F31b` | Tornado Cash 1000 ETH pool (**OFAC SDN**) | none | 0 ⚠️ |
| `0xb66cd96…01e7` | Euler Finance exploiter | none | 0 ⚠️ |
| `0xd8dA6BF…6045` | vitalik.eth (clean) | none | 0 ✅ |
| `0x71660c4…75d3` | Coinbase 1 hot wallet (clean) | none | 0 ✅ |
| `0x1d82454…7bb337` | our deployer (clean) | none | 0 ✅ |

**Finding:** GoPlus correctly flagged 2/5 known-bad addresses; 3 OFAC-sanctioned
addresses (2 Tornado Cash pools, Euler exploiter) came back clean — a real
coverage gap in GoPlus's dataset, not a bug in our code. `maxRisk=80` on the
sandbox policy means anything GoPlus does catch above 80 correctly blocks;
anything it misses, this layer alone won't catch — matches the README's own
framing ("free address oracles only flag addresses that are themselves on
the list").

### Layer 3 — identity verification (Sumsub, real sandbox API)

| # | Scenario | Expected | Result | Evidence |
|---|---|---|---|---|
| 1 | `Verify()` for a nonexistent applicant, direct Go call | fail closed, non-nil error | ✅ PASS | real `404` from `api.sumsub.com` |
| 2 | Same, through the real cron pipeline, `--broadcast` | excluded from batch, heartbeat-only report | ✅ PASS | `"attested 0"`, tx [`0x0ee4f39f…c8c151`](https://sepolia.basescan.org/tx/0x0ee4f39f94f677cb6fbf1c11ff21e0189769d5b948b0cf0acab02e6d50c8c151) — only `Heartbeat`, no `Attested` |

## Bug found during this campaign

**Stale-finalized-block read in `onPaymentOpened`.** The settlement handler
reads `gateway.Payments(id)` with `blockNumber=nil`, which the generated
binding resolves to `bindings.FinalizedBlockNumber`. Immediately after a
fresh `pay()` on Base Sepolia, the finalized view can still lag behind the
block the payment was actually opened in, so the read came back as the
zero-valued struct (`MaxRisk=0`) instead of the real policy value (`80`) —
observed directly: simulator printed `maxRisk=0`, `cast call` against the
*current* (later) state correctly shows `80`. In this run the outcome
(`ok=true`) happened to be correct by coincidence (payer's real score was
also `0`, so `0<=0` and `0<=80` both hold) — but a payer with, say, score 50
would have been wrongly refunded (`50<=0` false) despite qualifying under the
real policy (`50<=80` true). **Not yet fixed** — needs the read pinned to the
same block/tx context as the triggering log, not `FinalizedBlockNumber`.

## Not (yet) testable

- **World ID (level 1) verification** — needs a real liveness/uniqueness ZK
  proof from the World ID app or an Orb; can't be fabricated offline.
- **Live `ok=false` settlement branch** — would require the private key of a
  wallet GoPlus actually scores above the policy's `maxRisk`, i.e. a real
  sanctioned entity's key. Nobody should have or use that. Proven
  deterministically instead: `test_FullFlow_ScreenFailsRefundsPayer`
  (Foundry) and `TestOnPaymentOpened_RefundsWhenScoreExceedsMaxRisk` (Go,
  `cre/testutils` mocks) — same contract bytecode, same Go binary logic.
- **`reclaim()` after the 15-minute `TIMEOUT`, live** — scenario #14 (second
  `pay()`, tx `0x5d949243…97b22`, payment id `0xf4d65aac…5fef273`) is
  currently sitting `Pending` on the real gate and becomes reclaimable after
  `TIMEOUT`; not waited out live in this pass. Proven deterministically via
  `test_Reclaim_AfterTimeoutReturnsFundsWithoutForwarder` (Foundry).
- **Real multi-node DON consensus** — `cre workflow simulate --broadcast`
  produces a report the mock forwarder accepts, which is sufficient to prove
  the contract-side integration, but it is not N independent DON nodes
  reaching threshold signatures. A genuine multi-node run needs a deployed
  production workflow, which needs Deploy Access (`cre whoami` currently
  shows `Deploy Access: Not enabled` on this account).
- **Cumulative-threshold split-across-wallets, live** — same person, two
  wallets, spend cap — proven only via Foundry
  (`test_CumulativeThreshold_SplitAcrossWalletsStillCaps`); would need a
  second funded live wallet plus two live Sumsub-backed attestations sharing
  one nullifier to reproduce on Base Sepolia.
