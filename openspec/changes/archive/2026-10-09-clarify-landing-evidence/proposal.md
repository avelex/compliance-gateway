# Proposal

## Why

The Evidence pack cards used two different words for the same thing: the Payment Passport was scoped "per payment", while the hero promises a proof for "every deposit" and the manifest band says "each deposit". The Passport description named its readers instead of what the document is. The Settlement Manifest used the unfamiliar term "passported payments". The Audit Export described a file format instead of what the auditor gets from it.

## What Changes

- The Payment Passport scope reads "Per deposit". Its description states that it records how one deposit was checked and decided, signed by the processor, and that each recipient sees what its profile allows. "List dates" becomes "list versions".
- Settlement Manifest: "Which checked deposits make up each withdrawal from your pool." The first item reads "Deposits included".
- Audit Export: "Every decision in a period with the rule versions behind it, so your auditor can reproduce the logic."

Out of scope: the section intro, and the "policy" terminology shared with the Control section.

## Capabilities

### Modified Capabilities

- `landing`: the three-proofs requirement (Payment Passport scope).

## Impact

- `frontend/app/page.tsx` (`DOCS`).
