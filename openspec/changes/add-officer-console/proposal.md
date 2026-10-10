# Proposal

## Why

Deflow has no interface for the people it is built for. The compliance backend ingests deposits, runs checks, records decisions and issues Payment Passports, but an officer can reach it only with curl and a shared bearer token. The pilot is measured by how fast an RFI is answered, and the first pilot stages run in configuration (b), so the first console has to let a compliance officer find a deposit, see why it was decided, and issue a recipient copy of its passport, with every disclosure attributed to the person who made it. The existing `(dashboard)` belongs to the legacy merchant-gateway product and is not the place for this.

## What Changes

- A new officer console at `/console` in the frontend, next to the legacy `(dashboard)`, which stays unchanged. One console deployment serves one processor's `compliance-backend` instance. Configuration (b) only; configuration (a) views come later behind a configuration flag.
- **Payments**: search a deposit by transaction hash, payer or deposit address, or amount and date range; list deposits with ingest status, stage and the `reconstruction` flag; filter frozen payments. A hash that matches no payment is answered with what was searched, not with a claim about the transaction: no payment is recorded for it, which chains and tokens Deflow records deposits for, and that Settlement Manifests for withdrawals are not available yet. Times are shown and searched in UTC, as in the passport.
- **Payment page**: the checks with their sources and list versions, the recommendation with its ruleset and rule, the timeline from `seen` to decision, the pack versions, the disclosures already made for this payment, and an "Issue projection" action that returns the canonical JSON copy for download. The action is offered whenever the payment has a pack, without the profiles the backend would refuse for it, whose reason it shows instead; a payment without a pack says why (`checks_pending`, `in_review` without an automatic decision, `orphaned`).
- **Inbox**: the open officer cases (`in_review`). The decision itself is taken on the payment page, which offers it for any payment whose status is not final, including frozen payments that leave the Inbox. An officer picks a decision kind allowed by their mask and by the freeze rule, writes a rationale and signs the EIP-712 decision in their own wallet, which the console switches to the payment's chain first. Kinds the officer cannot sign are not offered.
- **Disclosures**: the log of every projection issued, with profile, recipient, purpose, projection hash, time and the issuer. Any signed-in staff member may issue a projection; the issuer is the session's address.
- **Sign-in with Ethereum** in `compliance-backend`: an officer signs in with the wallet whose address is in `officers[]` or `mlro[]`, and the session carries that address. The bearer token stays for service callers such as backfill.
- New read endpoints: a payment search/list and a projection log. The payment read gains the times, token details and decision state the console needs. Each projection record stores who issued it.
- Officer decisions on an orphaned payment are refused by the backend, so neither the console nor a curl caller can decide on a transfer that left the canonical chain.
- Out of scope: Settlement Manifest (separate change, needs a withdrawal allocation rule), rules UI, sources and health, Audit Export, contracts and hub settings for configuration (a), four-eyes review, roles outside compliance staff, PDF passports.

## Capabilities

### New Capabilities

- `officer-console`: the processor staff's browser console for configuration (b) — payment search and list, payment page, officer inbox and decision signing, projection issue, and the disclosure log.

### Modified Capabilities

- `compliance-recommendations`: "API is authenticated" changes from bearer token only to a bearer token for service callers or a Sign-In with Ethereum session for an address in the officer or MLRO set; a session's address must match the officer who signs a submitted decision; officer decisions on an orphaned payment are refused.
- `payment-passport`: "Every projection issue is logged" adds the issuer's address to each projection record; the projection log becomes readable through the API.
- `deposit-ingestion`: processor staff can search and list payments and read one payment's full record through the API.

## Impact

- `frontend/app/console/**`: new routes, a wallet connection for sign-in and EIP-712 signing; no Privy dependency for the console.
- `frontend/next.config.ts`: the backend rewrite exists only when `DEFLOW_BACKEND_URL` is set at build time, so one frontend build serves one processor and a build without it (the public landing) has no live console.
- `compliance-backend/internal/api`: SIWE nonce and session endpoints, session middleware next to the bearer check, `GET /v1/payments`, `GET /v1/projections`.
- `compliance-backend/internal/pipeline`: the orphaned-payment guard on officer decisions.
- `compliance-backend/internal/store/migrations`: `issued_by` on `projection`, a `staff_session` table, indexes for payment search. Sign-in nonces live in memory.
- Depends on `block-frozen-offramp-projection`: the payment read reports its `RefusedProfiles` for the latest pack, so the console never offers a projection the backend would refuse as tipping-off and never keeps its own copy of that rule.
- Legacy merchant dashboard and checkout are unaffected.
