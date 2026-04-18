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

### Task 1 — FK indexes (commit 541c4c6)

- `prisma/schema.prisma` — added `@@index([classSectionId])` to
  `TeachingAssignment` and `@@index([feeComponentId])` to `InvoiceLine`.
- `prisma/migrations/20260418000000_add_residual_fk_indexes/migration.sql` —
  `CREATE INDEX IF NOT EXISTS` for both columns. Non-blocking, safe online.

### Task 2 — Session user cache

- `lib/auth.ts` — added module-level `Map<email, { user, expiresAt }>` with
  60 s TTL. `getSession()` checks cache before `prisma.user.findUnique`. The
  cache is refreshed on user auto-create and on every `lastLoginAt` bump so
  the cached row never lags writes the same request just made.
- Supabase `auth.getUser()` still runs on every call — only the Prisma
  round-trip is collapsed.

### Task 3 — Student create N+1 + slim list `include`

- `app/api/students/route.ts`:
  - GET: `parent: true` narrowed to `parent: { select: { name: true, phone: true } }`
    on the primary-guardian include. List page only renders these fields.
  - POST: replaced the sequential `for` loop over `body.guardians` with a
    `Promise.all` over upserts/creates, then a single
    `prisma.studentGuardian.createMany` for the join rows. Two guardians
    (typical) drops from 4 sequential round-trips to 2 parallel + 1.

## Verification

| Gate                       | Command                                              | Result |
|----------------------------|------------------------------------------------------|--------|
| Task 1 between-task        | `npm run build && npx vitest run`                    | ✅ build ok, 116/116 |
| Task 2 between-task        | `npm run build && npx vitest run`                    | ✅ build ok, 116/116 |
| Task 3 between-task        | `npm run build && npx vitest run`                    | ✅ build ok, 116/116 |
| End-of-cycle (Playwright)  | `npx playwright test`                                | ✅ 25/25 in 25.6 s |

Manual smoke not required — changes are server-side only and exercised by
the Playwright suite (admin students list/create flow, parent dashboard
fetches, teacher session checks all hit the modified code paths).

## Ship Notes

**Migration to apply:** `20260418000000_add_residual_fk_indexes`
- Two `CREATE INDEX IF NOT EXISTS` statements. PostgreSQL holds a SHARE
  lock on the table during a non-CONCURRENT `CREATE INDEX` — fine on
  staging with no traffic, but for production consider running the same
  SQL with `CREATE INDEX CONCURRENTLY` manually and then marking the
  migration applied if the live tables are large enough to matter.
- `TeachingAssignment` and `InvoiceLine` are both small in the current
  tenant (≪ 10k rows), so the lock window is sub-second. Safe to ship via
  the standard Prisma migrate flow.

**Env vars:** none added.

**Rollback:** `DROP INDEX "TeachingAssignment_classSectionId_idx";` and
`DROP INDEX "InvoiceLine_feeComponentId_idx";`. The session cache is
purely additive — to disable, revert `lib/auth.ts`. The student-create
refactor is functionally equivalent to the original loop; revert
`app/api/students/route.ts` if a regression appears.

**Post-deploy check:** after staging deploys, hit `/admin/students` once
and watch for the request-coalescing benefit on the second page load
(session cache hit). Re-run `/uat parent/reports` and `/uat admin/payroll`
in a follow-up cycle to confirm the warm-load numbers improve.
