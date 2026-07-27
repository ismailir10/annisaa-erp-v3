# Students & Guardians Module Review

## Context

CTO-initiated review-and-fix cycle. The students/guardians module is the highest-criticality surface outside payments: it is the PII hub (NIK/KK/KTP identity documents, birth data), every other module references Student, the prod roster was just re-imported (2026-07-25 wipe → re-import), and the module's family-scoping logic has a known historical bug class (parent email-null leak — a null/empty email in a `parent.findFirst` where-clause matches other families' null-email rows).

Review executed as a 4-way subagent fan-out per CLAUDE.md: (1) `app/api/students/**` routes, (2) `app/api/{guardians,parents,guardian,parent}/**` routes, (3) `app/admin/{students,guardians}/**` UI, (4) validations + lib helpers + prisma schema for Student/Guardian/Parent.

## Spec

- Every P0 finding (exploitable leak/IDOR/auth gap/data-corruption path) fixed in this cycle.
- P1 findings fixed unless fix requires schema migration or product decision — those recorded here with rationale.
- P2 (standards drift) fixed only where trivial; rest recorded as backlog.
- No behavior change beyond the fixes; no new endpoints.
- Regression tests added for each P0 fix.

## Tasks

Findings verified against source by the CTO driver before task cut. Severity per audit fan-out.

1. **T1 — Student PUT integrity + lifecycle guard + atomic cascade** (`app/api/students/[id]/route.ts`)
   - P0: partial update silently nulls `nickname/dateOfBirth/gender/address/notes` (lines 90–94 use `|| null` instead of the `!== undefined` pattern used for nis/nisn/nik in the same handler).
   - P0: direct `status: "GRADUATED"` via PUT bypasses the `/graduate` route — no `graduationDate`, no enrollment cascade. Guard: reject GRADUATED transition via PUT with 400 pointing to the dedicated action.
   - P1: INACTIVE/WITHDRAWN cascade transaction excludes the `student.update` itself — not atomic. Fold into one transaction.
   - P2: add `rateLimit` to PUT.
2. **T2 — Guardian primary invariant + bulk-create invariant + duplicate-email handling** (`app/api/guardians/[id]/route.ts`, `app/api/parents/[id]/route.ts`, `app/api/students/route.ts`)
   - P0: `guardians/[id]` PUT writes `isPrimary` with no sibling demotion and no transaction → two primaries (or zero) per student. Port the serializable-tx pattern from `students/[id]/guardians/[guardianId]/route.ts`.
   - P0: `students` POST bulk-create persists client-supplied `isPrimary` unchecked → 0 or 2+ primaries. Enforce exactly-one (auto-default first guardian when none marked; 400 on multiple).
   - P1: bulk-create skips the employee-email collision guard that `students/[id]/guardians` POST enforces.
   - P1: `Parent.email` unique-constraint violation (P2002) on PUT in both `guardians/[id]` and `parents/[id]` returns unhandled 500 → catch → structured 409.
   - P2: add `rateLimit` to both PATCH handlers.
3. **T3 — Admin UI lifecycle + data-integrity fixes** (`app/admin/students/page.tsx`, `app/admin/guardians/page.tsx`, `app/admin/guardians/[id]/page.tsx`, `lib/constants/filter-options.ts`)
   - P0: guardian detail edit never seeds `relationship`/`isPrimary` from the record — every save overwrites relationship→WALI, isPrimary→false. Seed from the junction row being PUT.
   - P0/P1: edit dialog offers GRADUATED/WITHDRAWN directly (bypasses lifecycle routes); `isActive = status !== "INACTIVE"` lets Nonaktifkan destroy GRADUATED/WITHDRAWN state. Restrict edit-dialog status to ACTIVE/INACTIVE; row toggle only for ACTIVE↔INACTIVE.
   - P1: dead `ENROLLED` filter option (not a Student.status value) always returns empty list.
   - P1: stat cards fetched once on mount, stale after every create/edit/toggle (both list pages). Refetch after mutations.
   - P2: birth-date `max` computed via UTC `toISOString()` — one day behind in Jakarta mornings.
4. **T4 — API mechanical hardening batch** (lifecycle sub-routes, portal routes, lib helpers)
   - P2: `rateLimit` on enroll POST, photo POST/DELETE, `students/[id]/guardians/[guardianId]` PUT/PATCH.
   - P2: `req.json().catch` + Zod schemas for enroll/promote/withdraw/graduate bodies; stop silently coercing invalid guardian PATCH status.
   - P2: 401/403 split in `guardian/invoices/[id]` + `guardian/raport/.../pdf`.
   - P2: explicit `tenantId` on scoped-by-guard queries (`lib/parent-activity.ts`, `lib/student-journal/guards.ts`, parent child attendance route).
   - P1: `lib/auth.ts:377,500` — `parent.findFirst({ where: { email: user.email } })` unscoped by tenant; demo path has no `assertSingleTenant`. Add tenant scoping + non-empty-email guard.
   - P2: guardians list `_count` includes INACTIVE junction rows — filter to ACTIVE.

**Deferred (recorded, not fixed this cycle):** unique constraints for `nis/nisn/nik` (requires migration — schedule with next migration window; e2e-writes-to-staging makes ad-hoc migrations risky); CSV export row cap (product call — tenant-wide export is the feature); NIK 16-digit / future-DOB / `livingWith` enum validation tightening (prod has known-corrupt NIK from roster import; tightening would block edits of existing rows); soft-delete convention unification (`status` vs `deletedAt`); missing `loading.tsx` on 3 routes; list default filter `all` vs crud.md ACTIVE-default.

## Implementation

- **T1** — `app/api/students/[id]/route.ts`: omitted-field preservation (`!== undefined` skip pattern for nickname/dateOfBirth/gender/address/notes), 400 guard on PUT transition to GRADUATED (points to Luluskan action), student.update folded into the INACTIVE/WITHDRAWN cascade transaction, rateLimit on PUT. Tests: `app/api/__tests__/students-update-put.test.ts` (6).
- **T2** — `app/api/guardians/[id]/route.ts`: serializable-tx single-primary invariant with sibling demotion + P2034 retry-once→409 (ported from `students/[id]/guardians/[guardianId]`), P2002 on parent email → 409, rateLimit on PATCH. `app/api/parents/[id]/route.ts`: P2002→409, rateLimit on PATCH. `app/api/students/route.ts`: bulk-create single-primary normalization (multiple→400, none→index 0), employee-email collision guard. Tests: `students-bulk-guardians.test.ts` (3), `guardians-id-route.test.ts` (2).
- **T3** — `app/admin/guardians/[id]/page.tsx`: edit form seeds relationship/isPrimary from the junction row it PUTs to. `app/admin/students/page.tsx`: StudentFormBody `mode` prop (edit mode locks GRADUATED/WITHDRAWN, offers ACTIVE/INACTIVE only), row toggle restricted to ACTIVE↔INACTIVE, stats refetch after mutations, birth-date max in local time. `app/admin/guardians/page.tsx`: stats refetch after mutations. `lib/constants/filter-options.ts`: dead ENROLLED option removed.
- **T4** — rateLimit on enroll/photo/guardian-junction handlers; Zod wiring for enroll/graduate/withdraw/promote + guardian status PATCH (`lib/validations/student.ts` +3 schemas); 401/403 split in 2 guardian portal routes; relation-scoped tenant filters in `lib/parent-activity.ts`, `lib/student-journal/guards.ts`, parent child attendance; `lib/auth.ts` guardian email-fallback lookup now tenant-scoped + non-empty-email guarded (both real + demo session paths); guardians list `_count` filtered to ACTIVE. Tests: `student-lifecycle-validation.test.ts` (4); `enroll.test.ts` rate-limit mock; 2 portal tests updated to the 401 contract.

## Verification

- Cross-checked design-system.html — no visual/styling changes this cycle; UI diffs are behavioral (form seeding, select options, refetch timing); components remain Shadcn per ui.md.
- End-of-cycle gate: `npm run build` green; `npx vitest run` → **239 files passed | 2 skipped, 2255 tests passed | 42 todo, 0 failed** (two colocated suites — photo route, guardian-junction route — initially broke on the new rate limits; fixed by mocking `@/lib/rate-limit`, the same pattern `enroll.test.ts` uses).
- Playwright: **deferred to the required CI `Playwright E2E` check.** Local run refused by `playwright.config.ts` guard — this environment's `DATABASE_URL` points at the remote staging pooler and the specs mutate data (env-can't-run-locally case per CLAUDE.md).
- New unit coverage: 15 tests across 4 new suites (students-update-put 6, students-bulk-guardians 3, guardians-id-route 2, student-lifecycle-validation 4).

## Ship Notes

_Filled at ship._
- Commit trail: one commit per task (T1-T4); full gate run once post-implementation covers all four (files are disjoint).
- Manual smoke deferred to /ship preview-verify (Chrome MCP): guardian-detail edit round-trip (relationship/isPrimary preserved), student edit dialog on a GRADUATED row (select locked), stat-card refresh after deactivate.
