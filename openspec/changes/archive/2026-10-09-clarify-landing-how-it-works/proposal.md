# Proposal

## Why

The How it works copy placed Deflow between the payer and the pool, which contradicts "Deflow holds no funds". It said the contract waits for "the evidence" when it actually waits for the processor's decision. It labelled the decision link "Releases", although hold and freeze release nothing. It also left out the off-ramp, the main recipient of a Payment Passport. Screen readers ignored the diagram's label and read its boxes as loose fragments.

## What Changes

- New intro: each payment waits in your contract while Deflow collects the evidence, and the contract executes only what you signed.
- The contract box reads "Holds the payment until you decide".
- The decision-to-contract link reads "Instructs".
- The recipients are the off-ramp, the bank and the regulator.
- The diagram's scroll box is a named region with a visually hidden text summary of both paths. The drawn diagram is hidden from assistive technology.

Out of scope: the diagram layout on mobile, and the colour of the Freeze outcome.

## Capabilities

### Modified Capabilities

- `landing`: the two-paths flow diagram requirement.

## Impact

- `frontend/app/page.tsx`, `frontend/app/landing.module.css`.
