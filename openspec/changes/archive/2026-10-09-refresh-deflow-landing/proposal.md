# Proposal

## Why

A new revision of the Deflow landing design (`Deflow Landing.html`) replaces the first one. It leads with a Payment Passport card instead of the configuration diagram, adds a manifest band, a "Keys and funds stay with you" section, and a pilot offer. It drops the configuration radio and the Problem, Why, and Not-claims sections. The page at `/` should match it.

## What Changes

- Hero: the same headline, lead, and audience line, now with "Request a pilot" and "How it works" buttons and an interactive sample Payment Passport card (tilt on hover, copy buttons).
- New sections, in order: Manifest, How it works (static money path and evidence path diagram), Evidence pack (three cards with checklists), Control (four tiles), and Pilot (terms and a request card).
- **BREAKING** (spec): the "Without contracts" and "With contracts" configuration control is removed. The diagram always shows the contract.
- **BREAKING** (spec): Problem, Why Deflow, and What Deflow does not claim are removed. The not-claim statement moves into the Evidence pack intro.
- Header anchors change to How it works, Evidence, Control, and Pilot. Beta stays.
- The design's pilot form (email, company, licence country) is not built, because Deflow does not collect this data. The request card's "Send request" button opens `NEXT_PUBLIC_WAITLIST_URL` in a new tab, and is hidden when the URL is unset.
- `components/landing-flow.tsx` is removed, and `components/landing-passport.tsx` is added.

Out of scope: a pilot backend, real passport data on the card, and dashboard styling.

## Capabilities

### Modified Capabilities

- `landing`: hero, sections, navigation, and waitlist placement change. The configuration requirement and the explanatory-sections requirement are replaced.

## Impact

- `frontend/app/page.tsx` and `frontend/app/landing.module.css` are rewritten.
- No new dependencies. The logo PNG in the export is byte-identical to `frontend/public/deflow-logo.png`.
