# Seed refresh — a date-relative seed that is a live school on any day

## Context
The full end-to-end review (`docs/uat/reports/2026-09-29-full-e2e.md`) found the demo dataset frozen in the past. `prisma/seed.ts` pinned the school calendar to 2025/2026 (ended 2026-06-20) while other rows were relative to "now"; the review ran on 2026-09-29, so:

- **CORE-17 / ACAD-17** — the 2025/2026 year and both semesters were `ACTIVE` though today sat in neither; Semester 2 had no themes.
- **TCH-4** — the only Week rows ran Jul–Sep 2025 and `AchievementIndicator` / `IndicatorThemeLink` / `LearningObjective` were empty, so weekly (walas) and sentra assessment could not be completed; the teacher home said "no sessions" (ClassSession stopped 2026-06-19).
- **Docs audit** (`docs-audit.json` seedGaps, `docs-guides.json` seedRecommendations) — no Term / ReportCard rows, no custom Role, invoices only Jan–May, no DRAFT invoice, 5 of 6 classes at capacity with every student enrolled, `Student.nis` null, student attendance not linked to sessions.

The review's Playwright section also showed the consequence for the test suite: **8 specs silently skip** (`154 passed / 0 failed / 8 skipped`), each with a seed-gap reason. A spec that never runs rots — this cycle found that four of them had already gone stale behind their skips (see Implementation).

## Spec
Goal: a fresh `prisma db push` + `prisma db seed` on an empty database, on **any** day, yields a live, current school — and every Playwright spec runs.

- [x] Academic year = the Jul-start year containing today (`2026/2027`), `ACTIVE`; the previous year `ARCHIVED` with `INACTIVE` semesters. Exactly one `ACTIVE` semester, and it contains today. Years and semesters are contiguous, Monday-aligned spans (Semester 2 starts the first Monday of January), so every calendar day belongs to exactly one semester — including the year-end break and the July changeover.
- [x] Mon–Fri `Week` rows cover **every** week of both semesters; 6 themes / 12 sub-themes per semester with weeks spread over them; 20 learning objectives + 40 IKTP per semester (TK A and TK B, 5 elements) and `IndicatorThemeLink` rows so every theme — hence every week — has IKTP for both age groups.
- [x] `ClassSession` for every active class across the whole year via `reconcileSessions` (skips weekends and seeded holidays), teacher = homeroom.
- [x] Recent daily student attendance (session-linked) and Buku Penghubung entries for the last five school days; weekly + sentra `AssessmentEntry` rows for the current week and the two before.
- [x] Invoices for the last five months **including the current month** (rightjet fixtures preserved + SPP for every enrolled student for the last three months), all statuses incl. ~10 `DRAFT`; payments spread through each month and four dated **today**.
- [x] Leave requests and both payroll runs relative to today: `PENDING/APPROVED/REJECTED`; `SLIPS_SENT` for the previous 21st–20th period, `DRAFT` for the period containing today (always exists — no more "only if the start is in the past").
- [x] Two `Term`s for the active semester, the raport narrative bank for both age groups, one `PUBLISHED` and one `DRAFT` report card (+ measurements) for the rightjet household.
- [x] One custom `Role` (`FINANCE_ADMIN`); `Student.nis` for every student.
- [x] Room in every class (capacities raised) and three `ACTIVE` unenrolled applicants — one per program age band (Day Care / KB / TK), computed from the academic-year start, names sorting early.
- [x] **Weekend/holiday safety** — nothing a spec needs "today" for depends on the weekday: the *latest school day* (today, else the previous school day) is the anchor for attendance, journals and assessments, is deliberately left partly unmarked, and `SEED_TODAY=YYYY-MM-DD` rehearses any date.
- [x] Existing fixture ids/emails kept (`u_super_admin`, `u_school_admin`, `u_teacher`, `u_parent` fallback, `u_rightjet`, `u_kbaster_parent_d4`, invoice numbers `INV-YYYY-0001..0005`, `1001/1002/2001/2002`). `lib/auth.ts` untouched; `u_parent` still resolves to the same person (Fatimah Rahman, KB — she now has current invoices, attendance and journal too).
- [x] The seed asserts its own calendar invariants and fails loudly (one ACTIVE year/semester containing today; a week with IKTP for both age groups on the latest school day; a homeroom-taught session per class; ≥1 DRAFT invoice; NIS everywhere; ≥1 unenrolled student).
- [x] Full Playwright suite green on two freshly seeded databases; the 8 previously-skipped specs run.

### Non-goals
- No schema migration, no new dependency, no app-code change. E2E spec edits only where a spec had rotted behind its skip.
- No staging/production write; `scripts/reseed-staging.ts` (its own generator, shares only `holidays` + `salary-components`) is untouched and was not run.
- No real 2027 holiday calendar (still an owner-input TODO in `prisma/data/holidays.ts`).
- No `AuditLog` / `WebhookEvent` / `BillingRun` / `EnrollmentApplication` rows (recommended by the docs audit, not needed by any spec).

### Assumptions
1. `PREV_CAL`'s boundaries follow the same rule, so 2025/2026 is 2025-07-14 → 2026-07-12 (the old seed ended it on the Saturday 2026-06-20; the contiguous rule extends it to the day before 2026/27 opens).
2. Semester `ACTIVE` follows `demoteOtherActiveSemesters` (one ACTIVE per year); the other semester of the active year is `INACTIVE` but still carries a curriculum, so the admin curriculum screens have data whichever semester the API lists first.
3. `sibling-detect › edit-sheet banner` stays `test.fixme` — a documented CI flake in the row-action dropdown, unrelated to seed data (the review labelled it "no matching sibling fixture", which is wrong: the guardian/phone match exists).

## Tasks
- [x] **T1 — Calendar helpers + curriculum content.** `prisma/data/calendar.ts` (date-relative academic calendar, latest-school-day anchor, seeded PRNG, `SEED_TODAY`), `prisma/data/curriculum.ts` (themes, TP/IKTP, raport narrative bank), Vitest coverage. *Accept:* every day of 2025–2028 falls in exactly one semester; weekend anchors to Friday.
- [x] **T2 — Date-relative `prisma/seed.ts`.** Years/semesters/curriculum/weeks/links, sessions, attendance, journals, assessments, invoices + payments, leave, payroll periods, terms + raport, role, NIS, capacity, unplaced applicants, invariants; wipe list completed. `lib/db.ts` header updated (adapter parity re-verified — the seed hook). *Accept:* fresh empty DB seeds clean.
- [x] **T3 — Un-rot the specs the gaps were hiding.** Fix the four specs that were stale behind their skips and make the calendar-pinned ones date-agnostic; un-`fixme` the sentra active-week spec. *Accept:* full suite 0 failed.
- [x] **T4 — Verify + ship notes.** Full Playwright on two fresh DBs and a Saturday rehearsal; browser check of teacher home, weekly assessment, receipts, parent invoices.

## Implementation
- Subagent plan: driver=claude-sonnet-5-5, no subagents — one tightly coupled file (`prisma/seed.ts` sections share ids and lookups) plus its two data modules; a subagent would need the whole seed as context, so fan-out costs more than it saves. The Playwright runs are the long pole and run serially under the shared lock regardless.
- Task 1: `prisma/data/calendar.ts` — `seedToday()` (Jakarta day, `SEED_TODAY` override, validated), `academicYearFor/StartingIn` (year opens on the first Monday on/after 10 July, Semester 2 on the first Monday of January, next year starts the day after the previous ends), `weeksOfSemester`, `termsOfSemester`, `latestSchoolDay`, `schoolDaysEndingAt`, `firstOfMonthShifted`, `monthLabelId`, `jakartaInstant`, `createRng` (mulberry32, seeded by today's date so a given day always seeds identically). `prisma/data/curriculum.ts` — themes for both semesters, 2 TP × 5 elements × 2 IKTP, narrative bank text. `prisma/data/__tests__/calendar.test.ts` — 19 cases incl. "every day 2025–2028 is in exactly one semester of exactly one year" and the Saturday/Sunday/holiday anchors.
- Task 2: `prisma/seed.ts` — `TODAY` / `CAL` / `LATEST_SCHOOL_DAY` / `RECENT_DAYS` derive everything; `Math.random` replaced by the seeded `rand` so two seeds on one date are identical; attendance/journal/assessment/invoice/payment inserts moved to `createMany` (seed time 17 s → ~19 s despite ~10× the rows); payroll now picks the period containing today (the old code skipped the DRAFT run when the 21st had not arrived yet); the Rp 0 XENDIT "reconciliation" payment is gone — the first sibling's real payment carries the XENDIT method instead; wipe list now covers `AssessmentEntry`, `Term`, report-card, measurement, billing-run, fee-adjustment, enrollment-application and note-read tables (re-seeding a used DB previously failed on Restrict FKs). `lib/db.ts` header refreshed to satisfy the seed-drift hook (it *is* the "adapter parity re-verified" note that hook asks for; no code change).
- Task 3: `e2e/admin-classes.spec.ts` (reference-data probe hit a non-existent `/api/admin/academic-years` list; POST lacked the `ageGroup` the API has required since the 2026-05-20 cutover), `e2e/teacher.spec.ts` (`/api/teaching-assignments/my` returns a bare array, not `{ data }`; the roster spec still looked for a `Simpan` button the UI renamed to `Simpan absensi · N siswa`), `e2e/admin-curriculum-objectives.spec.ts` (asks for the first semester by start date — now the INACTIVE one; objectives need an ACTIVE semester), `e2e/curriculum-admin.spec.ts` (year name pinned to `2025/2026`), `e2e/teacher-assessments-weekly.spec.ts` (asserted that today has *no* active week), `e2e/teacher-assessments-center.spec.ts` (`fixme`d test pinned to `2025-07-15`; now discovers a live week via the API and runs).

## Verification
_(filled in T4)_

## Ship Notes
_(filled in T4)_
