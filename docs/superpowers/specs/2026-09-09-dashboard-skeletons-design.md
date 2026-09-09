# Dashboard Skeletons & Instant Loading Design

## Purpose
The dashboard currently suffers from slow tab transitions due to Next.js App Router blocking route changes until the target chunk is loaded. Additionally, pages use plain text (e.g., "Loading...") for data-fetching states, which causes jarring UI shifts. The goal is to provide instant page transitions and a seamless, modern loading experience using `loading.tsx` files and skeleton UI components.

## Architecture & Components

### 1. `DashboardSkeleton` Component
- **Location:** `frontend/components/dashboard-skeleton.tsx`
- **Purpose:** A reusable UI component that visually represents loading content.
- **Implementation:** Will use a wrapper with a few rectangular div blocks using Tailwind classes like `animate-pulse`, `bg-rule` (or another appropriate subtle background color from the existing design system), `rounded-md`, and varying widths to simulate lines of text or table rows.

### 2. Next.js Route Loaders (`loading.tsx`)
We will create four `loading.tsx` files inside the dashboard app directory to enable instant route transitions:
- `frontend/app/(dashboard)/gateways/loading.tsx`
- `frontend/app/(dashboard)/payments/loading.tsx`
- `frontend/app/(dashboard)/team/loading.tsx`
- `frontend/app/(dashboard)/wallet/loading.tsx`

Each `loading.tsx` will:
1. Render the static layout of the page (the `<h1>` title and the subtitle `<p>`).
2. Render `<DashboardSkeleton />` immediately below it.

*Result:* Clicking a tab instantly paints the page title while the client downloads the Next.js page chunk.

### 3. Inline Client Data Fetching States
Once the page chunk loads, client components fetch their data (e.g. via `useEffect` and `multicall`). We will replace the existing text-based fallback states with skeleton components so the transition from the route loader to the client data loader is imperceptible.

**Updates:**
- **`gateways/page.tsx`:** Replace the `rows === null` inline loader (`<li className="py-8 text-slate">Loading your gateways…</li>`) with `<DashboardSkeleton />`.
- **`wallet/page.tsx`:** The `balances === null` condition will show a small localized skeleton pulse block instead of the current `…`.
- **`team-panel.tsx`:** Replace the `if (!team)` text fallback (`<p className="mt-9 text-slate">Loading your team…</p>`) with `<DashboardSkeleton />`.
- **`payments/page.tsx`:** Update the `Suspense` fallback from `<p>Loading payments…</p>` to `<DashboardSkeleton />`.

## Constraints & Trade-offs
- **Duplication:** The title and subtitle text for each page must be duplicated between `page.tsx` and `loading.tsx`. This is an accepted trade-off to achieve instant layout painting with the correct context.
- **Server vs Client Fetching:** We intentionally keep the data fetching on the client (via viem/Privy hooks) to avoid complex auth sharing and maintain the security model. Skeletons bridge the visual gap effectively.

## Success Criteria
- Switching between tabs in the dashboard is visually instantaneous.
- No plain text "Loading..." indicators remain on these core pages.
- No layout jumping when transitioning from the Next.js `loading.tsx` state to the client `useEffect` loading state.
