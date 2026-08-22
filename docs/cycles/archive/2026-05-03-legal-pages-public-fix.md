# Legal Pages — Supabase Middleware Public Allowlist Fix

## Context

Cycle A (rebrand) merged via PR #166. Post-merge smoke on staging URL `https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/legal/privacy` returned `307 → /` instead of rendering the page. Same redirect on `/legal/terms`.

Root cause: two-layer auth gate. The Cycle A fix added `/legal/` to `proxy.ts` public-routes allowlist, but `proxy.ts` then calls `updateSession(request)` from `lib/supabase/middleware.ts` when `NEXT_PUBLIC_SUPABASE_URL` is set (production scope on Vercel). `updateSession` has its **own** independent public-routes allowlist that does NOT include `/legal/`, so unauthenticated visitors fall through to its `if (!user) redirect("/")` branch.

Manual verification (curl):
```
$ curl -sIL https://.../legal/privacy
HTTP/2 307
location: /
```

Cross-checked design-system.html voice section — no copy change in this cycle.

## Spec

`/legal/terms` and `/legal/privacy` must serve `200 OK` to anonymous visitors so the login footer links function and so the boilerplate can be linked from outside the platform (Resend transactional emails, marketing materials, etc.).

Acceptance:
- `curl -I /legal/terms` → `200`
- `curl -I /legal/privacy` → `200`
- E2E branding spec (`legal pages render and are linked from login`) passes against production build with `NEXT_PUBLIC_SUPABASE_URL` set
- No regression in proxy.ts behavior for authenticated portal routes

## Tasks

1. Add `/legal/` to `lib/supabase/middleware.ts` public-routes allowlist (mirror the proxy.ts fix from Cycle A).
2. End-of-cycle gate + smoke + Verification.

## Implementation

- **Task 1** — `lib/supabase/middleware.ts` line 44: appended `pathname.startsWith("/legal/") ||` to the public-routes condition. Mirror of the same pattern landed in `proxy.ts` during Cycle A (commit `da8a5e5` / merge `11bd098`). No other change.

## Verification

- [x] `npm run build` — clean
- [x] `npx vitest run` — green
- [x] `npx playwright test e2e/branding.spec.ts` — 5/5 pass
- [ ] Staging smoke after merge: `curl -I https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/legal/privacy` returns 200, not 307
- [ ] Same for `/legal/terms`

## Ship Notes

- **Branch:** `feat/legal-pages-public-fix` → staging → main
- **Migrations:** none
- **Env vars:** none (this fix only matters when `NEXT_PUBLIC_SUPABASE_URL` is set, i.e. staging + prod)
- **Rollback:** Vercel "Promote previous deployment" — legal pages would 307 again but no other regression
- **Out of scope:** the two-layer auth allowlist duplication (proxy.ts + lib/supabase/middleware.ts) is a code smell — defer consolidation to Cycle B (Production Infrastructure) where security headers + rate-limit audit lives
