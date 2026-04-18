# Performance Quick Wins — Session Cache, FK Indexes, Student Create

## Context

UAT 2026-04-18 flagged warm page loads above the strict thresholds for the
Indonesian PAUD/TKIT deployment reality (mid-range Android + intermittent 4G):

- `/admin/payroll` warm load 2,831 ms (MAJOR threshold 2,500 ms)
- `/parent/reports` warm load 5,259 ms (BLOCKER threshold 4,000 ms)
- Stat cards on multiple list pages render `0` for 2–3 s before real data

Architecture review (see chat 2026-04-18) identified four classes of fix:
A) composite indexes, B) session lookup caching, C) stat-card aggregate,
D) student-create N+1 + over-fetch trim.

Audit of `prisma/schema.prisma` shows recent migrations already added most of
the proposed composite indexes (`Invoice[tenantId,status,dueDate]`,
`PayrollRun[tenantId,periodStart]`, `ClassSection[tenantId,status]`,
`Student[tenantId,status]`). Two FK indexes remain missing:
`TeachingAssignment.classSectionId` and `InvoiceLine.feeComponentId`.

This cycle ships A (residual) + B + D. C is deferred to its own cycle since it
touches three list pages and benefits from its own UAT pass.

`DATABASE_URL` for both staging and production is confirmed on the Supabase
pooler (port 6543). No env change needed.

## Spec

**Acceptance criteria:**

1. `TeachingAssignment` has an index on `classSectionId` for reverse lookups.
2. `InvoiceLine` has an index on `feeComponentId` for reverse lookups.
3. `getSession()` does not hit the database on every request when the same
   user has been looked up within the last 60 seconds (TTL).
4. `POST /api/students` creates all guardians in parallel rather than
   sequentially, and uses a single `createMany` for `studentGuardian` rows.
5. `GET /api/students` list endpoint replaces `include: { parent: true }` with
   a tight `select: { name, phone }` so the list query stops fetching the
   full Parent row when only name + phone are displayed.
6. All existing vitest + playwright tests continue to pass.
7. Migration applies cleanly to staging; rollback documented.

**Non-goals:**

- Stat-card aggregate endpoint (separate cycle).
- Supabase RLS hardening (separate cycle, security-focused).
- Any UI changes.

## Tasks

1. **Add missing FK indexes** — new migration
   `prisma/migrations/<ts>_add_residual_fk_indexes/migration.sql` adding
   `@@index([classSectionId])` on `TeachingAssignment` and
   `@@index([feeComponentId])` on `InvoiceLine`. Update schema, run gate.

2. **In-memory user cache for `getSession()`** — add a small Map-based TTL
   cache (60 s) keyed by email in `lib/auth.ts`. Cache only the Prisma `User`
   row, not the full session (auth check still runs every request). Clear on
   user mutations is out of scope — 60 s TTL is acceptable staleness for
   `lastLoginAt` and similar fields. Run gate.

3. **Fix `POST /api/students` N+1 + slim list `include`** — refactor the
   guardian loop to:
   - Resolve all `parent` rows in parallel with `Promise.all` over upserts.
   - Insert `studentGuardian` rows in a single `createMany`.
   In the list `include`, narrow `parent: true` to
   `parent: { select: { name: true, phone: true } }` (the only fields used
   by `app/admin/students/page.tsx`). Run gate.

## Implementation

_(filled by /build)_

## Verification

_(filled by /build — between-task gate per task, end-of-cycle gate after task 3)_

## Ship Notes

_(filled by /ship — migration apply order, rollback, env vars)_
