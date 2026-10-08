# Tasks

## 1. Assets and dependencies

- [x] 1.1 Extract the logo PNG from `Deflow Landing.html` into `frontend/public/deflow-logo.png`. The logo is manifest entry `f7e0c8fd-…`, raw base64 and not compressed. Verify with `file frontend/public/deflow-logo.png`, which should report PNG 830×210.
- [x] 1.2 Add `lucide-react` pinned to exactly `0.469.0` in `frontend/package.json`. Verify that `npm install` completes with no peer-dependency warnings, and that `FileCheck2`, `Undo2`, `IdCard`, `LockOpen`, and `Landmark` resolve with `node -e "const l=require('lucide-react');console.log(['FileCheck2','Undo2','IdCard','LockOpen','Landmark'].every(n=>l[n]))"`, which should print `true`.

## 2. Scoped stylesheet

- [x] 2.1 Create `frontend/app/landing.module.css`. Port the Deflow token sheets (colour, type, spacing) onto a `.root` class, and port the export's page CSS (`.wrap`, `.hdr`, `.fold`, `.top`, `.hero`, `.cfg`/`.opt`, `.pack`/`.doc`, `.sec`, `.cmp`, `.cols`/`.pt`, `.tp-*`, `.ftr`, and the two media queries). Remove the unused rules: `.ph`, `.flag`, `.fv`/`.fpl`/`.fld`/`.fpp`, and `.fouts`. Move `html`/`body` rules onto `.root`, and scope `a` and `:focus-visible` under `.root`. Set `--font-sans` from the Schibsted variable and `--font-mono` from `--font-plex-mono`. Verify that `grep -nE '^\s*(:root|html|body|a|\*)\b' frontend/app/landing.module.css` prints nothing, and that `npm run build` accepts the module.
- [x] 2.2 Restyle the configuration options for native radios. Each label carries the `.opt` look. The input is visually hidden but focusable. Use `.opt:has(:checked)` for the selected state and `.opt:has(:focus-visible)` for the focus ring. Verify in task 3.3.

## 3. Diagram and configuration (client component)

- [x] 3.1 Create `frontend/components/landing-flow.tsx` with `"use client"`. Configuration state defaults to `"with"`. Port the two-paths diagram (`FlowTwoPaths`) with lucide icons at `strokeWidth={1.5}` and `aria-hidden`. Port the `.off` state: "No contract", "Funds move as they do today", inactive outcomes, and no "Releases" link. Use the logo in the bracket. Verify by reading the rendered page against the "Two-paths flow diagram" and "Flow outcomes visible" scenarios.
- [x] 3.2 Wrap the diagram in the `.tp-scroll` container with `tabIndex={0}`, `aria-label="How Deflow works"`, and `data-scroll-region`. Verify at 390px width that `document.documentElement.scrollWidth === innerWidth`, that the diagram scrolls inside its container, and that Tab reaches the container.
- [x] 3.3 Below the diagram, add the configuration control with the export's `CFG` copy and the heading "Pick a configuration". It uses native `<input type="radio" name="config">` inside labels. Verify that clicking and the arrow keys both switch the diagram, that the focus ring is visible, and that the checked option is announced as checked (the input is a native radio).

## 4. Landing page

- [x] 4.1 Rewrite `frontend/app/page.tsx` as a server component. Load `Schibsted_Grotesk` through `next/font/google` (latin, CSS variable) on the `.root` element. Add route metadata with title "Deflow — A proof for every deposit and every withdrawal". Verify that `/` renders with no session, and that network requests include no Privy script.
- [x] 4.2 Add the header:
  - the `next/image` logo (22px tall, `alt="Deflow"`);
  - anchor links to `#problem`, `#why`, `#how`, and `#evidence`, hidden below 1000px;
  - Beta as a `next/link` to `/gateways` in the `Tag` look.

  Verify that every anchor scrolls to an existing section, and that at 390px the logo and Beta are visible.
- [x] 4.3 Add the fold:
  - the hero: headline, the evidence-layer lead, and an audience line naming processors, exchanges, off-ramps and custodians;
  - the waitlist anchor, rendered only when `NEXT_PUBLIC_WAITLIST_URL` is set, with `target="_blank" rel="noopener noreferrer"`;
  - `<LandingFlow/>`;
  - the evidence pack, with Payment Passport "per deposit", Settlement Manifest "per withdrawal", and Audit Export "per period".

  Verify with the dev server, with the variable set and unset. Also verify that the hero and the diagram are visible without scrolling at 1280×720.
- [x] 4.4 Add the sections below the fold, in this order:
  - Problem (`#problem`, the four-row Today and With Deflow table);
  - Why Deflow (`#why`, three numbered points);
  - How it works (`#how`, "Who decides" and "Quiet freezes");
  - What Deflow does not claim (`#not`, four points with the ink top rule);
  - the footer, with the 18px logo and "Evidence layer for stablecoin deposits".

  Copy comes from the export's `PROBLEM`, `WHY`, `HOW`, and `NOT` arrays. Verify against the "Explanatory sections" scenarios, and check that the custody statement ("Deflow never holds funds or signs transactions") is present.
- [x] 4.5 In `frontend/DESIGN.md` under "Known inconsistencies", replace the landing-page bullet with one line. It should say that `/` follows the Deflow brand system (`app/landing.module.css`), and that the dashboard rules (no cards, no alert red, Archivo) do not apply to it. Verify that `grep -n "landing" frontend/DESIGN.md` shows the new line and no stale 38px `.display` note.

## 5. Integration checks

- [x] 5.1 Check that nothing leaks. Open `/`, click Beta, and reach `/gateways`. Compare the body `font-family` and the blue of a primary button with a direct load of `/gateways`; they must be identical. Spot-check that `/checkout` and `/approve/<id>` look unchanged.
- [ ] 5.2 Check the Beta flow. Signed out, Beta leads to the dashboard sign-in screen. Signed in with setup done, Beta leads to `/gateways`.
- [x] 5.3 Check the build and tests. `cd frontend && npm run build && npx vitest run` must both succeed.
- [x] 5.4 Delete the root `Deflow Landing.html`, or move it to `research/` if it should be kept as a design reference. Verify that `git status` no longer lists it at the root.

## Workflow follow-up

- Add `adopt-deflow-landing` to `ROADMAP.md`, and reword the `add-landing-page` entry's "single-screen ... dashboard design system" description, or note that it was superseded, when this change is archived.
- Archive with `/opsx:archive` after review, so that `openspec/specs/landing/spec.md` picks up the delta.
