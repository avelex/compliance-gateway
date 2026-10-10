# Deflow Officer Console — UI brief

Use this as the prompt for designing the officer console. It describes what the console is for, who
uses it, every screen and state, and the rules the design must not break. Requirements live in
`specs/officer-console/spec.md`; where this brief and the spec disagree, the spec wins.

---

## 1. What you are designing

A browser console for the compliance staff of one payment processor (a MiCA-authorised CASP that
accepts USDC or EURC on EVM chains). Deflow watches the processor's deposits, runs checks on each,
recommends a decision under a ruleset the MLRO approved, records who decided, and produces a
Payment Passport: a signed evidence pack that can be issued as a recipient copy ("projection") to an
off-ramp, a bank, an auditor or a supervisor.

The console has three jobs, in this order of importance:

1. **Answer an RFI fast.** An off-ramp or bank asks "what is this payment?". The officer finds the
   deposit, sees how it was checked and decided, and downloads a copy of its passport prepared for
   that recipient. The pilot is measured by how long this takes.
2. **Decide open cases.** Payments the rules could not decide wait for an officer, who picks a
   decision, writes a rationale and signs it in their own wallet.
3. **Keep the disclosure record.** Every copy issued is logged with who issued it, to whom, and why.

This is configuration (b), "shadow mode": funds move as they do today and Deflow builds the proofs
alongside. There are no contracts and nothing on chain is executed by the console.

## 2. Who uses it

- **Compliance officer.** Works at a desk, on a laptop or a large monitor, most of the day. Fluent in
  AML vocabulary (KYT, sanctions screening, structuring, RFI, MLRO, tipping-off). Not a crypto
  native by default, but knows what a transaction hash and a wallet are. Reads carefully; mistakes
  have legal weight. Wants density and precision over friendliness.
- **MLRO.** Same screens. May have no decision rights (empty mask) but can sign in, read everything
  and issue copies.

The recipients of the copies never see the console.

## 3. Rules the design must not break

These come from the product's commitments. Treat them as hard constraints.

1. **Never say a payment is clean, safe, verified, legitimate or approved.** State which checks ran,
   their outcomes, the ruleset version and rule, and who decided. A credited payment shows
   "CREDIT" and its check outcomes — no green "safe" badge, no shield icon, no checkmark verdict.
   - The ruleset's fallback rule `DEFAULT` currently emits the reason code `CLEAN`. Do not render
     that code verbatim. Show it as "No rule matched · DEFAULT". (Flag to the backend team; the
     code should be renamed.)
2. **A hold or a freeze is the product working, not failing.** Do not style HOLD or FREEZE as an
   error (no red alert banners, no warning triangles). They are decisions like CREDIT. Red is
   reserved for things that are actually broken: a request that failed, a check that is
   `UNAVAILABLE`.
3. **A broken system must not look like an empty one.** A failed load is never an empty table, an
   empty Inbox or a "0". Show that the data could not be loaded, and keep the last known count
   marked as unknown ("—" with a tooltip, or "?"), never 0.
4. **Every decision has an author.** Each decision shows its mode (`AUTO_BY_POLICY` or officer),
   the signer (policy key or officer id + address) and, for automatic ones, the rule's `policy_ref`.
5. **Never claim more than the system knows.** A search with no result says "no payment is recorded
   for this hash" — never "this transaction contains no deposit" or "unknown transaction". What
   was not collected (e.g. Travel Rule data in configuration (b)) is labelled "not collected".
6. **Status is never carried by colour alone.** Every coloured state has a text label.
7. **Deflow holds no keys and moves no money.** No wording like "Deflow froze", "release funds",
   "send". The officer decides; the processor executes outside Deflow.

## 4. Visual direction

Continue the Deflow landing page, not the legacy merchant dashboard.

- **Character:** an instrument for reading evidence. Ruled ledgers, hairline tables, tabular
  numerals, generous line height in long text, tight density in tables. Closer to a well-set
  financial document than a SaaS dashboard. No cards-in-cards, no gradient hero areas, no
  illustrations, no emoji.
- **Echo the passport.** The landing shows Payment Passport specimens with checks in their own
  ruled band. Reuse that idea: on the payment page the checks are a ruled band with one row per
  check, the same order and vocabulary as in the passport file the officer will download.
- **Layout:** desktop first. Design at 1440 and 1280; must remain usable at 1024. Below that a
  readable single column is enough (no dedicated mobile design).

## 5. Formatting conventions

- **Time:** always UTC, written `2026-03-03 14:02 UTC`. Relative time ("3 h ago") may appear only as a
  secondary hint next to the absolute time.
- **Amounts:** token units with symbol, tabular numerals: `1,240.00 USDC`. Base units only in the
  payment's facts, in mono.
- **Addresses and hashes:** mono, shortened in tables (`0x8c1e…6f2a`), full on the payment page,
  with copy-to-clipboard on each. Checksummed addresses.
- **Enums** (`CREDIT`, `HOLD`, `FREEZE`, `RETURN`, `UNAVAILABLE`, `in_review`, profiles): uppercase
  mono tag, neutral ink outline. Stages and ingest statuses get a plain-language label next to the
  code where it helps ("in_review · waiting for an officer").
- **Officer identity:** officer id first, address second: `officer-2 · 0x4F3a…91C0`. The API token
  is shown as "API token (service)", never as a person.

## 6. Information architecture

```
/console
  sign-in
  payments            (default after sign-in)
  payments/[ref]      payment page (decide + issue live here)
  inbox
  disclosures
```

**Shell** (every signed-in page):

- Left: wordmark "Deflow" + "Officer console" and the processor's legal name.
- Nav: Payments · Inbox (count) · Disclosures.
- Right: signed-in identity — address (short, copyable), officer id, permitted decision kinds as
  small tags (e.g. `CREDIT HOLD FREEZE`), an "MLRO" tag when applicable; Sign out.
- No link to the merchant dashboard anywhere.
- A thin status line may show ingest lag per chain when `/healthz` reports lag > 0 ("Base: ingest
  42 blocks behind").

## 7. Screens

### 7.1 Sign-in

Centered, quiet, single column.

- Title "Sign in to the officer console", one line on what it is: "Staff of {processor legal name}
  sign in with the wallet registered as officer or MLRO."
- Primary button "Connect wallet". After connecting: the address, then "Sign in" which opens the
  wallet's signature prompt. Explain in one line that signing proves control of the address and
  costs nothing.
- States:
  - **No wallet in the browser:** "A browser wallet is required (MetaMask, Rabby…)." No other way in.
  - **Waiting for signature** in the wallet.
  - **Refused (403):** "0x4F3a…91C0 is not authorised for this processor." Offer to switch account.
  - **Busy (503):** "Sign-in is temporarily unavailable. Try again in a minute."
  - **Signature rejected by user:** neutral, back to "Sign in".
  - **Console not configured** (build without backend): "This console is not connected to a
    processor." No button.

### 7.2 Payments (search + list)

The workhorse. The officer arrives with an RFI that contains a hash, an address, or an amount and a
date.

- **Search bar on top**, one field that accepts a transaction hash, payment reference or address
  (hint text says so), plus: amount (token units), date from / to (UTC days, both inclusive, label
  says "UTC"), and filters: stage, ingest, last decision, and a prominent **Frozen** toggle.
  All search state lives in the URL; a reload or a shared link reproduces it.
- **Results table**, newest first, keyset pagination ("Load more", no page numbers):
  time (UTC) · amount + token · payer · deposit address · chain · ingest · stage · last decision ·
  reconstruction mark. Whole row opens the payment page.
- **Reconstruction mark:** a small, clearly worded tag "Reconstructed" (backfilled after the fact),
  with a tooltip.
- **No result for a hash:** not an empty table. A ruled note:
  > No payment is recorded for `0xabc…`.
  > Deflow records deposits to this processor's addresses on: Base (USDC, EURC), Ethereum (USDC).
  > Base ingest is 42 blocks behind — a recent deposit may not be recorded yet.
  > Withdrawals are not covered: Settlement Manifests are not available yet.
- **No result for other filters:** "No payments match these filters." with the active filters
  listed.
- **Load failure:** "Payments could not be loaded (502 · backend unreachable). Retry."

### 7.3 Payment page

The core screen. Reads top to bottom like the passport; actions on the right.

Layout at ≥1280: main column (evidence) + right rail (actions: Decide, Issue copy) that stays in
view while scrolling. At 1024 the rail moves above the evidence.

**Header:** amount + token (large, tabular), chain, short payment ref (copyable), tags: stage,
ingest, last decision, "Reconstructed" if set, "Frozen" if frozen.

**Sections, in order:**

1. **Facts** — a definition list: payment ref, chain id, tx hash, log index, block number,
   block time (UTC), first seen (UTC), payer, deposit address, token address + symbol, amount
   in base units and token units. Links out to a block explorer for hash/addresses.
2. **Checks** — the ruled band. One row per check (KYT, sanctions, structuring, issuer
   blacklist): check name · provider · product · outcome · list version(s) · performed at.
   `UNAVAILABLE` is red-labelled with "check did not return a result" — never blank, never
   passing. Demo providers carry their own product text (e.g. "address_security (demo, not for
   production)") — show it as is.
3. **Recommendation** — recommended decision, reason codes (mono tags), ruleset version, rule id
   and `policy_ref`, whether the rule was automatic.
4. **Decisions** — in nonce order: decision tag · mode · author (policy key / officer id +
   address) · time · rationale (officer decisions; expandable) · resulting pack version.
5. **Timeline** — one vertical, time-ordered list: first seen, block time, each check,
   recommendation, each decision, each pack version, each copy issued. Each entry: UTC time,
   event, author/source. Automatic and officer events must be distinguishable in text.
6. **Pack versions** — version, pack id, created at, roots (evidence root, pack hash) in mono,
   collapsible.
7. **Disclosures for this payment** — the projection log filtered to this payment (see 7.5).

**Missing passport** (no pack) replaces the Issue action with an explanation:
- `checks_pending`: "Checks are still running. The passport is issued after a decision."
- `in_review` without a pack: "Waiting for an officer. The passport is issued after the decision."
  + link to the case.
- `orphaned`: "This transfer is not on the canonical chain. It will get no decision and no passport."

**Decide panel** (right rail) — shown when the payment has a pack, is not orphaned and is not
CREDITED or RETURNED. This includes frozen payments that are no longer in the Inbox.
1. Decision kind as a segmented control, showing only kinds the officer's mask and the freeze
   rule allow. If some are hidden, one line says why ("RETURN is not available: a frozen payment
   accepts only CREDIT or a new FREEZE" / "your signer mask does not include RETURN").
2. Rationale textarea, required, with a character count.
3. "Sign decision" → the console fetches the typed data, switches the wallet to the payment's
   chain if needed ("Switching wallet to Base…"), then the wallet prompt opens. Show a compact
   summary of what is being signed (kind, payment ref, amount, nonce) next to the button.
4. Outcomes:
   - Success: "FREEZE recorded · pack v3" and the page refreshes in place.
   - 409 stale: "Another decision was recorded while you were preparing this one. Review the
     payment again before signing." with a Reload button. The rationale text is kept.
   - 409 orphaned / not allowed: backend message shown verbatim under a neutral heading.
   - 403: "The signature does not match the signed-in officer."
   - Wallet doesn't know the chain: "Add chain 8453 (Base) to your wallet, then try again."
   - User rejected in wallet: neutral, back to step 3.
- MLRO without mask: the panel is replaced by "You may not sign decisions (no decision kinds in
  your mask)."

**Issue copy panel** (right rail) — shown whenever the payment has a pack.
1. Profile, as radio cards with one line each on what the recipient sees:
   `OFF_RAMP`, `BANK`, `FIU_SUPERVISOR`, `AUDITOR`, `MASTER`.
2. Recipient (prepared for), required. Purpose, required (e.g. "source of funds RFI"). Inline
   validation; the request is not sent while either is empty.
3. "Issue and download" → downloads `passport_<pack_id_prefix>_<PROFILE>.json`; the new entry
   appears in the page's Disclosures section with the officer as issuer.
4. Notes:
   - **Refused profiles:** the payment read lists profiles the backend would refuse, each with a
     reason (today: `OFF_RAMP` and `BANK` when the latest decision is FREEZE or the sanctions
     result is `TRUE_MATCH`). Do not offer them; in their place show the backend's reason as a
     neutral note, e.g. "Off-ramp and bank requests on this payment go to the MLRO." Must not read
     as an error and must not mention the freeze in recipient-facing wording. The console never
     decides this itself.
   - **Open case** (last decision HOLD): "The case is still open. This copy shows decision HOLD."
   - Backend refusal: show its message verbatim.
- Make clear this is a disclosure: a one-line reminder under the button: "Issued copies are
  logged with your address."

### 7.4 Inbox

Open cases, oldest block time first (the longest-waiting at the top).

- Table: block time (UTC) + age · amount + token · payer · recommendation · reason codes · last
  decision. Row opens the payment page.
- Nav count = number of rows. Unknown on failure, never 0.
- Empty (successful load, no cases): "No open cases." — plain, no celebration.
- Failure: "Cases could not be loaded." + retry; nav count shows "—".
- Frozen payments are not here; a small link under the table: "Frozen payments → Payments,
  Frozen filter".

### 7.5 Disclosures

The projection log, newest first, "Load more" pagination.

- Columns: issued at (UTC) · payment ref (link) · pack version · profile · recipient · purpose ·
  projection hash (mono, copyable) · issuer.
- Issuer: officer id + address, or "API token (service)".
- Filter by payment reference.
- Empty: "No copies have been issued."
- Failure: "The disclosure log could not be loaded."

## 8. Shared states and components

- **Loading:** skeleton rows in tables, not spinners over the whole page.
- **Error block:** one component used everywhere: what failed, HTTP status and backend error code
  in mono, Retry.
- **Session expired (401 on any call):** return to sign-in with "Your session ended. Sign in again."
- **Tags:** enum tag (mono, outline), mark tag (Reconstructed, Frozen, MLRO — sans, filled
  `--ink-100`), failure tag (`UNAVAILABLE` — red text + outline).
- **Copy-to-clipboard** on every hash, address, pack id and projection hash.
- **Tooltips** explain codes in plain language (e.g. `SPLIT-03` → "structuring rule: several
  deposits below threshold in a window").

## 9. Accessibility

Real labels on every control; keyboard-reachable tables and rails; visible focus using
`--focus-ring`; no state by colour alone; WCAG AA contrast; `prefers-reduced-motion` honoured;
mono text never below 12px.

## 10. Sample data for mock-ups

Use realistic but obviously fictional values:

- Processor: "Example Payments GmbH".
- Chains: Base (8453) with USDC and EURC; Ethereum (1) with USDC.
- Officers: `officer-1` (mask 15: CREDIT HOLD FREEZE RETURN), `officer-2` (mask 7, no RETURN); an
  MLRO-only address.
- Ruleset `2026.10-1`; rules `UNAV-01` (a check UNAVAILABLE → HOLD, automatic), `SANC-01`
  (sanctions true match → FREEZE, officer), `ISS-01` (issuer listed → HOLD), `KYT-01` (KYT HIGH or
  SEVERE → HOLD), `SPLIT-03` (structuring FLAG → HOLD, automatic), `DEFAULT` (→ CREDIT, automatic).
- KYT outcomes are risk levels: LOW, MEDIUM, HIGH, SEVERE.
- KYT provider GoPlus, product "address_security (demo, not for production)".
- Payments to show:
  1. Credited automatically by `DEFAULT`, all checks returned, one `OFF_RAMP` copy issued to
     "Example Exchange" for "source of funds RFI".
  2. Held automatically by `SPLIT-03` (in Inbox, has pack v1).
  3. Held automatically then frozen by `officer-1` (not in Inbox, frozen, packs v1–v2, one
     `FIU_SUPERVISOR` copy).
  4. Held automatically by `UNAV-01` because KYT is `UNAVAILABLE` (in Inbox, has pack v1).
  5. Sanctions `TRUE_MATCH`: `SANC-01` recommends FREEZE without auto, so it waits in the Inbox
     with no pack. Show also the state after an officer holds it instead of freezing: pack v1,
     `OFF_RAMP` and `BANK` refused.
  6. Reconstructed (backfilled), credited.
  7. Orphaned.

## 11. Out of scope

Settlement Manifests, Audit Export, rules editing, sources and health pages, contracts and hub
settings for configuration (a), four-eyes review, team management, PDF passports, live updates
(views refresh on navigation and on an explicit Refresh), dark mode, mobile-specific layouts.

## 12. Deliverable

High-fidelity screens for: sign-in (default + no wallet + refused), Payments (results + unmatched
hash), payment page for payments 1, 3, 4 and 5 above with the decide and issue rails, Inbox (cases +
failure), Disclosures. Plus a component sheet of tags, the error block, the checks band row and the
timeline entry.
