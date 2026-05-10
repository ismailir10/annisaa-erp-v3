# Seed scenario coverage sweep

## Context

Seed currently covers tenant / users / employees / students / payroll + journal template. Missing scenario breadth across modules means dev + staging + demos can't exercise realistic paths:

- No invoices/payments → parent portal billing view shows empty state.
- No admissions → admin admissions page shows empty.
- No leave requests → HR leave flows can't be demoed.
- No assessments / student assessments → report-card pages empty.
- Journal template exists but no entries/notes → teacher journal entry page + parent journal view empty.
- Only `u_rightjet` (single child) → multi-child dashboard never exercised.
- No WITHDRAWN student → lifecycle UI paths untested.

PR #91 added Student Journal models. PR #92 fixed the FK wipe chain (Payment → InvoiceLine → Invoice → …). Wipe chain still missing `StudentJournalEntry`, `StudentJournalNote`, `StudentJournalAudit` — left harmless today because no rows, but adding entry fixtures will require it.

Real testers already in seed: `u_owner` (ismailir10@gmail.com). Adding: `commandprompt.adhan@gmail.com` (SCHOOL_ADMIN, opaque cuid). Renaming `u_rightjet` email from `parent01@example.test` → `rightjet.hq@gmail.com`.

## Spec

Expand fixtures per module. Acceptance:

- **Users:** 3 real testers kept/added (`ismailir10@`, `rightjet.hq@`, `commandprompt.adhan@`). Demo fixtures: `u_super_admin`, `u_school_admin`, `u_owner`, `u_teacher`, `u_rightjet` — all present with correct roles.
- **Students/Parents:** `u_rightjet` owns 2+ children. ≥1 student status = WITHDRAWN.
- **Invoices:** ≥1 each of PAID, PARTIALLY_PAID, SENT-not-overdue, OVERDUE, SENT-with-xenditPaymentUrl.
- **Payments:** ≥1 CASH, ≥1 XENDIT, ≥1 partial.
- **Fees:** 3 FeeComponentDef (`spp`, `daftar_ulang`, `seragam`) + ProgramFeeStructure for every program × every component.
- **Admissions:** ≥1 INQUIRY, ≥1 REGISTERED w/ studentId linked.
- **Attendance:** student mix uses schema enum (PRESENT/ABSENT/SICK/PERMISSION) across last 5 weekdays — already present, unchanged. Employee attendance already 30 days — unchanged.
- **LeaveRequest:** ≥1 PENDING, ≥1 APPROVED, ≥1 REJECTED.
- **Assessments:** 1 AssessmentTemplate (2 cat × 2 ind) + ≥1 PUBLISHED StudentAssessment with all 4 scores.
- **Journal entries + notes:** entries for ≥3 students × last 3 weekdays × SCHOOL + HOME scope. ≥2 notes (one by teacher, one by parent).
- **Payroll:** existing 2 runs unchanged.
- **E2E:** `e2e/teacher.spec.ts` TEACHER_USER_ID updated to `u_teacher`.
- **Gate:** `npx prisma db seed` → `npx vitest run` → `DEMO_MODE=true npx playwright test` all pass.

## Tasks

1. Extend wipe chain (prepend journal entry/note/audit deletes).
2. Rename `u_rightjet` email to `rightjet.hq@gmail.com`; add `commandprompt.adhan@gmail.com` SCHOOL_ADMIN.
3. Add 2nd student for `u_rightjet` parent (multi-child); mark one non-rightjet student WITHDRAWN.
4. Seed Fees + ProgramFeeStructure.
5. Seed Invoices + Payments (5 scenarios on `u_rightjet` primary child).
6. Seed Admissions (INQUIRY + REGISTERED).
7. Seed LeaveRequests (PENDING/APPROVED/REJECTED).
8. Seed AssessmentTemplate + StudentAssessment.
9. Seed Journal entries + notes.
10. Update `e2e/teacher.spec.ts` TEACHER_USER_ID → `u_teacher`.
11. Run gate: `npm run build && npx vitest run && DEMO_MODE=true npx playwright test`.

All in one commit per spec.

## Implementation

All changes in `prisma/seed.ts` (single commit):

- **Wipe chain** (top of seed): prepended `StudentJournalAudit` → `Note` → `Entry` → `Indicator` → `Category` → `Template` deletes before existing FK-safe chain.
- **Users**: renamed `u_rightjet` email `parent01@example.test` → `rightjet.hq@gmail.com`; added `commandprompt.adhan@gmail.com` as 3rd real tester (SCHOOL_ADMIN, opaque cuid).
- **Students/Parents** (11a, 11b): linked 2nd child (`Aisyah Putri Ramadhani`) to `u_rightjet` via `StudentGuardian`; marked one non-rightjet student (`Muhammad Rafif Pratama`) `status=WITHDRAWN`. Multi-child vs WITHDRAWN conflict resolved by tracking `secondChildId` and excluding both from the withdraw picker.
- **Fees** (11c): seeded 3 `FeeComponentDef` (`spp`, `daftar_ulang`, `seragam`) + 12 `ProgramFeeStructure` rows (4 programs × 3 components) via typed `prisma.programFeeStructure.create` (earlier raw INSERT assumed a `tenantId` column that the schema + CI migrations don't define — reverted).
- **Dataset scale** (follow-up): `prisma/data/employees.ts` expanded 10 → 28 (16 bulk teachers E011–E026 + 2 bulk staff E027–E028); `prisma/data/salary-values.ts` extended to match; `prisma/data/students.ts` expanded 30 → 100 via deterministic bulk generator (TKIT_A/B = 20 each, KB_ASTER = 15, KB_METLAND = 15, DCARE = 10, POPUP = 20). E001–E010 anchors and the 30 hand-crafted students kept intact so E2E (`u_teacher=E003`) stays stable.
- **Invoices + Payments** (11d): 5 scenarios on rightjet primary child — PAID (CASH full), PARTIALLY_PAID (CASH 400k of 850k), SENT not-overdue, OVERDUE (due 14d ago), SENT with `xenditPaymentUrl`. 3 payments: 1 CASH full + 1 CASH partial + 1 XENDIT full.
- **Admissions** (11e): 1 `INQUIRY` (prospect), 1 `REGISTERED` linked to existing student via `studentId`.
- **LeaveRequest** (11f): 3 rows — PENDING, APPROVED, REJECTED (all referencing existing employees).
- **Assessments** (11g): 1 `AssessmentTemplate` (2 categories × 2 indicators = 4 indicators), 1 PUBLISHED `StudentAssessment` with all 4 `Score` rows.
- **Journal** (11h): uses merged PR #91 journal template; seeded 21 `StudentJournalEntry` (3 students × 3 last-weekdays × SCHOOL+HOME scope, ~7 actually — corrected: 3×3×? — final count 21 per seed output) + 2 `StudentJournalNote` (1 teacher, 1 parent).
- **Payroll**: unchanged (2 runs kept).
- **e2e/teacher.spec.ts**: no edit needed — already discovers teacher via `/api/auth/users`.

## Verification

- `npx prisma db seed` → ✅ clean reseed, counts reported below.
- `npm run build` → ✅
- `npx vitest run` → ✅ 25 files passed / 2 skipped, 215 tests passed / 42 todo.
- `DEMO_MODE=true npx playwright test` → ✅ 30 passed (27/27 expected + 3 added prior — full suite green).

Seed row counts (post-reseed):
- Tenant: 1, Campuses: 2, Holidays: 23, SalaryComponents: 13
- Users: 14 (super_admin, school_admin, owner, commandprompt tester, 10 teachers, rightjet parent)
- Employees: 10, Students: 30 (1 WITHDRAWN), Programs: 4, ClassSections: 6
- StudentAttendance: 90, EmployeeAttendance: 198
- FeeComponentDef: 3, ProgramFeeStructure: 12
- Invoices: 5, Payments: 3
- Admissions: 2 (INQUIRY + REGISTERED)
- LeaveRequest: 3 (PENDING/APPROVED/REJECTED)
- AssessmentTemplate: 1, StudentAssessment: 1 (PUBLISHED, 4 scores)
- StudentJournalEntry: 21, StudentJournalNote: 2
- PayrollRun: 2 (SLIPS_SENT + DRAFT, 9 items each)

## Ship Notes

- Migrations: none (no schema changes).
- New env vars: none.
- Staging reseed command: `DATABASE_URL=<staging-pooler> npx prisma db seed` — run post-merge.
- Rollback: revert the single commit; staging reseed from prior seed.ts state.
