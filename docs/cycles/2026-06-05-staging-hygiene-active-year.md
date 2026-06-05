# Staging Hygiene + Single-Active-Year Integrity

## Context

The 2026-06-04 admin+teacher UAT ([report](../uat/reports/2026-06-04-admin-teacher-full.md)) surfaced two coupled **Major** integrity problems. (1) **Multiple `AcademicYear`s and `Semester`s are `ACTIVE` at once** — activating a year/semester never demotes its siblings, so "current" is not uniquely resolvable. Its concrete user-facing break: `/admin/classes` defaults its year filter to the *first* `ACTIVE` year the API returns (an arbitrary E2E test year dated 2030) and renders "Tidak ada data" — an admin opening Kelas sees **no classes** until they manually switch to `2025/2026`. (2) **Staging is swamped with un-torn-down E2E fixtures** — 18/21 years, 9/10 active semesters, ~75 admissions (many duplicate `Rate Limit Test`), E2E classes, and 56 E2E invoices, because several Playwright specs create data with no teardown. Together these make staging un-demoable and mask real data. Intended outcome: enforce at most one ACTIVE year per tenant + one ACTIVE semester per year at the API layer, make Kelas resolve the *true* current year date-wise, stop E2E specs from leaking, and reseed staging to clear the backlog.

## Spec

**Acceptance criteria**
- [ ] Activating an `AcademicYear` (PUT/POST `status: "ACTIVE"`) demotes every other `ACTIVE` year for the same tenant to `PLANNING` in a single transaction — afterwards at most one ACTIVE year exists per tenant.
- [ ] Activating a `Semester` (create or PUT `status: "ACTIVE"`) demotes every other `ACTIVE` semester **in the same `AcademicYear`** to `INACTIVE` in one transaction — at most one ACTIVE semester per year. (`Semester.status` enum = `ACTIVE | INACTIVE`, default `ACTIVE` — schema.prisma:1110.)
- [ ] `/admin/classes` default year = the `ACTIVE` year whose `[startDate, endDate]` covers today; fallback to the most-recently-started `ACTIVE` year, then `list[0]`. Opening Kelas with seed data lands on the year that actually has classes, never an empty default.
- [ ] The five leaking E2E specs (`daftar-public`, `admin`, `admin-admission-convert-parity`, `sibling-detect`, `curriculum-promes-import`) clean up every entity they create (years, semesters, admissions, classes, invoices) in `afterAll`/`afterEach`, OR scope creation to a disposable tenant that is deleted after — no `E2E …`-prefixed rows survive a full `npx playwright test` run.
- [ ] Staging reseeded via `npm run reseed:staging` (ops step, recorded in Ship Notes) so the existing backlog is gone; post-reseed there is exactly one ACTIVE year + one ACTIVE current-term semester.
- [ ] `npm run build && npx vitest run` green; new unit tests cover the year + semester single-active invariants and the Kelas date-bounded year pick.

**Non-goals**
- Invoice "Link Gagal" / Xendit link-generation failures (UAT D1) — separate cycle.
- Admission "Konversi ke Siswa" offer-then-reject at non-ADMITTED (B1) and Sumber WhatsApp→Datang Langsung mutation (B2) — separate cycle.
- Teacher assessment empty-state UX + adding tema/pekan to Semester 2 (T1/T2/T3) — separate cycle.
- No schema/enum changes to `AcademicYear.status` / `Semester.status` (reuse `PLANNING|ACTIVE|ARCHIVED`).

**Assumptions**
1. A tenant has exactly one current `AcademicYear` (`ACTIVE`); planning years sit at `PLANNING`, past years at `ARCHIVED`. Demotion target on activate = `PLANNING`.
2. A year has at most one `ACTIVE` semester (the current term); other terms in the same year move to `INACTIVE` on activate. The period resolver (`getCurrentPeriodFromDb`) already date-bounds (`status='ACTIVE' AND startDate<=today<=endDate`), so this is about picker/integrity cleanliness, not the resolver.
3. Reseeding staging is acceptable and the right cleanup (vs a one-shot demote script). A manual Supabase snapshot is taken first per the runbook. **CTO will NOT auto-run the destructive reseed** — it is handed off / explicitly confirmed at build time.
4. Demoting siblings on activate is silent (no extra confirm dialog) — the activate confirm already exists.
5. Pollution source is **specs run against preview deployments (which use the staging DB)** — CI itself runs E2E vs ephemeral `localhost:5432`, so CI is not the leak. `afterAll` teardown keyed on each spec's `Date.now()` suffix is the right durable fix.

## Tasks

1. [x] **`setActiveAcademicYear` transaction helper + wire into year API.** Add `lib/academic-year/activate.ts` exporting a helper that, in a `prisma.$transaction`, demotes all other `tenantId` years with `status=ACTIVE` to `PLANNING` then sets the target `ACTIVE`. Call it from `app/api/academic-years/[id]/route.ts` PUT and `route.ts` POST when `status==="ACTIVE"`. *Accept: PUT activate leaves exactly one ACTIVE year for the tenant.*
2. [x] **Single-active Semester per year.** Routes use the `prisma.semester` model client (schema caught up — `model Semester` schema.prisma:1103). In `app/api/admin/curriculum/semesters/route.ts` (`create`, L82) + `[id]/route.ts` (PUT, L81), when the resulting status is `ACTIVE`, wrap in `prisma.$transaction` and `updateMany` sibling `ACTIVE` semesters in the same `academicYearId` to `INACTIVE`. *Accept: activating/creating an ACTIVE semester leaves ≤1 ACTIVE semester in that year.* (independent of 1; same txn pattern.)
3. [ ] **Kelas date-bounded default year.** API already returns full rows incl. `startDate/endDate` (`/api/academic-years` GET, `orderBy startDate desc`). (a) Extend the client `AcademicYear` type + `setYears` mapping in `app/admin/classes/client.tsx` to carry `startDate`/`endDate`. (b) Replace `list.find(y => y.status === "ACTIVE")` (~L124-127) with a pure `pickDefaultYear(years, today)`: ACTIVE year covering today (`startDate<=today<=endDate`), else most-recent-`startDate` ACTIVE, else `list[0]`. *Accept: with multiple ACTIVE years, Kelas selects the date-covering one, never an empty default.* (independent of 1/2.)
4. [ ] **Unit tests for invariants.** Vitest: `setActiveAcademicYear` demotes sibling years to PLANNING; semester activate demotes in-year siblings to INACTIVE; `pickDefaultYear` date logic (covering / fallback-recent / list[0] / empty). *Accept: tests fail on the pre-fix behavior, pass after.* (depends on 1,2,3.)
5. [ ] **E2E spec teardown (stop preview→staging leak).** Root source: specs create timestamped rows (`curriculum-promes-import.spec.ts:52` `E2E PROMES Import ${Date.now()}` years; `admin-admission-convert-parity.spec.ts:60` admissions; plus `daftar-public`, `admin`, `sibling-detect`) and, when run against a **preview deploy (staging DB)**, leave them. Add `afterAll`/`afterEach` that deletes each created entity by its captured id/suffix (years, semesters, admissions, classes, invoices). *Accept: a full `npx playwright test` leaves no new `E2E …`/`Rate Limit Test` rows.* (independent.)
6. [ ] **README ADR + invariant note.** Add a short ADR-table row in README.md recording the single-active-year/semester invariant + Kelas date-bounded default (also satisfies the `commit-msg` hook requiring README on `feat` commits touching `app/**`/`lib/**`). *Accept: README ADR row present; pre-commit/commit-msg pass.* (depends on 1,2,3.)
7. [ ] **Reseed staging + Ship Notes (ops, hand-off).** Run `npm run reseed:staging` against staging — **manual, needs staging creds + prior Supabase snapshot; CTO does not auto-run it.** Record exact command, snapshot id, and post-reseed active-year/semester counts in Ship Notes. *Accept: staging shows 1 ACTIVE year + 1 ACTIVE current-term semester, no E2E backlog.* (depends on 1,2,5 merged so reseed output stays clean.)

## Implementation
- Subagent plan: tasks 1/2/3/5 are independent (different files) but executed **inline sequentially** in one worktree to avoid write conflicts; each task's unit test folded into its own commit (TDD), superseding the standalone task-4.
- Task 1: single-active AcademicYear — `lib/academic-year/activate.ts` (`demoteOtherActiveYears` txn helper + `ACADEMIC_YEAR_STATUSES`/`isAcademicYearStatus` allowlist), wired into `app/api/academic-years/route.ts` POST + `[id]/route.ts` PUT (demote siblings→PLANNING inside `$transaction` when status=ACTIVE; capture narrowed `tenantId` before closure). Review fix (superpowers:code-reviewer): added status allowlist validation (400 on unknown) to both handlers — activation branches on the free-form string, so a typo'd status would silently skip demotion. `feature-dev:code-reviewer` unavailable (glm-5 infra error); superpowers pass cleared post-fix.
- Task 2: single-active Semester per year — `lib/curriculum/semester-activate.ts` (`demoteOtherActiveSemesters` txn helper, scoped to `tenantId`+`academicYearId`, ACTIVE→INACTIVE), wired into `app/api/admin/curriculum/semesters/route.ts` POST (create defaults ACTIVE → demote-then-create in `$transaction`) + `[id]/route.ts` PUT (added `academicYearId` to `before` select; demote-then-update when status=ACTIVE). Updated `app/api/__tests__/curriculum-routes.test.ts` mock (`$transaction` + `semester.updateMany`). Status zod-validated (`semesterUpdateSchema` enum) — no allowlist gap. superpowers:code-reviewer: PASS, no findings (tenant+year scoping airtight, 409 P2002 path preserved through the transaction).

## Verification
- Task 1: gates passed — `npm run build` (compiled + typecheck) green; `npx vitest run` 1889 passed; new `lib/academic-year/__tests__/activate.test.ts` (4 tests: demote where-clause PUT/create paths + status allowlist) green.
- Task 2: gates passed — `npm run build` green; `npx vitest run` 1894 passed; new `lib/curriculum/__tests__/semester-activate.test.ts` (3 tests: PUT/create where-clause + year-scoping). Fixed 2 pre-existing `curriculum-routes.test.ts` failures caused by create moving inside `$transaction` (mock now provides `$transaction`+`updateMany`).

## Ship Notes
