# Fix Google Sign-In Login Loop on Staging

## Context

**Problem:** Google sign-in on staging (`annisaa-erp-v3.vercel.app`) produced a login loop:
`/auth/callback` → `/admin` → `/` (back to login). Reported and fully investigated in
[`docs/cycles/2026-04-18-investigate-auth-break.md`](2026-04-18-investigate-auth-break.md).

**Three-layer root cause (from investigation):**

1. **Cookie loss on redirect (primary)** — `app/auth/callback/route.ts` returned
   `NextResponse.redirect(...)` without attaching the session cookies written by
   `exchangeCodeForSession`. Browser received redirect with no `Set-Cookie` → no session →
   middleware redirected to `/`.

2. **Wrong Vercel origin (secondary)** — `origin` from `new URL(request.url)` was the
   internal Vercel deployment host. Redirects pointed at the wrong domain.

3. **Stale idle-timeout cookie (tertiary)** — `school-erp-last-active` from demo-mode testing
   caused `enforceIdleTimeout()` to kick the user back to `/` immediately after a fresh login.

**Status at cycle start:** All three fixes were already shipped to `origin/staging` via:
- PR #58 (`7c3cfe8`) — `resolveCallbackOrigin` + `x-forwarded-host`
- PR #59 (`35bfbfe`) — pending-cookie capture; temporary `[AUTH-DBG]` logging added
- PR #60 (`a2a3762`) — idle-timeout cookie reset on callback redirect

The `[AUTH-DBG]` console logs in `app/auth/callback/route.ts` and
`lib/supabase/middleware.ts` were diagnostic — to be removed once root cause was confirmed.
They are now confirmed (see investigate-auth-break cycle doc). This cycle removes them.

**Scope:** Remove `[AUTH-DBG]` console.log lines only. No logic changes. No new files.

---

## Spec

### Acceptance criteria

| # | Criterion |
|---|-----------|
| AC-1 | No `[AUTH-DBG]` console.log lines in `app/auth/callback/route.ts`. |
| AC-2 | No `[AUTH-DBG]` console.log lines in `lib/supabase/middleware.ts`. |
| AC-3 | All existing tests pass (`npx vitest run`). |
| AC-4 | Build succeeds (`npm run build`). |
| AC-5 | Auth logic (cookie capture, origin resolution, idle-timeout reset) is unchanged. |

### Out of scope

- Any auth logic changes
- Magic-link auth, demo-mode login
- Supabase dashboard or Google Console configuration

---

## Tasks

- [x] T1 — Remove `[AUTH-DBG]` diagnostic logs from `app/auth/callback/route.ts` and
  `lib/supabase/middleware.ts`. Keep all `console.error` calls for genuine error paths.

---

## Implementation

- T1: Remove `[AUTH-DBG]` diagnostic logs — `app/auth/callback/route.ts`, `lib/supabase/middleware.ts` — removed 2 `console.log` blocks (setAll trace + redirect trace in callback, portal-path trace in middleware); all `console.error` on error paths retained.

---

## Verification

- T1: `npm run build` — compiled successfully. `npx vitest run` — 13 files, 108 tests passing. `grep -r AUTH-DBG` returns no matches.

---

## Ship Notes

- No DB migrations, no env vars, no schema changes.
- Rollback: revert the single commit — logs reappear, no functional impact.
- README.md: no change needed (no module/CRUD/route changes).
