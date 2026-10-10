# Proposal

## Why

The `OFF_RAMP` and `BANK` disclosure profiles withhold the decision's mode, rationale, reason codes and officer, but not `decision.decision` itself. When a payment's latest decision is `FREEZE`, any projection issued to an off-ramp or a bank tells that recipient the payment was frozen. That is tipping-off, and it breaks the commitment that a freeze is never revealed outside the processor. In configuration (b) this is a realistic path: the freeze is only recorded, the funds may already have reached the off-ramp, and the off-ramp's RFI is exactly what prompts the officer to issue a projection. The endpoint `POST /v1/packs/{pack_id}/projections` is live today, so the gap exists before any console is built.

Two more paths reveal the same thing:

- `sanctions.result` is not withheld from `OFF_RAMP` or `BANK`. A payment with a sanctions `TRUE_MATCH` whose latest decision is not `FREEZE` — an officer without FREEZE in their mask holds it, or it is frozen and later credited on an authority instruction — shows the recipient `TRUE_MATCH` next to HOLD or CREDIT, which reads as an investigation.
- `BuildPack` reuses each leaf's salt from the previous pack version (`carry`). A withheld leaf is replaced by `{"$withheld": sha(salt ‖ value)}`, so with the same salt a changed value gives a changed hash. A recipient holding `OFF_RAMP` copies of version 1 (HOLD) and version 3 (CREDIT after a FREEZE) sees that the hash of `decision.return_blocked` changed, and that value only changes after a freeze.

## What Changes

- `POST /v1/packs/{pack_id}/projections` SHALL refuse an `OFF_RAMP` or `BANK` projection when the pack's latest version records a `FREEZE` decision or a sanctions `TRUE_MATCH`, responding `409` with an explanation that the payment must be handled by the MLRO outside a recipient copy.
- The rule lives in one function, `evidence.RefusedProfiles(pack)`, which returns each refused profile with its reason. `Pipeline.Project` uses it; other readers (the officer console's payment read) can use the same function instead of copying the rule.
- `MASTER`, `FIU_SUPERVISOR` and `AUDITOR` projections of such a pack remain allowed.
- A refused request SHALL NOT write a projection record, because nothing was disclosed. It is written to the service log as a warning with the pack id, profile, recipient and issuer, so an attempt that bypassed the console can be traced.
- Each pack version salts the `decision` subtree afresh instead of reusing the previous version's salts, so withheld decision fields cannot be compared across versions. `decision` is not an evidence key, so `evidence_root`, the decision `packHash` and the verifier are unchanged; other sections keep reusing salts.
- A payment frozen and later credited, with no sanctions match, may be projected for `OFF_RAMP` and `BANK`: the copy shows CREDIT and withholds `timeline.offchain` and `decision.return_blocked`.
- The rule is enforced in `compliance-backend`, not only in a UI, so every caller (console, curl, scripts) is bound by it.
- The rule guards against issuing a recipient copy that reveals a freeze or a sanctions match by mistake. It does not bind a profile to a recipient: a caller can still label an `FIU_SUPERVISOR` copy for anyone. The control for that is the projection log, which records profile, recipient, purpose and issuer.
- Out of scope: withholding `decision.decision` or `sanctions.result` from `OFF_RAMP` (that would change specimen A and remove the answers an off-ramp needs); binding profiles to recipients; exposing refused profiles in the payment read (`add-officer-console`); four-eyes review of disclosures.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `payment-passport`: `OFF_RAMP` and `BANK` projections are refused for a pack whose latest version records a FREEZE or a sanctions true match, and a refused projection is not logged as a disclosure; withheld decision fields are salted afresh in each pack version.

## Impact

- `compliance-backend/internal/evidence/profiles.go`: `RefusedProfiles`.
- `compliance-backend/internal/evidence/builder.go`: `BuildPack` skips `carry` for `decision`.
- `compliance-backend/internal/pipeline/queries.go` (`Pipeline.Project`): check `RefusedProfiles` on the latest pack version before projecting.
- `compliance-backend/internal/api/api.go`: map the refusal to `409` and log it.
- Tests in `internal/evidence`, `internal/pipeline`, `internal/api` and `e2e`.
- No change to the pack format, roots, verifier or specimens.
- Accepted: `Project` reads the latest version without a lock. A FREEZE committed between that read and the insert yields a copy of the previous version issued a moment after the freeze. It does not reveal the freeze; the window is milliseconds.
