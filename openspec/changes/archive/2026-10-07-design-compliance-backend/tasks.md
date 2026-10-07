# Tasks

Design-only change. The tasks are spikes that test the design's riskiest assumptions, plus the roadmap update. Spike code lives under `openspec/changes/design-compliance-backend/spikes/` and is not production code.

## 1. Spikes

- [x] 1.1 (T1) Produce the EIP-712 `Decision` test vector from D7. It has fixed domain values (chain 84532, a fixed `verifyingContract`), one `Decision` per decision kind, the digest for each, and a signature from a known test key. Generate it with a short Go program using go-ethereum `apitypes`. Cross-check with `cast` (Foundry) by recomputing the struct hash. Verify: Go and `cast` give identical digests, and the vector is saved as `spikes/decision-eip712.json`.
- [x] 1.2 (T2) Run eventscale against a local `anvil` chain and force a reorg with `anvil_reorg` after a USDC-like `Transfer` is published. Record whether eventscale re-emits, drops, or duplicates the log, and confirm that the D4 finaliser rule (re-read receipt at `head - N`, compare block hash) is enough. Verify: findings written to `spikes/eventscale-reorg.md`, with the exact eventscale commit and the commands to reproduce.
- [x] 1.3 (T3) Write a minimal Go pack builder that reads the `data` and `salts` from the two specimen JSONs and recomputes `master_root`, `evidence_root`, and `projection_hash` with RFC 8785 canonicalisation. Add 3 edge-case vectors (non-ASCII names, numeric strings, empty arrays). Verify: the Go output equals the specimens' integrity values, and `verify_pack.py` on the edge-case vectors agrees with Go.

## 2. Roadmap and review

- [x] 2.1 Update the README roadmap. `add-compliance-backend` now ships mode (b) first (D10, Migration Plan). `processor-decision-contracts` now carries the D7 interface: signer set, nonce, neutral statuses, freeze commitment, no public reclaim on `HELD`. Verify by reading the README diff.
- [x] 2.2 Fold the spike results back into `design.md`: adjust D4 if T2 shows eventscale needs more than the finaliser, and record T1 and T3 file paths in D7 and D9. Then get the user's sign-off on the design. Verify: `openspec validate design-compliance-backend --strict` passes, and the user has confirmed the design in conversation.

## Workflow follow-up

- Archive with `/opsx:archive`. There are no spec deltas, because `skip_specs` is true.
- Then propose `processor-decision-contracts` and `add-compliance-backend` against this design.
