# p1-auth-google-oauth — Phase 1 final cycle (auth surface)

## Context

Phase 1 foundation is shipped except the auth surface. `lib/auth/session.ts` was scaffolded as a minimal shim in `p1-upload-route-sharp` (PR #188) — `getSession()` calls Supabase `auth.getUser()`, then defends against the privilege-escalation primitive (no `@@unique([supabaseUserId])` exists in schema) via `findMany({ take: 2 })` + length-check. Production currently returns `null` from every `getSession()` call because (a) no code populates `User.supabaseUserId` (no OAuth callback), (b) no code writes `school-erp-session` cookie (E2E specs deleted in Phase 0). Every p2+ admin/teacher/parent route + the live `/api/upload` route gates on this resolver returning a real session, so this is the cycle that lights up the auth pipe.

Scope: ship the Google OAuth callback at `app/auth/callback/route.ts` (per spec §8.1 — Google-only, no magic-link / OTP / password), enforce one-Supabase-account ↔ one-tenant invariant **at callback time** (the runtime defensive `findMany + length === 1` in `getSession` is fail-closed but not user-actionable), backfill `User.supabaseUserId` on first login w/ audit, refactor `proxy.ts` to drop the now-stale "rebuild window" comment + clean public-bypass shape, ship the demo-cookie write helper (HMAC-signed) the upload-route cycle deferred, ship `app/api/_demo/login/route.ts` (404 outside `DEMO_MODE=true`), ship `app/auth/error/page.tsx` (server component, decoded `?reason=`), and document the JWT custom-claim hook dashboard setup. **The JWT hook PL/pgSQL function was already shipped in `prisma/migrations/02_identity/migration.sql` lines 324-360** (covers both `tenant_id` and `role` claims via `User`/`UserRole`/`Role` join keyed on `supabaseUserId`) — this cycle only adds the dashboard-enable runbook + a post-condition smoke test. **No new migration this cycle.**

Outcome: post-merge, `/api/upload` accepts real callers, p2 entity cycles unblock, `Phase 1 truly DONE`. Marathon mode (foundation spec §18.12) — brainstorm skipped, request derives from spec §6.5 + §8.1 + p1-upload-route-sharp Ship Notes "getSession deferral chain".

**Required reading folded into Spec/Tasks below:**
- `docs/cycles/2026-05-06-p1-upload-route-sharp.md` Ship Notes — contract this cycle extends (`getSession()` shape immutable)
- `docs/cycles/2026-05-06-spec-sync-phase-1-actual.md` — confirms §6.1 migration numbering; **drop user-prompt task #5 migration** (already shipped)
- v1 archived `app/auth/callback/route.ts` (commit `2529e17` pre-Phase-0) — pattern reused: pending-cookies array, idle-timeout reset on fresh login, `NEXT_PUBLIC_SITE_URL` precedence over `x-forwarded-host`
- foundation spec §6.5 (JWT custom-claim hook), §8.1 (Auth Google OAuth only)
- `.claude/standards/security.md` (auth-helper allowlist; `getSession(` matches `verify-api-auth.sh` regex)

## Spec

### Acceptance criteria

#### Code shape

- [ ] **`app/auth/callback/route.ts`** — Next.js 16 route handler:
  - Reads `?code=` query param; missing code → redirect `/auth/error?reason=missing_code`
  - Captures cookies set by `exchangeCodeForSession` via pending-array pattern (v1 lesson: ambient `cookies().set()` writes do NOT survive `NextResponse.redirect()` from a route handler)
  - On exchange failure → redirect `/auth/error?reason=oauth_provider_declined`
  - Calls `supabase.auth.getUser()` post-exchange; missing user.email → redirect `/auth/error?reason=oauth_provider_declined`
  - Resolves matching `User` row by **email** (not `supabaseUserId` — first login has it null): `prisma.user.findMany({ where: { email, isActive: true, deletedAt: null }, take: 2 })`
  - **Multi-tenant invariant enforcement (BLOCKER from p1-upload-route-sharp finding M1):**
    - 0 rows → redirect `/auth/error?reason=no_invitation`
    - 2 rows → redirect `/auth/error?reason=cross_tenant_email` (one Supabase account ↔ one tenant policy)
    - 1 row → continue
  - **No-role-assigned guard (per spec-time review finding M2):** after row resolves, count `prisma.userRole.count({ where: { userId: row.id, tenantId: row.tenantId } })`. If 0 → redirect `/auth/error?reason=no_role_assigned`. Spec §8.1 requires admin pre-seeds User w/ a role via Employee/Guardian invitation; a User w/ no UserRole means provisioning is incomplete. The JWT hook would otherwise emit a `tenant_id`-only token (LEFT JOIN behaviour in `02_identity` migration line 338) and the user would land in the portal w/ no role, producing empty result sets across RLS — failing-soft instead of failing-loud.
  - **Backfill on first login:** if `row.supabaseUserId == null` → `prisma.user.update` to set, then `writeAuditLog({ action: 'UPDATE', resource: 'User', resourceId: row.id, after: { supabaseUserId } })`
  - **No-op when matches:** `row.supabaseUserId === user.id` → continue without write
  - **Reject when collides:** `row.supabaseUserId != null && row.supabaseUserId !== user.id` → `writeAuditLog({ action: 'AUTH_REJECT', ... })` then redirect `/auth/error?reason=identity_collision`
  - **`?next=` redirect-target validation (two-layer per spec-time review finding M3):**
    - Layer 1 — regex `^/[^/]` (single leading slash, not protocol-relative; rejects `//evil.com`, `\evil.com`)
    - Layer 2 — `new URL(next, 'http://localhost').origin === 'http://localhost'` — defends against URL-encoded-slash bypass (`/%2Fevil.com` would pass the regex but `URL.origin` exposes the protocol-relative interpretation post-decode). Path-only acceptance — no scheme tolerated.
    - Either layer fails → fallback to `/admin`
  - **Origin resolution:** `lib/auth/callback-origin.ts` (NEW). Production REQUIRES `NEXT_PUBLIC_SITE_URL` (throws if unset). Dev returns `request.url` origin. **Tightened from v1 per T1 review BLOCKER:** v1's x-forwarded-host fallback is an open-redirect primitive on non-Vercel topologies (self-hosted Docker / generic nginx) where the LB doesn't constrain that header to known aliases. Pinning to operator-set env removes the fallback entirely.
  - **Idle-timeout cookie reset:** on successful redirect to `/admin` / `/teacher` / `/parent`, set `school-erp-last-active = String(Date.now())` (v1 lesson: stale value from prior demo session causes immediate logout via proxy.ts idle check)

- [ ] **`lib/auth/callback-origin.ts`** (NEW) — `resolveCallbackOrigin(request)` ported from v1 commit `2529e17`. Pure function, ~20 LoC.

- [ ] **`lib/auth/session.ts` extension** — production `getUser` path UNCHANGED (signature + shape preserved). Add demo-cookie branch **before** the Supabase call: when `DEMO_MODE === 'true'` AND `school-erp-session` cookie present + HMAC-verified, decode JSON `{tenantId, userId, supabaseUserId}` and return synthetic session. HMAC mismatch → fall through to Supabase path (as if no cookie). Do NOT skip Supabase path on `DEMO_MODE !== 'true'`.

- [ ] **`lib/auth/demo-cookie.ts`** (NEW) — exports:
  - `signDemoCookie(payload: {tenantId, userId, supabaseUserId}): string` — `base64url(JSON.stringify(payload)) + '.' + base64url(hmacSHA256(SESSION_COOKIE_SECRET, base64url(payload)))`
  - `verifyDemoCookie(raw: string | undefined): Payload | null` — splits on `.`, verifies HMAC via `crypto.timingSafeEqual` (constant-time), returns payload or null. Rejects empty / malformed.
  - `setDemoSessionCookie(payload)` — server action; writes signed cookie via `next/headers` `cookies()` w/ `httpOnly: true, secure: NODE_ENV==='production', sameSite: 'lax', path: '/', maxAge: 24*60*60`.
  - `clearDemoSessionCookie()` — server action.
  - Constant: `DEMO_COOKIE_NAME = 'school-erp-session'` (must match `proxy.ts:5`).

- [ ] **`app/api/_demo/login/route.ts`** (NEW) — POST handler:
  - **Production guard:** `if (process.env.DEMO_MODE !== 'true') return new NextResponse(null, { status: 404 })` — 404 (not 403) so Vercel function listing reveals nothing; never reachable in prod
  - **`// @public` sentinel** at top of file (route is intentionally pre-auth — it WRITES the session cookie; verify-api-auth.sh allows w/ sentinel)
  - Zod-validate `?role=admin|teacher|parent`; invalid → 400
  - Look up first matching pre-seeded `User` w/ a Role of the requested kind; respond 200 + set demo cookie
  - 0 matching rows → 500 w/ message ("seed user not found for role X")

- [ ] **`app/auth/error/page.tsx`** (NEW) — server component:
  - Reads `?reason=` from `searchParams`
  - Renders Indonesian-locale messages per voice.md tone:
    - `no_invitation` → "Email belum terdaftar di sistem. Hubungi admin sekolah untuk mendapatkan undangan."
    - `cross_tenant_email` → "Akun ini terkait beberapa sekolah. Hubungi admin sekolah."
    - `identity_collision` → "Akun Google ini sudah pernah login dengan email berbeda. Hubungi admin sekolah."
    - `no_role_assigned` → "Akun Anda belum diberi role. Hubungi admin sekolah untuk aktivasi."
    - `oauth_provider_declined` → "Login Google ditolak atau gagal. Coba lagi atau hubungi admin sekolah."
    - `missing_code` → "Tautan login tidak valid. Mulai ulang dari halaman utama."
    - default → generic + support contact placeholder
  - Single "Kembali ke beranda" link to `/`. No client-side state. Loads on `/auth/error` already in proxy.ts public-bypass via `pathname.startsWith("/auth/")`.

- [ ] **`proxy.ts` refactor:**
  - Drop the stale "rebuild window" comment block (lines 65-69) — `/auth/callback` ships this cycle
  - `pathname.startsWith("/auth/")` already covers `/auth/callback` + `/auth/error` — no new entries needed
  - Drop the **demo-mode fallback when Supabase NOT configured** block (lines 116-120) — Supabase env is always set post-OAuth-cycle in dev/staging/prod; the dead branch confused the demo-vs-supabase-precedence story
  - Demo-mode-priority block (lines 90-98) preserved; demo cookie now written by `lib/auth/demo-cookie.ts` so the path is live (no longer dead)
  - `/api/csp-report` + `/api/health` `// @public` sentinel paths unaffected (still under `/api/` short-circuit)

- [ ] **`.env.example`** — append:
  - `# Demo mode (E2E + local dev ONLY — NEVER set in production)`
  - `# DEMO_MODE=true`
  - `# SESSION_COOKIE_SECRET="<32+ char random>"  # HMAC key for demo session cookie`

- [ ] **JWT hook (no migration — already shipped):**
  - Verify `prisma/migration-tests/02-identity.test.ts` post-condition test for `custom_access_token_hook` exists. If absent, add 3-line static assertion (function definition present + `tenant_id` claim injection + `role` claim injection)
  - Document Supabase dashboard hook-enable step in Ship Notes (Auth → Hooks → enable `public.custom_access_token_hook`)

- [ ] **`.claude/standards/auth.md`** (NEW) — covers: when to call `getSession()`, contract shape `{tenantId, userId, supabaseUserId}`, demo-mode usage (E2E + local-only; route 404s outside `DEMO_MODE=true`), JWT custom-claim hook contract (function name `public.custom_access_token_hook`, claims injected: `tenant_id` + `role`), multi-tenant invariant enforcement at callback time, role resolution flow (User → UserRole → Role → Permission scope materialisation via `lib/scaffold/permission.ts`), forward-looking deferrals (SSO/SAML/MFA → v1.1+).

#### Tests (~22 cases)

- [ ] `app/auth/callback/__tests__/route.test.ts` — ~12 cases (was 10; +2 from spec-time review M1 + M2):
  - happy path: code valid → exchange → user found → 1-row → 1+ roles → redirect /admin
  - `supabaseUserId` backfill on first login (asserts `prisma.user.update` + `writeAuditLog`)
  - `supabaseUserId` already-matches → no write
  - `supabaseUserId` collision (row has different ID) → `AUTH_REJECT` audit + error redirect
  - cross-tenant email (>1 rows by email) → `cross_tenant_email` redirect
  - no-invitation (0 rows by email) → `no_invitation` redirect
  - **no-role-assigned (1 User row but 0 UserRole rows) → `no_role_assigned` redirect** *(spec-time review finding M2)*
  - exchange failure — provider-declined (Supabase returns auth-rejected error) → `oauth_provider_declined` redirect
  - **exchange failure — code already used / `invalid_grant` (PKCE one-shot reuse via double-click) → `oauth_provider_declined` redirect** *(spec-time review finding M1 — split from generic "exchange failure")*
  - missing `?code=` → `missing_code` redirect
  - safe `?next=/teacher/attendance` → redirect there + idle-timeout cookie reset
  - **unsafe `?next=` rejected — full bypass set: `javascript:`, `data:`, `//evil.com`, `\evil.com`, `/%2Fevil.com` (URL-encoded slash bypass), `https://evil.com` → fallback to /admin** *(spec-time review finding M3 — URL-encoded variant added)*

- [ ] `lib/auth/__tests__/session.test.ts` — ~6 cases:
  - production happy: Supabase user exists + 1 User row → returns session
  - null when Supabase getUser errors
  - null when Supabase user exists but no User row (`length === 0`)
  - null when Supabase user exists but two User rows (`length === 2`) — fail-closed
  - demo-mode happy: `DEMO_MODE=true` + valid signed cookie → returns synthetic session (Supabase NOT called)
  - demo cookie HMAC mismatch → falls through to Supabase path (asserted via spy)

- [ ] `lib/auth/__tests__/demo-cookie.test.ts` — ~3 cases:
  - sign + verify roundtrip
  - tampered payload → verify returns null
  - missing/empty cookie → verify returns null

- [ ] `app/api/_demo/login/__tests__/route.test.ts` — ~3 cases:
  - happy: `DEMO_MODE=true` + valid `?role=admin` → 200 + Set-Cookie present
  - prod guard: `DEMO_MODE` unset → 404 (no Set-Cookie)
  - invalid role → 400

- [ ] **`prisma/migration-tests/02-identity.test.ts`** — extend if not present: ~2 cases:
  - `custom_access_token_hook` body sets `tenant_id` AND `role` claims (function defined + both `jsonb_set` calls present).
  - **LEFT JOIN behaviour documented as intentional** *(spec-time review finding M2)* — assertion that the function body uses `LEFT JOIN "UserRole"` (not INNER JOIN) AND the callback layer is responsible for rejecting User rows w/ no UserRole. This pins the design contract: the JWT hook may emit `tenant_id`-only tokens for unroled users, and callback is the SOLE gate.

#### Gates (between-task + end-of-cycle)

Between-task gate **expanded** per cycle 10 lesson:

```bash
npm run build && npm run typecheck && npx vitest run
```

End-of-cycle gate adds:
```bash
npx playwright test  # this cycle CAN run E2E since /api/_demo/login now writes the cookie
bash scripts/verify-rls-coverage.sh    # 25/25 (no schema change)
bash scripts/verify-api-auth.sh        # 7/7 (was 5/5; new: /auth/callback impl, /api/_demo/login w/ @public sentinel)
bash scripts/verify-pii-annotations.sh # 2/2 (no PII annotation change)
npm run scaffold:check                 # registry parity (no scaffold change)
```

**Manual smoke (Vercel preview):** `/admin` → unauth → redirect to Google → consent → callback → land in `/admin` shell w/ session cookies set. Document outcome in Verification.

#### Doc updates

- [ ] `CLAUDE.md` — add `auth.md` row in Standards table; update Phase 1 banner to "Phase 1 DONE" post-merge (or defer to spec-sync follow-up cycle)
- [ ] `README.md` — append ADR row for OAuth cutover (single-line table cell <400 chars per ADR-cell-length pre-commit gate)
- [ ] `.claude/standards/auth.md` — NEW (per acceptance criterion above)

### Non-goals

- Magic-link / email OTP fallback (spec §8.1 explicit Google-only)
- Multi-provider OAuth (Microsoft / Apple / etc.) → v1.1+
- SCIM provisioning / bulk user-import via SSO claims → v2+
- Session rotation cron / forced logout on role change → p3+
- MFA / TOTP — not in v1
- Cross-tenant tenant-switching UI → v1.1+
- Rate limiting on `/auth/callback` + `/api/_demo/login` → first p2 entity cycle ships `lib/rate-limit.ts`
- Fixing `lib/scaffold/permission.ts:149` contract drift (resolver expects `args.userId == supabaseUserId` while `getSession()` returns `User.id`) — **flagged in Ship Notes**, deferred to first p2 entity cycle (no real callers consume the resolver yet)
- New JWT-hook migration `20_jwt_hook` (user prompt §5) — function ALREADY shipped in `02_identity` migration (lines 324-360), covers `tenant_id` + `role` claims. This cycle adds dashboard-enable runbook + post-condition smoke only.
- Adding `@@unique([supabaseUserId])` to schema — runtime defense via callback-time invariant + `getSession()` `findMany take:2` + length-check covers the privilege-escalation primitive without DDL change. Future schema-hardening cycle may add the unique.
- Auto-provisioning fallback (v1 callback created `User` rows on first login if Employee/Guardian existed) — **dropped per spec §8.1** ("User pre-seeded by admin via Employee/Guardian invitations"). 0-rows-by-email → explicit `no_invitation` error.

### Assumptions

1. **Email is the join key** — `User.email` is not enforced unique anywhere in the schema (no `@@unique([email])` or `@@unique([tenantId, email])`). Callback enforces uniqueness via `findMany take:2` + length-check. `/spec` flags this as a future schema-hardening candidate, but treats the runtime check as sufficient for v1.
2. **`SESSION_COOKIE_SECRET` rotation** is out of scope. If the env var changes mid-session, all signed cookies become invalid (clean logout for all demo users). Acceptable for an E2E + local-dev-only feature.
3. **HMAC algorithm:** SHA-256 via Node `crypto.createHmac('sha256', secret)`. Output base64url (URL-safe; cookie-safe). Verification uses `crypto.timingSafeEqual` (constant-time) — `===` would leak signature length via timing.
4. **`/api/_demo/login` 404 vs 403:** 404 chosen because (a) Vercel function listing is opaque w/ 404 — looks like the route doesn't exist, (b) 403 leaks "this route exists but you can't access it" giving an attacker a foothold to reason about prod feature flags.
5. **JWT-hook dashboard step** is manual (Supabase free tier has no Management API for hooks). Documented as a runbook in Ship Notes; admin runs it once per Supabase project at first deploy.
6. **`?next=` validation two-layer** *(folded from spec-time review finding M3)*: regex `^/[^/]` (rejects `//evil.com`, `\evil.com` literal protocol-relative) + `new URL(next, 'http://localhost').origin === 'http://localhost'` (defends against `/%2Fevil.com` URL-encoded-slash bypass that the regex passes but `URL.origin` exposes post-decode). Both layers must pass; otherwise fallback to `/admin`.
7. **Origin resolution tightened beyond v1** *(T1 review BLOCKER)*: prod requires `NEXT_PUBLIC_SITE_URL`, throws if unset. Dropped v1's `x-forwarded-host` fallback (open-redirect primitive on non-Vercel topologies; on Vercel it's redundant — Vercel constrains the header to known aliases anyway). Without `NEXT_PUBLIC_SITE_URL`, `https://annisaa-erp-v3-<deployment-hash>.vercel.app` would resolve as origin and the PKCE cookie verifier would be missing on the alias domain — operator MUST set the env var at first deploy (Ship Notes runbook documents this as a deployment prerequisite).
8. **`getSession()` extension order:** demo-cookie path FIRST, Supabase path SECOND. If `DEMO_MODE=true` is set in production by mistake, the demo path activates ONLY if a valid signed cookie is present (forging requires `SESSION_COOKIE_SECRET`). Demo-cookie-write endpoint is 404 in prod, so no attacker can plant a cookie. Defense-in-depth: setting `DEMO_MODE=true` in prod is a configuration error but doesn't open auth.
9. **Race between two simultaneous OAuth callbacks for the same email:** both findMany return 1 row, both attempt `prisma.user.update` to set `supabaseUserId`. Last-write-wins is fine — both writes set the same value (Supabase user.id is deterministic for a given Google account). The audit log gets two `UPDATE` rows w/ identical `after`; minor noise, not a correctness issue.
10. **Idle-timeout cookie scope:** the `school-erp-last-active` cookie reset only fires on `/admin` / `/teacher` / `/parent` paths (matching proxy.ts `IDLE_THRESHOLDS`). Other `?next=` targets (e.g. `/admin/students`) inherit the reset because path-prefix matches.

11. **PKCE one-shot reuse** *(spec-time review finding M1)*: Supabase OAuth authorization codes are single-use. A double-click / browser-retry on the redirect link triggers a second `exchangeCodeForSession` call which returns `AuthApiError: invalid_grant`. The exchange-failure branch handles this cleanly (redirect `oauth_provider_declined`), but the test suite splits the case into "provider declined the OAuth dance" vs "code already used" so /build doesn't accidentally happy-path past it.

12. **JWT-hook LEFT JOIN intentional** *(spec-time review finding M2)*: `prisma/migrations/02_identity/migration.sql:338` uses `LEFT JOIN "UserRole"` so that a User w/o any UserRole row still gets `tenant_id` claim, but `role` claim stays null. The callback (acceptance criterion above) is the SOLE gate that rejects unroled users — this contract is documented in `auth.md` standard + pinned by the migration-test assertion in T5.

## Tasks

Sequential boundary: T1 → T2 → T3 → T4 → T5 (shared session.ts + proxy.ts boundary). T6 + T7 + T8 are **parallel-safe** (callback route, error page, demo-login endpoint — independent files). T9 docs runs last after all code lands.

- [x] **T1 — `lib/auth/callback-origin.ts` + tests.** Tightened from v1 per spec-time T1 review BLOCKER (open-redirect via x-forwarded-host on non-Vercel topologies). Production REQUIRES `NEXT_PUBLIC_SITE_URL` (throws if unset). Dev returns `request.url` origin. Pure function. ~35 LoC + 4 vitest cases (dev-bypass / env-wins-over-x-forwarded-host / throw-on-missing / explicit attacker-spoofed-x-forwarded-host-ignored). **Gates passed:** typecheck + vitest 4/4 green.

- [ ] **T2 — `lib/auth/demo-cookie.ts` + tests.** HMAC-SHA256 sign/verify, set/clear server actions, constant-time compare via `crypto.timingSafeEqual`. ~70 LoC + ~3 vitest cases. **Acceptance:** sign-verify roundtrip + tamper-detection + missing-cookie test all pass. *Independent of T1, T3-T8 except T3 (session.ts imports `verifyDemoCookie`) + T8 (demo-login endpoint imports `setDemoSessionCookie`).*

- [ ] **T3 — `lib/auth/session.ts` extension + tests.** Prepend demo-cookie branch before Supabase path. Production path UNCHANGED (assertion in test diff). Add ~3 demo-mode test cases (happy + HMAC-mismatch fall-through + DEMO_MODE-unset-skips-demo). **Acceptance:** existing 6-case session test continues to pass + new cases green. **Depends on T2.**

- [ ] **T4 — `proxy.ts` refactor.** Drop "rebuild window" comment (lines 65-69) + drop "Demo mode fallback when Supabase NOT configured" block (lines 116-120). No new public-route entries. Verify `/api/csp-report` + `/api/health` still bypass cleanly. **Pre-flight per spec-time review finding M4:** confirmed `DEMO_MODE=true` is set in `.github/workflows/ci.yml` for both `Build` (line 49) + `Playwright E2E` (lines 75, 84) jobs — line 90 (DEMO_MODE-priority block) handles all CI paths; line 116 fallback is only reachable when `DEMO_MODE !== 'true'` AND Supabase env unset (degenerate hand-planted-cookie scenario, never on CI). Drop is safe. **Acceptance:** existing proxy.ts behaviour preserved; `/auth/callback` + `/auth/error` reach the route handler (not redirected by `updateSession`). *Has no test file today; smoke-test via callback test in T6.*

- [ ] **T5 — `.env.example` + JWT-hook post-condition test.** Append `DEMO_MODE` + `SESSION_COOKIE_SECRET` lines (commented out). Verify or add 1 vitest case in `prisma/migration-tests/02-identity.test.ts` asserting `custom_access_token_hook` injects both `tenant_id` AND `role` claims (function body match). **Acceptance:** `npx vitest run prisma/migration-tests/02-identity.test.ts` green; `.env.example` diff visible.

- [ ] **T6 — `app/auth/callback/route.ts` + tests** (parallel-safe vs T7, T8). Implementation per Spec acceptance criteria above. Imports: `lib/auth/callback-origin` (T1), `lib/audit/write` (writeAuditLog), `@/lib/db` (prisma), `@/lib/supabase/server` adapted for cookie-pending pattern (or inline `createServerClient` w/ pending array — v1 used inline since the standard wrapper doesn't expose the cookie callbacks needed for capturing PKCE writes). ~150 LoC + ~10 vitest cases. **Acceptance:** all 10 callback test cases green; `verify-api-auth.sh` lists `/auth/callback` w/ `getSession(`-equivalent (the route does NOT call `getSession()` — it WRITES the session — so add `// @public` sentinel and document why). **Depends on T1.**

- [ ] **T7 — `app/auth/error/page.tsx`** (parallel-safe vs T6, T8). Server component. Reads `searchParams` per Next.js 16 contract. ~50 LoC, no new test (snapshot via E2E in T10 manual smoke). **Acceptance:** all 5 reasons render expected Indonesian copy + `Kembali ke beranda` link.

- [ ] **T8 — `app/api/_demo/login/route.ts` + tests** (parallel-safe vs T6, T7). POST handler w/ `DEMO_MODE` guard + Zod role validation + User lookup + cookie write via `setDemoSessionCookie` (T2). `// @public` sentinel at top. ~60 LoC + ~3 vitest cases. **Acceptance:** all 3 endpoint test cases green; `verify-api-auth.sh` accepts the route w/ `// @public` sentinel. **Depends on T2.**

- [ ] **T9 — `.claude/standards/auth.md` + CLAUDE.md row + README ADR row.** Standard documents the contract per Spec criterion. Update CLAUDE.md Standards table w/ `auth.md` row + glob (e.g. `app/api/**`, `app/auth/**`, `lib/auth/**`, `proxy.ts`). README ADR row for OAuth cutover (single-line, <400 chars). **Acceptance:** pre-commit doc-sync gate passes + frontend gate (no frontend touched outside cycle doc mention) + ADR-cell-length gate passes. *Depends on T1-T8.*

- [ ] **T10 — End-of-cycle verification.** Run all gates: `npm run build && npm run typecheck && npx vitest run && npx playwright test` + `verify-rls-coverage.sh` + `verify-api-auth.sh` + `verify-pii-annotations.sh` + `npm run scaffold:check`. Fill cycle doc Verification + Ship Notes. Manual Vercel preview smoke (will run after first push surfaces a preview URL). **Acceptance:** all green; cycle doc 6 sections complete. *Depends on T1-T9.*

## Implementation

- **Subagent plan:** all tasks share the auth-surface boundary (session.ts, proxy.ts, callback route, demo-cookie, demo-login) and benefit from sequential review. Executed inline T1→T10. Independent tasks T7 (error page) + T5 (env + JWT smoke) could parallelise via subagent but the speedup is marginal (<2 min savings per task) vs. inline review-loop coherence.
- **T1** — `lib/auth/callback-origin.ts` + `lib/auth/__tests__/callback-origin.test.ts`. Tightened from v1 per spec-time T1 review BLOCKER: dropped x-forwarded-host fallback (open-redirect primitive on non-Vercel topologies). Production now REQUIRES `NEXT_PUBLIC_SITE_URL` (throws if unset). 4 cases green (dev-bypass / env-wins / throw-on-missing / spoofed-header-ignored).


## Verification

<!-- filled by /build after gates run -->

## Ship Notes

<!-- filled by /ship -->
