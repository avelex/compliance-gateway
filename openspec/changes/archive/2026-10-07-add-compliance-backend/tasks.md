# Tasks

## 1. Module, config, storage

- [x] 1.1 Create `compliance-backend/` with the following (design D1):
  - `go.mod` (Go 1.27, go-ethereum, pgx v5, nats.go);
  - `cmd/compliance-backend` with the `serve`, `backfill` and `ruleset-hash` subcommands;
  - `internal/config`, which loads and validates a JSON config covering chains, tokens, deposit addresses with `merchant_id`, keys, officers, MLRO, sanctions lists, timeouts and the API token;
  - `config.example.json`.

  Verify with `go build ./...`, and with a unit test showing that an invalid config is rejected with a clear message.
- [x] 1.2 Add `docker-compose.yml` with Postgres 17, anvil, and eventscale built from `748a8ef` with its config (design D11). Verify that `docker compose up -d` brings all three up and that `psql` and `cast block-number` reach them.
- [x] 1.3 Add `internal/store` with embedded migrations for the D8 tables:
  - the append-only trigger on `check_result`, `recommendation`, `decision`, `pack` and `projection`;
  - the immutable-after-approval trigger on `ruleset`.

  Verify with a test against compose Postgres, skipped when `DATABASE_URL` is unset: migrations apply twice without error, and an `UPDATE` on `pack` fails.

## 2. Evidence core

- [x] 2.1 Move the spike's `canon.go` and `tree.go` into `internal/evidence`, and its testdata into `internal/evidence/testdata`. Check in the expected edge-vector roots generated with `vectors.py`. Verify with `go test ./internal/evidence`: both specimens reproduce `master_root`, `evidence_root` and `projection_hash`, the edge vectors match, and a float input is rejected.
- [x] 2.2 Add the pack builder (design D7):
  - the evidence snapshot with salts;
  - pack version n reusing salts;
  - `pack_hash` and `prev_pack_hash` journal logic;
  - the detached ES256 JWS.

  Add tests: `evidence_root` is stable across versions 1 and 2, the JWS verifies with the public key over the canonical data, and the journal chains.
- [x] 2.3 Add projections with the profile path sets in `profiles.go` (design D7). Add tests:
  - an `OFF_RAMP` projection of specimen B's full data (`FIU_SUPERVISOR`, where nothing is withheld) withholds exactly specimen A's paths and keeps B's roots;
  - `MASTER` withholds nothing;
  - an unknown profile errors.
- [x] 2.4 Extend `docs/evidence-pack/verify_pack.py` with JSON input through `check_copy`, with a lazy `pypdf` import (design D10). Verify:
  - `python3 docs/evidence-pack/verify_pack.py docs/evidence-pack/Payment_Passport_Specimen_*.pdf` still passes;
  - the verifier passes on a projection JSON written by a Go test into a temp file;
  - the README in `docs/evidence-pack/` or the script docstring documents JSON usage.

## 3. Ingestion

- [x] 3.1 Add the reconciler (design D3):
  - the chunked `FilterLogs` with the `to` topic filter;
  - header timestamps;
  - the upsert as `confirmed` and the orphan sweep;
  - the cursor in one transaction;
  - `backfill_until` and `reconstruction`.

  Verify with a test against compose anvil and Postgres:
  - a deposit to a watched address is confirmed once at depth N;
  - a transfer to an unwatched address is ignored;
  - a restart resumes from the cursor;
  - backfill marks `reconstruction`.
- [x] 3.2 Add the eventscale hint consumer: durable, deliver-all, explicit ack after the upsert, envelope decode, and the `hint` status for `/healthz` (design D3). Add a golden-envelope decode unit test with a message captured from `748a8ef`. Add a test against compose eventscale: a deposit appears as `seen` before depth N, a backlog published while the consumer was stopped is received after restart, and a `seen` row missing from the reconciled range becomes `orphaned`.

## 4. Checks

- [x] 4.1 Add the `Check` interface, the concurrent runner with timeouts, the `UNAVAILABLE` mapping, the raw store at `data/raw/<sha256>`, and FX formatting with `big.Rat` (design D4). Add unit tests: a timed-out check gives `UNAVAILABLE`, the raw bytes hash to the stored value, and EURC 250 formats as "250.00" at rate "1".
- [x] 4.2 Add the KYT GoPlus adapter, ported from `attestor-workflow`, with the level mapping and the demo labelling. Add `httptest` unit tests: `mixer` gives `SEVERE` with the category, a clean address gives `LOW`, and HTTP 500 gives `UNAVAILABLE`.
- [x] 4.3 Add the sanctions list loader (start and `SIGHUP`, version rows) and exact address matching. Add unit tests: a listed payer gives `TRUE_MATCH` with list name and version, a reload changes the version for later results only, and name screening is reported `NOT_PERFORMED`.
- [x] 4.4 Add structuring `SPLIT-03` as a SQL window query, and issuer `isBlacklisted` at the payment block. Add tests: EUR 950, 960 and 990 within 72 h give `FLAG` with linked count 3, against Postgres; a blacklisted payer gives `LISTED` and a token without the function gives `UNAVAILABLE`, against anvil with `MockStable`.

## 5. Rules and decisions

- [x] 5.1 Add `internal/rules`: parse and validate the fixed vocabulary, `ruleset_hash` over the canonical form, `recommend()`, `inputs_hash` and `engine_version`. Ship the example ruleset in `compliance-backend/rulesets/`. Add unit tests: an unknown field and a missing default are rejected, the first match wins, `amount_eur gte` works on decimals, and a replay is identical.
- [x] 5.2 Add `internal/decision`:
  - the EIP-712 `Decision` digest;
  - the `RulesetApproval` digest;
  - the file-backed `Signer`;
  - officer signature verification with masks;
  - the transition table.

  Add tests:
  - the service digest reproduces every signature in `contracts/test/processor/fixtures/decision-eip712.json` when signed with anvil key 0;
  - RETURN after FREEZE is rejected;
  - terminal states are final;
  - a non-MLRO approval is rejected.

## 6. Pipeline and API

- [x] 6.1 Add `internal/pipeline` (design D2), a worker that drives each payment through these steps:
  1. checks run on `seen`;
  2. once `confirmed`, the evidence snapshot and recommendation;
  3. under an `auto` rule, a policy decision and pack v1; otherwise `in_review`;
  4. no effective ruleset means a case with `NO_RULESET`;
  5. orphaned payments stop.

  Verify with an integration test against Postgres with stubbed checks: a clean payment ends `decided` with a CREDIT pack, a FREEZE recommendation ends `in_review`, and an orphaned payment gets no pack.
- [x] 6.2 Add `internal/api` with the D9 endpoints, bearer auth and JSON errors. Verify with `httptest` tests:
  - 401 without a token;
  - case listing;
  - typed data, then an officer FREEZE signature, records a decision and pack v2 with the same `packHash`;
  - a forged signature is rejected;
  - ruleset import and approval;
  - an `OFF_RAMP` projection is logged with recipient and purpose.

## 7. End-to-end and docs

- [x] 7.1 Add `e2e/MockStable.sol`, `e2e/gen.sh` and the checked-in `MockStable.bin`, and add the e2e test (design D11). Covers:
  - a clean deposit is credited, a sanctions deposit is frozen by an officer, and a blacklisted payer is held;
  - an `OFF_RAMP` projection passes `verify_pack.py`;
  - after a restart there are no duplicates and the hint resumes.

  Verify with `docker compose up -d && go test -tags e2e ./e2e`.
- [x] 7.2 Write `compliance-backend/README.md`: run steps, config reference, API table, and the deferred items. Update the root `README.md`:
  - split the `add-compliance-backend` roadmap entry into the shipped slice and the follow-ups (PDF, TSA and anchor, checkout intake, mode (a) plus NATS delivery, officer UI, KMS and OIDC, Annex 3);
  - add `compliance-backend` to the Components table.

  Verify that the README run steps work from a clean clone.

## 8. Integration check

- [x] 8.1 Run `go vet ./... && go test ./...` in `compliance-backend/` (unit tests) and `go test -tags e2e ./e2e` with compose up. Confirm `forge test` in `contracts/` still passes and that `git diff main -- contracts frontend relay attestor-workflow` is empty.
