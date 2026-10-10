# Tasks

## 1. Backend: schema and configuration

- [ ] 1.1 Add migration `002` with `projection.issued_by text NOT NULL DEFAULT 'api-token'`, table `staff_session (token_sha256 PK, address, expires_at)`, and the payment indexes from design D6; verify that `go test ./internal/store/...` against Postgres applies it on a database that already has `001` and existing projection rows read `api-token`
- [ ] 1.2 Add optional `console.origin` and `console.session_ttl` (default 12h) to config, rejecting an origin that is not an `https://` or `http://localhost` URL; document both in the README configuration table and `config.example.json`, and verify with a `config_test.go` case for each

## 2. Backend: staff sign-in and sessions

- [ ] 2.1 Implement `POST /v1/auth/nonce` that builds the EIP-4361 message and keeps it in the in-memory nonce map with expiry sweep and a 10,000-entry cap (design D1), returning 404 when `console.origin` is empty and 503 at the cap; verify with an API test that checks the domain, URI, chain id and 5-minute expiry in the message, and a unit test with a small cap that gets 503 and recovers after entries expire
- [ ] 2.2 Implement `POST /v1/auth/session` that consumes the nonce, requires exact message equality, recovers the `personal_sign` signer and requires it in `officers[]` or `mlro[]`, deletes expired `staff_session` rows, then sets the `deflow_session` cookie; verify API tests for success, a reused nonce (401), a tampered message (401) and an unknown signer (403)
- [ ] 2.3 Implement `GET /v1/auth/session` (address, officer id, mask, `mlro`, `chains: [{chain_id, tokens: [symbol]}]`) and `DELETE /v1/auth/session`; verify with tests that a signed-out cookie returns 401, that an officer who is also an MLRO reads `mlro: true` with their mask, and that `chains` matches the config
- [ ] 2.4 Extend the auth middleware to accept the bearer token or a live session, re-check the session address against config on each request, put the principal in the request context, and reject session-authenticated non-GET requests whose `Origin` differs from `console.origin`; verify that the existing `TestAuthRequired` still passes and new tests cover an expired session, an address removed from config, the same address added back before expiry (accepted again), and a cross-origin POST (403)
- [ ] 2.5 In `decide`, require the recovered signer to equal the session address when the principal is a session; verify with a test where officer A's session submits officer B's signature (403, no decision row), while the existing `TestOfficerFreezeThroughAPI` with the bearer token still passes
- [ ] 2.6 In `OfficerTypedData` and `OfficerDecide` (not `prepare`), refuse a payment whose `ingest` is `orphaned` with `ErrConflict` (design D6a); verify a pipeline test that orphans a decided, confirmed payment and gets 409 from both calls with no decision row, while automatic decisions still pass

## 3. Backend: read endpoints and issuer

- [ ] 3.1 Add the shared payment row mapper with `token_symbol`, `amount_units`, `block_time` and `first_seen_at`, use it in `GET /v1/payments/{ref}`, add `created_at` to each pack, `state: {status, frozen}` from `decision.Replay`, and `projection.refused` from `evidence.RefusedProfiles` over the latest pack; verify with a pipeline test on a payment that has two decisions and two packs, one with FREEZE then CREDIT that reads CREDITED and frozen, one frozen payment and one HOLD on a sanctions `TRUE_MATCH`, both with `OFF_RAMP` and `BANK` refused
- [ ] 3.2 Implement `GET /v1/payments` with `q`, `amount`, `from`, `to`, `stage`, `ingest`, `last_decision`, `limit` and a keyset `cursor` (design D6); `from`/`to` as RFC3339 instants over `[from, to)`; verify table-driven tests for each filter, a payment at exactly `to` excluded, the amount conversion across two tokens with different decimals, an unmatched hash (empty list), a bad `q` (400), `limit` above 200 (400) and a two-page walk with no duplicates
- [ ] 3.3 Record `issued_by` in `Project` from the request principal (address hex or `api-token`); verify one test with a session caller and one with the bearer token
- [ ] 3.4 Implement `GET /v1/projections` filtered by `payment_ref` or `pack_id`, newest first, with cursor pagination; verify a test with two projections on one payment and an empty list for a payment with no packs
- [ ] 3.5 Document the new endpoints and the sign-in flow in the `compliance-backend/README.md` API section; verify the documented curl sequence works against `go run ./cmd/compliance-backend serve`
- [ ] 3.6 Extend the e2e test with a session sign-in, a payment search by transaction hash, and a projection whose log entry names the session address; verify with `go test -tags e2e ./e2e`

## 4. Frontend: console shell and sign-in

- [ ] 4.1 Add the `/console/api/:path*` rewrite to `DEFLOW_BACKEND_URL` in `next.config.ts`, only when the variable is set at build time, and document it in `frontend/README.md` as a build-time variable (design D4); verify that `curl localhost:3100/console/api/healthz` returns the backend's health JSON, and that `npm run build` without the variable succeeds with no rewrite
- [ ] 4.2 Add `lib/console/api.ts` (same-origin fetch with typed `{status, error, detail}` failures) and `lib/console/wallet.ts` (the EIP-1193 calls of design D5, including `eth_chainId` and `wallet_switchEthereumChain` with 4902 mapped to an "add chain" error), plus a UTC date helper that turns date fields into `[from, to)` instants; verify vitests for error mapping from the backend's JSON error shape, a non-JSON 502, and the date helper for an inclusive end day
- [ ] 4.3 Build `app/console/layout.tsx` with the "console not configured" state when `/console/api/healthz` is Next's 404, the session gate, header (address, officer id, permitted kinds, MLRO mark), nav with the Inbox count, and sign-out, plus `console.module.css` scoped from the Deflow tokens; verify in the browser that `/console` loads with no Privy request in the network panel, that sign-out returns to sign-in, and that a build without `DEFLOW_BACKEND_URL` shows "console not configured"
- [ ] 4.4 Build `app/console/sign-in/page.tsx`: no-wallet message, connect, nonce, `personal_sign`, session; show the refused address on 403 and a retry message on 503; verify by hand with an anvil officer key in a browser wallet, and with a non-officer key that sees the refusal

## 5. Frontend: payments and payment page

- [ ] 5.1 Build `app/console/payments/page.tsx` with the search form in the URL query, the result table, the frozen filter, the reconstruction mark, UTC times and date fields, and the unmatched-hash message that states the searched chains and tokens from the session and any lagging chain from `/healthz`; verify by hand against the e2e fixture data that hash, address, amount and date searches each find the expected payment, that a reload keeps the search, and that the date search gives the same result with the browser in UTC+3
- [ ] 5.2 Add `lib/console/timeline.ts` to merge payment record and projections into ordered events; verify a vitest with an automatic HOLD, an officer FREEZE, two packs and one projection in the right order
- [ ] 5.3 Build `app/console/payments/[ref]/page.tsx` with facts, the checks band (`UNAVAILABLE` shown as such), recommendation with `policy_ref`, decisions with mode and author, the timeline, packs, disclosures, and the missing-passport explanations per stage and ingest when there is no pack; verify by hand on a credited, an in-review without a pack, an automatically held, an orphaned and a reconstructed payment, and check that no view uses the words clean or safe

## 6. Frontend: decisions and disclosures

- [ ] 6.1 Add `lib/console/decision-kinds.ts` (decide panel shown when there is a pack, `ingest` is not `orphaned` and `state.status` is not final; kinds = mask AND freeze rule); verify vitests for mask 15 on a frozen `decided` payment (panel shown; CREDIT, FREEZE), a credited payment (no panel), an orphaned payment (no panel) and a mask without RETURN
- [ ] 6.2 Build the decide panel on the payment page: offered kinds, required rationale, then fetch typed data, switch the wallet to the payment's chain, `eth_signTypedData_v4` with the unchanged document, submit, show the new pack version, and show 409, 403 and the "add chain" error as the spec describes; verify by hand that a FREEZE signed in the browser wallet is accepted and the payment leaves the Inbox, that the frozen payment found through the frozen filter can then be credited from its page, and that signing with the wallet on another chain prompts a switch
- [ ] 6.3 Build `app/console/inbox/page.tsx` (open cases, oldest first, rows link to the payment page) and the failure state where the count shows as unknown; verify by hand with the backend stopped that the Inbox shows the failure and the nav count is not 0
- [ ] 6.4 Build the issue panel, shown whenever the payment has a pack: profiles = all five minus `projection.refused`, with the backend's reason shown for each refused one, required recipient and purpose, open-case note when the last decision is HOLD, blob download named `passport_<pack_id_prefix>_<PROFILE>.json`, refusal shown on non-2xx; verify that `python3 docs/evidence-pack/verify_pack.py` accepts a downloaded `OFF_RAMP` file
- [ ] 6.5 Build `app/console/disclosures/page.tsx` listing the projection log with issuer, showing `api-token` issuers as the API token; verify by hand that a copy issued through curl and one issued in the console both appear with the right issuer

## 7. Integration

- [ ] 7.1 Run the whole flow against the local stack (docker compose, backend with `console.origin=http://localhost:3100`, frontend dev with `DEFLOW_BACKEND_URL`, in Chrome or Firefox): sign in as an officer, find a deposit by hash, freeze it from the Inbox, confirm OFF_RAMP is not offered, issue an `FIU_SUPERVISOR` copy, verify it with `verify_pack.py`, and see it in Disclosures; record the result in the PR description
- [ ] 7.2 Run `go test ./...`, `go test -tags e2e ./e2e` and `npm test && npm run build` in `frontend`; verify all pass and that the legacy `(dashboard)` and checkout still build unchanged

## Workflow follow-up

- Implement `block-frozen-offramp-projection` before task 3.1: the payment read uses its `RefusedProfiles`, and the backend enforces the refusal rule the console reads.
- Archive the change after review, then sync the delta specs into `openspec/specs/`.
