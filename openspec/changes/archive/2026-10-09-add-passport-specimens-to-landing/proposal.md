# Proposal

## Why

The landing page describes the Payment Passport but shows only an illustrative card. Visitors cannot open a real specimen. The two specimen PDFs in `docs/evidence-pack/` (a credited off-ramp copy and a frozen FIU copy) show what a passport looks like in each case.

## What Changes

- Publish both specimen PDFs with the frontend (`frontend/public/evidence/`): Specimen A (credited, OFF_RAMP copy) and Specimen B (frozen, FIU_SUPERVISOR copy, full file including its reporting annex).
- Hero: add two links to the specimens under the "Request a pilot" / "How it works" buttons.
- Evidence pack: add the same two links inside the Payment Passport card.
- Links open the PDFs in a new tab. The group is labelled "Specimens, fictional data:"; the links carry no "PDF" or "new tab" suffix.
- The section structure of the page does not change.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `landing`: new requirement for the specimen links in the hero and in the Payment Passport card.

## Impact

- `frontend/app/page.tsx`, `frontend/app/landing.module.css`, new files in `frontend/public/evidence/`.
- Two PDFs of about 100 KB each are served statically. No API or dependency changes.
- Specimen B is marked FIU-only inside the document. It is published on purpose because all data is fictional and watermarked SPECIMEN (confirmed by the user).
- Out of scope: inline preview images, a PDF viewer, changes to the existing sample card in the hero.
