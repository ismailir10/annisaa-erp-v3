# Enrollment Flexibility — Advisory Age Bands + Dual Enrollment (Sekolah + Daycare)

## Context

Bu Shanti reported two blockers from real admin use on 2026-08-21 (WhatsApp):

> "di kelas (program) itu harus sesuai usia, ya? … kadang ada bbrp anak yg daftar dan penempatannya sesuai dengan kemampuannya (biasanya turun kelas drpd usia seharusnya) … ada ortu yg sengaja mengulang kelas anakny atau usia anaknya telat masuk sekolah. kemarin saya coba daftarin anak usia TK ke kelas KB itu gak bisa karena usianya lewat batas maksimum … mungkin batasan usianya bisa diubah, jadi cukup batas usia minimum di masing2 programnya saja"
>
> "ini juga berkaitan dgn program daycare. di staging belum bisa daftarin anak di 2 kelas aktif (sekolah+daycare)"

Both are real, and reading the code found the causes are broader than the report.

**Age gate.** `app/api/students/[id]/enroll/route.ts:49-58` hard-rejects (HTTP 400) outside `Program.ageMin`/`ageMax`. Three defects sit inside those ten lines:

1. The outer guard is `if (student?.dateOfBirth && sectionInfo.program.ageMin)`, so a program with only an `ageMax` is never checked at all — the `ageMax` branch is dead whenever `ageMin` is null or 0.
2. Age is derived as `(Date.now() - dob) / (30.44 days)`. Two errors compound: approximate months drift, and it measures age **today** rather than at a fixed point in the academic year, so the same student passes in July and fails in March.
3. The **second enrolment door** — `app/api/admin/classes/[id]/enrollments/route.ts`, add-student-from-class-detail — performs no age check whatsoever. Two doors, one lock.

Staging data (`udbivhchbizpxoryejgz`, 37 ACTIVE enrolments) quantifies defect 2 exactly: measured at `AcademicYear.startDate`, **0** enrolments exceed their program's `ageMax`; measured at `Date.now()` as the code does, **13** do. Correcting the reference date removes 13 false blocks on its own.

The same query showed `ageMin` is the sharper edge: **26 of 37** active enrolments sit *below* their program's `ageMin` at year start — KB 26–35mo against a 36–48 band, TKIT-A 38–47 against 48–60, TKIT-B 50–59 against 60–72, DCARE 0–5 against 6–36. A uniform ~10-month shortfall across every program; add 12 months and every band fits. The bands are calibrated to age *reached during* the year, not age at intake. A hard `ageMin` would therefore refuse re-enrolment for 26 of 37 existing students. So **both** bounds become advisory, not just `ageMax` — a wider change than Bu Shanti asked for, and the data is why. Staging bands are also tighter than `prisma/seed.ts` claims (KB is 36–48, not 36–60; TKIT is split into TKIT-A and TKIT-B), which is precisely why her TK-age child bounced off KB.

**Dual enrollment.** Blocked by two guards that contradict each other:

- `app/api/students/[id]/enroll/route.ts:65-69` — one ACTIVE enrolment per student **globally, across all years**.
- `app/api/admin/classes/[id]/enrollments/route.ts:89-104` — one ACTIVE enrolment per student **per academic year**.

The global variant is actively harmful today. 16 of the 21 current-year students carry a stale `ACTIVE` row in the ARCHIVED 2024/2025 year (shape is uniformly `X/2024-2025(ARCHIVED) + Y/2025-2026(ACTIVE)`; there are **zero** same-year doubles, so these are un-closed prior-year rows from the bulk roster import, not intentional dual enrolment). For those 16, the students-detail door refuses every enrolment while the class-detail door works. `app/api/students/[id]/promote/route.ts:37` shares the flaw — an unscoped `findFirst({ studentId, status: "ACTIVE" })` picks an arbitrary row when several exist.

Nothing in the schema forbids dual enrolment: `StudentEnrollment` is unique only on `[studentId, classSectionId]`, `ClassSession` is unique on `[classSectionId, date, slot]`, and `StudentAttendance` on `[studentId, sessionId]` — so school-AM plus daycare-PM already records correctly. Staging already runs DCARE as a first-class program: `type = YEAR_ROUND`, 2 class sections, 13 active enrolments, 9 fee-structure rows. The plumbing exists; only the guard is in the way.

The real cost is **billing**, not display. `lib/finance/build-billing-run.ts:110-117` dedups candidates by `studentId`, first enrolment wins, so a KB + DCARE student is silently invoiced for one program's fees. Silent under-billing. `Invoice` has no `[studentId, periodLabel]` unique constraint (only `[tenantId, invoiceNumber]`), so merging both programs' lines into one invoice needs no migration. Seven display sites additionally assume `enrollments[0]`.

Note that `Program.type` is currently **display-only** — a label in `app/admin/academic-years/page.tsx` and an enum in `lib/validations/program.ts`, consumed by no business logic anywhere. This cycle makes it load-bearing for the first time.

**Outcome:** an admin can place any child in any class, seeing an advisory warning (never a wall) when the age falls outside the program band, with the override reason captured in the audit log; and a child can hold one school enrolment and one daycare enrolment simultaneously within an academic year, billed on a single merged invoice.

**UAT input:** newest report is `docs/uat/reports/2026-06-04-admin-teacher-full.md` — 78 days old, past the 60-day staleness rule, and later than no cycle touching these files. Treated as background only; no findings carried in as fact.

**Prior cycles in this area:** `docs/cycles/archive/2026-05-15-academic-hierarchy-refactor.md` (session/attendance keys), `docs/cycles/archive/2026-06-23-enrollment-application.md` (`dcareAddon` introduced), `docs/cycles/archive/2026-07-21-historical-roster-visibility.md` (archived-year enrolments are deliberately preserved — do **not** mass-close them), `docs/cycles/archive/2026-07-29-class-picker-year-scoping.md`, `docs/cycles/2026-08-14-billing-run-wizard.md` (the dedup being changed here).

## Spec

### Acceptance criteria

**Age band becomes advisory**

- [x] Age is computed with calendar-correct month arithmetic, never `/ 30.44`.
- [x] Age is measured at the target class's `AcademicYear.startDate`, not at request time. The same student + same class yields the same verdict in July and in March.
- [x] `ageMin` and `ageMax` are **both** advisory. Neither ever returns a terminal error.
- [x] A first enrolment attempt outside the band returns `409` with `code: "AGE_OUT_OF_RANGE"` and a human message naming the student's age, the program band, and the reference date used.
- [x] Re-submitting the same request with a non-empty `ageOverrideReason` succeeds and writes an `AuditLog` row with action `student.enroll.age-override` whose `after` carries the reason, the computed age in months, and the program band.
- [x] A program with only `ageMax` set (no `ageMin`) is evaluated — the dead-branch bug is gone, proven by a unit test.
- [x] Both enrolment doors (`students/[id]/enroll` and `admin/classes/[id]/enrollments`) run the identical check and return the identical shape.

**Dual enrollment**

- [x] A student may hold at most one ACTIVE enrolment **per `Program.type` per academic year**. One `SEMESTER` (sekolah) plus one `YEAR_ROUND` (daycare) is permitted; two `SEMESTER` in the same year is not.
- [x] The guard is scoped to the target class's academic year. A stale ACTIVE row in an ARCHIVED year no longer blocks anything.
- [x] Both doors enforce the identical rule and return `409 code: "ALREADY_ENROLLED"` naming the conflicting class.
- [x] `promote` resolves its source enrolment by academic year **and** program type, never by unscoped `findFirst`.
- [ ] A student with a school enrolment and a daycare enrolment appears on both class rosters and both attendance registers. — **not ticked:** structurally supported (`ClassSession` is unique on `[classSectionId, date, slot]` and `StudentAttendance` on `[studentId, sessionId]`, so two same-day sessions record independently) and no code change was needed, but no automated test drives an actual dual-enrolled attendance register. Confirm during preview-verify.

**Billing**

- [x] A billing run for a student with two active enrolments produces **one** row carrying the fee lines of **both** programs.
- [x] `totalDue` remains owned by `applyAdjustments` — never re-summed at the call site (billing-run rule 6).
- [x] Keringanan adjustments are applied once, across the merged line set.
- [x] When a student's lines span more than one program, each line label is disambiguated by program name; single-program students keep today's labels byte-identical.
- [x] `classLabelSnapshot` names both classes when there are two.
- [x] Existing single-enrolment billing behaviour is unchanged — proven by the existing `lib/finance/__tests__` suite passing untouched.

**Display**

- [x] All seven `enrollments[0]` sites resolve through one shared primary-enrolment helper that prefers the `SEMESTER` enrolment: `app/admin/students/page.tsx:354`, `lib/students/export.ts:66`, `lib/parent-helpers.ts:95`, `app/api/admin/raport/[studentId]/[termId]/pdf/route.ts:61`, `app/api/guardian/raport/[studentId]/[termId]/pdf/route.ts:98`, `app/api/guardian/invoices/[id]/route.ts:135`, `app/api/guardian/invoices/[id]/pdf/route.ts:133`.
- [x] Raport and invoice PDFs name the school class, not the daycare class.
- [x] Admin student list and CSV export show both classes when two exist.
- [x] Override-confirm UI follows `design-system` (Dialog/Sheet pattern already used by the enrol flow) and `voice.md` Indonesian copy.

### Non-goals

- **No change to any `Program.ageMin`/`ageMax` value.** The ~10-month band mismatch is real but correcting it is a data decision for Bu Shanti, not this cycle. Advisory bands make it harmless in the meantime.
- **No configurable cutoff-date field.** `AcademicYear.startDate` is the reference; a dedicated "usia per 1 Juli" column is deferred.
- **No schema migration.** The dual-enrolment rule is enforced in application code inside the existing transaction + row lock. `Program.type` is not denormalised onto `StudentEnrollment`, so no partial unique index is possible; that trade-off is recorded in Ship Notes.
- **No mass-closing of the 16 stale ARCHIVED-year rows.** `2026-07-21-historical-roster-visibility` deliberately preserves them. Year-scoping the guard makes them inert. A read-only diagnostic SQL goes in the runbook instead.
- **No split invoices.** One merged invoice per `(studentId, periodLabel)`, per decision.
- **No daycare attendance/teacher UI work.** Sessions and attendance already key per class section and need nothing.
- **`EnrollmentApplication.dcareAddon` is not wired to auto-create a second enrolment.** Convert still produces one student; the admin enrols into daycare explicitly. Auto-conversion is a follow-up.

### Assumptions

1. **Reference date = `AcademicYear.startDate`** of the target class's year. Chosen over a fixed cutoff because it needs no new field and is stable within a year. The warning text states the reference so an admin can see what was measured.
2. **Stream key = `Program.type`.** "One per type per year" generalises "sekolah + daycare" without hardcoding program codes. It relies on `type` being set correctly; staging is clean (DCARE=`YEAR_ROUND`, KB/TKIT-A/TKIT-B=`SEMESTER`). Programs typed `SESSION` (Pop Up Class) become independently enrollable as a side effect — believed desirable, flag if not.
3. **Primary enrolment = the `SEMESTER` one**, falling back to the earliest `enrollDate` when there is no `SEMESTER` row (a daycare-only infant). Drives raport, invoice PDF header, and the singular "Kelas" column.
4. **Merged-invoice label disambiguation** activates only when a student's lines span >1 program, so single-program invoices stay byte-identical and no existing PDF or parent-portal snapshot shifts.
5. **Keringanan applies across the merged bill**, not per program — `applyAdjustments` is called once over the concatenated base lines. If a grant is meant to cover school fees only, this over-applies it. No such grant exists on staging today.
6. **The override reason is free text, required, non-empty.** No fixed reason taxonomy.
7. **`409` is the status for both advisory rejections**, matching the existing `ALREADY_ENROLLED` convention in `admin/classes/[id]/enrollments`, rather than the `400` the students door uses today. The students door's status changes; its callers are ours.

## Tasks

Dependency graph: T1 → T2; T3 independent; T4, T5 need T2+T3; T6 needs T3; T7 needs T4+T5; T8 needs T3; T9 needs T3; T10 last. **T3 and T1 can start in parallel. T6, T8, T9 are mutually independent once T3 lands.**

- [x] **T1 — Calendar-correct age-in-months helper.**
  Add `ageInMonthsAt(dob: string, reference: Date | string): number | null` to `lib/admission/age.ts`, reusing the Y/M/D borrow arithmetic that `formatAgeFromDob` already implements (UTC-noon construction, `days < 0` borrow). Export both from the same module. No new file — *reuse `lib/admission/age.ts`*.
  *Acceptance:* unit tests in `lib/admission/age.test.ts` cover exact-birthday, day-before-birthday, leap-year 29 Feb, malformed input → `null`, future DOB → `null`; and assert `ageInMonthsAt("2020-03-15", "2026-03-14") === 71` (not 72).

- [x] **T2 — Advisory age-fit evaluator.**
  New `lib/enrollment/age-fit.ts`: `evaluateAgeFit({ dob, referenceDate, ageMin, ageMax, programName })` → `{ ageMonths: number | null, status: "OK" | "BELOW_MIN" | "ABOVE_MAX" | "UNKNOWN", message: string | null }`. `UNKNOWN` when DOB is missing — never blocks. Both bounds evaluated **independently**, so an `ageMax`-only program is checked (kills the dead-branch bug). Message in Indonesian per `voice.md`, naming age, band, and reference date. Depends: T1.
  *Acceptance:* unit tests prove `ageMin: null, ageMax: 48` still yields `ABOVE_MAX` for a 60-month child; missing DOB yields `UNKNOWN`; boundary months (exactly `ageMin`, exactly `ageMax`) yield `OK`.

- [x] **T3 — Enrollment stream helpers.**
  New `lib/enrollment/active.ts`: `findStreamConflict(tx, { studentId, academicYearId, programType })` returning the conflicting enrolment or `null`; `pickPrimaryEnrollment(enrollments)` preferring `program.type === "SEMESTER"` then earliest `enrollDate`. Pure functions where possible so they unit-test without Prisma mocks.
  *Acceptance:* unit tests cover — one SEMESTER + one YEAR_ROUND in the same year → no conflict; two SEMESTER same year → conflict; SEMESTER in an ARCHIVED year + SEMESTER in the active year → no conflict; `pickPrimaryEnrollment` on a daycare-only student returns the daycare row.

- [x] **T4 — Rewrite the students-detail enrolment door.**
  `app/api/students/[id]/enroll/route.ts`: swap the global-any-year guard (`:65-69`) for `findStreamConflict` scoped to `sectionInfo.academicYearId`; replace the hard age block (`:49-58`) with `evaluateAgeFit` against that year's `startDate`; return `409 { code: "AGE_OUT_OF_RANGE", message, ageMonths, ageMin, ageMax }` unless `ageOverrideReason` is present and non-empty. Add optional `ageOverrideReason` to `enrollStudentSchema` in `lib/validations/student.ts`. On override, `recordAudit` inside the transaction (tx form — the reason must not be lost) with action `student.enroll.age-override`. Depends: T2, T3.
  *Acceptance:* `app/api/__tests__/enroll.test.ts` updated — the two existing `400` age tests become `409` + `AGE_OUT_OF_RANGE`, plus new tests for override-succeeds, audit-row-written, same-year-same-type conflict, and cross-type same-year success.

- [x] **T5 — Bring the class-detail door to parity.**
  `app/api/admin/classes/[id]/enrollments/route.ts`: add the `evaluateAgeFit` check it currently lacks and swap its per-year guard for `findStreamConflict` so cross-type enrolment is allowed. Preserve the existing advisory-lock + capacity ordering and the `EnrollmentBlocked` error shape. Depends: T2, T3.
  *Acceptance:* new tests assert both doors return identical `code` and status for the same input; the existing capacity-race test still passes.

- [x] **T6 — Scope promote to year + stream.**
  `app/api/students/[id]/promote/route.ts:35-40`: replace `findFirst({ studentId, status: "ACTIVE" })` with a lookup scoped to the source academic year and the target class's program type, so a student with school + daycare promotes each stream independently and a stale ARCHIVED row is never picked. Depends: T3.
  *Acceptance:* new test — a student with a stale ARCHIVED-year ACTIVE row plus a current-year row promotes the current-year row; `app/api/__tests__/promote-capacity-race.test.ts` and `bulk-promote-race.test.ts` still pass.

- [x] **T7 — Override-confirm UI on both doors.**
  `app/admin/students/[id]/page.tsx` (`handleEnroll` at `:412`, Sheet `:1023` / Dialog `:1034`) and `app/admin/classes/[id]/client.tsx` (`:310`): on `409 AGE_OUT_OF_RANGE`, render a confirm step showing the server message plus a required reason textarea, then resubmit with `ageOverrideReason`. On `409 ALREADY_ENROLLED`, show the conflicting class — no override offered. Follows the `design-system` overlay + Field patterns and `voice.md` copy; keep the mobile Sheet / desktop Dialog split already in place. Depends: T4, T5.
  *Acceptance:* component tests cover warn → reason → success and warn → cancel; empty reason keeps the confirm button disabled; `npm run lint` clean.

- [x] **T8 — Merge fee lines across active enrolments.**
  `lib/finance/build-billing-run.ts`: replace the first-wins `enrollmentByStudent` dedup (`:110-117`) with a group-by-`studentId` that concatenates the base lines of every in-scope active enrolment; disambiguate `labelSnapshot` by program name only when a student spans >1 program; join `classLabelSnapshot`; keep the single `applyAdjustments` call over the merged set so `totalDue` stays resolver-owned. Verify `lib/finance/materialize-billing-run.ts:71-77` still collects every `programId`. Also delete the stale comment at `:14-16` referencing `app/api/invoices/generate/batch/route.ts`, which no longer exists. Depends: T3.
  *Acceptance:* new test — KB + DCARE student yields one row with both programs' components and a `totalDue` equal to the resolver's; existing `lib/finance/__tests__` pass unmodified, proving single-program output is unchanged.

- [x] **T9 — Route the seven display sites through `pickPrimaryEnrollment`.**
  `app/admin/students/page.tsx:354`, `lib/students/export.ts:66` (`firstEnrollment`), `lib/parent-helpers.ts:95`, `app/api/admin/raport/[studentId]/[termId]/pdf/route.ts:61`, `app/api/guardian/raport/[studentId]/[termId]/pdf/route.ts:98`, `app/api/guardian/invoices/[id]/route.ts:135`, `app/api/guardian/invoices/[id]/pdf/route.ts:133`. Where the surface can show more than one (admin list "Kelas" column, CSV export), render both; where it must be singular (raport header, invoice header), use the primary. Check each query's `take: 1` — `lib/parent-helpers.ts:81` has one and must be widened. Depends: T3.
  *Acceptance:* tests assert a dual-enrolled student's raport PDF names the SEMESTER class, and the admin list shows both.

- [x] **T10 — Docs + runbook.**
  Fill Implementation / Verification. Add a diagnostic query for the 16 stale ARCHIVED-year ACTIVE rows to `docs/runbooks/` (read-only, no mutation — historical rows are preserved by design). Update README only if the surface counts move. Run `bash scripts/audit-docs.sh` to zero.
  *Acceptance:* `bash scripts/audit-docs.sh` exits 0; Verification records the between-task gate, the end-of-cycle gate, and Playwright status.

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet-5. Waves — W1 parallel [T1, T3]; W2 parallel [T2, T6, T8, T9]; W3 parallel [T4, T5]; W4 [T7]; W5 [T10]. Files are disjoint within each wave. Subagents implement + run targeted vitest; the driver runs the full `npm run build && npx vitest run` gate and commits one task at a time in task order.
- Baseline before any edit (driver-verified, not delegated): `npx vitest run` → 306 passed | 2 skipped (308 files), 2963 passed | 42 todo (3005 tests), 0 failures. Any later failure is introduced by this cycle.
- Worktree bootstrap: replaced the `setup-worktree.sh` `node_modules` symlink with a real `npm install` (1159 packages) + `npx prisma generate` — Turbopack rejects the symlink.
- **Deviation from strict per-task gating, recorded deliberately.** `/build` prescribes a full gate between every task. With parallel subagents sharing one worktree the tree always contains several tasks' edits at once, so a per-task gate is not achievable — a build run mid-wave would fail on another agent's half-written file. Instead each wave ran targeted `vitest` per agent, and the driver ran the full `npm run build && npx vitest run` on the settled tree before committing, then committed one task per commit in task order. The cumulative gate is stricter than the per-task one; what is lost is the ability to attribute a failure to a single task automatically, which the driver did by hand instead.
- Task 1: Calendar-correct age helper — `lib/admission/age.ts`, `lib/admission/age.test.ts` — extracted `parseIsoDateAtNoon` + `diffYearsMonths` as shared private helpers and added `ageInMonthsAt(dob, reference)`; `formatAgeFromDob`'s signature and behaviour are unchanged (its 9 original tests pass untouched). No `/30.44` anywhere.
- Task 2: Advisory age-fit evaluator — `lib/enrollment/age-fit.ts`, `lib/enrollment/age-fit.test.ts` — pure `evaluateAgeFit()` returning `OK | BELOW_MIN | ABOVE_MAX | UNKNOWN`. Bounds evaluated independently, so an `ageMax`-only program is now checked (the dead-branch bug). Renders only the bounds actually set, so such a program never shows a phantom `0` minimum. Reference date formatted by regex off the `YYYY-MM-DD` string, avoiding a timezone off-by-one.
- Task 3: Enrollment stream helpers — `lib/enrollment/active.ts`, `lib/enrollment/active.test.ts` — `findStreamConflict(tx, …)` (year- and program-type-scoped, `tx` required so it runs in the caller's transaction) and the pure generic `pickPrimaryEnrollment()`.
- Task 4: Students-detail door — `app/api/students/[id]/enroll/route.ts`, `lib/validations/student.ts`, `app/api/__tests__/enroll.test.ts`, `app/api/__tests__/enrollment-doors-parity.test.ts` — advisory age gate returning `409 AGE_OUT_OF_RANGE`, overridable by a non-empty `ageOverrideReason` that is audited **inside** the transaction via `recordAudit(entry, tx)` (the re-throwing form, so a justification cannot be lost while the enrollment commits). Global-any-year duplicate guard replaced with the year+stream guard.
- Task 5: Class-detail door — `app/api/admin/classes/[id]/enrollments/route.ts`, `app/api/__tests__/class-enrollments-add.test.ts` — gained the age check it previously lacked **entirely**, and the same stream guard. Parity with the students door is asserted directly by feeding one fixture into both handlers.
- Task 6: Promote scoping — `app/api/students/[id]/promote/route.ts`, `app/api/__tests__/promote-stream-scoping.test.ts` — source enrollment resolved by target program type + non-ARCHIVED year, ordered by year start. Not pinned to the target's `academicYearId`, because a promotion moves *across* years and that scope would match nothing.
- Task 8: Billing merge — `lib/finance/build-billing-run.ts`, `lib/finance/materialize-billing-run.ts`, `lib/finance/__tests__/build-billing-run.test.ts` — first-wins dedup replaced by group-by-student; fee lines concatenated across every distinct in-scope program; `applyAdjustments` still called once and still owns `totalDue`.
- Task 9: Display sites — `app/admin/students/page.tsx`, `lib/students/export.ts`, `lib/parent-helpers.ts`, the two raport PDF routes, the two guardian invoice routes, plus `app/api/students/route.ts` and `app/api/students/export/route.ts` (the queries actually feeding the first two) — all route through `pickPrimaryEnrollment`. Raport and invoice headers use the primary (SEMESTER) enrollment; admin list, CSV export and the parent child-card show both classes.

### Defects found by the mandatory review pass, and fixed

Two reviewers (`feature-dev:code-reviewer` + `superpowers:code-reviewer`) ran on the assembled diff. They independently converged on the first item. All were fixed before any commit.

- **Keringanan applied once per line instead of once per grant.** `FeeComponentDef` is a tenant-level shared catalog — `prisma/seed.ts` attaches one `spp` to TKIT, KB, DCARE and POPUP alike — so a genuine KB+DCARE student yields two base lines sharing a `feeComponentId`, and `applyAdjustments` matched each independently. A FIXED 500,000 discount subtracted 1,000,000. Fixed by collapsing base lines that share a `feeComponentId` into one merged line **before** calling the resolver. **PERCENT-base rule:** the grant applies to the summed cross-program amount, so it neither privileges whichever program sorted first nor double-charges. Every prior test used distinct per-program component ids, which is exactly why this hid; tests using a *shared* id now cover both FIXED and PERCENT.
- **Billing candidates were not scoped to the run's academic year.** `materialize-billing-run.ts` filtered on `status` + `tenantId` only. Harmless under first-wins dedup, but T8's group-by made it additive: the 16 students carrying a stale ARCHIVED-year ACTIVE row would have been billed for two years on one invoice. Fixed by adding `academicYearId` to the `classSection` filter, with a regression test asserting the where-clause.
- **`pickPrimaryEnrollment` deterministically selected the archived row.** The widened display queries dropped `take: 1` but had no year filter; for those same 16 students both rows are `SEMESTER`, so the earliest-`enrollDate` tiebreak picked *last year's* class — raport and invoice headers would have named it, and the parent card rendered `"KB A & TKIT A"`. Fixed by excluding archived years at all seven call sites. The test gap that hid it (no case ever constructed two SEMESTER rows) is closed.
- **The stream guard was protected by a lock on the wrong object.** `findStreamConflict` ran inside the transaction, but the lock was keyed on the *class* (`FOR UPDATE` / `pg_advisory_xact_lock(classId)`). Two concurrent requests enrolling one student into two different same-type sections took different locks, both saw no conflict, and both committed — with no DB constraint to catch it, since the cycle deliberately adds no partial unique index. Fixed by taking a `pg_advisory_xact_lock` on `studentId:academicYearId:programType` as the first statement inside the transaction in **both** doors, always before the class lock so the two can never deadlock on opposing acquisition order.
- **Students door returned 500 where the class door returned 409.** It had no `isUniqueViolation` branch, breaking the parity criterion. Added.
- **Promote's "at most one candidate" comment was false.** The year guard blocks only ARCHIVED, so a PLANNING next-year enrollment gives two live candidates to an unordered `findFirst`, which could graduate the current-year row instead of the promoted one. Fixed with an explicit `orderBy`; the incorrect comment was corrected rather than left asserting an invariant the code lacks.

Two subagents separately tried to silence a failing assertion by adding a defensive fallback (`program?.type` with a conditional spread; a length-1 shortcut) rather than updating an outdated mock. The first genuinely disabled a production guard and was sent back; the second was provably equivalent and was kept. Fixture updates were required instead in both cases.

## Verification

- Baseline, driver-run before any edit: `npx vitest run` → **306 passed | 2 skipped (308 files), 2963 passed | 42 todo (3005 tests), 0 failures.**
- `npm run build` — passes. One TypeScript strict error (`TS18048`, possibly-undefined mock-call indexing in a new test) was found by the gate and fixed.
- `npx vitest run` after all tasks and all review fixes: **311 passed | 2 skipped (313 files), 3023 passed | 42 todo (3065 tests), 0 failures.**
- `npm run lint` — 0 errors. 59 warnings, all pre-existing in files this cycle does not touch.
- The advisory-lock fix broke 8 tests across 3 files whose tx mocks lacked `$executeRaw`; mocks updated, no assertion weakened.
- `design-system` — the T7 override-confirm step reuses the existing Shadcn Sheet/Dialog + Field composition from the enrol flow rather than introducing new surface, per the canonical reference.
- `npx vitest run` after T7 (final): **313 passed | 2 skipped (315 files), 3036 passed | 42 todo (3078 tests), 0 failures.** `npm run build` exit 0.
- Playwright: local run deferred to CI (env cannot execute it — `playwright.config.ts` refuses to start because this worktree's `DATABASE_URL` points at the staging Supabase pooler, and the specs create and mutate data through the API). The `E2E_ALLOW_REMOTE_DB=1` override exists but was **not** used: it would have written cycle test data into the staging database, which is the exact pollution the guard prevents.
  Required CI check `Playwright E2E` gates the merge; CTO will not merge on red.
- Not verified by any automated gate, and left for preview-verify: that the override confirm step renders correctly on a real mobile viewport, and that `Program.type` is set correctly on production programs (see Ship Notes — this cycle makes that column load-bearing for the first time).

### Preview-verify (PR #509)

- Iteration 1 (`https://annisaa-erp-v3-git-feat-enroll-deef45-ismails-projects-196d40d3.vercel.app`), admin portal signed in as the admin account. Flows: student-detail enrol with an out-of-band age → override → dual enrolment; students list rendering. **Blockers 1, minors 0.** Zero console errors; every `/api/**` response 200.
  - **Verified live end-to-end on the real staging data.** Test subject: a TKIT-B student (DOB 2021-04-28, 50 months at year start) enrolled into D'Care (band 6–36mo).
    - The advisory step rendered *"Usia anak 4 tahun 2 bulan (50 bulan) di atas batas usia maksimum program D'Care (Day Care) (6–36 bulan), per awal tahun ajaran 14 Juli 2025."* — the 50-month figure and the 14 July 2025 reference both match the SQL independently, confirming age is measured at `AcademicYear.startDate` and not at request time.
    - Confirm button correctly disabled until a reason was typed.
    - After override: `StudentEnrollment` holds **TKIT-B (SEMESTER) + DCARE (YEAR_ROUND)**, both ACTIVE in 2025/2026 — dual enrolment works.
    - This student *also* carries a stale `TKIT-A / 2024-2025 (ARCHIVED)` ACTIVE row, and it did **not** block the enrolment. That is the 16-student regression, proven fixed against production-shaped data rather than a mock.
    - `AuditLog` row written: `student.enroll.age-override`, `after = { reason, ageMonths: 50, ageMin: 6, ageMax: 36, programId }`.
    - Students list rendered `TK Islam Terpadu Kelas B · TKIT-B + D'Care (Day Care) · DCARE` — both placements, school first, archived year excluded.
  - **Blocker found — an eighth `enrollments[0]` site that T9 missed.** The student-detail header derived its placement with `student.enrollments.find(e => e.status === "ACTIVE")`. `GET /api/students/[id]` orders enrollments `createdAt: desc`, so immediately after the day-care enrolment the header announced *"D'Care (Day Care) · DCARE"* as the child's placement and the school class disappeared. It had no archived-year filter either, and the same predicate gated the "Naik Kelas" button. Invisible to every unit test because they all fixture a single enrollment.
- Iteration 2 — fix pushed: the detail header now filters to ACTIVE non-archived rows, orders them through `pickPrimaryEnrollment`, and renders school-first joined with `+`, matching the list. `GET /api/students/[id]` now selects `program.type` and `academicYear.status` to support it. The Riwayat Kelas tab is untouched and still lists every historical row. Four regression tests added.
- **Preview-verify converged on iteration 2 (clean): 2 iterations, 1 fix commit, blockers 0, minors 0.** Re-walked on the rebuilt preview:
  - Detail header now reads `TK Islam Terpadu Kelas B · TKIT-B + D'Care (Day Care) · DCARE` — school first, both placements, archived year excluded.
  - `ALREADY_ENROLLED` path checked directly: enrolling the same student into a second SEMESTER class (TKIT-A, band 48–60, so the age check passes and the conflict guard is what fires) returns `409` and renders *"Siswa sudah terdaftar di kelas TKIT-B pada tahun ajaran ini."* with **no override affordance** — only "Pilih Kelas Lain". Confirms the stream guard permits YEAR_ROUND beside SEMESTER but refuses a second SEMESTER, and that the non-overridable case is genuinely non-overridable in the UI.
  - Zero console errors across both flows; the only non-2xx was the intended `409` (notably not a `500` — the parity fix at work). D'Care roster count moved 6/15 → 7/15.
- **Fixture left on staging, deliberately:** student `cms41asz2006ki5x7nhy6itos` (Abdurrahman Aziz Fauzi) now holds a real TKIT-B + DCARE dual enrolment plus its `student.enroll.age-override` audit row. Not cleaned up — the cycle is not destructive, and this is the only dual-enrolled student on staging, so it is the fixture the next billing-run or raport verification will need. It does mean the next staging billing run will produce a merged two-program invoice for that child; that is the feature working, not a defect.

## Ship Notes

**No migrations. No new env vars. No schema change.** Every guard is application-level.

### What changes for an admin on day one

- An age outside a program's band no longer blocks. The admin sees an advisory message naming the child's age, the band and the reference date, types a reason, and continues. The reason lands in `AuditLog` under `student.enroll.age-override`.
- A child can be enrolled in a school class **and** a day-care class in the same year. A second class of the *same* type is still refused, naming the conflicting class.
- Both enrol doors — student detail and class detail — now behave identically. The class-detail door previously ran no age check at all, so admins may notice it is now stricter in that one respect while everything else got looser.

### Deliberately not done

- **Program age bands were not changed.** On staging 26 of 37 active enrollments sit below their program's `ageMin` when measured at year start, a uniform ~10-month shortfall that disappears if you add 12 months — the bands look calibrated to age *reached during* the year, not age at intake. Making the bands advisory removes the harm without guessing. Whether the bands or the reference date are wrong is a question for Bu Shanti, and correcting them is a separate cycle. `prisma/seed.ts` is also stale against staging (KB is 36–48 there, not 36–60; TKIT is split A/B).
- **The 16 stale ARCHIVED-year ACTIVE rows were not cleaned.** A prior cycle preserves archived enrollments on purpose. They are now inert because every guard, billing query and display query is year-scoped. Read-only diagnostic added to [`docs/runbooks/staging-data-cleanup.md`](../runbooks/staging-data-cleanup.md).
- **`EnrollmentApplication.dcareAddon` is still not wired to auto-create a second enrollment.** Convert produces one student; the admin adds the day-care placement explicitly.

### Risks to watch

- **`Program.type` is now load-bearing.** It was display-only until this cycle. A program mistyped in the admin UI silently changes what counts as a conflict — e.g. a day-care program typed `SEMESTER` would block the school placement it is meant to sit alongside. Staging is clean (DCARE=`YEAR_ROUND`, KB/TKIT-A/TKIT-B=`SEMESTER`); **verify prod before relying on this.**
- **The one-per-stream invariant has no database constraint.** Enforcing it in SQL would need `Program.type` denormalised onto `StudentEnrollment`, which the spec ruled out. Concurrency is covered by a `pg_advisory_xact_lock` on `studentId:academicYearId:programType`, taken before the class lock in both doors (fixed order, so they cannot deadlock). If the invariant is ever violated, the runbook query is the only detector.
- **Merged invoice line shape changed for dual-enrolled students only.** When two programs share a `feeComponentId` — the normal case, since `FeeComponentDef` is a tenant-level catalog — the two lines collapse into **one** line labelled `SPP (D'Care + KB)` carrying the summed amount, rather than two itemised lines. A PERCENT keringanan then applies to that summed base. Single-program invoices are byte-identical to before. If the school wants the two programs itemised separately on the invoice, that is a follow-up and needs a product decision.

### Smoke test on the preview URL

1. Admin → a student whose age is outside the target program's band → enrol → expect the advisory message, not a hard failure. Confirm the button stays disabled until a reason is typed.
2. Repeat from the class-detail door; confirm identical wording and behaviour.
3. Enrol a student into a school class, then into a D'Care class in the same year → both should succeed, and the student should appear on both rosters.
4. Try a second school class for that student → expect a refusal naming the existing class, with no override offered.
5. Check `/admin/students` and a raport PDF for that student: the list shows both classes, the raport header shows the **school** class.
6. Build a billing run covering that student → one row, both programs' fee lines, one invoice.

### Rollback

`git revert` the range. No data migration to undo. Reverting restores the hard age block and the single-enrollment guard; any dual enrollments created in the meantime would remain in the database as extra ACTIVE rows and would then be picked up by the pre-revert `enrollments[0]` code paths arbitrarily — so if dual enrollments have been created, close them before reverting.
