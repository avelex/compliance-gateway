# Tasks

## 1. Publish specimens

- [x] 1.1 Copy `Payment_Passport_Specimen_A_Credited_OffRamp.pdf` and `Payment_Passport_Specimen_B_Frozen_FIU.pdf` from `docs/evidence-pack/` to `frontend/public/evidence/`; verify both load at `/evidence/<file>.pdf` in the dev server.

## 2. Links on the landing page

- [x] 2.1 Add a single `SPECIMENS` constant (label, href) in `frontend/app/page.tsx` and render the two links in the hero under the buttons (`target="_blank"`, `rel="noopener"`, label says PDF and fictional); verify both open in a new tab.
- [x] 2.2 Render the same links inside the Payment Passport card in the Evidence pack section only; verify the Manifest and Audit Export cards have none.
- [ ] 2.3 Add styles in `frontend/app/landing.module.css` using existing tokens; verify no horizontal scroll at 390px and hero buttons plus links visible at 1280x720.

## 3. Verification

- [ ] 3.1 Run `npx tsc --noEmit` in `frontend/` and verify it passes; check keyboard focus and visible labels on the new links.
