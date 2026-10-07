# Proposal

## Why

The project has no OpenSpec specs. Its behavior is spread across code, `README.md`, `relay-spec.md`, and `frontend/SPEC.md`, and these sources sometimes disagree. This change records how the system behaves today as the baseline that future changes will modify. It adds no new behavior.

## What Changes

- Capture the current behavior of every component as specs: contracts, the CRE attestor workflow, the relay, and the frontend (checkout and merchant dashboard).
- Specs describe only what the code on `main` does. Aspirations from the README roadmap and the earlier SPEC documents are left out.
- No code changes.

Known gaps, recorded here so they are not mistaken for specified behavior:

- `main` does not build cleanly. `contracts/remappings.txt` maps `forge-std/` to `.../src/` while tests import `forge-std/src/...`. `attestor-workflow/go.mod` exists only on the `demo` branch.
- The frontend calls `/api/relay/*` on its own origin, but the relay is a separate Next.js app and no rewrite or proxy connects them.
- Level 1 (World ID) cannot be reached end to end because the relay queue does not carry a World ID proof.
- No Sumsub webhook revokes attestations automatically, and the workflow has no `Unrevoke` handler.
- The dashboard's payment lists and its "held in screening" panel use labeled demo data from `frontend/lib/data.ts`. The monitoring liveness banner also uses a fixture (`heartbeatMinutesAgo = 4`), but it is not labeled as demo data.
- The verifiers compute attestation expiry from the enclave's local clock (`time.Now()`), not from `runtime.Now()`.
- The on-chain sanctions oracle is commented out. GoPlus is the only screen on the funds' origin.
- `MerchantGateway` has no reentrancy lock, and `reclaim()` emits no event.

## Capabilities

### New Capabilities

- `merchant-gateway`: Per-merchant escrow contract. It covers the payment policy, `pay()` admission, the per-person spend window, DON settlement, and payer reclaim.
- `attestation-registry`: On-chain registry of verification attestations, nullifier revocations, and the monitoring heartbeat. It holds the fail-closed validity rule.
- `gateway-factory`: Deploys merchant gateways and is the only emitter of the `PaymentOpened` event, which triggers the workflow.
- `verification-relay`: A stateless relay that mints Sumsub WebSDK tokens and queues verification requests for the enclave to drain.
- `identity-verification`: Enclave cron handler. It drains the relay queue, verifies payers with Sumsub (level 2) or World ID (level 1), derives nullifiers, and reports attestations together with the heartbeat.
- `payment-screening`: Enclave log-trigger handler. It scores the payer's funds origin with GoPlus and reports the settle-or-refund verdict.
- `attestation-revocation`: Signed HTTP-trigger handler that revokes a nullifier.
- `checkout`: The payer-facing payment page. It covers the payment link, wallet connection, deciding the payer's next step, the verification wait, approve/pay, and the verdict and reclaim states.
- `merchant-dashboard`: Merchant onboarding with a Privy organization and wallet, gateway deployment and listing, policy changes through a key-quorum approval, and team management.

### Modified Capabilities

None.

## Impact

- Adds `openspec/specs/**` after archive. No code, API, or dependency changes.
- Future changes to contracts, the workflow, the relay, or the frontend write delta specs against these baselines.
