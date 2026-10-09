# Proposal

## Why

An impeccable critique of the landing page found that the three "Request a pilot" buttons led to a card with no action whenever `NEXT_PUBLIC_WAITLIST_URL` was unset. It also found copy that contradicted PRODUCT.md: the pilot stages, who signs a decision, "checks passed", and "anyone can verify". The sample passport in the hero also read as a real record.

## What Changes

- The pilot request accepts a mailto fallback through the new `NEXT_PUBLIC_PILOT_EMAIL`. The external form still takes precedence. With neither variable set, the header and hero "Request a pilot" buttons and the request card are not rendered.
- The request card says that an NDA and a DPA are signed before any payment data is shared.
- The pilot copy follows PRODUCT.md's stages: a 90-day retro Settlement Manifest, then shadow mode answering 2–3 real RFIs.
- Wording fixes:
  - Decisions are signed by the officer or by the policy key under MLRO-approved rules.
  - The Evidence pack records which checks "ran", not "passed".
  - A passport is verifiable by "its recipient", not "anyone".
- A caption labels the hero passport as a sample with illustrative names, addresses and hashes.
- Polish: no tabular figures in the hero amount and the pilot stats, empty alt on the repeated logos, `aria-label` on the header nav, and no CSS resizing of `next/image` logos.

Out of scope: section structure (final), the mobile diagram layout, and hero card motion and touch-target hardening.

## Capabilities

### Modified Capabilities

- `landing`: the core message and the pilot request link change.

## Impact

- `frontend/app/page.tsx`, `frontend/app/landing.module.css`, `frontend/components/landing-passport.tsx`, `frontend/.env.local.example`.
