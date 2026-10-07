# Design

## Context

- **The architecture is fixed by `design-compliance-backend`.** It is archived at `openspec/changes/archive/2026-10-07-design-compliance-backend/design.md` and covers D1–D12. This change implements its mode (b) slice. The proposal lists what is deferred.
- **Decision format.** `processor-decision-contracts` replaced the D7 struct with `Decision(paymentId, decision, token, amount, packHash, nonce, deadline)`. Its `cast` vector at `contracts/test/processor/fixtures/decision-eip712.json` is the cross-implementation fixture.
- **Spike code to reuse.**
  - `spikes/pack-builder/`, with `canon.go`, `tree.go` and testdata, reproduces both specimens and agrees with `verify_pack.py` on the edge vectors.
  - `attestor-workflow/internal/provenance/goplus.go` holds the GoPlus weights.
- **eventscale at `748a8ef`.**
  - Events are published to stream `eventscale` under the subject `eventscale.events.<network>.<contractAlias>.<EventName>`.
  - The JSON envelope is `{meta: {network, chain_id, contract, name, block_number, block_hash, tx_hash, tx_index, log_index, timestamp, ...}, data: <base64 of the decoded event JSON>}`.
  - It filters by emitting contract, not by `to`. It has no confirmation depth and drops logs in replacement blocks (spike T2).
- **`verify_pack.py` reads only PDFs today.**
- **Local toolchain:** Go 1.27.1, Docker, Foundry.

## Goals / Non-Goals

**Goals:**
- One binary that a processor runs next to Postgres and that is correct with or without eventscale.
- Every artifact (check result, recommendation, decision, pack) can be reproduced or verified from stored data.
- The decision digest is identical to the contracts' digest, and the pack roots are identical to the verifier's.

**Non-Goals:**
- Horizontal scaling or several replicas. Single tenant means a single process. Leader election is not needed.
- A general workflow engine or a message queue between internal stages.
- Pseudonymisation for the `AUDITOR` profile. Version 1 withholds instead, since mode (b) carries no PII yet.

## Decisions

### D1. Module layout

```
compliance-backend/
  cmd/compliance-backend/     main: serve | backfill | ruleset-hash
  internal/config             one JSON file (stdlib), validated at start
  internal/store              pgx v5; embedded *.sql migrations applied in order at start
  internal/ingest             hint (JetStream consumer), reconciler (eth_getLogs)
  internal/checks             kyt (GoPlus), sanctions, structuring, issuer, fx
  internal/rules              ruleset parse/validate/hash, recommend()
  internal/decision           EIP-712 digest, policy signer, officer verify, transitions
  internal/evidence           canon, tree, pack builder, JWS, projections
  internal/pipeline           the worker that advances payments
  internal/api                net/http (Go 1.22+ routing patterns), bearer auth
  e2e/                        anvil + Postgres end-to-end test, mock stablecoin
  docker-compose.yml          postgres, nats+eventscale, anvil
```

- **Dependencies:** `go-ethereum` (ethclient, crypto, EIP-712 hashing), `jackc/pgx/v5` and `nats-io/nats.go/jetstream`. Nothing else.
- **Configuration is JSON,** so it needs no YAML dependency. Secrets are paths to key files.
- **Migrations** are SQL files plus a `schema_migrations` table, about 40 lines, instead of a migration library.
- **No dependency on the eventscale module.** Its event type lives in `internal/`, and its go-ethereum version is older. The service decodes the envelope itself, and a golden message from `748a8ef` pins the format in a test.

### D2. A database-driven pipeline, not a queue

Payments move through `seen | confirmed | orphaned` for ingest, and `checks_pending -> checks_done -> recommended -> decided | in_review` for the pipeline. A single worker loop (default every 2 s) selects payments whose next step is due and runs that step in its own transaction.

- **Why:**
  - **Crash-safe.** A step either committed or it reruns.
  - **Idempotent by key.** The steps already have natural keys.
  - **Observable.** The state is the database.
  - **Single tenant needs no queue.**
- **Ordering:**
  - checks may run on `seen`;
  - recommend, decide and pack only on `confirmed`;
  - a payment that turns `orphaned` stops wherever it was.
- **Alternative rejected:** NATS work subjects between stages. That means a second source of truth, and it does not survive NATS downtime, which the spec requires.

### D3. Ingestion

**Hint consumer**, per chain and token:
- It runs a durable consumer `compliance-backend-<chainId>-<alias>` on stream `eventscale`, with `FilterSubject = eventscale.events.<network>.<alias>.Transfer`, `DeliverAll` and `AckExplicit`.
- It decodes the envelope and the base64 `data` into `{from, to, value}`, with `value` as a `json.Number` parsed into a `big.Int`. It keeps only events whose `to` is a deposit address, upserts them as `seen`, and then acks.
- **Unreachable NATS.** If NATS cannot be reached, it retries with backoff and sets `/healthz` `hint: degraded`. The reconciler never waits for it.
- **No runtime `AddTargetEventSync`.** In mode (b) the watched contracts are the token contracts, which are static and listed in eventscale's own config. Runtime targets arrive with mode (a), where per-payer accounts appear.

**Reconciler**, per chain, by default every 30 s:
- `to = min(head - N, last + chunk)`, with a default chunk of 2,000 blocks.
- It runs `FilterLogs{Addresses: tokens, Topics: [[Transfer], nil, depositAddrs]}`. The deposit address is the indexed `to`, so the node does the filtering.
- It fetches the header of every block that contains a match, for `block_timestamp`.
- **In one transaction:**
  1. Upsert every log as `confirmed`, setting the block number, block hash and timestamp. This also re-confirms a row that was previously `orphaned`.
  2. `UPDATE payment SET ingest = 'orphaned' WHERE chain = $c AND ingest = 'seen' AND block_number BETWEEN $from AND $to`. Any `seen` row left in a fully reconciled range is not on the canonical chain.
  3. Set `chain_cursor.last_reconciled = $to`.

**Backfill:**
- `compliance-backend backfill --chain <id> --from-block B` sets the cursor to `B - 1` and `chain_cursor.backfill_until = current head - N`.
- Payments confirmed at blocks up to `backfill_until` get `reconstruction = true`.
- The normal reconciler loop then does the work, so there is only one code path.

**Identity:**
- `paymentId = keccak256(abi.encode(chainId, txHash, logIndex))`;
- `payment_ref` = the `paymentId` as hex, since mode (b) has no checkout reference;
- `pack_id` = a random UUIDv4.

### D4. Checks

```go
type Check interface {
    Kind() string                                              // kyt | sanctions | structuring | issuer
    Run(ctx context.Context, p Payment) (Result, []byte, error) // normalised, raw
}
```

- **Running and recording.** The worker runs the four checks concurrently, each with a timeout (default 10 s). An error or a timeout gives `Result{Outcome: "UNAVAILABLE"}`. The raw bytes are written to `data/raw/<sha256>`, and the hash is stored on the row.
  - `ponytail:` filesystem object store. Swap in S3 with object lock when retention needs WORM.
- **KYT (GoPlus).**
  - It is a port of the `attestor-workflow` weights, and the base URL is configurable so tests can stub it.
  - Score to level: 80 and above is `SEVERE`, 60 and above `HIGH`, 30 and above `MEDIUM`, otherwise `LOW`.
  - The categories are the flags that are set.
  - Provider `GoPlus`, product `address_security (demo, not for production)`.
- **Sanctions.**
  - The config lists `{name, version, path}`. A file holds one address per line, and `#` starts a comment.
  - Lists load at start and on `SIGHUP`. Each load upserts `sanctions_list_version(name, version, sha256)`, and every result stores the version ids it used.
  - The comparison is exact on the lowercase payer address.
  - `fields_screened = "address"` and `algorithm = "exact address match"`. Name screening is recorded as `NOT_PERFORMED`.
  - Direct counterparties are out of version 1. The pack says so in `sanctions.matched_on` when no match is found.
- **Structuring `SPLIT-03`.**
  - It runs one SQL query over `confirmed` payments by the same payer, using the block-time window `(t - 72h, t]` and their EUR amounts.
  - `FLAG` if the aggregate is 5,000 or more, or if 3 or more payments fall in `[900, 1000)`.
  - The score is `max(aggregate / 5000, count / 3)`, a decimal string capped at "1.00".
  - The linked pack ids are those of the linked payments' latest packs.
- **Issuer.** `eth_call` of `isBlacklisted(address)` on the token at `block_number`, for the payer and the deposit address. A revert, for a token without the function, gives `UNAVAILABLE`, which fails closed.
- **FX.** Per-token config `{decimals, eur_rate, source}`, with EURC at rate `"1"`. Amounts are formatted with `big.Int` and `big.Rat`, and never touch a float.

### D5. Rulesets and the engine

```json
{"version": "2026.10-1",
 "rules": [
   {"id": "UNAV-01", "when": [{"field": "any_unavailable", "op": "eq", "value": true}], "recommend": "HOLD", "reasons": ["CHECK_UNAVAILABLE"], "auto": true},
   {"id": "SANC-01", "when": [{"field": "sanctions.result", "op": "eq", "value": "TRUE_MATCH"}], "recommend": "FREEZE", "reasons": ["SANCTIONS_TRUE_MATCH"], "auto": false},
   {"id": "ISS-01",  "when": [{"field": "issuer.result", "op": "eq", "value": "LISTED"}], "recommend": "HOLD", "reasons": ["ISSUER_LISTED"], "auto": true},
   {"id": "KYT-01",  "when": [{"field": "kyt.risk_level", "op": "in", "value": ["HIGH", "SEVERE"]}], "recommend": "HOLD", "reasons": ["KYT_HIGH_RISK"], "auto": true},
   {"id": "SPLIT-03","when": [{"field": "structuring.result", "op": "eq", "value": "FLAG"}], "recommend": "HOLD", "reasons": ["STRUCTURING"], "auto": true},
   {"id": "DEFAULT", "when": [], "recommend": "CREDIT", "reasons": ["CLEAN"], "auto": true}]}
```

- **Matching.** Conditions inside a rule are ANDed, and the first rule that matches wins. `amount_eur` with `gte` compares decimal strings through `big.Rat`.
- **Hashing.** `ruleset_hash = sha256(canon(ruleset))`, using the evidence canonical writer, so a ruleset hashes the same in Go and in Python. An example ruleset ships in `compliance-backend/rulesets/`.
- **Approval.**
  - The approval is EIP-712 with domain `{name: "Deflow Ruleset", version: "1"}`. The domain has no chainId, because a ruleset applies across chains.
  - The struct is `RulesetApproval(bytes32 rulesetHash, string version, uint64 effectiveFrom)`.
  - The signer must be in `config.mlro`.
  - The `ruleset` row becomes immutable through a trigger once `approved_at` is set.
- **Recording.**
  - `inputs = {kyt, sanctions, structuring, issuer, any_unavailable, amount_eur}`, the normalised outcomes only;
  - `inputs_hash = sha256(canon(inputs))`;
  - `engine_version = "deflow-core@" + vcs.revision` from `debug.ReadBuildInfo`.

### D6. Decisions and keys

- **Digest.** The digest code is go-ethereum `apitypes.TypedData` with the struct from `processor-decision-contracts`. The test is that, for every case in the contracts' `cast` fixture, signing the service's digest with anvil key 0 reproduces cast's signature byte for byte.
- **Mode (b) fields:**
  - `verifyingContract` = the deposit address. It is the closest analogue of the per-payer account and keeps signatures from being portable across addresses.
  - `nonce = max(nonce of this payment) + 1`.
  - `deadline = decided_at + config.decision_ttl`, 24 h by default.
- **Policy signer.** A secp256k1 key from a file (`config.keys.policy`), behind:

  ```go
  type Signer interface {
      Address() common.Address
      Sign(digest [32]byte) ([]byte, error)
  }
  ```

  - `ponytail:` file key. Add a KMS implementation of the same interface for the pilot (D2 of the backend design).
- **Officers.** `config.officers` is `[{address, officer_id, mask}]`, and `mask` uses the contract's bits.
  1. `GET /v1/payments/{ref}/typed-data?decision=FREEZE` returns the typed data with a fixed nonce and deadline.
  2. The service keeps it as a pending request for 15 minutes.
  3. `POST /v1/payments/{ref}/decisions {decision, signature, rationale}` recovers the signer against the pending typed data and checks the mask.
- **Transitions** mirror `ProcessorHub`:
  - `CREDITED` and `RETURNED` are terminal;
  - a payment with a freeze accepts only CREDIT or FREEZE;
  - HOLD and FREEZE are allowed from no decision or from HOLD.

  The table is a small Go map with the same cases as the contract tests.

### D7. Evidence pack

- **Snapshot at recommendation time.**
  - The builder fills the evidence keys (`pack_id`, `payment_ref`, `onchain`, `travel_rule`, `wallet_ownership`, `kyt`, `sanctions`, `structuring`, `issuer`, `rules`) and generates salts for every leaf path.
  - It stores `evidence_snapshot(data, salts, evidence_root)`.
  - That is what an officer signs over, before any pack exists.
- **Pack version n at each decision.**
  - The data is the snapshot's evidence keys plus `pack_version`, `schema_version`, `created_at`, `merchant_id`, `processor`, `timeline`, `decision` and `retention`. Salts are reused for paths that already have one, and new paths get fresh salts. The `evidence_root` is therefore stable across versions.
  - The pack then gets its `master_root`, its JWS, and `prev_pack_hash`.
  - `merchant_id` comes from config for each deposit address.
- **Journal.**
  - `pack_hash = sha256(prev_pack_hash_bytes || master_root_bytes)`, with an all-zero `prev_pack_hash` for the first pack.
  - Each pack stores `prev_pack_hash` = the previous pack's `pack_hash`.
  - The chain commits to the order and to every root.
  - Insertion is serialised by a `SELECT ... FOR UPDATE` on a single `journal_head` row.
- **JWS.**
  - The header is `{"alg": "ES256", "kid": <config.keys.evidence_kid>}`.
  - The signing input is `b64url(header) + "." + b64url(canon(data))`.
  - The signature is `r||s` over P-256, from a PEM key file.
  - The output is the detached form `b64url(header)..b64url(sig)`.
  - TSA and anchor fields are `null` in version 1.
- **Projections.**
  - Each profile is a static list of withheld paths in `internal/evidence/profiles.go`:
    - **`OFF_RAMP`:** the exact path set of specimen A.
    - **`BANK`:** the `OFF_RAMP` set, plus `travel_rule.originator`, `travel_rule.beneficiary`, and every `wallet_ownership` key except `result`.
    - **`AUDITOR`:** `travel_rule.originator` and `travel_rule.beneficiary`.
    - **`FIU_SUPERVISOR` and `MASTER`:** nothing withheld.
  - For each path, the builder replaces the subtree with `{"$withheld": node(subtree)}` and deletes the salts under it.
  - The output has the specimen's top-level keys: `schema_version`, `pack_id`, `profile`, `prepared_for`, `purpose`, `generated_at`, `data`, `salts` and `integrity`.
  - `projection_hash = sha(canon(copy without integrity))`, exactly as `verify_pack.py` pops `integrity`.
- **Shared code.** The canonical writer and the tree move from the spike as they are, still rejecting floats. The spike's testdata becomes `internal/evidence/testdata/`. The expected edge-vector roots are generated once with `vectors.py` and checked in, so `go test` needs no Python.

### D8. Storage

The tables are a subset of D3 in the backend design:
- `chain_cursor`, `payment`, `check_result`, `sanctions_list_version`;
- `ruleset`, `recommendation`, `evidence_snapshot`, `decision`, `pending_officer_request`;
- `pack`, `journal_head`, `projection`.

- **Append-only.** `check_result`, `recommendation`, `decision`, `pack` and `projection` reject `UPDATE` and `DELETE` through one trigger function, so the evidence cannot be edited even through SQL mistakes.
- **No PII column exists yet.** Mode (b) stores no Travel Rule data, so per-column encryption arrives with checkout intake.

### D9. API

| Method and path | Purpose |
|---|---|
| `GET /healthz` | DB ok, reconciler lag per chain, `hint: ok\|degraded\|disabled` (no auth) |
| `GET /v1/cases` | payments `in_review`, with recommendation and reasons |
| `GET /v1/payments/{ref}` | payment, check results, recommendation, decisions, pack ids |
| `GET /v1/payments/{ref}/typed-data?decision=` | EIP-712 typed data for an officer to sign |
| `POST /v1/payments/{ref}/decisions` | officer signature, rationale |
| `POST /v1/rulesets` | import a draft; returns hash and approval typed data |
| `POST /v1/rulesets/{version}/approve` | MLRO signature, `effective_from` |
| `POST /v1/packs/{pack_id}/projections` | `{profile, prepared_for, purpose}` returns projection JSON |

- **Auth.** A static bearer token from config, compared in constant time.
  - `ponytail:` one shared token. Swap it for processor OIDC with officer identities from claims.
- **Errors** are JSON `{error, detail}` with 400, 401, 403, 404 or 409. 403 is a signature from an unauthorised key. 409 covers forbidden transitions and stale requests.

### D10. Verifier JSON input

- `verify_pack.py` splits `check(pdf_path)` into `check_copy(copy)`, which covers the copy hash, master root, evidence root and reporting links, plus a PDF wrapper that adds the printed-text check.
- An argument ending in `.json` is read directly.
- `pypdf` is imported lazily, so verifying JSON needs no dependency.
- PDF output is unchanged, and both specimens still pass.

### D11. Dev stack and end-to-end test

- **`docker-compose.yml`:**
  - `postgres:17`;
  - `anvil` (the Foundry image), with block time 1 s;
  - `eventscale`, built by a small Dockerfile from eventscale `748a8ef`. Its config watches the e2e token on the anvil network under alias `MUSD`, and it embeds NATS on 4222.
- **`e2e/MockStable.sol`** is an ERC-20 with `mint` and `isBlacklisted`/`blacklist`. `e2e/gen.sh` compiles it with `forge` into a checked-in `MockStable.bin`, so the e2e test needs no Foundry at run time.
- **The e2e test** (`go test -tags e2e ./e2e`) runs against the compose services:
  1. Deploy the token and start the service in-process, with a stubbed GoPlus.
  2. Send three deposits: a clean payer, a payer on the test sanctions list, and a blacklisted payer.
  3. Mine past N blocks.
  4. Assert:
     - CREDIT by policy for the clean payer;
     - an officer case recommending FREEZE for the sanctions payer, then a FREEZE signed with an officer test key, which creates pack version 2;
     - HOLD for the blacklisted payer.
  5. Issue an `OFF_RAMP` projection and run `python3 docs/evidence-pack/verify_pack.py` on it.
  6. Restart the service and confirm that no duplicate payments appear and the hint consumer resumes.
- **Unit tests** run without Docker: evidence, rules, decision and checks, with stubbed HTTP and RPC.

## Risks / Trade-offs

- **[The eventscale envelope format is an internal type, so it can change upstream.]** → Pin `748a8ef` in compose. A golden-message decode test fails loudly on drift. The reconciler keeps correctness either way.
- **[eventscale drops logs on reorgs and panics on restart (T2).]** → The hint is optional and the reconciler is the truth. Compose restarts eventscale with a fresh store if it panics. The upstream fixes stay on the roadmap.
- **[GoPlus is not a production KYT.]** → It is labelled in the pack and in the product field. The adapter interface makes a Chainalysis or TRM adapter a single file.
- **[Address-only sanctions screening misses name matches and counterparties.]** → The pack records `NOT_PERFORMED` and the scope, so a recipient sees exactly what was screened.
- **[File keys on disk.]** → Version 1 is for the pilot's retro and shadow stages only. The `Signer` interface is the seam for KMS.
- **[A single bearer token has no officer identity.]** → The officer identity comes from the officer's signing key and `officer_id` in config, not from the token. OIDC is a follow-up.
- **[Withholding instead of pseudonymising for `AUDITOR`.]** → It is documented, and harmless while there is no PII. It must be revisited with checkout intake.
- **[USDC to EUR uses a configured static rate.]** → The rate and its source are recorded in every pack. A live FX feed is a non-goal of the backend design.

## Migration Plan

1. The new module and compose stack. Nothing existing changes, except that `verify_pack.py` gains JSON input in a backward-compatible way.
2. To run it: `docker compose up -d`, then `compliance-backend serve -c config.json`. Rollback is to stop the process. Nothing else depends on it yet.
3. Follow-ups, listed in the README roadmap:
   - PDF render worker, TSA and anchor;
   - checkout intake with Travel Rule data and wallet proof;
   - mode (a) ingestion and NATS decision delivery;
   - officer console UI;
   - KMS keys and OIDC;
   - Annex 3 reporting.

## Open Questions

- Which USDC reference rate source the pilot wants recorded. It is only a configuration value.
