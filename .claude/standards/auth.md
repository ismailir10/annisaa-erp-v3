# Auth

> Loaded on demand by `/build` when staged paths match `app/api/**`, `app/auth/**`, `lib/auth/**`, or `proxy.ts`.

The auth surface for v2. Google OAuth only (spec §8.1) — no magic link, no OTP, no password.

## 1. Session contract

`getSession()` is the single resolver every server-component page + API route + server action calls.

```ts
import { getSession, type SessionContext } from "@/lib/auth/session";

const session = await getSession();
if (!session) return new NextResponse(null, { status: 401 });
// session.tenantId, session.userId, session.supabaseUserId
```

**Shape (immutable across the auth refactor):**

```ts
type SessionContext = {
  tenantId: string;        // User.tenantId — drives every query's `where: { tenantId }`
  userId: string;          // User.id (cuid) — local identity row
  supabaseUserId: string;  // auth.users.id — JWT subject for RLS reads
};
```

`getSession()` returns `null` on every failure path (Supabase unauthenticated, no User row, two User rows fail-closed, demo-cookie HMAC mismatch). Callers own the response shape — typically `{ error: 'unauthorized' }` 401 JSON for API routes, redirect to `/` for server components.

**Where to call:** server components, API route handlers, server actions. **NEVER from `proxy.ts` (Edge middleware)** — `next/headers` `cookies()` errors there. The proxy reads the demo-cookie value directly via `request.cookies.get(...)`.

## 2. OAuth callback (`/auth/callback`)

The callback handler is the one place that WRITES the session — it has `// @public` sentinel because verify-api-auth.sh's regex matches that or `getSession(`. The callback does not (and cannot) call `getSession()`.

Flow:

1. `?code=` → `supabase.auth.exchangeCodeForSession(code)`. PKCE codes are one-shot — a double-click yields `invalid_grant`, treated as `oauth_provider_declined`.
2. Resolve User by **email**: `prisma.user.findMany({ where: { email, isActive: true, deletedAt: null }, take: 2 })`. The schema has no `@@unique([email])`; the take:2 + length-check is the only application-layer enforcement of one-Supabase-account ↔ one-tenant.
   - 0 rows → `no_invitation` (admin must invite first)
   - 2 rows → `cross_tenant_email` (one Supabase account ↔ one tenant policy)
3. Count UserRole rows. 0 → `no_role_assigned` (provisioning incomplete; JWT hook would otherwise emit a `tenant_id`-only token + empty result sets — fail-soft into RLS denial).
4. Identity-collision check: if `User.supabaseUserId` is set AND mismatches AND is NOT `demo:*` → `identity_collision`. (Demo-prefixed values get cleaned up on first real login.)
5. CAS backfill via `prisma.user.updateMany({ where: { id, supabaseUserId: <null|demo:*> } })` — atomic against simultaneous fresh OAuth flows. Race-loser refetches + identity-collision-checks.
6. `writeAuditLog({ action: UPDATE, resource: User, before: {supabaseUserId: <prev>}, after: {supabaseUserId: <new>} })` — wrapped in try/catch; partition-trigger throws are non-fatal because backfill already committed.
7. Validate `?next=` via three-layer defense (see §5).
8. Reset `school-erp-last-active` cookie before redirect to a portal path — otherwise a stale demo-session timestamp loops the user back to `/` via `proxy.ts` `enforceIdleTimeout`.

## 3. JWT custom-claim hook contract

Function: `public.custom_access_token_hook(event jsonb)` — defined in `prisma/migrations/02_identity/migration.sql:324-360`.

Injected claims:
- `tenant_id` — `User.tenantId` for the actor
- `role` — `Role.code` from the **first** `UserRole` ordered by `createdAt ASC NULLS LAST`

`LEFT JOIN "UserRole"` is intentional: a User w/o any UserRole gets a `tenant_id`-only JWT (no `role` claim). The OAuth callback (§2 step 3) is the SOLE gate that rejects unroled users at login time. INNER JOIN here would silently log unroled users in with empty result sets across RLS — fail-soft instead of fail-loud. `prisma/migration-tests/02-identity.test.ts` pins this contract.

**Dashboard setup (manual, once per Supabase project):**
1. Supabase dashboard → Authentication → Hooks
2. Enable "Custom Access Token" hook
3. Select function: `public.custom_access_token_hook`
4. Save

The hook function is granted to `supabase_auth_admin` role only. Never call it from app code.

## 4. Demo mode (E2E + local dev ONLY — NEVER in production)

Three env-vars participate:

| Var | Required when | Purpose |
|---|---|---|
| `DEMO_MODE` | E2E + local dev | Set to literal `"true"` to enable. Anything else (`""`, `"1"`, unset) disables. |
| `SESSION_COOKIE_SECRET` | DEMO_MODE=true | HMAC-SHA256 key, ≥32 chars. Generate: `openssl rand -hex 32`. |
| `NEXT_PUBLIC_SITE_URL` | Production | Pinned origin for OAuth-callback redirect. Throws if unset. |

Cookie shape (`school-erp-session`): `<base64url(JSON {tenantId, userId, supabaseUserId})>.<base64url(HMAC-SHA256)>`. Verification uses `crypto.timingSafeEqual` w/ length-guard. See `lib/auth/demo-cookie.ts`.

**Why HMAC even though gated by DEMO_MODE:** defense-in-depth. If `DEMO_MODE=true` is accidentally set in prod (configuration error), forging requires `SESSION_COOKIE_SECRET`. The `/api/_demo/login` route 404s outside DEMO_MODE so an attacker can't plant a cookie either.

**`/api/_demo/login`** writes the cookie:
- POST + `?role=admin|teacher|parent`
- 404 if `DEMO_MODE !== 'true'`
- Looks up first User w/ matching role in first tenant (single-tenant MVP)
- Stamps `supabaseUserId` as `demo:<userId>` if no real Supabase ID stored — the prefix is recognised by the OAuth callback's identity-collision guard so a User who was demo'd locally can log in for real later.

## 5. `?next=` redirect-target validation (three-layer)

```ts
function safeNextPath(next: string | null): string | null {
  if (!next) return null;
  if (/%(2[Ff]|5[Cc]|25)/.test(next)) return null;   // L0: percent-encoded slash/backslash/percent
  if (!/^\/[^/]/.test(next)) return null;            // L1: not protocol-relative
  const u = new URL(next, "http://localhost");
  if (u.origin !== "http://localhost") return null;  // L2: same-origin
  return u.pathname + u.search + u.hash;
}
```

Reject set: `javascript:`, `data:`, `//evil.com`, `\evil.com`, `/%2Fevil.com`, `/%252Fevil.com` (double-encoded), `/%5Cevil.com`, `https://evil.com`. Falls back to `/admin`.

## 6. Origin resolution (`lib/auth/callback-origin.ts`)

Production REQUIRES `NEXT_PUBLIC_SITE_URL` — throws if unset. Dev returns `request.url` origin. **No `x-forwarded-host` fallback** (open-redirect primitive on non-Vercel topologies). Operator pins the canonical alias at first deploy.

## 7. Multi-tenant invariant — closed at OAuth-callback time

The schema has no `@@unique([email])` and no `@@unique([supabaseUserId])`. Two enforcement layers:

- **Compile-time:** none — schema doesn't enforce.
- **Runtime A:** OAuth callback (§2) — `findMany({take: 2})` by email + length-check rejects 2+ rows w/ `cross_tenant_email`.
- **Runtime B:** `getSession()` — `findMany({take: 2})` by supabaseUserId + length-check returns null on collision (defense-in-depth if callback gate is bypassed or future migration introduces collision).

Future schema-hardening cycle may add `@@unique([supabaseUserId])`; until then both layers are mandatory.

## 8. Role resolution flow

```
User.id → UserRole[].roleId → Role.id
                            → Role.rolePermissions[]
                              → Permission (resource, action, scope)
```

`lib/scaffold/permission.ts` materialises the per-scope ID Sets in-memory (5-min TTL cache). The resolver's `args.userId` parameter is **the User.id (cuid)** — NOT the supabaseUserId. (Note: `permission.ts:149` queries `Employee.supabaseUserId: args.userId` which is a contract drift documented in this cycle's Ship Notes; first p2 entity cycle should fix.)

## 9. Forward-looking deferrals

| Item | Defer to |
|---|---|
| Magic-link / email OTP fallback | not in v1 (spec §8.1 explicit Google-only) |
| Multi-provider OAuth (Microsoft, Apple) | v1.1+ |
| SCIM provisioning / bulk SSO user-import | v2+ |
| Session rotation cron / forced logout on role change | p3+ |
| MFA / TOTP | not in v1 |
| Cross-tenant tenant-switching UI | v1.1+ |
| Rate limiting on `/auth/callback` + `/api/_demo/login` | first p2 entity cycle ships `lib/rate-limit.ts` |
| `@@unique([supabaseUserId])` schema hardening | future schema cycle |
| `permission.ts:149` resolver contract fix (args.userId vs supabaseUserId) | first p2 entity cycle |
