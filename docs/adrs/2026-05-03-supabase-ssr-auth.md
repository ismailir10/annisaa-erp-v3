# ADR — Supabase SSR auth + tenant isolation via app-layer filter, RLS for SELECT only

**Status:** Accepted, 2026-05-03 (codifies decisions made 2026-04-18 → 2026-04-24)
**Cycle origin:** [2026-04-18-fix-google-auth-loop.md](../cycles/archive/2026-04-18-fix-google-auth-loop.md), [2026-04-18-fix-pkce-verifier.md](../cycles/archive/2026-04-18-fix-pkce-verifier.md), [2026-04-24-stress-review-followups.md](../cycles/archive/2026-04-24-stress-review-followups.md)
**Related:** [2026-05-03-role-split-super-admin-school-admin.md](2026-05-03-role-split-super-admin-school-admin.md)

---

## Context

Auth must work across (a) Vercel-hosted production (real Supabase Auth + Google OAuth + Magic Link), (b) staging (real Supabase, demo emails ovverride to admin inbox), and (c) local dev + CI (`DEMO_MODE=true`, no Supabase, cookie-driven role switching for E2E). Tenant isolation must hold for both a write path (admin POSTs to `/api/students`) and a read path (RLS-protected SELECTs from the Supabase JS client when an SSR page reads its own data). Earlier attempts at full RLS coverage hit two friction points: (1) the `service_role` key bypasses RLS for all writes (which we want, because writes need explicit `tenantId` filters), and (2) PKCE verifier cookies consistently dropped between OAuth callback and code exchange when the browser landed on a domain different from the one that started the flow.

## Decision

1. **Auth is Supabase SSR (`@supabase/ssr`)** — middleware (`proxy.ts`) reads the `sb-*` cookie via `createServerClient`, hydrates a session, and exposes a `getSession()` helper at `lib/auth.ts`. No client-side session shuttling.
2. **Tenant isolation = app-layer `where: { tenantId: session.tenantId }` on every Prisma write.** RLS is configured but only on SELECT — its job is to defense-in-depth the read path when the Supabase JS client is used directly (none today, but preserved for future). All writes go through Prisma with the `service_role` connection, which bypasses RLS by design.
3. **CI guard `scripts/verify-rls-coverage.sh`** ensures every `tenantId`-scoped Prisma model has a SELECT policy on its Supabase counterpart.
4. **CI guard `scripts/verify-api-auth.sh`** ensures every `app/api/**/route.ts` either calls `getSession()` or is in the explicit public-route allowlist (e.g. `/api/health`, `/api/csp-report`, OAuth callback).
5. **Demo mode (`DEMO_MODE=true`)** swaps in a cookie-driven session stub used by E2E + local dev. The demo middleware lives at `lib/supabase/middleware.ts`. Public-route allowlist must be kept in sync (cycle [2026-05-03-legal-pages-public-fix](../cycles/2026-05-03-legal-pages-public-fix.md) added `/legal/*`).
6. **Client portal pages call API routes, not the Supabase JS client.** The mobile portals (`/teacher`, `/parent`) have no direct DB access; they fetch through `/api/teacher/*` and `/api/parent/*`. This removes the RLS-bypass-on-service-role tension entirely on the read path for portal users.

## Consequences

**Accepted:**
- The two CI guards (`verify-rls-coverage.sh`, `verify-api-auth.sh`) must stay green or staging → main is blocked. Adding a new model means adding an RLS policy. Adding a new route means adding `getSession()` or being explicit about why it is public.
- Demo-mode parallel codepath has to be maintained whenever a real auth feature changes (e.g., when role-split landed, demo session factory had to learn `permissions[]`).
- Portal users cannot use realtime-subscriptions to Supabase directly — every portal feature is a polled API call. This is a deliberate trade for simpler tenant isolation; revisit if/when realtime is needed.

**Rejected alternatives:**
- Pure client-side Supabase JS with RLS as the only isolation: PKCE issues + service_role write bypass make this a foot-gun.
- NextAuth.js: would replace Supabase's auth UI, no Magic Link out of box, more glue code.
- Custom session store: too much code for a small team; would re-derive what Supabase Auth already gives us.

## Verification

- `bash scripts/verify-rls-coverage.sh` → exits 0 in CI on every PR
- `bash scripts/verify-api-auth.sh` → exits 0 in CI on every PR
- Playwright E2E `e2e/admin.spec.ts` etc. exercise the demo-mode path
- Production: monitored via OAuth callback success in Vercel logs
