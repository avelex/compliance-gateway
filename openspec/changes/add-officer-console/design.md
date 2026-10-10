# Design

## Context

See proposal.md for why. Current state that shapes the approach:

- `compliance-backend` serves seven endpoints behind one shared bearer token (`internal/api/api.go`). Officer identity already comes from the officer's EIP-712 signature: `decision.VerifyOfficer` recovers the signer and checks it against `officers[]` and its mask. `mlro[]` is checked the same way for ruleset approvals.
- `GET /v1/payments/{ref}` already returns checks, recommendation, decisions and pack roots, but no first-seen time, no pack creation time and no token symbol. There is no list or search, and no read of the `projection` table.
- `projection`, `decision` and `pack` are append-only by trigger. `projection` has no issuer column.
- The frontend is one Next.js 15 app. The legacy `(dashboard)` wraps itself in `PrivyProvider`; the root layout does not, so a new route group can stay Privy-free. `viem` is installed. The Deflow brand tokens live in `app/landing.module.css` and `ds-bundle/`; `DESIGN.md` describes the legacy look.
- The officer signing flow is two calls: `GET .../typed-data?decision=K` stores a pending request (TTL) and returns the typed data; `POST .../decisions` with signature and rationale records it. The EIP-712 domain carries the payment's chain id. `prepare` checks only that an evidence snapshot exists and that the transition is allowed; it does not look at `ingest`.
- After a decision the stage becomes `decided`, except HOLD, which stays `in_review` (`pipeline/decide.go`). A FREEZE therefore leaves the Inbox, although a frozen payment still accepts CREDIT or a new FREEZE (`decision/transition.go`). An automatic HOLD issues a pack and stays `in_review`, so `in_review` does not mean "no pack".
- Recommendation, evidence snapshot and any automatic decision are written in one transaction, and only for `ingest = 'confirmed'`. A snapshot therefore implies the payment was confirmed and past recommendation.
- `GET /healthz` already reports `reconciler_lag_blocks` per configured chain.

## Goals / Non-Goals

**Goals:**
- Attribution comes from a signature checked by the backend, never from a header the frontend sets: per decision for decisions, and at sign-in for everything a session does afterwards, including projections.
- The browser never sees the bearer token.
- No new frontend dependency: the console uses the injected EIP-1193 wallet directly.
- Backend changes stay additive: existing bearer-token callers (backfill scripts, e2e) keep working unchanged.

**Non-Goals:**
- WalletConnect, hardware-wallet flows beyond what an injected wallet offers, or embedded wallets.
- Multi-tenant console, roles outside the officer and MLRO sets, per-role hiding of freezes.
- Visual design system work beyond applying the existing Deflow tokens.
- Live updates (polling or push); views load on navigation and on explicit refresh.

## Decisions

### D1. Sign-in with a server-built EIP-4361 message, verified in Go

`POST /v1/auth/nonce` builds the full SIWE message (domain and URI = configured console origin, chain id = first configured chain, nonce, issued-at, expiration 5 minutes) and keeps the nonce with the exact message text in memory: a map under a mutex. Each insert first drops expired entries; when 10,000 live entries remain, the endpoint answers 503. `POST /v1/auth/session` takes `{message, signature}`, removes the nonce from the map (so it is single-use), requires the message to equal the stored text and to be unexpired, recovers the `personal_sign` signer with go-ethereum, and requires it in `officers[]` or `mlro[]`.

The chain id in the message is informational: `personal_sign` does not depend on the wallet's active chain.

Nonces live in memory because the endpoint is unauthenticated and reachable through the public rewrite: a table would grow with every anonymous call. One backend instance serves one processor, so a restart loses only nonces that expire within 5 minutes anyway.

- Alternative: an `auth_nonce` table with a delete of expired rows before each insert. Still grows without bound for 5 minutes under a flood, and costs a migration.
- Alternative: stateless HMAC nonces. Needs a new secret, and single use still needs a store of used nonces.

Because the server wrote the message, there is no SIWE parser: equality with the stored text is the check.

The nonce cap means a flood can block sign-in for its duration. Accepted for the pilot; existing sessions keep working.

- Alternative: SIWE in a Next.js BFF that forwards an actor header. Rejected in exploration: the backend would trust the frontend for authorship.
- Alternative: a SIWE library in Go. Unneeded when the server authors the message.
- Alternative: Privy login. Officers are already wallet addresses in config; Privy would add a second identity to map.

### D2. Opaque session token in Postgres, HttpOnly cookie

On success the service generates 32 random bytes, stores `sha256(token)`, the address and `expires_at` in a new `staff_session` table, and sets cookie `deflow_session` (HttpOnly, Secure, SameSite=Strict, Path=/). Lifetime from config `console.session_ttl` (default 12h). Creating a session first deletes expired rows, so the table holds only live sessions. `DELETE /v1/auth/session` deletes the row. `GET /v1/auth/session` returns address, officer id, mask, `mlro`, and the coverage the console needs to explain an empty search: `chains: [{chain_id, tokens: [symbol]}]` from the config.

On every request the middleware resolves the session and re-checks the address against the loaded config, so removing an officer from config and restarting ends their access (spec: "Address removed from the configuration"). The row is not deleted on that 401: if the address is added back before `expires_at`, the old cookie works again. Re-adding an address is a deliberate administrator action, so this is accepted rather than coded around.

- Alternative: stateless signed cookie (HMAC/JWT). Needs a new secret, cannot be revoked at sign-out. A table is one migration.

### D3. One auth middleware, two principals

`auth` accepts `Authorization: Bearer` (principal = service) or the session cookie (principal = address). The principal goes into the request context. Handlers that care read it:

- `decide`: when the principal is an address, the recovered signer from `VerifyOfficer` must equal it, else `ErrForbidden`.
- `project`: writes `issued_by` = address hex or `api-token`. Any staff principal may issue any profile the backend allows; there is no disclosure role.
- Session-authenticated non-GET requests must carry `Origin` equal to `console.origin`, else 403 (spec: "Session writes are same-origin"). SameSite=Strict already blocks most cross-site sends; the Origin check is the second lock and costs a string compare.

When `console.origin` is empty, the auth endpoints return 404 and only the bearer token works. That is today's behaviour, so existing deployments are unchanged.

### D4. Same-origin through a Next.js rewrite

`next.config.ts` rewrites `/console/api/:path*` to `${DEFLOW_BACKEND_URL}/:path*`. The browser talks to its own origin, so the cookie is first-party, no CORS configuration exists, and the backend URL stays server-side. The backend sees `Origin` = console origin, which matches D3.

Next.js evaluates rewrites at `next build` and stores them in the routes manifest, so `DEFLOW_BACKEND_URL` is a build-time variable: one frontend build serves one processor. The rewrite is added only when the variable is set. The same app also serves the public landing, which is built without it: there `/console` exists, nothing is proxied, and `GET /console/api/healthz` is Next's own 404. `layout.tsx` turns that 404 into "console not configured"; no second variable is needed.

- Alternative: CORS with credentials on the backend. More configuration, third-party cookie behaviour varies by browser.
- Alternative: a catch-all route handler that reads the backend URL at runtime. Allows one image for several processors, which the pilot does not need; about 20 lines when it does.
- Alternative: a separate Next app for the console. Duplicates tokens, config and CI for no pilot benefit.

### D5. Wallet access through raw EIP-1193 requests

The console calls `window.ethereum.request` directly:
- `eth_requestAccounts` to pick the address;
- `personal_sign` for the sign-in message;
- `eth_chainId` and, when it differs from the payment's chain, `wallet_switchEthereumChain` before signing a decision;
- `eth_signTypedData_v4` with `JSON.stringify(typedData)` exactly as the backend returned it.

Passing the backend's document through unchanged guarantees the digest matches `decision.Digest`; re-encoding it through a typed-data helper could drop or reorder fields (notably `EIP712Domain`). viem is used only for address checksumming and formatting.

MetaMask refuses `eth_signTypedData_v4` when `domain.chainId` differs from the active chain, and the domain carries the payment's chain. The switch happens right before signing. Error 4902 (chain unknown to the wallet) is shown as "add chain <id> to your wallet"; the console does not call `wallet_addEthereumChain`, because that needs a public RPC URL the backend should not hand out.

### D6. Payment search as one parameterised query

`GET /v1/payments` with optional `q`, `amount`, `from`, `to`, `stage`, `ingest`, `last_decision`, `limit` (default 50, max 200), `cursor`.

- `q` is classified by shape: 32 bytes matches `tx_hash` or `id`; 20 bytes matches `payer` or `deposit`. Anything else is 400.
- `from` and `to` are RFC3339 instants and select `block_time` in `[from, to)`. The console works in UTC throughout, like the passport: a date field means a UTC day, and the console sends the day after `to` at `00:00Z`, so the user's end date is inclusive. Times are displayed as `YYYY-MM-DD HH:MM UTC`.
- `amount` is a decimal string. For each configured token it is converted to base units with that token's decimals, and the query matches `(token, amount)` pairs. A value with more fractional digits than a token's decimals simply cannot match that token.
- `last_decision` uses a lateral subquery on the highest-nonce decision, the same expression `Cases` uses today.
- Pagination is a keyset cursor over `(block_time DESC, id DESC)`, encoded as an opaque string.
- New index: `payment (block_time DESC, id DESC)`, plus `payment (tx_hash)` and `payment (deposit, block_time)`. `payment_payer_time` already exists but is partial on `confirmed`; search covers every ingest status, so add a plain `(payer, block_time)` index.

List entries and the single-payment read share one row mapper, which adds `token_symbol`, `amount_units`, `block_time` and `first_seen_at` from the payment row and the token config. The single read also adds `created_at` per pack, `state: {status, frozen}` from `decision.Replay` over the decisions, so the console does not re-implement the transition rules to decide whether to offer a decision, and `projection: {refused: {PROFILE: reason}}` from `evidence.RefusedProfiles` over the latest pack version (from `block-frozen-offramp-projection`), so the refusal rule has one implementation that both `Project` and the console follow.

An empty result is not evidence about the transaction. The console states what was searched: no payment is recorded for the hash; Deflow records deposits to the processor's addresses on the chains and tokens from the session's coverage; a chain whose `reconciler_lag_blocks` in `/healthz` is above zero is named as behind; withdrawals need a Settlement Manifest, which is not available yet. It never says the transaction contains no deposit: the deposit may predate the backfill window, be on an unconfigured chain or token, or not be ingested yet.

### D6a. Officer decisions refuse orphaned payments

`OfficerTypedData` and `OfficerDecide` read `ingest` of the locked payment and return `ErrConflict` (409) when it is `orphaned`. The guard does not go in `prepare`, which `decideAuto` also calls inside the recommendation transaction. No guard for `seen` or `checks_done` is needed: a snapshot, which `prepare` already requires, is only written for confirmed payments in the same transaction as the recommendation. What remains is a confirmed payment later orphaned by a deep reorg.

### D7. Projection issuer and log

Migration `002`: `ALTER TABLE projection ADD COLUMN issued_by text NOT NULL DEFAULT 'api-token'`. The fast-default path does not rewrite rows, so the append-only trigger does not fire. Existing rows were issued with the bearer token, so the default is true for them. `GET /v1/projections?payment_ref=&pack_id=&limit=&cursor=` joins `pack` for the payment reference and orders by `issued_at DESC, id DESC`.

### D8. Console structure

```
frontend/app/console/
  layout.tsx           session gate, header (address, officer id, mask, MLRO), nav, sign-out
  page.tsx             redirect to payments
  sign-in/page.tsx     wallet connect -> nonce -> personal_sign -> session
  payments/page.tsx    search form in the URL query, result table, frozen filter
  payments/[ref]/page.tsx   facts, checks band, recommendation, decisions, timeline,
                            packs, disclosures, decide panel, issue panel
  inbox/page.tsx       open cases
  disclosures/page.tsx projection log
frontend/lib/console/
  api.ts               fetch wrapper for /console/api: same-origin credentials, typed errors
  wallet.ts            the EIP-1193 calls of D5, including the chain switch
  decision-kinds.ts    whether to show the decide panel, and allowed kinds = mask AND freeze rule (pure, unit-tested)
  timeline.ts          merges the payment record and its projections into ordered events (pure, unit-tested)
```

Pages are client components. The data is per-officer and behind a cookie, so server rendering buys nothing and would need the backend URL and cookie forwarding on the server as well.

Search state lives in the URL query, so a search result can be shared with a colleague and survives a reload.

The decide panel is a page section, not a separate Inbox screen: Inbox rows link to the payment page. One place shows the evidence and takes the decision. It is shown from the payment's state, not its stage: the payment has a pack, `ingest` is not `orphaned`, and `state.status` is not CREDITED or RETURNED. That covers `in_review` cases and frozen payments, which are `decided` and absent from the Inbox but still accept CREDIT or a new FREEZE; frozen payments are found with the Payments frozen filter. The typed data is fetched after the rationale is written, right before the wallet prompt, so the pending request is fresh.

The issue panel is shown whenever the payment has a pack, whatever its stage. An automatic HOLD leaves the payment `in_review` with a pack; the panel then notes that the case is open and the copy shows decision HOLD. Without a pack the page explains why from `stage` and `ingest`. The profiles offered are the five profiles minus the keys of `projection.refused`; for each refused profile the panel shows the backend's reason. The console holds no copy of the rule (today: a FREEZE or a sanctions `TRUE_MATCH` in the latest version refuses `OFF_RAMP` and `BANK`), so a new condition in the backend needs no console change. A backend 409 on issue is still shown, for the case where a decision lands between reading the page and issuing.

The projection download uses `response.blob()` straight into an object URL, so the bytes on disk are the bytes the backend canonicalised. The file is named `passport_<pack_id_prefix>_<PROFILE>.json`, matching the specimen naming.

Errors: `api.ts` turns non-2xx responses into `{status, error, detail}` from the backend's JSON error shape. Every view renders its own failure state. A failed Inbox count is shown as unknown, never as 0.

Visuals reuse the Deflow tokens from `landing.module.css`, lifted into a `console.module.css` scoped to the console root, so the landing and the legacy dashboard are untouched.

## Risks / Trade-offs

- [Injected wallet only: officers on WalletConnect-only or hardware setups without a browser extension cannot sign in.] → Accepted for the pilot; MetaMask and Rabby cover Ledger and Trezor through their extensions. WalletConnect is a later addition behind the same three calls in `wallet.ts`.
- [Config-based roles mean adding an officer needs a config edit and a restart.] → Same as today for decisions; the console does not make it worse. A team page is out of scope.
- [Session cookie theft on a shared machine.] → HttpOnly, Secure, 12h TTL, sign-out deletes the row. Signing a decision still needs the officer's wallet, so a stolen session can read and issue projections but cannot decide.
- [A stolen session can issue projections and therefore disclose data; disclosure attribution rests on the sign-in signature, not on a signature per projection.] → Accepted for the pilot. Every projection carries the session address as issuer and appears in the log; the refusal rule from `block-frozen-offramp-projection` (freeze or sanctions match) applies to session callers too. A `personal_sign` per projection, stored on the record, can be added later without changing the log's shape.
- [Any staff member, including an MLRO-only address or an officer with mask 0, can issue any allowed profile.] → Accepted: answering RFIs is the officers' job and there is no disclosure role in the config. Roles are out of scope.
- [A nonce flood blocks new sign-ins while it lasts.] → Accepted; the cap protects memory, and existing sessions are unaffected.
- [Each officer decision may need a chain switch in the wallet.] → Done automatically right before signing; a chain the wallet does not know needs a one-time manual add.
- [Amount search with exact match misses a payer who remembers a rounded figure.] → Combine with a date range; a range-of-amounts filter can come later without changing the response shape.
- [Rewrite proxy adds a hop and hides the backend's own client IP view.] → Single-tenant, low volume; acceptable.
- [`Secure` cookies on `http://localhost` are not kept by every browser.] → Local runs (task 7.1) use Chrome or Firefox, which treat localhost as secure.
- [`GET .../typed-data` writes a pending request but, as a GET, is outside the Origin check.] → SameSite=Strict keeps the cookie off cross-site requests, and the pending request alone records nothing.
- [`eth_signTypedData_v4` support differs across wallets.] → MetaMask, Rabby, Coinbase Wallet and Frame support it; a wallet that rejects it gets an explicit error in the decide panel.

## Migration Plan

1. Deploy `block-frozen-offramp-projection` first (dependency in the proposal).
2. Deploy the backend with migration `002` (`issued_by`, `staff_session`, indexes) and leave `console.origin` empty. Behaviour is identical to today; bearer callers are unaffected.
3. Build and deploy the processor's frontend with `DEFLOW_BACKEND_URL` set at build time. The public landing build stays without it.
4. Set `console.origin` (and optionally `console.session_ttl`) and restart the backend to enable sign-in.

Rollback: clear `console.origin` and restart. The console then cannot sign in, and every other path keeps working. Migration `002` is additive and can stay.

## Open Questions

- Does the pilot processor's officer team use browser-extension wallets? If not, WalletConnect moves into this change's follow-up early. This does not change the specs: they say "browser wallet".
