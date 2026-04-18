# Perf Deep Fix — Observability-Driven Investigation

## Context

Full investigation using Vercel + Supabase observability (2026-04-18).

**Vercel** — runtime logs empty (Speed Insights just installed via PR #68; no retained function-duration data yet). No production deployment target set — all deploys have `target: null`, so Vercel Speed Insights will only accumulate data going forward.

**Supabase Production** (`qrnbanxcrmrwganpmzmn`, ap-south-1) — three active signals:

1. **`column User.parentId does not exist` errors** (3 occurrences, April 18 13:44–13:49 UTC) — appeared in `qrnbanxcrmrwganpmzmn` (the original Supabase project from Jan 2026). **Investigation revealed this is the abandoned original DB.** The active app (`.env`, Vercel) uses `jzhujpqaxyeeokgexerc` (staging Supabase, created April 2026) which has all columns and tables. Production Supabase is 21 tables behind because it was never migrated after the repo was restarted on staging. The errors were from old debugging sessions connecting directly to the old DB. **Task 1 is N/A** — active DB already has `parentId`. Infra recommendation: retire `qrnbanxcrmrwganpmzmn` to avoid future confusion.

2. **Staging pgbouncer auth: 17,295 `pgbouncer.get_auth` calls** vs prod's 701. This is connection-pool churn caused by the double `supabase.auth.getUser()` pattern: `proxy.ts` calls `updateSession()` (which calls `getUser()`) for every non-static request, and then each API route handler calls `getSession()` which calls `getUser()` again. Two Supabase round-trips per API call.

3. **22 tables with multiple permissive RLS policies** (Supabase performance advisor, WARN level). Tables like `AttendanceRecord`, `Employee`, `LeaveRequest`, `PayrollItem`, `Tenant` etc. each have two `SELECT` policies for `authenticated` role: `{table}_select_own_tenant` + `{table}_service_all`. PostgreSQL evaluates all permissive policies per query with an OR — both must be checked on every SELECT.

**Code-level findings** (code-explorer agent + direct file reads):

| # | Issue | File | Impact |
|---|---|---|---|
| ~~P0~~ | ~~`User.parentId` missing on production DB~~ | N/A — active DB is staging Supabase, already has column | N/A |
| P0 | Double `supabase.auth.getUser()` per API request | `proxy.ts:94`, `lib/auth.ts:62` | ~200ms saved per API call |
| P0 | 22 RLS tables with dual permissive policies | Supabase migrations | Overhead on every SELECT |
| P1 | `getParentWithChildren` uncached — 5-model join on every parent page load | `lib/parent-helpers.ts:43` | ~150ms per parent page |
| P1 | `student-attendance` routes: pre-fetch class IDs then filter via `IN` | `app/api/student-attendance/route.ts:31`, `stats/route.ts:22` | 1 extra round-trip per call |
| P2 | Invoice generation: N sequential `tx.invoice.create()` calls in a loop | `app/api/invoices/generate/route.ts:131` | 500 inserts → 3 round-trips |

**What's already fixed** (prior cycles, do not re-do):
- `getSession()` has 60s in-memory User cache (PR #64)
- FK indexes on `TeachingAssignment` and `InvoiceLine` (PR #64)
- Guardian upsert parallelized with `Promise.all` (PR #64)
- Parent reports lazy-load + slim list query (PR #63)
- Session `getParentInvoiceList` and `getStudentInvoices` already use `unstable_cache` (PR #63)

---

## Spec

### Acceptance Criteria

1. **AC-1** — Production Supabase has `parentId` column on `User` table; `column User.parentId does not exist` error no longer appears in production postgres logs.
2. **AC-2** — `/api/*` routes are bypassed in middleware (`proxy.ts`) without calling `updateSession()`; only page routes trigger the Supabase session refresh.
3. **AC-3** — Each of the 22 dual-policy tables has a single merged SELECT policy replacing the two separate ones; Supabase performance advisor returns 0 `multiple_permissive_policies` warnings.
4. **AC-4** — `getParentWithChildren` is wrapped with `unstable_cache` (60s TTL, per-parent tag); parent page tab navigation does not re-run the 5-model join.
5. **AC-5** — `student-attendance` list and stats routes use a Prisma relation filter (`classSection: { tenantId }`) instead of a pre-fetched `IN` list.
6. **AC-6** — Invoice generation creates all invoices via `createMany` (no lines) then all lines via `createMany`; the advisory lock window is ≤3 round-trips regardless of student count.

---

## Tasks

### Task 1 — Apply `parentId` migration to production DB
**Files:** Supabase MCP (execute_sql on `qrnbanxcrmrwganpmzmn`)

The `parentId String?` field with FK to `Parent` was added to the `User` model in a schema migration. Run the missing DDL on production:

```sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT IF NOT EXISTS "User_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "User_parentId_idx" ON "User"("parentId");
```

Verify: `SELECT column_name FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'parentId';` should return 1 row.

Gate: no new `column User.parentId does not exist` errors in production postgres logs.

---

### Task 2 — Skip `updateSession()` for `/api/*` routes in middleware
**File:** `proxy.ts`

API routes call `getSession()` themselves (which calls `supabase.auth.getUser()`). The middleware's `updateSession()` on the same request is a redundant second call. Page routes (HTML responses) need the cookie refresh — API routes do not.

In `proxy.ts`, before the Supabase auth block (line 92), add an early return for API routes:

```ts
// API routes handle their own auth via getSession() — skip the extra getUser() here
if (pathname.startsWith("/api/")) {
  return NextResponse.next();
}
```

This preserves idle-timeout enforcement (which only fires on portal page routes anyway — it checks `/admin`, `/teacher`, `/parent` prefixes).

Gate: `npm run build && npx vitest run` green. Verify login still works in E2E.

---

### Task 3 — Merge dual permissive RLS policies into single policies
**Files:** Supabase MCP (apply_migration on `qrnbanxcrmrwganpmzmn` and `jzhujpqaxyeeokgexerc`)

22 tables have `{table}_select_own_tenant` + `{table}_service_all` policies. Merge each pair into a single policy:

```sql
-- Pattern for each table (example: AttendanceRecord)
DROP POLICY IF EXISTS "attendancerecord_select_own_tenant" ON "AttendanceRecord";
DROP POLICY IF EXISTS "attendancerecord_service_all" ON "AttendanceRecord";
CREATE POLICY "attendancerecord_select" ON "AttendanceRecord"
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR (auth.role() = 'authenticated' AND "tenantId" = (
      SELECT "tenantId" FROM "User" WHERE "User"."email" = auth.email()
    ))
  );
```

Tables affected: `AttendanceRecord`, `Campus`, `EmailLog`, `Employee`, `EmployeeSalaryValue`, `Holiday`, `LeaveRequest`, `OrgConfig`, `PayrollItem`, `PayrollItemLine`, `PayrollRun`, `SalaryComponentDef`, `Tenant` (+ any remaining from staging advisor).

Gate: Supabase advisor returns 0 `multiple_permissive_policies` warnings on both projects. All Playwright E2E tests pass (they exercise RLS via demo mode service_role key).

---

### Task 4 — Cache `getParentWithChildren` with `unstable_cache`
**File:** `lib/parent-helpers.ts:43`

Wrap the function body. Key on `parentId` (or email fallback) + `tenantId`. TTL: 60s. Tag: `['parent-children']`.

```ts
export const getParentWithChildren = unstable_cache(
  async (session: SessionUser) => { /* existing body */ },
  ['parent-children'],
  { revalidate: 60, tags: ['parent-children'] }
);
```

Revalidate on mutations that change child enrollment: none currently call this — the 60s TTL is sufficient.

Gate: `npm run build && npx vitest run` green.

---

### Task 5 — Fix `student-attendance` pre-fetch anti-pattern
**Files:** `app/api/student-attendance/route.ts:31`, `app/api/student-attendance/stats/route.ts:22`

Replace:
```ts
const classSections = await prisma.classSection.findMany({ where: { tenantId }, select: { id: true } });
// ... classSectionId: { in: classSections.map(c => c.id) }
```

With a Prisma relation filter:
```ts
// Direct relation filter — no pre-fetch needed
classSection: { tenantId: session.tenantId }
```

This collapses 2 round-trips to 1 and avoids unbounded `IN` lists as class count grows.

Gate: `npm run build && npx vitest run` green. Verify admin attendance list still filters to correct tenant.

---

### Task 6 — Batch invoice generation with `createMany`
**File:** `app/api/invoices/generate/route.ts:111`

Replace the `for...of` loop with a 3-round-trip batch pattern inside the transaction:

1. `createMany` all Invoice rows (no nested lines yet — use `skipDuplicates: false`)
2. `findMany` created invoices to resolve generated IDs (filter by `periodLabel + tenantId + studentId IN [...]`)
3. `createMany` all InvoiceLine rows (flat array across all invoices)

This reduces from 500+ sequential inserts to 3 round-trips, cutting generation time for 500 students from ~10s to <500ms.

The advisory lock and invoice number sequencing logic remain unchanged — they still run inside the same transaction.

Gate: `npm run build && npx vitest run` green. Seed-test with `/api/admin/seed` to generate invoices and verify `created` count matches expected.

---

## Implementation

- Task 1: N/A — investigation revealed the active DB is staging Supabase (`jzhujpqaxyeeokgexerc`) which already has `parentId`. Old Supabase (`qrnbanxcrmrwganpmzmn`) is abandoned. No code change needed.
- Task 2: Skip `updateSession()` for `/api/*` in middleware — `proxy.ts` — added 3-line early return before the Supabase auth block; API routes handle their own auth via `getSession()`.
- Task 3: N/A — app uses Prisma with direct DB connection, not PostgREST; RLS policies are never evaluated for app queries so merging them has zero perf impact. Separately noted: `_service_all` policies with `qual=true` for ALL authenticated users are a security concern if PostgREST ever becomes used directly.
- Task 4: Cache `getParentWithChildren` — `lib/parent-helpers.ts` — extracted inner function, wrapped with `unstable_cache` (60s TTL, `parent-children` tag); public API unchanged.

---

## Verification

- Task 2: `npm run build` ✅ `npx vitest run` 116/116 ✅. Also ran `npm install` in worktree — Speed Insights dependency (#68) was missing from the symlinked node_modules.
- Task 4: `npm run build` ✅ `npx vitest run` 116/116 ✅.

**End-of-cycle gate:** `npm run build && npx vitest run && npx playwright test`

---

## Ship Notes

**Migrations required:**
- Task 1: DDL on production Supabase (`qrnbanxcrmrwganpmzmn`) — can run via Supabase MCP `execute_sql`
- Task 3: RLS policy migration on both production and staging Supabase — run via `apply_migration`

**No new env vars.**

**Rollback:** Task 2 (middleware bypass) is a 3-line change reversible in seconds. Tasks 1 and 3 are additive DDL (no data loss). Task 6 is functionally equivalent.
