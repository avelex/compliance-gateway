# Tasks

## 1. Configuration

- [x] 1.1 Add `NEXT_PUBLIC_WAITLIST_URL=` with a one-line comment to `frontend/.env.local.example`, and add it to the frontend env list in `frontend/SPEC.md` §10. Verify by grepping both files for the variable.

## 2. Landing page

- [x] 2.1 Replace the redirect in `frontend/app/page.tsx` with a server-rendered landing page. Use the header from the design: the "Deflow" wordmark, plus "Beta" in the top-right corner linking to `/gateways` through the shared `Button` styling. Add route metadata with the Deflow title. Verify that `/` renders without a session and that the page's network requests include no Privy script.
- [x] 2.2 Add the left column: headline, subline, audience line, and the waitlist call to action. The call to action renders only when `NEXT_PUBLIC_WAITLIST_URL` is set and opens it with `target="_blank" rel="noopener noreferrer"`. Verify both states by running the dev server with the variable set and unset.
- [x] 2.3 Add the right column. The flow is a ruled ledger: checkout, contract, checks, processor-signed decision, then credit to the pool (ink square), freeze (blue circle, reads as a check in progress), and refund (hatched square). Also show the custody statement, the three proofs with their scopes, and configurations (a) and (b). Verify against each `landing` spec scenario by reading the rendered page.
- [x] 2.4 Apply the layout constraint: `min-h-dvh` with a fixed-height header, content sized to fit, two columns at `lg`, one column below, and no horizontal overflow. Verify in a browser at 1280×720 (no scrollbars) and at 390×844 (vertical scroll only).
- [x] 2.5 Check the page against the design rules in `frontend/DESIGN.md`: tokens only, no cards, shadows, or `alert`, mono only for compared strings, and `.display` only on the headline. Record any deliberate deviation under "Known inconsistencies". Verify that `grep -n "shadow\|alert\|rounded-" frontend/app/page.tsx` shows no violations.

## 3. Integration checks

- [x] 3.1 Verify the Beta flow end to end. Signed out: "Beta" leads to the dashboard sign-in screen. Signed in with setup done: "Beta" leads to `/gateways`. `/checkout` and `/approve/<id>` are unaffected.
- [x] 3.2 Verify the frontend build and tests: `cd frontend && npm run build && npx vitest run` both succeed.

## Workflow follow-up

- Tick `add-landing-page` in the README roadmap when the change is archived.
