# Frontend

Static design pass for `FRONTEND_SPEC.md`. Every screen is built with mock data from
`lib/data.ts`; nothing talks to a chain, a wallet or an API yet.

```
npm install
npm run dev      # http://localhost:3100
```

Stop `npm run dev` before `npm run build` — a production build overwrites `.next` underneath
a running dev server and it starts asking for chunks that no longer exist. If that happens:
`rm -rf .next` and start dev again.

## Design system

| | |
|---|---|
| Paper | `#FFFFFF` |
| Ink | `#05070E` — black shifted toward blue |
| Slate | `#5A6478` — secondary text |
| Rule | `#E3E7EF` — hairlines |
| Blue | `#1750F0` — actions, and anything in motion |
| Wash | `#EDF1FF` — tint fills |

Type is Archivo throughout; the `.display` class engages its width axis for headings.
IBM Plex Mono appears **only** on hex strings, where characters are compared by eye.

Three rules the screens follow:

1. **A returned payment is not an error.** The gateway did its job. There is no red anywhere
   in the palette — blue means money in motion, ink means the outcome is fixed, and a diagonal
   hatch means the money went back. Status reads by form, not by alarm colour.
2. **One bold element.** The screening ledger in the checkout is the only loud thing in the
   product. Everything else stays quiet.
3. **Structure from rules and space**, not cards and shadows.

## Screens

| Route | Spec |
|---|---|
| `/checkout` | §3 — requirements before the amount, daily allowance, both waits named, two screening layers, reclaim countdown |
| `/gateways` | §4.1 |
| `/gateways/new` | §4.2 — the same component renders as the empty state of the list |
| `/gateways/[slug]` | §4.3 — payment link and QR, configuration, recent payments |
| `/gateways/[slug]/policy` | §4.4 — the only write screen, with the Privy control panel |
| `/payments` | §4.5 |
| `/attestations` | §4.6 — grouped by nullifier |

## Wiring left to do

Ordered as in `FRONTEND_SPEC.md` §12.

- `lib/data.ts` → viem `getLogs` + `watchContractEvent` from the factory deploy block (§5).
- `components/checkout.tsx` — the `Phase` machine is already the real sequence; replace each
  `setTimeout` with the matching contract call or event subscription.
- `components/wizard.tsx` `deploy()` → `POST /api/deploy` (§2.2).
- `components/policy-form.tsx` `Save changes` → `POST /api/privy/set-policy` (§2.2).
- Route handlers under `app/api/` — none exist yet.
- Gateway names in `localStorage` (§6); routes already key on the address.
