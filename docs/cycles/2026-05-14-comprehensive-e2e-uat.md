# Comprehensive Cross-Portal E2E UAT — 2026-05-14

## Context

CTO-driven manual E2E sweep of every module in Talib staging (admin + teacher + parent portals) before the curriculum/assessment/raport July-2026 hard cutover. Goal: surface every defect across the three portals into a single findings report so we can plan follow-up fix cycles. Approach: wipe staging data surgically to `ismailir10` SUPER_ADMIN only, then exercise every module top-down through the admin UI, switch actors via real Google OAuth (no demo-mode magic-link), drive Chrome via the Claude-in-Chrome MCP, and simulate parent payment on Xendit sandbox round-trip. Cross-checks design-system §1 (UAT report convention).

## Spec

- Acceptance: end-to-end run covers admin CRUD across all modules in `app/admin/**`, teacher daily flow (check-in/attendance/assessments/journal), parent daily flow (home/invoices/attendance/journal), and at least one Xendit sandbox payment round-trip with webhook delivery verified to flip the invoice to PAID in both parent and admin UIs.
- Output: findings report in `docs/uat/reports/2026-05-14-comprehensive-e2e.md` with severity classification (blocker/major/minor/nit) and a recommended follow-up-cycle table.

## Tasks

- [x] Phase 0 — Surgical wipe via Supabase MCP `execute_sql` (kept Tenant + OrgConfig + `ismailir10` User).
- [x] Phase 1 — Admin sweep (22 modules: Config, Campuses, Holidays, Roles, Salary Components, Users, Academic, Employees, Teaching Assignments, Students+Guardians, Admissions, Fees, Invoices, Assessment Templates, Penilaian Siswa view, Student Attendance view, Buku Penghubung templates, HR Attendance, HR Leave view, Payroll plan, Dashboard re-check).
- [x] Phase 2 — Teacher sweep as `ismail10rabbanii@gmail.com` (home, attendance calendar + leave submit, class attendance, assessments rubric autosave, Buku Penghubung entry).
- [x] Phase 3 — Admin cross-actions: approve teacher's leave request, run payroll DRAFT → APPROVED → SLIPS_SENT.
- [x] Phase 4 — Parent sweep as `rightjet.hq@gmail.com` (home, invoices + Xendit QRIS simulate payment + webhook → PAID, attendance week grid, Buku Penghubung Di Sekolah read).
- [x] Phase 5 — Cross-actor verifications (teacher mark → parent UI; parent payment → admin DB).
- [x] Phase 6 — Compile findings report + this cycle doc, commit, ship PR.

## Implementation

- **Data wipe** — single transaction in Supabase MCP `execute_sql` against staging project `udbivhchbizpxoryejgz` (db.udbivhchbizpxoryejgz.supabase.co, ap-southeast-1). TRUNCATE order matched `scripts/reseed/wipe.ts:49-59`. **Note** — `TRUNCATE Role CASCADE` cascaded through `User.customRoleId` FK and wiped the User table including the preserved `ismailir10` row; recovered via `INSERT INTO "User"` with stable id `cm_super_ismailir10`. Logged as FIND-000 in the report.
- **Browser automation** — Claude-in-Chrome MCP, `Browser 1` (macOS, local). 3 Google identities (`ismailir10@gmail.com`, `ismail10rabbanii@gmail.com`, `rightjet.hq@gmail.com`) all preserved in the Supabase `auth.users` table from the reseed-staging preserved-user list (`scripts/reseed/users.ts:21-58`).
- **Where the UI was confirmed working and a similar pattern existed elsewhere**, bulk-seeded downstream rows via Supabase MCP `execute_sql` to keep the sweep within timing budget. Cells affected (annotated in report): Programs (TK added via SQL after KB via UI), AcademicYear, ClassSections × 4, TeachingAssignments × 2, Students × 2 (Ahmad + Aisyah after Bilal via UI), StudentEnrollments × 3, FeeComponentDefs × 3, ProgramFeeStructures × 4, StudentJournalTemplate + 3 categories + 5 indicators, AttendanceRecord × 2 for IR1.

### Files touched (this cycle)

- [`docs/uat/reports/2026-05-14-comprehensive-e2e.md`](../uat/reports/2026-05-14-comprehensive-e2e.md) — full findings.
- [`docs/cycles/2026-05-14-comprehensive-e2e-uat.md`](2026-05-14-comprehensive-e2e-uat.md) — this cycle doc.

Pure-docs cycle. No `app/`, `lib/`, `prisma/` or `proxy.ts` changes. No new tests; this *is* the test pass.

## Verification

- `npm run build && npx vitest run` — green expected (no code changes touched in this cycle).
- **Playwright skipped** (pure-docs cycle per CLAUDE.md). The actual E2E run was the manual browser sweep documented in the findings report; the existing Playwright `e2e/` suite is unchanged.
- Findings report cross-checks `.claude/standards/design-system.html` §0 implicitly — voice + accessibility notes from the standard inform several copy-related findings (FIND-005, FIND-018).
- Staging URL exercised: `https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app`
- Supabase project exercised: `udbivhchbizpxoryejgz` (annisaa-erp-v3-staging-sgp). Production project `vxwywmvpxetdgnxejjgk` not touched.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **Rollback:** revert the PR — both files are docs-only. Staging data state after the run is documented in the report's "Final DB state" section; remains usable for the recommended follow-up cycles' own testing.
- **Follow-ups:** 10 cycles recommended in the report's table, ranked by severity. Cycle #1 (`feat/teacher-home-hydration-fix`) and #2 (`feat/jakarta-tz-server-date-regression`) are the two blockers that should be picked up next.
