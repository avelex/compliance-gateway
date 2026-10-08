# Design

## Context

- `frontend/app/page.tsx` is a server-rendered landing page in the dashboard system: Archivo, `#1750F0`, the `@theme` tokens in `app/globals.css`, and the shared `Button` from `components/ui.tsx`. Privy is mounted per route group, so `/` is Privy-free by default. That stays true.
- `Deflow Landing.html` at the repository root is a bundled Claude Design export. Unpacked, it contains:
  - an HTML template with the Deflow token sheets (colour, type, spacing) and about 150 lines of page CSS;
  - an inline JSX `App`, plus `FLOW_VARIANTS`, which has four diagram variants; only `twopaths` is used;
  - a `DeflowDesignSystem` bundle. The landing page uses only `Icon`, a lucide 0.469 wrapper with stroke width 1.5, and `Tag`;
  - an 830×210 logo PNG and Google Fonts woff2 subsets of Schibsted Grotesk and IBM Plex Mono;
  - vendor React 18 UMD, Babel standalone, lucide UMD, and the Tweaks panel. None of these are needed.
- The export's CSS uses global selectors (`:root`, `body`, `a`, `*`). Imported as is, they would restyle the dashboard.
- `app/layout.tsx` already loads IBM Plex Mono (400, 500) as `--font-plex-mono` on `<html>`.
- `frontend/ds-bundle/` and `frontend/dist/` are empty, untracked directories. They are not used here.

## Goals / Non-Goals

**Goals:**
- Port the export's rendered page faithfully: the same copy, layout, and CSS values.
- The only client JavaScript is the configuration control and the diagram.
- Make leakage into other routes impossible by construction, not by convention.

**Non-Goals:**
- No shared Deflow component library. `Tag`, `Icon`, and the rest are not ported as reusable components. The future dashboard migration will define them.
- No visual regression tooling.

## Decisions

**Scoped styles in one CSS Module, `app/landing.module.css`.**
- The Deflow tokens (`--blue-*`, `--ink-*`, the status colours, type, spacing, radius) are declared on the module's root class, not on `:root`.
- The page CSS from the export is ported with its class names. `body`/`html` rules move to the root class, and `a` becomes `.root a`.
- CSS Modules hash class names and reject impure selectors such as `:root` and `body`. If the stylesheet stays mounted after client-side navigation to `/gateways`, nothing in the dashboard can match it.
- Alternative: a plain global stylesheet with every selector prefixed `.df`. Rejected, because one unprefixed selector added later leaks silently.
- Alternative: a rewrite in Tailwind utilities. Rejected, because it means about 150 hand-translated rules, and new `@theme` tokens would be global.

**Fonts through `next/font/google` in `page.tsx`.**
`Schibsted_Grotesk` (a variable font, latin subset) is exposed as a CSS variable on the landing root element. The module sets `--font-sans` from it, and `--font-mono` from the existing `--font-plex-mono`. No woff2 files from the export are committed.
- Alternative: copy the export's woff2 files into `public/`. Rejected, because `next/font` self-hosts the same Google files and handles preload.

**Split: `page.tsx` is a server component, and `components/landing-flow.tsx` is a client component.**
- `page.tsx` holds the static copy (hero, evidence pack, Problem, Why, How, Not) and the header and footer.
- `landing-flow.tsx` owns the one piece of state, the selected configuration, which defaults to "with". It renders the two-paths diagram and the configuration control, in that order, because both read that state.
- The file is flat under `components/`, as every existing component is.
- The three unused diagram variants are not ported.

**Configuration control from native radio inputs.**
- The export uses `<button role="radio">` without arrow-key handling.
- Visually hidden `<input type="radio" name="config">` elements inside `<label>`s give the radio-group keyboard model, the checked state, and form semantics for free.
- The export's `.opt` and `.rd` styling is applied to the label, with `:has(:checked)` and `:has(:focus-visible)` for the selected and focus looks.

**Icons from `lucide-react@0.469.0`, pinned exactly.**
- This is the version the export bundles, so icon names and glyphs match: `FileCheck2`, `Undo2`, `IdCard`, and so on.
- Its peer range includes React 19.
- Each icon is imported by name with `strokeWidth={1.5}`, and gets `aria-hidden` because every icon sits beside a text label.
- Alternative: inline SVG copies of 16 icons. Rejected, because they are hand-maintained path data.

**Logo through `next/image` from `public/deflow-logo.png`.**
The PNG is extracted from the export unchanged. It renders at 22px tall in the header and 18px in the footer, and at 30px in the diagram's bracket, with `alt="Deflow"`.

**Beta and the waitlist are plain links in Deflow styling, not the shared `Button`.**
- `Button` carries dashboard tokens (`bg-blue` is `#1750F0`).
- Beta is a `next/link` to `/gateways` with the export's `Tag` look: 24px tall, a bordered pill, 12px/500.
- The waitlist is an anchor styled as a Deflow primary button (`--accent` fill). It has `target="_blank" rel="noopener noreferrer"` and renders only when `NEXT_PUBLIC_WAITLIST_URL` is set, as it does today.

**Layout follows the export's "twopaths" arrangement.**
- **Fold:** `min-height: calc(100vh - 65px)`. The `.top.wide` hero has the headline and lead side by side, then the diagram, then the configuration control, then the evidence pack.
- **Below the fold:** `.sec` sections with `id`s `problem`, `why`, `how`, and `not`. The evidence pack keeps `id="evidence"`.
- **How it works and Not-claims:** both use the export's `Points` pattern (two and four columns). Not-claims uses the ink top rule (`.pt.k`).
- **Diagram container:** `.tp-scroll` gets `tabIndex={0}`, `aria-label`, and the existing `data-scroll-region` attribute, so the min-width 1040px diagram scrolls inside itself and can be reached by keyboard. The rest of the page collapses to one column at 1000px, as the export does.

**Dashboard rules do not apply to this page.**
The Deflow system has bordered cards and colours its outcomes: credit green, hold ink, freeze red, return amber. That is intended under the Deflow brand system. `frontend/DESIGN.md` gets one line under "Known inconsistencies" that says the landing page follows the Deflow brand system, and that the dashboard rules do not apply to it.

**No new unit tests.**
The only logic is one `useState` toggle. Each spec scenario is verified in a browser, and the existing `npm run build` and vitest run must pass.

## Risks / Trade-offs

- [Global rules in `globals.css` still apply under the landing root: Tailwind preflight, `:focus-visible` outline, `::selection`, `table` collapse.] → Preflight matches the export's own reset. The module overrides `:focus-visible` with the export's box-shadow ring inside the root class. The rest is compatible.
- [The fold exceeds 720px if the hero lead wraps to more lines.] → The spec requires only the hero and the diagram above the fold at 1280×720, not the evidence pack. Check this in the browser. If it overflows, reduce the gaps first, not the type.
- [The export's fonts are labelled "substitutes — replace with licensed brand files".] → `--font-sans` stays a single variable, so swapping in licensed files later touches one declaration.
- [Playwright's Chrome is not installed on this machine.] → Either run `npx playwright install chrome` before verification, or verify manually in a browser at the listed viewports.
- [The red freeze could be read as an error by readers who know the dashboard's "alert" rule.] → This is accepted, because the brand system defines it. The labels carry the meaning, not colour alone.

## Migration Plan

This is a frontend-only deploy. To roll back, revert the commit. `/` returns to the previous landing page, and no data or other routes are involved.
