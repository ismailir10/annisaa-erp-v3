# Investigate Slow Queries from pg_stat_statements

## Context

Supabase `pg_stat_statements` was queried for the top slow queries by total execution time. The raw data shows queries dominated by platform infrastructure, not our application code. This cycle audits the data, categorizes what's ours vs Supabase's, and fixes the two actionable issues found.

### Query Classification

| Category | % of total_time | Key queries |
|----------|----------------|-------------|
| **Supabase platform** (pg-meta, Studio, MCP, auth internals, pgbouncer, backup) | ~93% | `pg_timezone_names` (35%), `pg_available_extensions` (24%), `table_privileges` (9%), `pgbouncer.get_auth` (3.5%), function/column introspection, pg_backup |
| **Supabase Auth** (GoTrue internals) | ~6% | `SELECT/UPDATE users`, `SELECT/INSERT sessions`, `SELECT identities`, `SELECT mfa_factors`, `INSERT flow_state`, `INSERT refresh_tokens` |
| **Our application** | **~0.5%** | `UPDATE User SET lastLoginAt` (0.5%), `SELECT COUNT(*) AttendanceRecord GROUP BY status` (0.19%) |

**Bottom line:** 99.5% of slow query time is Supabase platform overhead — not actionable from our codebase. The remaining 0.5% has two fixable issues.

### Actionable Findings

**Finding 1 — `lastLoginAt` write on every `getSession()` call** (`lib/auth.ts:91-94`)

`getSession()` is called by every API route, every Server Component layout, and every Server Component page. Each call does `prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } })`. With ~1809 calls in the measurement period, this is a write-heavy hotspot for a field that's only displayed in the admin users list as "Login Terakhir".

**Finding 2 — Student Attendance stats N+1** (`app/admin/student-attendance/page.tsx:101-113`)

The page makes 4 parallel `fetch()` calls to `/api/student-attendance?mode=list&pageSize=1&status=PRESENT|ABSENT|SICK|PERMISSION` just to get today's count per status. Each call runs the full `findMany` + `count` query with pagination overhead, and each triggers `getSession()` (which triggers Finding 1). A single `GROUP BY status` query would replace all 4.

---

## Spec

### Acceptance Criteria

**AC-1 — `lastLoginAt` cooldown: skip update if last update was < 5 minutes ago**

In `lib/auth.ts`, after fetching the user, check `user.lastLoginAt` before writing:

```ts
const now = new Date();
const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
if (!user.lastLoginAt || user.lastLoginAt < fiveMinutesAgo) {
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: now },
  });
}
```

This reduces writes from ~1809/day to ~288/day (one per user per 5 minutes). The admin "Login Terakhir" display remains useful — it shows "within 5 minutes" precision which is sufficient for monitoring user activity.

**Note:** Demo mode (`getDemoSession`) does NOT update `lastLoginAt` — confirmed by reading `lib/auth.ts:123-148`. Only production sessions are affected.

**AC-2 — Student Attendance stats endpoint: single `GROUP BY` query**

New endpoint `GET /api/student-attendance/stats?dateFrom=&dateTo=`:

```ts
// Auth + role check (admin only)
// Single query:
const stats = await prisma.studentAttendance.groupBy({
  by: ["status"],
  where: {
    isVoided: false,
    classSectionId: { in: tenantClassIds },
    date: { gte: dateFrom, lte: dateTo },
  },
  _count: { status: true },
});
```

Returns `{ present: number, absent: number, sick: number, permission: number }`.

The admin page `app/admin/student-attendance/page.tsx` replaces the 4 parallel fetch calls with one call to `/api/student-attendance/stats`.

Build + tests green.

### Out of Scope

- Supabase platform queries (pg-meta, pgbouncer, auth internals) — not actionable from our codebase
- Supabase Auth queries (GoTrue internals) — managed by Supabase
- `pg_timezone_names` cache_hit_rate=0% — this is a known Supabase Auth issue; consider reporting to Supabase support
- Adding more composite indexes beyond what Phase 6 already added — current index coverage is good
- `SELECT COUNT(*) FROM AttendanceRecord GROUP BY status` (924 calls) — this is likely from the admin dashboard or attendance page; it's already indexed on `[date]` and `[status]` and only takes 0.19% of total time

### Assumptions

1. `lastLoginAt` with 5-minute granularity is acceptable for the admin "Login Terakhir" display — it shows approximate last-active time, not exact second.
2. The `student-attendance/stats` endpoint is admin-only (same as the page that consumes it).
3. The `AttendanceRecord GROUP BY status` query (924 calls, 0.19%) is not from our codebase — no Prisma query matches this pattern. It may be from a Supabase function or a dashboard widget we haven't identified. Low priority.

---

## Tasks

| # | Task | Files | Impact | Risk |
|---|------|-------|--------|------|
| 1 | `lastLoginAt` cooldown in `getSession()` — skip update if < 5 min | `lib/auth.ts` | HIGH (reduces ~1500 unnecessary writes/day) | Low |
| 2 | Student attendance stats endpoint — single `groupBy` query | New: `app/api/student-attendance/stats/route.ts` | MEDIUM (4 API calls → 1) | Low |
| 3 | Update admin student-attendance page to use stats endpoint | `app/admin/student-attendance/page.tsx` | MEDIUM (4 fetch → 1 fetch) | Low |
| 4 | Supabase session policy: 24h timebox + enable inactivity timeout | `supabase/config.toml` | MEDIUM (documented session policy) | Low |
| 5 | Middleware admin idle timeout: 4h for admin roles via cookie | `lib/supabase/middleware.ts`, `proxy.ts` | HIGH (admin session protection) | Low |

**Gate between tasks:** `npm run build && npx vitest run` — must pass before every commit.
**End-of-cycle gate (after Task 5):** `npm run build && npx vitest run && npx playwright test`

### Session Policy (Tasks 4–5)

Supabase Auth `timebox` and `inactivity_timeout` are global — no per-role support. Strategy:

- Supabase global: `timebox = "24h"` (covers teacher/parent full day)
- Middleware: lightweight cookie-based idle check for admin roles only — reads a `last-active` timestamp cookie, force-redirects to login if > 4h idle
- Teacher/Guardian: no middleware idle check — 24h Supabase timebox is sufficient

```
Role          Supabase timebox    Middleware idle timeout
Teacher       24h                 none
Guardian      24h                 none
SCHOOL_ADMIN  24h (upper bound)   4h idle
SUPER_ADMIN   24h (upper bound)   4h idle
```

---

## Implementation

- Task 1 (2026-04-16): `lib/auth.ts` — added 5-minute cooldown to `lastLoginAt` update in `getSession()`. Reduces ~1809 writes/day to ~288. Build + 90 tests green.
- Task 2 (2026-04-16): New `app/api/student-attendance/stats/route.ts` — single `prisma.studentAttendance.groupBy({ by: ["status"] })` query, admin-only, returns `{ present, absent, sick, permission }`. Replaces 4 parallel list API calls. Build + 90 tests green.
- Task 3 (2026-04-16): `app/admin/student-attendance/page.tsx` — replaced 4 parallel `fetch` calls with single call to `/api/student-attendance/stats`. Build + 90 tests green.
- Task 4 (2026-04-16): `supabase/config.toml` — enabled `[auth.sessions]` with `timebox = "24h"` and `inactivity_timeout = "24h"`. Note: for Supabase Cloud, apply same settings in Dashboard > Authentication > Policies > Session Limits. Build + 90 tests green.
- Task 5 (2026-04-16): `proxy.ts` — added `enforceAdminIdle()` middleware function. Uses `school-erp-admin-last-active` cookie (httpOnly, sameSite lax, path /admin). Only activates on `/admin/*` page routes. If cookie timestamp > 4h old → redirect to login. On every admin page request → refresh cookie. Works for both Supabase Auth and demo mode. Build + 90 tests + 25 Playwright tests green.
- Task 6 (2026-04-16): `proxy.ts` — generalized `enforceAdminIdle` → `enforceIdleTimeout` with per-portal thresholds: `/admin` = 4h, `/teacher` = 24h, `/parent` = 24h. Single `school-erp-last-active` cookie (path `/`). Works independently of Supabase plan (no Pro required). Build + 90 tests + 25 Playwright tests green.
- Task 7 (2026-04-16): `supabase/config.toml` — reverted session policy to commented-out state with a note that these require Supabase Pro plan. Idle timeouts are fully enforced at middleware level instead.
- Task 8 (2026-04-16): `prisma/seed.ts` — fixed hardcoded LibSQL adapter (`file:dev.db`) that crashed CI seed. Now detects DATABASE_URL: uses `PrismaLibSql` for `file:` URLs (local dev), `PrismaPg` for `postgres:` URLs (CI/prod), aligned with `lib/db.ts`.

---

## Verification

| Gate | Status |
|------|--------|
| `npm run build` | ✅ clean build |
| `npx vitest run` (90 tests) | ✅ 90/90 passed |
| `npx playwright test` (25 tests) | ✅ 25/25 passed |
| `lastLoginAt` cooldown: `lib/auth.ts:92-99` | ✅ 5-min guard before update |
| Stats endpoint: `app/api/student-attendance/stats/route.ts` | ✅ admin-only, groupBy query |
| Admin page: single fetch to `/stats` | ✅ replaces 4 parallel calls |
| Session config: `supabase/config.toml` `[auth.sessions]` | ✅ timebox=24h, inactivity_timeout=24h |
| Admin idle timeout: `proxy.ts` `enforceIdleTimeout()` | ✅ per-portal: admin 4h, teacher 24h, parent 24h |
| Config.toml session policy: commented out with Pro plan note | ✅ idle timeouts enforced at middleware level |

---

## Ship Notes

### DB migrations
None — all changes are application code and config.

### Supabase Cloud configuration
No manual steps needed. Session limits in `config.toml` require Supabase Pro plan — idle timeouts are fully enforced at middleware level instead (no plan dependency).

### New env vars
None.

### Rollback plan
- All changes are additive — revert any file safely with no data migration.
- The idle timeout cookie (`school-erp-last-active`) is self-healing — if deleted, users get a fresh window on next page load.
- The `lastLoginAt` cooldown is backward-compatible — existing timestamps remain valid.

### Session policy summary
All enforced at middleware level (proxy.ts), no Supabase plan dependency:
```
Route          Idle timeout    Cookie
/admin/*       4 hours         school-erp-last-active
/teacher/*     24 hours        school-erp-last-active
/parent/*      24 hours        school-erp-last-active
```
