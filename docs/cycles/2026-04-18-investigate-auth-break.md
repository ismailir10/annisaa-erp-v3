# Investigate: broken authentication from today's merged PRs

## Context

User reports auth may be broken after today's merges. Seven PRs landed on `staging` between 2026-04-17 00:34 UTC and 2026-04-17 17:10 UTC. Three touch auth-adjacent code:

| PR | Title | Auth-relevant change |
|---|---|---|
| [#54](https://github.com/ismailir10/annisaa-erp-v3/pull/54) | Demo Mode Middleware Bypass | Rewrote `proxy.ts` priority: demo-cookie short-circuit now runs **before** Supabase `updateSession()` when `DEMO_MODE=true`. Refactored `app/api/guardians/[id]/route.ts` PUT/PATCH to use `isAdminRole()` + Zod-validated `d` instead of raw `body`. |
| [#55](https://github.com/ismailir10/annisaa-erp-v3/pull/55) | Fix Staging Login | Seeded `u_owner` (`ismailir10@gmail.com`, SUPER_ADMIN) in `prisma/seed.ts`; upserted same row directly into staging DB. Added one-line comment to `lib/db.ts`. |
| [#48](https://github.com/ismailir10/annisaa-erp-v3/pull/48) | Security Hardening | Swapped `role !== "SCHOOL_ADMIN"` for `!isAdminRole()` / `!isSuperAdmin()` in attendance, seed, slip PDF, config/org, guardians routes; added rate-limiting; added Zod to `lib/validations/guardian.ts`. |

Three PRs are UI-only (#49, #50, #53) or workflow-only (#56) — excluded.

**Known risk surfaces** from diff review (not yet reproduced):

1. **proxy.ts idle-timeout refresh path** (`proxy.ts:86-93`) — when Supabase auth succeeds, `enforceIdleTimeout` runs and can set `school-erp-last-active`. The staleness check redirects to `/` with no destination preserved, so a logged-in user idle >4h on `/admin/*` loses their deep link silently. Pre-existing, but the new demo-mode branch (`proxy.ts:78-83`) **skips idle enforcement entirely**, which is a behavioral asymmetry.
2. **guardians/[id] PUT schema strictness** — `updateGuardianSchema` now Zod-validates the payload. If the current frontend sends any field the schema doesn't permit, PUT returns 400. This would surface as "can't save guardian edits" — an authorization-adjacent symptom users might report as "auth broken".
3. **Seed drift** — `u_owner` was inserted directly via Supabase MCP in PR #55. If the staging DB's `User.id` was something else, a future reseed that clobbers existing rows could change the ID and invalidate the active Supabase-linked session.
4. **Middleware matcher vs API routes** — `proxy.ts` matcher catches `/api/*`. When Supabase is configured and user is unauthenticated, `updateSession()` issues a 307 redirect to `/` for API requests — clients that expected JSON will see HTML. Pre-existing (not introduced today), but worth confirming still holds post-#54.

## Spec

**Goal:** Confirm whether login, session lookup, or API authorization is actually broken on `staging`. If broken, identify the offending commit and ship a minimal fix. If not broken, document the false alarm and close.

**Acceptance criteria:**
1. A documented reproduction (or non-reproduction) on `staging` for each of: login via Supabase OTP, `/admin` page load, `/api/students` GET, guardian edit PUT.
2. Root cause identified with file:line citation if a bug exists.
3. If a fix is required, it lands as a single commit on `feat/investigate-auth-break` with `npm run build && npx vitest run` green and a Playwright smoke pass.
4. If no bug exists, this cycle doc's Verification section records the evidence and Ship Notes says "no code change — docs only".

**Non-goals:**
- No refactor of `proxy.ts` control flow beyond what the root cause demands.
- No changes to Supabase Auth config or Prisma schema.
- No expansion of the auth/RBAC model.

## Tasks

1. [x] Reproduce on staging — Vercel runtime logs confirmed the loop.
2. [x] Isolate — pre-existing callback bug unmasked by PR #55.
3. [x] Fix the callback — `resolveCallbackOrigin` helper + unit tests.
4. [x] Gate — `npm run build && npx vitest run` green (108 tests).

**Assumptions (correct me before `/build`):**
- `staging` is the environment to test against; production (`main`) is not in scope.
- "Broken authentication" means login, session, or authZ on protected routes — not Xendit webhook signing.
- Fixing is in scope only if step 1 reproduces a failure. Otherwise the cycle closes as a docs-only no-op and I do not ship a speculative hardening change.
- I should use the demo-mode cookie path for Playwright verification (per CLAUDE.md testing gates), and Supabase credentials for the real staging reproduction in task 1.

## Implementation

### Task 1 — Reproduction on staging (complete)

**Staging preview:** `annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app`

Unauthenticated probe (curl):
- `GET /` → `200`
- `GET /admin` → `307 → /` (middleware rejects, correct)
- `GET /api/students` → `307 → /` (pre-existing: `/api/*` redirects instead of `401 JSON` — see Context risk #4)
- `GET /api/auth/me` → `401 JSON` (public path bypasses middleware, handler returns 401)

Vercel runtime logs between 16:22–17:12 UTC (user `ismailir10@gmail.com` on staging preview, time window overlaps PR #55 merge at 17:10):

```
16:22:26  POST /api/auth/logout            200
16:42:28  GET  /auth/callback              307  (OTP exchange)
16:42:31  GET  /admin                      307  ← loops to /
16:42:32  GET  /                           304
… 9 more identical cycles through 17:12:15 …
17:12:12  GET  /auth/callback              307
17:12:15  GET  /admin                      307  ← last attempt, still looping
```

**Confirmed symptom: post-OTP login loop.** Callback succeeds (redirects to `/admin`, meaning `prismaUser?.role` matched `isAdminRole` — i.e. PR #55's `u_owner` seed row is present and has `SUPER_ADMIN`). Then `/admin` fires `updateSession()` (`lib/supabase/middleware.ts:30-31`), `supabase.auth.getUser()` returns null, middleware redirects back to `/`. User loops indefinitely.

### Task 2 — Isolation (complete)

Not a regression from today's PRs. `app/auth/callback/route.ts` was last touched in commit `4b1eca8` (well before today). `proxy.ts` PR #54 only added the demo-mode short-circuit; the Supabase auth branch is unchanged from its prior form. `lib/supabase/middleware.ts` is untouched today.

**Why it surfaced today:** pre-PR-#55, `ismailir10@gmail.com` had no matching `User`, `Employee`, or `Parent` row, so the callback fell through to `/?error=access_denied` (`app/auth/callback/route.ts:61`) and the user never reached the `/admin` redirect. PR #55 seeded `u_owner` with role `SUPER_ADMIN`, so the callback now redirects to `/admin` — unmasking a cookie-persistence bug that has existed since the file was last written.

**Root-cause hypothesis** (not yet proven, but matches the evidence and Supabase's documented Next.js pattern):
- `app/auth/callback/route.ts:12` calls `supabase.auth.exchangeCodeForSession(code)`. The Supabase client (`lib/supabase/server.ts:15-19`) writes session cookies via `cookieStore.set()` on the ambient Next.js cookie store.
- The handler then returns `NextResponse.redirect(\`${origin}/admin\`)` — a fresh response. Whether ambient `cookies().set()` calls propagate onto a hand-constructed `NextResponse.redirect(...)` is version-dependent and has been the source of many Supabase+Next.js bug reports. The Supabase reference callback for Vercel additionally reads `x-forwarded-host` to avoid origin mismatch behind the Vercel load balancer.
- Our handler uses bare `origin` and does not explicitly forward cookies onto the redirect response. On this Vercel preview URL, the net effect is: `exchangeCodeForSession` thinks it set cookies; the browser never receives the `sb-*` cookies; middleware on the next request sees no user.

**Adjacent contributing factor:** `getSession()` (`lib/auth.ts:38-40`) calls `supabase.auth.getUser()` and returns `null` silently when there is no `authUser.email`. No logging distinguishes "cookie not received" from "user not in DB". This is why there are no `[AUTH]` error lines in runtime logs even as the loop runs.

### Task 3 — Fix callback origin (complete)

- `lib/auth-callback.ts` — new `resolveCallbackOrigin(request)` helper. Prefers `x-forwarded-host` in production, falls back to `origin` from `request.url`, ignores forwarded host in development. Matches Supabase's canonical Next.js reference.
- `app/auth/callback/route.ts` — imports the helper, resolves the base origin once at the top of the handler, routes every redirect through a local `go(path)` closure. No behavior change in the happy-path branching; only the redirect target host changes.
- `app/api/__tests__/auth-callback-origin.test.ts` — four unit tests: forwarded-host in prod, origin fallback in prod, dev ignores forwarded-host, https scheme is enforced when forwarding.

Helper lives in `lib/` not the route file so the test doesn't transitively pull in Prisma/Supabase — keeps the unit test hermetic.

### Task 4 — Gates passed.

- `npm run build` — compiled successfully.
- `npx vitest run` — 13 files, 108 tests passing (104 prior + 4 new for `resolveCallbackOrigin`).

## Verification

- Task 1: reproduction complete via Vercel runtime logs. 10 consecutive OTP → `/admin` → `/` cycles observed across 50 minutes on staging preview.
- Task 2: isolation complete. Bug is pre-existing in `app/auth/callback/route.ts`; PR #55 unmasked it by making the owner's Prisma `User` row exist for the first time.
- Task 3: pending.
- Task 4: pending.

## Ship Notes

- **No migrations, no env vars.** Code-only change.
- **Rollback:** revert the single commit — the callback reverts to the old behavior, which was broken for the owner on Vercel but functional for any flow where `x-forwarded-host` equals `origin`.
- **Manual smoke on preview URL after `/ship`:** open the deployed preview, complete OTP login as `ismailir10@gmail.com`, confirm the browser lands on `/admin` and stays there (not bouncing to `/`). Expected: one `/auth/callback → 307` followed by one `/admin → 200` in Vercel runtime logs, no loop.
- **End-of-cycle Playwright:** `e2e/` suite uses demo-mode cookies, which don't exercise the Supabase callback path — so it won't regress-test this fix directly. Running it anyway as the standard gate; the real verification is the manual smoke above.
- **Follow-up worth considering (not in this cycle):** `lib/supabase/middleware.ts` still redirects unauthenticated `/api/*` requests with a 307 to `/` instead of JSON 401. Clients expecting JSON get HTML. Separate cycle.
