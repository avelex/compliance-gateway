# Design

## Context

See `proposal.md` for motivation. Facts this design builds on:

- **Output format is fixed.** `Deflow_Evidence_Pack_Template.pdf` defines the Payment Passport, schema `deflow-evidence/1.0`. It has sections A–K and Annexes 1–3. Two specimens (`Payment_Passport_Specimen_A_Credited_OffRamp.pdf`, `..._B_Frozen_FIU.pdf`) embed their JSON.
- **The integrity scheme is proven.** `verify_pack.py` checks both specimens:
  - a salted per-leaf hash tree, where `$withheld` nodes carry only their subtree hash;
  - `master_root` over the whole `data`;
  - `evidence_root` over the evidence keys `pack_id, payment_ref, onchain, travel_rule, wallet_ownership, kyt, sanctions, structuring, issuer, rules`;
  - `projection_hash` over the copy handed to a recipient;
  - a separate Annex 3 reporting record linked by `pack_master_root`.
- **Decision vocabulary from the specimens.**
  - Decisions: `CREDIT | HOLD | FREEZE | RETURN`.
  - Modes: `AUTO_BY_POLICY | OFFICER_REVIEW`.
  - On-chain statuses: `PENDING | HELD | CREDITED | RETURNED`. FREEZE is `HELD` plus an updated *lock commitment*, so a freeze and an ordinary review look the same on chain.
  - The decision signature is EIP-712 over `{payment_id, decision, pack_hash}`.
  - Deposit contracts are per payer and owned by the processor.
- **Current code does not match the target.**
  - `MerchantGateway` is per merchant, settles on a DON-signed `(id, ok)`, and lets anyone `reclaim()` after 15 minutes.
  - Checks run inside the CRE enclave (`attestor-workflow`).
  - There is no database anywhere.
- **eventscale** (Go, embedded NATS JetStream) streams EVM logs to NATS subjects and supports adding target events at runtime. Spike T2 shows that it drops logs on reorgs and panics on restart (D4).
- **Decisions made in exploration:**
  - Variant 1: the processor signs and the executor delivers.
  - Single-tenant: one backend instance per processor.
  - deflow-workflow is a DON analog.
  - compliance-backend owns recommendations and the Payment Passport.

## Goals / Non-Goals

**Goals:**
- One architecture that serves configuration (a), with contracts, and configuration (b), shadow mode without contracts. Mode (b) must not need a separate code path for the evidence it produces.
- Deflow never holds a key that can move funds or sign a decision, and never holds another processor's data.
- Every pack is reproducible. Given the stored inputs, ruleset version, and engine version, the recommendation can be replayed.
- Stable interfaces for the three dependent changes: the contracts, the executors, and the backend implementation.

**Non-Goals:**
- Settlement Manifest and Audit Export (the data model only leaves room for them).
- Inter-CASP Travel Rule protocols. Version 1 covers self-hosted originators and manually entered CASP data.
- Payer KYC through Sumsub or World ID. That stays in the beta path. The one-pager model uses Travel Rule data plus wallet-ownership proof instead.
- Multi-tenant hosting.
- Fiat FX feeds beyond EURC 1:1 and a USDC reference rate.

## Decisions

### D1. Topology: one Go service per processor, three planes

```
              processor boundary (single tenant: their cloud, or a dedicated deployment under DPA)
+-------------------------------------------------------------------------------------------+
|                                                                                           |
|  checkout --HTTPS--> [intake API] ----+                                                   |
|  (TR data, wallet sig)                |                                                   |
|                                       v                                                   |
|  eventscale --NATS--> [ingest] --> [payments + checks pipeline] --> [rules engine]        |
|  (Transfer / Deposit logs)            |   KYT adapter (BYO key)          |                |
|                                       |   sanctions lists + matcher      v                |
|                                       |   structuring detector    recommendation          |
|                                       |   issuer blocklist read          |                |
|                                       v                                  v                |
|                               [Postgres]  [object store]       [decision service]        |
|                               append-only  raw responses,       AUTO_BY_POLICY --> policy |
|                               journal      PDFs, WORM            signer (processor KMS)   |
|                                       ^                          OFFICER_REVIEW --> officer|
|                                       |                          console (browser wallet) |
|                                       |                                  |                |
|                              [evidence builder] <---- signed decision ---+                |
|                               pack, salts, roots, JWS, TSA, anchor batch |                |
|                                       |                                  v                |
|                              [projection + RFI API]           NATS: decisions.<chain>    |
+---------------------------------------|----------------------------------|----------------+
                                        v                                  v
                         off-ramp / bank / FIU / auditor        executor: chainlink-cre | deflow
                                                                           |
                                                                           v
                                                                deposit contract (mode a)
```

- **Shape.** One Go binary (`compliance-backend/`, its own Go module at the repo root) with internal packages per box above. Postgres holds state. S3-compatible object storage with object lock holds raw provider responses and rendered PDFs. NATS comes from the eventscale deployment.
- **Why one binary:** a single tenant has small volume. Splitting into services would multiply deploy units per processor for no throughput gain.
  - Alternative: microservices per plane. Rejected for the same reason.
- **Language: Go.** It matches eventscale and `attestor-workflow`, and the project stack.

### D2. Single-tenant boundary and key custody

- Each processor gets an isolated deployment: database, object store, NATS account, and KMS.
- **Policy signer.** The key that signs `AUTO_BY_POLICY` decisions lives in the processor's KMS or HSM. The service role may only `Sign`. Deflow operators get no key-admin rights, even in a deployment Deflow operates under a DPA.
- **Officer review.** Decisions are signed in the officer's browser with the officer's wallet (EIP-712 typed data). The backend receives only the signature.
- **Signer authorisation.** The contract accepts any signer from a processor-managed signer set (see D7). Revoking a key is an on-chain action by the processor.
- Alternative considered: Deflow-managed signer with processor approval. Rejected because it contradicts "Deflow signs no transactions" and the template's scope statement.

### D3. Domain model (Postgres, append-only where it is evidence)

| Entity | Key fields | Notes |
|---|---|---|
| `processor_config` | legal name, LEI, CASP id, NCA, RFI channel, cert URL, signer set, retention policy | One row (single tenant). Feeds section header and K. |
| `merchant` | pseudonymous `merchant_id`, payout or pool address | The processor's sub-merchant. |
| `checkout_session` | `payment_ref`, merchant, expected amount and token, chain, deposit address, EIP-712 ownership challenge (nonce, expiry) | Created before payment. Binds TR data and wallet proof to a `payment_ref`. |
| `travel_rule_record` | IVMS101.2023 JSON, `collected_at`, wallet type and method, completeness | PII. Encrypted at rest per column with a processor KMS key. |
| `wallet_proof` | method (EIP-191, EIP-712, SIWE, ERC-1271, TEST_TRANSFER), message, digest, signature, result, `verified_block`, `prior_pack_id` | Reuse across payments is recorded, not silent. |
| `payment` | chain id, token, `tx_hash`, `log_index`, block, payer, deposit contract, amount, EUR amount and FX source, confirmations, `onchain_status` | Unique on `(chain_id, tx_hash, log_index)`. |
| `check_result` | `payment_id`, kind (`kyt`, `sanctions`, `structuring`, `issuer`), provider, product, API version, `external_ref`, normalised result, `raw_sha256`, `performed_at` | Raw response kept in the object store under its hash. |
| `sanctions_list_version` | list name, publisher version or date, `loaded_at`, content hash | Every screening references the exact list versions it used. |
| `ruleset` | version, canonical JSON, `ruleset_hash`, thresholds text, `approved_by`, approval signature, `effective_from`, engine version | Immutable once approved. |
| `recommendation` | `payment_id`, ruleset version, recommendation, `reason_codes`, `inputs_hash` | `inputs_hash` lets a replay prove it used the same inputs. |
| `decision` | `payment_id`, decision, mode, `policy_ref`, `reason_codes`, rationale, officer and second reviewer (pseudonymous), `signer_address`, EIP-712 signature, `pack_hash`, nonce, `execution_tx`, `return_blocked` | Several per payment are allowed, for example auto-HOLD then officer FREEZE. |
| `pack` | `pack_id`, `pack_version`, `data` JSON, `salts`, `master_root`, `evidence_root`, JWS, TSA token, `prev_pack_hash`, anchor batch id | Append-only. A new version links to the old one and never overwrites it. |
| `projection` | `pack_id`, profile, `prepared_for`, purpose, `projection_hash`, PDF object key, `issued_at` | Records exactly who received what. |
| `reporting_record` | Annex 3: freeze report, STR, authority instructions, funds status, `pack_master_root` | Separate table with separate grants. Reachable only by the MASTER and FIU_SUPERVISOR profiles. |
| `anchor_batch` | Merkle root over `master_root`s, `anchor_tx`, chain, period | |
| `journal` | sequence, `pack_id`, `pack_hash`, `prev_pack_hash` | A hash chain across all packs, so a missing pack is detectable. |

- **Retention.** Each pack carries `retention.until` (processor policy, for example 7 years) and `legal_hold`. Object-lock retention mirrors it.
- **Future artifacts.** A Settlement Manifest selects `payment` rows by deposit contract and the withdrawal's source set. An Audit Export aggregates `ruleset`, `sanctions_list_version`, and `decision` statistics. Both need no new evidence tables.

### D4. Ingestion: eventscale as a hint, a reconciler as the truth

Spike T2 (`spikes/eventscale-reorg.md`, eventscale `748a8ef`) found four problems:
- eventscale emits orphaned logs and never retracts them;
- it **drops** logs that land in replacement blocks after a reorg;
- it panics on restart with a persisted cursor;
- SDK subscribers start at the last message only.

A finaliser that rechecks logs it has already seen cannot catch a log that was never delivered. So:

- **eventscale is the low-latency hint.**
  - Mode (a): deposit-contract events (payment received, decision executed).
  - Mode (b): `Transfer(to = processor deposit addresses)` on USDC and EURC.
  - Targets are registered at runtime with `AddTargetEventSync`.
  - The backend consumes through **its own durable JetStream consumer** (`DeliverAll`, explicit ack), not `SDK SubscribeEvent` as is.
- **A reconciler is the source of truth.** For each chain, on a schedule (default every 30 s), it runs `eth_getLogs` for the processor's deposit contracts or addresses over `[last_reconciled + 1, head - N]`, with N per chain in `processor_config`.
  - It upserts `payment` by `(chain_id, tx_hash, log_index)`.
  - A row first seen through eventscale whose block hash differs from the reconciled one, or which is absent from it, is marked `orphaned`.
  - The same code runs the 90-day retro backfill in mode (b).
- **When things run.** Checks may start on first sight, from eventscale. The pack and any decision require the payment to be reconciled at depth N.
- **Upstream eventscale fixes**, tracked in the README roadmap: a `confirmations` setting per network, the cursor encoding, and durable SDK consumers. They cut latency and noise, but correctness never depends on them.
- **Idempotency** comes from the unique key. Redelivery from JetStream or overlap with the reconciler is harmless.

### D5. Check pipeline

All checks write a `check_result` and run concurrently after the payment is first seen. Travel Rule data and wallet proof are collected *before* payment at checkout.

| Section | Check | Source | Version 1 implementation |
|---|---|---|---|
| B | Travel Rule completeness | PAYER | Validate IVMS101 required fields. A missing or meaningless value counts as missing. Wallet type comes from the declared type plus a heuristic (contract code at address means a smart wallet; a known CASP cluster from KYT means CASP-hosted). |
| C | Wallet ownership | DEFLOW | EIP-712 challenge bound to `{payer, amount, paymentRef, nonce, issuedAt}` and the deposit contract as `verifyingContract`. ERC-1271 for contract wallets at a recorded block. Required for self-hosted addresses at EUR 1,000 or more; the threshold is a ruleset parameter. |
| D | KYT | PROVIDER | Adapter interface. Production uses the processor's own provider and key (Chainalysis KYT v2 in the specimens; Elliptic and TRM as further adapters). Demo uses GoPlus, the existing logic in `attestor-workflow/internal/provenance`, labelled as such in the pack. Raw response hashed and stored. |
| E | Sanctions | DEFLOW | List loader for EU consolidated, UN, OFAC SDN with digital currency addresses, and the processor's national list. Each load records a version. Names use Jaro-Winkler with a calibrated threshold (`calibration_version`); addresses use exact match on the payer and its direct counterparties. Result `NO_MATCH | POTENTIAL_MATCH | TRUE_MATCH`. A `TRUE_MATCH` needs an officer. |
| F | Structuring | DEFLOW | Rule windows over the `payment` history per address cluster (cluster from KYT, else the address alone). Example `SPLIT-03`: aggregate EUR 5,000 or more, or 3+ payments within 10% below EUR 1,000, in 72 h. Output: score, features, linked pack ids, `PASS | FLAG`. |
| G | Issuer controls | CHAIN | `isBlacklisted` (USDC) or the equivalent (EURC) for the payer and the deposit contract, read at the payment block. |

Each check has a timeout. A check that fails or times out produces `UNAVAILABLE`, which the ruleset must map to HOLD (fail-closed). It is never silently skipped.

### D6. Rules engine and recommendation

- **The ruleset is data, not code.** It is a canonical JSON document of ordered rules: conditions over normalised check results and amount, mapped to a recommendation and reason codes. The engine is a pure function, `recommend(inputs, ruleset) -> {recommendation, reason_codes, policy_ref}`.
- **Approval.** A new ruleset is drafted, then signed by the processor's MLRO (EIP-712 over `ruleset_hash`). It becomes effective at `effective_from`. Only approved rulesets run.
- **Replay.** `inputs_hash` and `engine_version` (`deflow-core@<git sha>`) are stored with each recommendation. The Audit Export "replay" re-runs the engine on stored inputs and compares.
- **Mode.** A recommendation of `CREDIT` or `HOLD` under a rule flagged `auto: true` goes to the policy signer (`AUTO_BY_POLICY`). Anything else, and every `FREEZE` or `RETURN`, opens an officer case (`OFFICER_REVIEW`). Example from specimen B: auto-HOLD under `SANC-01`, then officer FREEZE.
- Alternative: a general rule language such as CEL or Rego. Rejected for version 1, because a fixed condition vocabulary keeps rulesets reviewable by an MLRO. CEL can come later behind the same `recommend` signature.

### D7. Decision object and the contract interface (input to `processor-decision-contracts`)

EIP-712 domain: `{name: "Deflow Decision", version: "1", chainId, verifyingContract: <deposit contract>}`.

Test vector: `spikes/decision-eip712.json`, generated by `spikes/decision-eip712/`. It has one case per decision kind, and its digests and signatures match `cast wallet sign --data` exactly (spike T1). Two constraints come out of it:
- `paymentId = keccak256(abi.encode(uint256 chainId, bytes32 txHash, uint256 logIndex))`.
- Typed-data JSON for other tools must omit the empty `salt` field that go-ethereum emits, because Foundry rejects it.

```
Decision {
  bytes32 paymentId;     // keccak256(chainId, txHash, logIndex) or the contract's own id
  uint8   decision;      // 1 CREDIT, 2 HOLD, 3 FREEZE, 4 RETURN
  bytes32 packHash;      // evidence_root of the pack version the decision was taken on
  uint64  nonce;         // per paymentId, strictly increasing (HOLD then FREEZE)
  uint64  deadline;      // unix; executors cannot deliver stale decisions
}
```

- **`packHash` is the `evidence_root`, not the `master_root`.** The decision itself and the timeline belong to the master tree, so they cannot be inside what the decision signs. `evidence_root` covers exactly the inputs the decision was taken on. This matches the specimen split.
- **What the contract must do.**
  - Accept a decision only if the signer is in the processor's signer set and the nonce is greater than the last one.
  - The submitting executor must be authorised: the CRE forwarder for `chainlink-cre`, or the `deflow-workflow` submitter address.
  - Map decisions to neutral statuses: `CREDIT` to `CREDITED` (transfer to the pool), `HOLD` to `HELD`, `FREEZE` to `HELD` plus `lockCommitment = keccak256(packHash, nonce)`, `RETURN` to `RETURNED` (refund to payer).
  - After a FREEZE, `RETURN` and any timeout reclaim are impossible. Only `CREDIT` (on authority instruction) or a new FREEZE commitment is accepted.
  - The current public `reclaim()` after 15 minutes is removed for configuration (a). A payer-safety timeout, if kept, must not apply to `HELD`.
- **Deposit contract per payer** (CREATE2 from processor and payer), as the template states. This lets a Settlement Manifest name contracts and keeps one disputed payer isolated from the pool.

### D8. Decision delivery to executors

- The backend publishes each signed decision to NATS subject `decisions.<chainId>` and exposes `GET /v1/decisions?after=<cursor>` for pull. Both carry `{decision struct, signature, deposit contract}`. They carry no reasons and no PII.
- **`deflow-workflow`** subscribes to NATS and submits immediately. Its submitter key pays gas only. It cannot forge a decision because the contract checks the processor's signature.
- **`chainlink-cre`** pulls `GET /v1/decisions` from a cron handler (the HTTP trigger allows 1 request in 60 s, see `relay-spec.md` §0), then writes through the forwarder. Delivery latency is up to about 1–2 minutes.
- **Delivery is at-least-once.** The contract's nonce makes redelivery a no-op.
- **The executor's result feeds back** through ingestion, when the decision-executed event arrives. It is not taken from an executor callback.

### D9. Payment Passport assembly, integrity and projections

1. **Pack v1** is built at the first decision. It holds the evidence keys, the decision, and the timeline so far. The builder salts every leaf (32 random bytes per path) and computes `evidence_root` and then `master_root` exactly as `verify_pack.py` does.
2. **Signing.**
   - The decision is signed over `evidence_root` (D7).
   - The whole pack is signed by the processor as a detached JWS (ES256) over the canonical `data` JSON, using a processor KMS key (D2).
   - **Canonical form is the verifier's**: `json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False)` in UTF-8. It is byte-identical to RFC 8785 under two schema rules: no non-integer JSON numbers (amounts, rates and scores are decimal strings), and ASCII-only object keys.
   - Go's `encoding/json` cannot produce this form, because it escapes `<>&` and U+2028/U+2029, so the builder uses its own writer.
   - Spike T3 (`spikes/pack-builder/`) reproduces both specimens' `master_root`, `evidence_root` and `projection_hash`, and agrees with `verify_pack.py` on non-ASCII, numeric-string, empty-container and `$withheld` vectors.
3. **Timestamp.** An RFC 3161 token from the processor's chosen TSA, a qualified one for EU use.
4. **Anchor.** Every period (default hourly), the `master_root`s are put into a Merkle tree and its root is written in one transaction on a public chain. Each pack stores its inclusion proof. No personal data goes on chain.
5. **Journal.** `prev_pack_hash` chains every pack in creation order.
6. **New versions.** A later event (execution tx, officer FREEZE, authority instruction) creates pack version n+1 that references version n. Earlier versions are never edited.
7. **Projections.** A projection is generated per request for a profile (`MASTER`, `FIU_SUPERVISOR`, `AUDITOR`, `OFF_RAMP`, `BANK`). It applies the Annex 1 matrix by replacing subtrees with `{"$withheld": <subtree hash>}`, so the roots still verify. Annex 3 (`reporting_record`) is attached only to MASTER and FIU_SUPERVISOR and is otherwise absent with no trace. Every issued projection is logged in `projection`.
8. **Rendering.**
   - The JSON is the source of truth.
   - The PDF is PDF/A-3 with the JSON embedded and a PAdES signature by the processor.
   - Version 1 reuses the existing ReportLab template (`evidence_template.py`) as a small Python render worker fed by the Go service, rather than porting the layout to Go.
   - `verify_pack.py` becomes the published open-source verifier (`{{verifier_url}}`).

### D10. Configurations (a) and (b) on one pipeline

| Step | (a) contracts + recommendations + evidence | (b) recommendations + evidence |
|---|---|---|
| Checkout | TR data and wallet proof before payment, paid into a per-payer deposit contract | TR data and wallet proof if the processor's checkout integrates; else section B is "n/a, collected outside Deflow" |
| Ingest | Deposit-contract events | ERC-20 `Transfer` to processor addresses |
| Checks and recommendation | same | same |
| Decision | signed, delivered by an executor, executed by the contract | signed and recorded; `execution_tx` is "n/a, executed by the processor outside Deflow"; on-chain statuses are omitted from the timeline |
| Passport | same builder, same integrity | same builder, same integrity |

Mode (b) is also the pilot's retro and shadow mode: replaying 90 days of `Transfer` history through the same pipeline produces reconstructed packs flagged `reconstruction: true`.

### D11. API surface (version 1, JSON over HTTPS)

- **Checkout** (public, merchant API key):
  - `POST /v1/checkout/sessions`
  - `PUT /v1/checkout/sessions/{ref}/travel-rule`
  - `POST /v1/checkout/sessions/{ref}/wallet-proof`
  - `GET /v1/checkout/sessions/{ref}` (status only, no reasons)
- **Officer console** (processor staff through the processor's OIDC):
  - `GET /v1/cases`, `GET /v1/payments/{ref}`
  - `POST /v1/payments/{ref}/decisions` (officer-signed EIP-712)
  - `POST /v1/rulesets` and `POST /v1/rulesets/{v}/approve`
- **Evidence:**
  - `POST /v1/packs/{id}/projections {profile, prepared_for, purpose}` returns JSON and PDF.
  - `POST /v1/packs/{id}/reporting` (MASTER and FIU scope only).
- **Executors:** NATS `decisions.<chainId>` and `GET /v1/decisions?after=`.

### D12. Relationship to the existing beta

The current DON-signed path keeps working on its own deployment. That path is `MerchantGateway` with settlement in `attestor-workflow` and the KYC attestations. compliance-backend neither reads nor writes `AttestationRegistry`. A later change may let configuration (a) use KYC attestations as an extra check.

## Risks / Trade-offs

- **[eventscale drops logs on reorgs and cannot restart; confirmed by spike T2.]** → The reconciler (D4) is the source of truth. eventscale is only a latency hint, and its fixes are tracked separately.
- **[An auto-signer key in the processor's KMS is still a hot key.]** → The contract signer set allows rotation and revocation. `AUTO_BY_POLICY` can be limited to `CREDIT` and `HOLD`, so a stolen auto-key can never FREEZE or RETURN.
- **[GoPlus is not an acceptable production KYT.]** It missed 3 of 5 known-bad addresses in `TESTING.md`. → Demo only, and labelled in section D. Production requires the processor's own provider.
- **[Sanctions name matching produces false positives.]** → `POTENTIAL_MATCH` always goes to an officer. The threshold and calibration are versioned and recorded per pack.
- **[CRE inbound limits slow decision delivery.]** → Pull by cron (D8). Processors that need seconds-level crediting use `deflow-workflow`.
- **[Single-tenant raises operating cost per client.]** → One binary plus managed Postgres and object storage per tenant. Infrastructure as code makes a tenant a parameter set. This is accepted, since the one-pager targets about 12 clients by 2029.
- **[Legal status of Deflow as a technology provider.]** → No custody and no signing by design. The pilot step 3 legal opinion is still required. The design does not settle it.
- **[Canonicalisation drift between Go and the Python verifier.]** → The T3 vectors (`spikes/pack-builder/testdata/`) become CI fixtures for `add-compliance-backend`. The builder rejects floats outright.

## Migration Plan

Nothing is deployed by this change. Follow-up order, already in the README roadmap:

1. `processor-decision-contracts` implements D7.
2. `add-compliance-backend` implements D1–D6 and D8–D11 in mode (b) first. It needs no contracts and is enough for the pilot's retro and shadow stages.
3. Then mode (a) against the new contracts.
4. `add-deflow-workflow` implements its side of D8.

## Open Questions

- Which KYT provider the first pilot processor uses. This changes only which adapter is built first.
- Which TSA, and which chain and period for anchoring. Both are configuration.
- Whether a payer-safety timeout survives in configuration (a) for `PENDING` (never `HELD`). Decide in `processor-decision-contracts`. It does not change this architecture.
