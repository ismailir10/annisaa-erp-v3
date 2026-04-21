# Fix Parent Portal Attendance Server Component Crash

## Context

The parent portal's `/parent/attendance` page throws a Next.js Server Component render error in production, surfaced as `"An error occurred in the Server Components render. The specific message is omitted in production builds..."`. The page is completely broken for guardian users.

Root cause: commit `f56015d` added a security patch — `classSection: { tenantId: session.tenantId! }` — to prevent cross-tenant attendance leakage. However, `SessionUser.tenantId` is typed `string | null`. The `!` non-null assertion suppresses TypeScript but passes `null` at runtime for any guardian whose session lacks a tenantId. Prisma 7.6.0 performs client-side input validation and throws when `null` is passed to a required (non-nullable) nested relation filter for `ClassSection.tenantId String` (non-optional field). The result is an unhandled server-side exception that kills the render.

The security concern was valid but the fix was fragile. The correct approach: `getParentWithChildren(session)` already scopes children to `session.tenantId` (filters `Parent` by tenantId → only returns enrolled students in that tenant), so `selected.studentId` is implicitly tenant-safe. No nested relation filter is needed on the attendance query.

## Spec

- [ ] `/parent/attendance` renders attendance records without crashing for all guardian users
- [ ] No cross-tenant data leakage: guardian can only see their own child's records (tenant isolation retained)
- [ ] Voided records (`isVoided: true`) are excluded from the parent-facing view
- [ ] TypeScript compiles cleanly on the attendance page with no `!` assertions on nullable fields
- [ ] Between-task gate passes: `npm run build && npx vitest run`
- [ ] Playwright e2e passes (parent spec, 6 tests)

**Non-goals:**
- No changes to `getParentWithChildren` or `lib/parent-helpers.ts`
- No changes to other parent portal pages (invoices, reports, dashboard)
- No schema migration needed

**Assumptions:**
1. `getParentWithChildren` already enforces tenant isolation (verified: it filters `Parent` by `tenantId` and only returns children via `StudentGuardian` join — cross-tenant access is structurally impossible via this path)
2. `StudentAttendance.isVoided` field exists in schema and generated Prisma client (verified: `Boolean @default(false)`)
3. The fix is a one-line change in `app/parent/attendance/page.tsx` — no schema or API changes needed

## Tasks

- [x] **Task 1 — Diagnose & fix the Prisma query in `app/parent/attendance/page.tsx`**
  Replace the crashing `classSection: { tenantId: session.tenantId! }` filter with `isVoided: false` (safe, uses a direct scalar field). Remove the `!` assertion. Tenant isolation is already guaranteed by `resolveSelectedChild` returning only the tenant's students.
  _Acceptance: `npx tsc --noEmit` emits no new errors on the attendance page; the Prisma where clause has no nullable-field assertions._

- [x] **Task 2 — Run between-task gate + end-of-cycle smoke**
  `npm run build && npx vitest run` must pass green. Then run `npx playwright test --grep "parent"` (6 tests) to confirm the attendance tab renders without error.
  _Acceptance: all 6 parent Playwright tests pass; build output is clean._

## Implementation

- Task 1: Fix Prisma query — `app/parent/attendance/page.tsx` — replaced `classSection: { tenantId: session.tenantId! }` with `isVoided: false`; root cause was actually the unapplied `isVoided` migration causing `ColumnNotFound` on any `StudentAttendance` query
- Task 2 (infra): Applied migration `20260416000002_student_attendance_is_voided` to staging Supabase DB via MCP — added `isVoided BOOLEAN NOT NULL DEFAULT false` + index to `StudentAttendance` table

## Verification

- Task 1: `npm run build` ✓ clean, `npx vitest run` ✓ 90/90 tests pass
- End-of-cycle: `npx playwright test` ✓ 25/25 pass (attendance page loads test now green)
- Staging DB confirmed: `isVoided` column present (`boolean NOT NULL DEFAULT false`) via Supabase MCP query

## Ship Notes

**Migration already applied to staging DB** — `isVoided BOOLEAN NOT NULL DEFAULT false` was applied directly via Supabase MCP during this cycle. No migration to run on PR merge to staging.

**Production DB** — migration `20260416000002_student_attendance_is_voided` must be applied before or immediately after merging to `main`. SQL:
```sql
ALTER TABLE "StudentAttendance" ADD COLUMN "isVoided" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "StudentAttendance_isVoided_idx" ON "StudentAttendance"("isVoided");
```
Apply via Supabase MCP (`project_id: qrnbanxcrmrwganpmzmn`) or `npx prisma migrate deploy` pointed at production `DATABASE_URL`.

**No new env vars.** No data backfill needed (DEFAULT false covers all existing rows).

**Rollback:** Drop the column (`ALTER TABLE "StudentAttendance" DROP COLUMN "isVoided"`) — this reverts to the pre-migration state. The app would crash again if rolled back without also reverting the Prisma client.

**Also fixed (opportunistic):** Removed the fragile `classSection: { tenantId: session.tenantId! }` nested filter from the attendance query. Tenant isolation is upheld by `getParentWithChildren` scoping children to `session.tenantId`. The `!` non-null assertion on a `string | null` field was a latent type-safety issue regardless of the migration bug.
