# Tasks

## 1. Refuse off-ramp and bank copies that would reveal a freeze or a sanctions match

- [x] 1.1 Add `evidence.RefusedProfiles(pack)` in `compliance-backend/internal/evidence/profiles.go`, returning `OFF_RAMP` and `BANK` with a reason when the pack's `decision.decision` is `FREEZE` or its `sanctions.result` is `TRUE_MATCH`; verify a table-driven unit test for FREEZE, TRUE_MATCH with HOLD, CREDIT after FREEZE without a match, and a plain HOLD
- [x] 1.2 In `Pipeline.Project` (`internal/pipeline/queries.go`), after loading the latest pack and before projecting, refuse a profile listed by `RefusedProfiles` with `ErrConflict` and a detail that the request goes to the MLRO; in the API handler, log the refusal with `slog.Warn("projection refused", ...)` carrying pack id, profile, `prepared_for` and issuer (`api-token` until `add-officer-console` adds sessions); verify that `go build ./...` passes and no projection row is inserted on that path
- [x] 1.3 In `BuildPack` (`internal/evidence/builder.go`), skip `carry` for the `decision` key so its leaves get fresh salts in each version; extend `TestPackVersionsKeepEvidenceRootAndChain` to assert that `decision.decision` salts differ between v1 and v2 while the `timeline.offchain.0.event` salt and `evidence_root` stay the same; verify with `go test ./internal/evidence/...` and that the specimen recomputation test still passes
- [x] 1.4 Update `TestOfficerFreezeThroughAPI` (`internal/api/api_test.go`): after the FREEZE, expect `409` for `OFF_RAMP` and for `BANK` with no projection row for the pack, then issue an `FIU_SUPERVISOR` copy and keep the existing log assertions on it; verify with `go test ./internal/api/...` against Postgres
- [x] 1.5 Add an API test for an officer HOLD on a sanctions `TRUE_MATCH` payment: an `OFF_RAMP` copy is `409` with no projection row; verify with `go test ./internal/api/...`
- [x] 1.6 Add an API test for a payment frozen and then credited without a sanctions match: an `OFF_RAMP` copy is `201`, carries `decision.decision` CREDIT, has `timeline.offchain` and `decision.return_blocked` withheld, and its `$withheld` hash for `decision.return_blocked` differs from that of an `OFF_RAMP` copy of version 1; verify with `go test ./internal/api/...`
- [x] 1.7 In `e2e/e2e_test.go`, after the sanctioned payment's FREEZE, assert that an `OFF_RAMP` copy of its pack returns `409`, leaving the credited payment's `OFF_RAMP` copy and `verify_pack.py` check as they are; verify with `go test -tags e2e ./e2e`
- [x] 1.8 Note the refusal in the `compliance-backend/README.md` API section, next to the projection endpoint; verify the note names the profiles refused, both conditions (FREEZE, sanctions TRUE_MATCH) and the `409` status

## Workflow follow-up

- Implement this change before task 6.4 of `add-officer-console`.
- Update `add-officer-console` to read refused profiles from `RefusedProfiles` through the payment read instead of `profiles.ts`.
- Archive after review, then sync the delta into `openspec/specs/payment-passport/spec.md`.
