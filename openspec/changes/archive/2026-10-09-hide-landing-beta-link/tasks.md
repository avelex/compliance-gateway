# Tasks

## 1. Hide Beta link

- [x] 1.1 Delete the `<Link href="/gateways" className={s.tag}>Beta</Link>` line in `frontend/app/page.tsx` header; verify `grep -rn "Beta" frontend/app` returns nothing and the page renders with logo, nav, and "Request a pilot".
- [x] 1.2 Delete the unused `.tag` rules in `frontend/app/landing.module.css`; verify `grep -rn "s.tag\|\.tag" frontend/app` returns nothing.
- [x] 1.3 Run the frontend build/typecheck and verify it passes; check the header at 1280px and 390px for no overflow or gap.
