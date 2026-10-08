# Proposal

## Why

Deflow has been repositioned as an evidence layer for stablecoin deposits. The uncommitted README already carries the new copy. The landing page at `/` still tells the old story: a processor's checkout, three outcomes, and "per payment" proofs. A finished brand design now exists as a Claude Design export (`Deflow Landing.html`), with its own tokens, typeface, logo, and a two-paths diagram. The landing page should adopt it, so that the public front door matches the README and the processor-decision contracts (`HELD`, `RETURNED`, per-payer deposit accounts).

## What Changes

- Rebuild `/` from the design export as a native Next.js page. The export's runtime is not used: no React UMD, no in-browser Babel, no design-system bundle, and no Tweaks panel.
- Adopt the Deflow brand system on the landing page only. This means Schibsted Grotesk, blue `#0072CE`, the ink scale, status colours, bordered cards, and the `deflow.` logo. The tokens are scoped to the landing page and do not reach the dashboard, checkout, or approval routes.
- New content, taken from the design and the README:
  - The hero: "A proof for every deposit and every withdrawal", plus the evidence-layer lead and an audience line.
  - The two-paths diagram (money path and evidence path), with four outcomes: credit to your pool, hold, freeze, and return to payer.
  - A configuration radio, "Without contracts" and "With contracts". The diagram follows the selected configuration, and "With contracts" is the default.
  - The evidence pack: the three proofs. The Payment Passport is now scoped "per deposit".
  - Sections below the fold: Problem (Today and With Deflow), Why Deflow, How it works (who decides, quiet freezes), and What Deflow does not claim.
- The header shows the logo, anchor navigation to the sections, and "Beta" as a link to `/gateways`.
- The waitlist call to action stays. It is still gated on `NEXT_PUBLIC_WAITLIST_URL` and now sits under the hero lead.
- **BREAKING** (spec): the landing page no longer fits a single screen. It scrolls vertically. At 390px it still has no horizontal page scroll; the diagram scrolls inside its own container.
- **BREAKING** (spec): the "dashboard design system only" rule is replaced by a scoped brand-system rule.
- Remove `Deflow Landing.html` from the repository root once the page is built.

Out of scope:

- Moving the dashboard, checkout, or approval pages to the Deflow brand system. That is a separate, later change.
- Renaming the root layout metadata ("ComplianceGateway").
- Licensed brand font files. The Google Fonts substitute is used, as in the export.
- An SVG logo. The export's PNG is used.
- The three unused diagram variants (pipeline, ledger, passport).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `landing`: the core message, the flow, the proof scopes, and the configurations are rewritten. The single-screen requirement is replaced by a scrolling layout with no horizontal page scroll. The dashboard-design-system requirement is replaced by a scoped Deflow brand system. The Beta, waitlist, no-auth, and served-at-root requirements keep their behaviour. New requirements cover the Problem, Why, How, and Not-claims sections, and the configuration-driven diagram.

## Impact

- `frontend/app/page.tsx` is rewritten.
- New landing-only files under `frontend/app/` or `frontend/components/`: the diagram and configuration client component, and the scoped stylesheet.
- New `frontend/public/deflow-logo.png`. This is the first file in `public/`.
- New dependency `lucide-react` for the icons.
- New font: Schibsted Grotesk through `next/font/google`, loaded only by the landing page.
- `frontend/DESIGN.md` gets a note that the landing page uses the Deflow brand system.
- The untracked `Deflow Landing.html` is deleted (or moved to `research/`).
- No change to contracts, backend, relay, workflow, or the dashboard routes.
