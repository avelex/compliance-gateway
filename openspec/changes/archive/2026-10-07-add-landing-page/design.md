# Design

## Context

- `frontend/app/page.tsx` currently only calls `redirect("/gateways")`.
- Privy is mounted per route group: `app/(dashboard)/layout.tsx` and `app/approve/[id]/page.tsx` wrap their content in `Providers` and `LoginGate`. The root `app/layout.tsx` carries only fonts and `globals.css`. A page at `/` is therefore Privy-free by default, the same way `/checkout` is.
- The design system lives in `frontend/DESIGN.md` ("The Ledger Page"), the `@theme` tokens in `app/globals.css`, and the shared components in `components/ui.tsx` (`Button` and others).
- The source content is the Russian one-pager. The app UI is in English.

## Goals / Non-Goals

**Goals:**
- One static screen at `/` that renders on the server, needs no client JavaScript beyond Next's defaults, and fits 1280×720 without scrolling.
- Reuse tokens and components. Introduce no new visual vocabulary.

**Non-Goals:**
- No analytics, no forms, and no server routes.
- No dashboard rebrand. The wordmark inside the dashboard stays "ComplianceGateway".

## Decisions

**Server component at `app/page.tsx`, outside the `(dashboard)` group.**
This keeps Privy off the page with no extra work. It needs no `"use client"`, because the Beta and waitlist controls are plain links.
- Alternative: a new `(marketing)` route group with its own layout. Rejected, because a group with one page is not worth a separate layout.

**"Beta" is a link to `/gateways`, not a login button.**
`LoginGate` already handles both signed-out and signed-in visitors, so the landing page does not need to know about auth state.
- Alternative: call Privy `login()` from the landing page. Rejected, because it would pull Privy onto the page and duplicate the gate.

**Waitlist URL from `NEXT_PUBLIC_WAITLIST_URL`, read at build or render time.**
The call to action is hidden when the URL is empty, so the page never shows a link to nowhere. The link uses `target="_blank" rel="noopener noreferrer"`.

**English copy adapted from the one-pager, with the brand "Deflow" on the landing page.**
- The landing page uses the README and one-pager name.
- The `<title>` for `/` is set through route metadata. The dashboard's "ComplianceGateway" metadata is left alone.
- Excluded copy: TAM/SAM/SOM, pricing, and pilot terms, which the one-pager itself labels as hypotheses.

**Layout: header row and a two-column body at `lg` and above.**
- Header: wordmark on the left, Beta on the right. It uses a paper background with a hairline bottom rule, not the dashboard's ink bar, so the page keeps a single blue action.
- Left column: headline, subline, audience, and the waitlist call to action.
- Right column: the flow as a ruled ledger on the 2px ink spine, then the three proofs and the two configurations as lists divided by hairlines.
- The page uses `min-h-dvh` and content sized to fit 1280×720 and 1024×768. There is no `overflow-hidden`, because clipping would hide content on short viewports instead of letting it scroll. Below `lg`, the columns stack and normal scrolling applies.
- Outcome marks follow the Three Forms Rule. Credit to the pool is an ink square. Freeze is a blue circle, because on chain a freeze reads as a check in progress. Refund is a hatched square.
- Alternative: a horizontal flow strip that copies the one-pager's boxes. Rejected, because boxes are cards, which the No-Card Rule forbids.
- `Button` gains an `external` prop so the waitlist link stays on the shared component instead of a hand-styled anchor.

**The landing page has no tests of its own.**
It holds no logic. Verify it by viewing it at 1280×720 and at 390px. The existing vitest suite must still pass.

## Risks / Trade-offs

- [Copy does not fit 1280×720 at 14px body.] → Content is trimmed before type is shrunk. The proofs and configurations are kept to one line each, with the detail left in the one-pager.
- [The one-pager describes configuration (a) as processor-signed, but the shipped beta is DON-signed.] → The landing page describes the target model, and "Beta" is the honest label for the gap. This is consistent with the roadmap's `processor-decision-contracts`.
- [Bookmarks of `/` change destination.] → "Beta" is one click away. No redirect shim is needed.
