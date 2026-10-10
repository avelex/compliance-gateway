# Spec Delta

## Purpose

The processor staff's browser console for configuration (b): find a deposit, see how it was checked and decided, sign officer decisions in the officer's own wallet, and issue recipient copies of its Payment Passport with every disclosure on record.

## ADDED Requirements

### Requirement: Console is separate from the merchant dashboard
The console SHALL be served under `/console`. It SHALL NOT load Privy and SHALL NOT share navigation, session or data with the legacy merchant dashboard. One console deployment SHALL talk to exactly one processor's compliance backend. A build made without a backend SHALL show that the console is not configured and SHALL NOT proxy any request.

#### Scenario: Opening the console
- **WHEN** a visitor opens `/console`
- **THEN** the page loads without the Privy SDK, and no merchant-dashboard link appears in its navigation

#### Scenario: Build without a backend
- **WHEN** a visitor opens `/console` on a build made without a backend URL, such as the public landing
- **THEN** the page says the console is not configured and offers no sign-in

### Requirement: Sign-in with the staff wallet
The console SHALL require sign-in with Ethereum through the visitor's browser wallet before showing any payment data. The wallet SHALL sign the message the backend issues, unchanged. An address outside the officer and MLRO sets SHALL be refused with a message that names the address.

#### Scenario: Officer signs in
- **WHEN** an address configured as an officer signs the sign-in message
- **THEN** the console opens on Payments and the header shows the address and its officer id

#### Scenario: Unknown address
- **WHEN** an address that is neither an officer nor an MLRO signs the sign-in message
- **THEN** the console stays on the sign-in screen and says that this address is not authorised for this processor

#### Scenario: No browser wallet
- **WHEN** the browser exposes no Ethereum wallet
- **THEN** the sign-in screen says a wallet is required and offers no other way in

### Requirement: Signed-in role is visible
The console header SHALL show the signed-in address, its officer id when it is an officer, the decision kinds its mask permits, and whether it is an MLRO. The console SHALL offer sign-out.

#### Scenario: MLRO who is not an officer
- **WHEN** an address that is only in the MLRO set signs in
- **THEN** the header marks it as MLRO and shows that it may sign no decision kinds

#### Scenario: Sign-out
- **WHEN** the user signs out
- **THEN** the session ends and any console page shows the sign-in screen again

### Requirement: Payment search
The Payments view SHALL search by transaction hash or payment reference, by payer or deposit address, by amount in token units, and by a block-time date range. Results SHALL show time, amount and token, payer, deposit address, ingest status, stage, the last decision and a reconstruction mark, newest first. All times SHALL be shown in UTC, and date-range fields SHALL be read as UTC days with both ends inclusive.

#### Scenario: Search by transaction hash
- **WHEN** the user enters the hash of a transaction that deposited to a processor address
- **THEN** the matching payment is listed, and selecting it opens its payment page

#### Scenario: Search by payer and dates
- **WHEN** the user enters a payer address and a date range
- **THEN** only that payer's payments with block time inside the range are listed

#### Scenario: Frozen filter
- **WHEN** the user turns on the frozen filter
- **THEN** only payments whose last decision is FREEZE are listed

#### Scenario: Date range in UTC
- **WHEN** the user searches from 3 March to 3 March and a payment has block time 2026-03-03 23:30 UTC
- **THEN** that payment is listed with its time shown as `2026-03-03 23:30 UTC`, whatever the browser's time zone

### Requirement: Unmatched hash states what was searched
When a hash matches no payment, the console SHALL say that no payment is recorded for it, name the chains and tokens for which deposits to the processor's addresses are recorded, name any chain whose ingest is behind, and say that Settlement Manifests for withdrawals are not available yet. It SHALL NOT claim that the transaction contains no deposit, and SHALL NOT suggest the transaction is unknown to the chain or clean.

#### Scenario: Off-ramp asks about a withdrawal
- **WHEN** the user searches for the hash of a withdrawal from the processor to an off-ramp
- **THEN** the console says no payment is recorded for that hash, lists the chains and tokens it records deposits for, and says Settlement Manifests are not available yet

#### Scenario: Ingest is behind
- **WHEN** the user searches for a hash that matches no payment while a configured chain's ingest is behind its head
- **THEN** the console names that chain as behind, so a recent deposit may not be recorded yet

### Requirement: Payment page shows how the payment was checked and decided
The payment page SHALL show the on-chain facts, every check with its provider, product, outcome and list versions, the recommendation with its ruleset version and rule, every decision with its mode and author, the pack versions and the disclosures of this payment. A check with outcome `UNAVAILABLE` SHALL be shown as unavailable.

#### Scenario: Automatic decision
- **WHEN** the payment was credited by a rule with `auto: true`
- **THEN** the decision shows mode `AUTO_BY_POLICY`, the policy key as signer and the rule's `policy_ref`

#### Scenario: Unavailable check
- **WHEN** the KYT check timed out
- **THEN** the KYT row shows `UNAVAILABLE`, not an empty or passing result

### Requirement: Payment page shows its timeline
The payment page SHALL show a timeline ordered by time: first seen, block time, each check, the recommendation, each decision, each pack version and each projection issued.

#### Scenario: Officer freeze after automatic hold
- **WHEN** a payment was held automatically and later frozen by an officer
- **THEN** the timeline lists the automatic HOLD before the officer's FREEZE, each with its time and author

### Requirement: Missing passport is explained
Whether the issue action is offered SHALL depend on whether the payment has a pack, not on its stage. A payment without a pack SHALL show why instead of an issue action: checks still running (`checks_pending`), waiting for an officer (`in_review`), or not on the canonical chain (`orphaned`).

#### Scenario: Payment in review without a pack
- **WHEN** the user opens a payment in stage `in_review` that has no pack
- **THEN** the page says the passport is issued after an officer decides and links to its case in the Inbox

#### Scenario: Payment held automatically
- **WHEN** the user opens a payment in stage `in_review` whose automatic HOLD issued a pack
- **THEN** the issue action is offered, with a note that the case is open and the copy shows decision HOLD

#### Scenario: Orphaned payment
- **WHEN** the user opens an orphaned payment
- **THEN** the page says the transfer is not on the canonical chain and will get no decision and no passport

### Requirement: Reconstructed payments are marked
A payment whose pack was produced by a retro backfill SHALL carry a visible reconstruction mark in the list and on its payment page.

#### Scenario: Backfilled deposit
- **WHEN** the user opens a payment ingested by a 90-day backfill
- **THEN** the page marks it as reconstructed after the fact

### Requirement: Inbox lists open cases
The Inbox SHALL list payments waiting for an officer, oldest block time first, with amount, payer, recommendation, reason codes and last decision. Its navigation entry SHALL show the number of open cases.

#### Scenario: New case
- **WHEN** a payment's recommendation opens an officer case
- **THEN** it appears in the Inbox and the count increases by one

### Requirement: Decision is offered by payment state
The payment page SHALL offer a decision for any payment that has a pack, is not orphaned and whose status is neither CREDITED nor RETURNED, whether or not it is in the Inbox.

#### Scenario: Frozen payment outside the Inbox
- **WHEN** an officer opens a payment whose last decision is FREEZE
- **THEN** a decision is offered although the payment is not in the Inbox

#### Scenario: Final payment
- **WHEN** an officer opens a credited or returned payment
- **THEN** no decision is offered

### Requirement: Officer signs a decision in their own wallet
The console SHALL offer only decision kinds that the officer's mask permits and that the freeze rule allows. It SHALL require a rationale, fetch the typed data for the chosen kind, switch the wallet to the payment's chain when needed and ask the wallet to sign the typed data unchanged. It SHALL never handle the officer's key.

#### Scenario: Frozen payment
- **WHEN** an officer with mask 15 opens a payment whose last decision is FREEZE
- **THEN** only CREDIT and FREEZE are offered

#### Scenario: Wallet on another chain
- **WHEN** the officer signs a decision for a payment on chain 8453 while the wallet is on chain 1
- **THEN** the console asks the wallet to switch to chain 8453 before signing, and if the wallet does not know that chain, says to add chain 8453 to the wallet

#### Scenario: Mask without RETURN
- **WHEN** an officer whose mask lacks RETURN opens a case
- **THEN** RETURN is not offered

#### Scenario: Decision recorded
- **WHEN** the officer signs a FREEZE with a rationale
- **THEN** the console shows the new pack version and the payment leaves the Inbox

#### Scenario: Typed data went stale
- **WHEN** another decision was recorded after the typed data was fetched
- **THEN** the console shows the backend's conflict and asks the officer to review the payment again before signing

### Requirement: Issue a recipient copy
The payment page SHALL issue a projection of the latest pack for a chosen profile with a required recipient and purpose. Any signed-in staff member, officer or MLRO, SHALL be able to issue it. The downloaded file SHALL be the exact bytes the backend returned, so `verify_pack.py` accepts it. The new disclosure SHALL appear on the page.

#### Scenario: Off-ramp copy
- **WHEN** the user issues an `OFF_RAMP` copy for "Example Exchange" with purpose "source of funds RFI"
- **THEN** a JSON file downloads, `verify_pack.py` verifies it, and the disclosure is listed with the user's address as issuer

#### Scenario: Missing purpose
- **WHEN** the user tries to issue a copy without a purpose
- **THEN** the console does not send the request and asks for the purpose

### Requirement: Refused profiles are not offered
The console SHALL NOT offer a profile that the backend reports it would refuse for the payment's latest pack, and SHALL show the backend's reason in its place. The console SHALL NOT keep its own copy of the refusal rule. If the backend refuses a projection, the console SHALL show the refusal.

#### Scenario: Off-ramp RFI on a frozen payment
- **WHEN** the user opens the issue action on a frozen payment
- **THEN** only `MASTER`, `FIU_SUPERVISOR` and `AUDITOR` are offered, with a note that off-ramp and bank requests go to the MLRO

#### Scenario: Officer hold on a sanctions match
- **WHEN** the user opens the issue action on a payment whose sanctions result is TRUE_MATCH and whose latest decision is an officer's HOLD
- **THEN** `OFF_RAMP` and `BANK` are not offered, with the backend's reason

### Requirement: Disclosures log
The Disclosures view SHALL list every projection issued, newest first, with time, payment, pack version, profile, recipient, purpose, projection hash and issuer.

#### Scenario: Copy issued through the API token
- **WHEN** a projection was issued by a service caller with the bearer token
- **THEN** the log shows the issuer as the API token, not as a person

### Requirement: Console never presents a payment as clean
The console SHALL NOT label any payment, check or decision as clean, safe or verified-legitimate. It SHALL state the checks that ran, the outcomes, the ruleset and who decided.

#### Scenario: Credited payment
- **WHEN** the user opens a credited payment with all checks passing
- **THEN** the page shows the decision CREDIT and the check outcomes, with no clean or safe verdict

### Requirement: Backend failure is visible
When the backend cannot be reached or returns an error, the console SHALL say so on the affected view. It SHALL NOT show an empty list, an empty inbox or a zero count in place of the failure.

#### Scenario: Backend down
- **WHEN** the backend does not respond while the Inbox loads
- **THEN** the Inbox shows that cases could not be loaded, and the navigation count is not shown as zero
