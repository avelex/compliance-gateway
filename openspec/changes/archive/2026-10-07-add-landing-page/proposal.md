# Proposal

## Why

The frontend has no public front door: `/` redirects straight into the dashboard's login. Deflow now has a positioning — the October 2026 one-pager — and two configurations to explain, (a) contracts + recommendations + evidence pack and (b) recommendations + evidence pack. Prospects need one screen that says what Deflow does and where to join the waitlist, with the working beta one click away.

## What Changes

- `/` becomes a single-screen landing page instead of a redirect to `/gateways`.
- Content is adapted from the one-pager (`One-pager A4.pdf`): the headline promise, the payment flow from checkout to pool, freeze, or refund, the three proofs (Payment Passport, Settlement Manifest, Audit Export), and the two configurations.
- A "Beta" button in the top-right corner leads into the existing flow: Privy login, then setup, then the dashboard. That flow does not change.
- A waitlist call to action links to an external form. Its URL comes from configuration. No waitlist data is stored by Deflow.
- The page uses the dashboard design system (`frontend/DESIGN.md`, the `globals.css` tokens, and the shared `ui.tsx` components). It adds no new colors, fonts, shadows, or animation.
- **BREAKING** (minor): bookmarks of `/` no longer land in the dashboard. They land on the landing page, and the dashboard is one click away through "Beta".

Out of scope:

- Renaming "ComplianceGateway" to "Deflow" inside the dashboard.
- Market sizing, pricing, and pilot terms from the one-pager. These are internal hypotheses.
- Any backend for the waitlist.

## Capabilities

### New Capabilities

- `landing`: The public entry page. It covers what it communicates, the Beta entry into the dashboard, the external waitlist link, the single-screen layout constraint, and the absence of authentication on the page.

### Modified Capabilities

None. The `merchant-dashboard` requirements stay as they are, because the dashboard routes and the login gate are unchanged.

## Impact

- `frontend/app/page.tsx` (replaces the redirect), possibly new components under `frontend/components/`.
- `frontend/.env.local.example` gains `NEXT_PUBLIC_WAITLIST_URL`.
- No change to contracts, the workflow, the relay, or the dashboard routes.
