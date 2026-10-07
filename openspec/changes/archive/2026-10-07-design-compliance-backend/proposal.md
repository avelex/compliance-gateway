# Proposal

## Why

Configurations (a) and (b) from the roadmap both depend on a service that does not exist yet. It must turn on-chain deposits and checkout data into a recommendation for the processor, and then into a signed Payment Passport. Today the only "checks" are GoPlus scoring and Sumsub KYC inside the CRE enclave, and their output is a yes/no written on-chain. There is no record a processor could hand to an off-ramp, a bank, or an FIU.

The evidence-pack template (`Deflow_Evidence_Pack_Template.pdf`, schema `deflow-evidence/1.0`) and two verified specimens already fix what the output must look like. The processor-decision contracts, the backend implementation, and `deflow-workflow` all need one agreed architecture before any of them is built. This change produces that architecture.

## What Changes

- A design document for `compliance-backend`. It covers:
  - the component boundaries;
  - the domain model;
  - storage and retention;
  - ingestion through eventscale;
  - the check pipeline (Travel Rule, wallet ownership, KYT, sanctions, structuring, issuer controls);
  - the versioned rules engine and its recommendations;
  - the decision flow, with the processor's own key and the EIP-712 decision that executors only deliver;
  - Payment Passport assembly, integrity, and disclosure profiles;
  - how configurations (a) and (b) differ.
- Fixed interfaces that later changes build against:
  - the EIP-712 decision struct and on-chain status vocabulary for `processor-decision-contracts`;
  - the decision delivery contract for executors (`chainlink-cre`, `deflow`);
  - the pack JSON and integrity scheme already proven by `verify_pack.py`.
- Spikes that de-risk the design: confirmation and reorg handling in eventscale, the EIP-712 test vector, and pack building against the specimen verifier.
- No production code, no deployed contracts, and no spec deltas. Specs come with `add-compliance-backend` and `processor-decision-contracts`.

Decided before this change:

- Variant 1: the processor signs every decision, and an executor (CRE DON or `deflow-workflow`) only delivers it.
- Single-tenant: one isolated `compliance-backend` per processor, so the master pack and PII never leave that processor's boundary.

Out of scope:

- Settlement Manifest and Audit Export. The data model must support them, but they are not designed here.
- Travel Rule protocol interoperability with other CASPs (TRUST, TRP).
- The current beta's DON-signed settlement path. It keeps working as is.

## Capabilities

### New Capabilities

None. This change is design-only and sets `skip_specs: true`. The capabilities it prepares are `compliance-recommendations` and `payment-passport`, created by `add-compliance-backend`, plus deltas to `merchant-gateway` and `gateway-factory` in `processor-decision-contracts`.

### Modified Capabilities

None.

## Impact

- New design record in `openspec/changes/design-compliance-backend/design.md`. After archive it lives in the change history.
- Updates the README roadmap entries that depend on this design, where the design changes their scope.
- Spike outputs (test vectors, notes) live under this change's directory. Nothing is added to `frontend/`, `contracts/`, `relay/`, or `attestor-workflow/`.
