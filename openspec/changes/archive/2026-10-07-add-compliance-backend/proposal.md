# Proposal

## Why

Configuration (b) of composable Deflow — recommendations plus evidence pack, without contracts — needs the service that `design-compliance-backend` designed and nothing else. It is also the pilot's retro and shadow mode. This change builds the first vertical slice of `compliance-backend`. It watches a processor's deposit addresses, screens each deposit, recommends a decision under an approved ruleset, records a signed decision, and issues a Payment Passport that the published verifier accepts.

## What Changes

- **New Go service `compliance-backend/`.** It is its own module, a single binary, single-tenant per processor, backed by Postgres (design D1–D3).
- **Ingestion of ERC-20 `Transfer` logs to configured deposit addresses,** for mode (b), from two sources:
  - **eventscale is the hint.** The service runs its own durable JetStream consumer with `DeliverAll` and explicit ack.
  - **An `eth_getLogs` reconciler up to `head - N` is the truth.** It upserts by `(chain_id, tx_hash, log_index)` and marks orphans. The same code runs a retro backfill from a given block.
- **Checks for evidence sections D–G**, each storing a normalised `check_result` and a hash of the raw response. A check that fails or times out is `UNAVAILABLE`, never skipped.
  - **D, KYT:** GoPlus, labelled as a demo provider.
  - **E, sanctions:** exact address match against versioned list files.
  - **F, structuring:** rule `SPLIT-03`.
  - **G, issuer:** `isBlacklisted` on the payer and the deposit address at the payment block.
- **Sections B (Travel Rule) and C (wallet ownership)** are recorded as "not collected, outside Deflow", as D10 specifies for mode (b) without checkout integration.
- **Rulesets are data.** A ruleset is canonical JSON with a fixed condition vocabulary. It runs only after the MLRO approves it with an EIP-712 signature. A pure `recommend()` function produces the recommendation, its reason codes and an `inputs_hash`.
- **Decisions are signed EIP-712 `Decision` structs,** in the format of `processor-decision-contracts`.
  - `AUTO_BY_POLICY` CREDIT and HOLD are signed by the policy key.
  - Everything else opens an officer case, and the officer submits a signature through the API.
  - In mode (b) a decision is recorded and not executed.
- **Payment Passport (`deflow-evidence/1.0`):**
  - salted hash tree, `evidence_root`, `master_root`;
  - detached JWS (ES256) by the processor evidence key;
  - `prev_pack_hash` journal;
  - new pack versions on later decisions;
  - projections per profile (`MASTER`, `FIU_SUPERVISOR`, `AUDITOR`, `OFF_RAMP`, `BANK`) with `$withheld` subtrees.
- **HTTP API, a subset of D11,** behind a static bearer token: cases, payment detail, officer decisions, ruleset import and approval, projections (JSON).
- **`docs/evidence-pack/verify_pack.py` also accepts a projection JSON file** next to the PDF form, so JSON-only passports can be verified.
- A `docker compose` dev stack (Postgres, NATS plus eventscale, anvil) and an end-to-end test on anvil.

Out of scope, and planned as later changes:
- PDF rendering;
- RFC 3161 timestamps and the Merkle anchor;
- checkout intake (Travel Rule data and wallet proof);
- name screening;
- the officer console UI;
- mode (a) ingestion of `DecisionExecuted` and delivery over NATS (D8);
- Annex 3 reporting records;
- KMS-backed keys, since version 1 reads keys from files;
- OIDC.

## Capabilities

### New Capabilities
- `deposit-ingestion`: detecting deposits to a processor's addresses from eventscale and the reconciler, plus confirmation depth, orphan handling, idempotency and retro backfill.
- `compliance-checks`: the KYT, sanctions, structuring and issuer checks, and the fail-closed `UNAVAILABLE` rule.
- `compliance-recommendations`: rulesets and their approval, the recommendation engine and replay inputs, decision modes, and the policy-signed and officer-signed decisions.
- `payment-passport`: pack assembly, integrity (roots, JWS, journal), versions, disclosure-profile projections, and verifier compatibility.

### Modified Capabilities
None.

## Impact

- **New code:** a new top-level directory `compliance-backend/` (Go 1.27, go-ethereum, pgx, nats.go).
- **Moved code:**
  - The spike pack builder (`canon.go`, `tree.go`) and its test vectors move into the service as production code and CI fixtures.
  - The GoPlus logic is ported from `attestor-workflow/internal/provenance`. `attestor-workflow` itself does not change.
- **Docs:**
  - `docs/evidence-pack/verify_pack.py` gains JSON input.
  - In the README, the roadmap entry splits into what shipped and the follow-ups listed above.
- **Dev dependencies:** Docker, for Postgres and the NATS plus eventscale image built from eventscale `748a8ef`.
- **No change to `contracts/`, `frontend/`, `relay/` or `attestor-workflow/`.**
