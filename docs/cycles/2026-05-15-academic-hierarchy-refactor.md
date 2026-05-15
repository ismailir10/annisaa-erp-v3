# Academic Hierarchy Refactor — ClassTrack + ClassSession + Pickup L1

## Context

Today's schema places `Campus`, `Program`, and `AcademicYear` as siblings under `Tenant`. `ClassSection` carries three independent FKs (`campusId`, `programId`, `academicYearId`) with no structural guarantee they belong together, and multi-year class identity is implicit (matched by name string). Daily class meetings are not modeled at all — `StudentAttendance` hangs directly off `ClassSection` keyed by `(studentId, date)`, which cannot represent shift-based daycare (MORNING + AFTERNOON same day) and provides no substitute-teacher trail. Separately, daycare parents arriving late to pick up children is a recurring operational pain, but pickup tracking is half-built: `checkInTime`/`checkOutTime` columns exist on `StudentAttendance` with no surface to capture them and no pickup-person context.

This cycle introduces a coherent `Campus > Program > AcademicYear > Class > Session` hierarchy with structural integrity, stable multi-year class identity (`ClassTrack`), a daily-meeting model (`ClassSession`) with default-teacher snapshot + substitute reassignment audit, reactive session generation (no admin "Generate" button), and Layer 1 pickup tracking. Outcome: enrollment and attendance become structurally tied to a verifiable academic context; admins roll a year forward in one click; teachers run their day from a single session page; the school gets late-pickup data to act on.

This cycle's design was brainstormed (`superpowers:brainstorming`) and architect-reviewed (`feature-dev:code-architect` — verdict SHIP_WITH_CHANGES, all five findings folded in). Mid-`/spec` re-verification against current `origin/staging` (the worktree had branched 57 commits stale) surfaced a new `Semester` model from the Curriculum initiative; user confirmed `ClassSession` anchors its date range to `Semester`, and the hierarchy does **not** gain an explicit Semester level (Class stays under AcademicYear, sessions carry a `semesterId` FK).

## Spec

### Acceptance criteria

- [ ] `ClassTrack` model exists: stable identity `(tenantId, campusId, programId, name)`, `status` soft-delete (CRUD Category A). `ClassSection` gains `classTrackId` FK; existing `(campusId, programId)` retained for query compat through this cycle.
- [ ] `ClassSession` model exists: FKs to `ClassSection` + `Semester`, fields `date` (YYYY-MM-DD), `slot` (FULL_DAY|MORNING|AFTERNOON), `teacherId` (effective), `defaultTeacherId` (snapshot), `substituteReason`, `isBackfilled`. Unique `(classSectionId, date, slot)`.
- [ ] `ClassSection` gains `slotTemplate` (FULL_DAY | MORNING_AND_AFTERNOON).
- [ ] `StudentAttendance` gains `sessionId` FK, `pickedUpByRelation` enum-coded string (PARENT|GUARDIAN|GRANDPARENT|SIBLING|DRIVER|HOUSEHOLD_HELPER|OTHER), `pickedUpByName` free text. Legacy `@@unique([studentId, date])` dropped (blocks DCARE multi-shift), replaced with non-unique index; primary uniqueness moves to `(studentId, sessionId)`.
- [ ] `reconcileSessions(classSectionId)` service generates `ClassSession` rows per-`Semester` date range, skipping non-working days (`OrgConfig.workingDays`) and `Holiday` dates; `Holiday.isHalfDay` produces a MORNING-only slot. Idempotent, advisory-locked, 10k-row hard cap, additive-by-default (destructive deletes only empty sessions).
- [ ] Reconcile fires reactively on: `ClassSection` create, `Semester` startDate/endDate change, `TeachingAssignment` POST/PATCH/DELETE (HOMEROOM derivation), `ClassSection.slotTemplate` change, `Holiday` upsert. No admin "Generate sessions" button.
- [ ] Admin: `/admin/class-tracks` CRUD; `/admin/academic-years` gains "Roll forward" (clone ACTIVE tracks into target year as new ClassSections + reconcile); class-section detail shows read-only session calendar with teacher-swap drawer.
- [ ] Teacher: `/teacher/sessions/[id]` page — roster with per-row status, Tap In, Tap Out, pickup relation + name; `/teacher` dashboard lists today's sessions including substitute-day assignments.
- [ ] Substitute swap: `PATCH /api/admin/class-sessions/[id]` sets `teacherId` + `substituteReason`, leaves `defaultTeacherId` intact; sub teacher sees the session, original homeroom does not.
- [ ] RLS: `ClassTrack` (direct `tenantId` policy) and `ClassSession` (indirect policy through `ClassSection`) both `ENABLE ROW LEVEL SECURITY` with policies in migration SQL; `scripts/verify-rls-coverage.sh` extended to recognize indirect-tenancy models.
- [ ] One-time migration backfills `ClassTrack` from existing `ClassSection` rows, generates historical `ClassSession` rows (semester-matched), re-points `StudentAttendance.sessionId`. Verification gate asserts row-count parity + zero un-mapped attendance, with orphan-report exit modes.
- [ ] Gates green: `npm run build && npx vitest run` between tasks; `+ npx playwright test` end-of-cycle. UAT: `/uat teacher/daily-session` + `/uat admin/class-tracks`.
- [ ] Frontend changes cross-checked against `design-system.html` (frontend-gate token).

### Non-goals

- Layer 2 (late-pickup alerts / parent notifications) and Layer 3 (late-pickup fees / billing) — separate future cycles.
- Subject/period scheduling within a day (timetable model) — Talib is early-childhood, single homeroom per day.
- Strict ownership chain (per-campus Program duplication) — rejected; school-wide single calendar.
- Explicit Semester level in the hierarchy — Class stays under AcademicYear.
- Parent-portal pickup-history view — deferred to L2.
- Re-pointing `StudentJournalEntry.classSectionId` to `ClassSession` — intentional soft reference, stays.
- Dropping `StudentAttendance.classSectionId` and `ClassSection.campusId/programId` denormalization — deferred to a follow-up cycle after burn-in (128 API routes unaudited).
- Postgres CHECK constraints for cross-FK tenant invariants — app-layer guards this cycle; DB-hardened in a follow-up.

### Assumptions

1. `Semester` rows exist (and have correct `startDate`/`endDate`) for every `AcademicYear` before `reconcileSessions` runs — reconcile over an AcademicYear with no Semesters generates zero sessions and logs a warning rather than erroring.
2. `Semester.startDate/endDate` are `DateTime` (UTC midnight Jakarta-tz); `Holiday.date` and `ClassSession.date` are `String` YYYY-MM-DD — reconcile normalizes to Jakarta-tz calendar dates for comparison.
3. Big-bang migration in one cycle is acceptable; `/ship`'s staging-PR gate + migration verification harness against a prod-shape snapshot is the safety net.
4. DCARE multi-shift historical attendance (multiple rows per student/date) is rare; migration flags such sections for manual `slotTemplate` review rather than auto-splitting.
5. `OrgConfig.workingDays` is the authoritative working-day calendar; reconcile treats a missing `Holiday` table as "no holidays."
6. Teacher permission to read/write a session's attendance derives from `ClassSession.teacherId === me.employeeId` (covers substitutes), not from the `TeachingAssignment` table.

## Tasks

> Ordered, atomic, independently committable. `[dep: N]` marks a hard dependency on task N. Tasks without a dep can be dispatched in parallel by `/build`.

- [x] **1. Schema + migration foundation.** Add `ClassTrack`, `ClassSession` models; add `classTrackId` + `slotTemplate` to `ClassSection`; add `sessionId` + `pickedUpByRelation` + `pickedUpByName` to `StudentAttendance`; drop legacy `@@unique([studentId, date])`, add non-unique index. Migration SQL includes `ENABLE ROW LEVEL SECURITY` + tenant policies for both new tables (direct for `ClassTrack`, indirect-through-`ClassSection` for `ClassSession`). Extend `scripts/verify-rls-coverage.sh` to recognize indirect-tenancy models via marker comment. _Accept: `npx prisma migrate dev` clean; `verify-rls-coverage.sh` passes with both new tables recognized._
- [x] **2. `reconcileSessions` service + unit tests.** `lib/sessions/reconcile.ts` — generate `ClassSession` rows per-`Semester` date range, skip non-working days + `Holiday` dates, `isHalfDay` → MORNING slot, `slotTemplate` → slot count. Idempotent, `pg_advisory_xact_lock(hashtext(classSectionId))`, 10k cap, additive-default with empty-only destructive delete. 10 unit cases per design (working-days, holidays, idempotent, year-extend additive, shorten-deletes-empty, preserves-non-empty, MORNING_AND_AFTERNOON fan-out, batch cap, HOMEROOM backfill, INACTIVE respect). _[dep: 1] Accept: `npx vitest run lib/sessions` green._
- [x] **3. `ClassTrack` admin CRUD.** `/api/admin/class-tracks` (GET/POST) + `/api/admin/class-tracks/[id]` (PATCH/DELETE soft-delete); `/admin/class-tracks` page (DataTable + create/edit dialog per `crud.md` Category A). Cross-check `design-system.html`. _[dep: 1] Accept: create/edit/soft-delete a track via UI; build + vitest green._
- [x] **4. Reconcile triggers wired into mutation endpoints.** `ClassSection` create → reconcile; `Semester` PATCH (dates) → reconcile each section in year; `TeachingAssignment` POST/PATCH/DELETE → re-derive `defaultTeacherId`/`teacherId` on future sessions; `ClassSection.slotTemplate` PATCH → reconcile; `Holiday` upsert → reconcile affected year's sections. _[dep: 2] Accept: integration test — creating a ClassSection with a Semester present yields ClassSession rows; vitest green._
- [x] **5. Roll-forward endpoint + admin UX.** `POST /api/admin/academic-years/[id]/roll-forward` — body `{ sourceYearId, trackIds }`, clone ACTIVE tracks' sections into target year, reconcile each. "Roll forward" button on `/admin/academic-years`. 409 on already-rolled track. Cross-check `design-system.html`. _[dep: 2, 3] Accept: roll-forward clones sections + generates sessions; E2E smoke; build + vitest green._
- [x] **6. `ClassSession` swap-teacher endpoint + admin calendar UX.** `PATCH /api/admin/class-sessions/[id]` (teacherId + substituteReason, defaultTeacherId untouched, past-date → isBackfilled). Class-section detail page: read-only session calendar + teacher-swap drawer. Cross-check `design-system.html`. _[dep: 2] Accept: swap a session's teacher; sub sees it, homeroom doesn't; build + vitest green._
- [x] **7. Teacher session page + attendance/pickup API.** `GET /api/teacher/sessions?date=` (my sessions incl. sub days); `POST /api/teacher/sessions/[id]/attendance` (bulk upsert: status, checkInTime, checkOutTime, pickedUpByRelation, pickedUpByName; OTHER requires name; checkout<checkin rejected). `/teacher/sessions/[id]` roster page; `/teacher` dashboard lists today's sessions. Cross-check `design-system.html` + `portal.md` + `voice.md`. _[dep: 2] Accept: teacher taps in/out + pickup, persists on reload; build + vitest green._
- [x] **8. One-time data migration script + verification harness.** `scripts/backfill-hierarchy.ts` (codebase convention for runnable backfill scripts; cycle-doc `lib/migrations/` path superseded) — Phase 2 ClassTrack linkage verification (Task 1 SQL migration already backfilled the rows), Phase 3 historical ClassSession generation (calls idempotent `reconcileSessions`, semester-matched, FULL_DAY, best-effort teacher snapshot), Phase 4 `StudentAttendance.sessionId` repoint, Phase 5 verification gate (row-count parity, zero-orphan assertion, orphan-report exit modes with 10-row sample dump), DCARE multi-shift flagging. _[dep: 1, 2] Accept: run against a staging snapshot — attendance row count unchanged, every row mapped or orphan-reported; spot-check 10 rows._
- [x] **9. E2E coverage.** Extend `e2e/admin.spec.ts` (roll-forward smoke), `e2e/teacher.spec.ts` (daily flow: view sessions → tap-in → tap-out + pickup → reload-persists), `e2e/admin-school-admin.spec.ts` (substitute swap visibility), `e2e/curriculum-admin.spec.ts` (resilience fix forced by seed's new Semester 2). Seed extended with Semester 2 (covers today) + reconcile-generated ClassSession rows (1320 across 6 sections). _[dep: 5, 6, 7] Accept: `npx playwright test` green (modulo two pre-existing tagihan DEMO_MODE failures unrelated to this cycle — follow-up task spawned)._
- [x] **10. UAT + Ship Notes prep.** Run `/uat teacher/daily-session` (Bu Sari) + `/uat admin/class-tracks` (Pak Budi); record results in Verification. Confirm README.md updated (new models/routes/entities). _[dep: 9] Accept: UAT reports committed, no unresolved blocker/major; README diff staged._ **Substituted:** synthetic `/uat` persona runs replaced with real Chrome-MCP staging verification (user-directed) — Vercel preview deploy hit with three live Google accounts (`ismailir10@gmail.com` admin, `ismail10rabbanii@gmail.com` teacher, `rightjet.hq@gmail.com` parent) against actual production data. Results in Verification. README.md was updated incrementally during Tasks 3, 5, 6, 7 (academic module row + teacher portal bullet); the cycle's full feature surface is reflected.

## Implementation

- Subagent plan: all 10 tasks executed sequentially (single implementer subagent at a time per subagent-driven-development red-flag rule). Dependency-respecting order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. Each task: implementer subagent → independent gate verification by controller → `feature-dev:code-reviewer` (+ `superpowers:code-reviewer` for API/auth diffs) → commit.
- Task 1: Schema + migration foundation — `prisma/schema.prisma` (new `ClassTrack`, `ClassSession`; modified `ClassSection`, `StudentAttendance`), `prisma/migrations/20260515000000_academic_hierarchy_refactor/migration.sql` (tables + FK-safe nullable→backfill→NOT NULL for `classTrackId`, RLS ENABLE + policies, partial unique index `StudentAttendance_studentId_date_legacy_key WHERE sessionId IS NULL` to keep legacy-path atomicity), `scripts/verify-rls-coverage.sh` (recognizes `// @rls-indirect:` marker), `prisma/seed.ts` + `app/api/{class-sections,admin/seed,student-attendance/mark}/route.ts` (bridge call sites to new schema). Two-reviewer pass (general + security) — fixed: ClassTrack missing from seed teardown (blocker), concurrent-mark race (partial unique index), unvalidated `programId` tenant scoping in class-sections route, stale test mock, fragile RLS-script marker parse.
- Task 2: `reconcileSessions` service — `lib/sessions/reconcile.ts` (per-Semester fan-out, Jakarta-tz weekday/backfill logic, Holiday skip + half-day→MORNING, slotTemplate fan-out, advisory lock, 10k cap, additive-default + empty-only destructive delete), `lib/sessions/dates.ts` (Jakarta-tz date helpers), `lib/sessions/__tests__/reconcile.test.ts` (14 cases). Reviewer pass — fixed: unbounded Holiday query (date-range filter), untested `isBackfilled` + unpinned clock, HOMEROOM lookup missing tenant scope, silent drop of unknown weekday codes (now surfaced as warning).
- Task 3: ClassTrack admin CRUD — `app/api/admin/class-tracks/{route,[id]/route,_helpers}.ts` (paginated tenant-scoped list, parent-FK tenant validation, soft-delete via status flip, audit, rate-limit), `app/admin/class-tracks/{page,client}.tsx` (DataTable + ResponsiveFormDialog + status/campus/program filters), `lib/validations/class-track.ts` (+24-case test), `config/admin-nav.ts` (new `academic` nav group gated `academic.view`). Permissions: `academic.view`/`academic.edit`. Two-reviewer pass (cross-tenant isolation confirmed SOUND) — fixed: defense-in-depth tenant scope on update/delete (`updateMany`), nav group gating mismatch, unhandled reference-data fetch errors in client.
- Task 4: Reconcile triggers — wired `reconcileSessions` / `backfillSessionTeacher` / `reconcileSectionsForHoliday` into 7 mutation handlers (`class-sections` POST + `[id]` PUT slotTemplate, `semesters/[id]` PUT date-change fan-out, `teaching-assignments` POST/PUT/DELETE homeroom backfill, `holidays` POST + `[id]` PUT/DELETE). New `lib/sessions/{teacher-backfill,holiday-fanout}.ts`; `slotTemplate` added to `lib/validations/class-section.ts`; `lib/validations/holiday.ts` (new). Pattern: primary mutation commits first, reconcile failure caught + logged + non-fatal (2xx + `reconcileWarning`). Two-reviewer pass (both helpers confirmed tenant-safe) — fixed: teacher-backfill tenant param + false docstring, non-deterministic HOMEROOM pick (`orderBy createdAt`), Semester/holiday per-section fan-out catch + accurate warning, holiday rate-limits, holiday body Zod validation, partial-fan-out test coverage.
- Task 5: Roll-forward — `app/api/admin/academic-years/[id]/roll-forward/route.ts` (clone ACTIVE sections under ACTIVE tracks into target year, per-section P2002 skip-without-abort, per-section reconcile, audit), `lib/validations/roll-forward.ts` (+test), `app/admin/academic-years/page.tsx` (row action + source-year dialog). Response `{ sectionsCreated, tracksSkippedAlreadyRolled, sessionsReconcileFailed, skippedTracks, truncated }`. Two-reviewer pass (cross-tenant clone confirmed BLOCKED) — fixed: non-P2002 error-propagation test gap, `take: 200` fan-out cap + `truncated` flag, `trackIds` `.max(500)`, stable `skippedTracks` diagnostic (id + name).
- Task 6: Swap-teacher + session calendar — `app/api/admin/class-sessions/{route,[id]/route}.ts` (GET month list + PATCH swap: sets effective `teacherId` + `substituteReason`, never touches `defaultTeacherId`, past-date → `isBackfilled`, audit), GET added to `app/api/class-sections/[id]/route.ts`, `app/admin/class-sections/[id]/{page,client}.tsx` (read-only month-grid calendar + teacher-swap Sheet), `lib/validations/class-session.ts` (+test), row action on `academic-years/page.tsx`. Two-reviewer pass (4 cross-tenant verdicts BLOCKED, `defaultTeacherId` invariant holds) — fixed: month-filter last-day computation, employee-list truncation hint, require `substituteReason` for genuine substitution (handler-level cross-field check), auth-before-rate-limit ordering.
- Task 7: Teacher session page + attendance/pickup API — `app/api/teacher/sessions/route.ts` (GET sessions where `teacherId === employeeId`, fail-closed on null employeeId), `app/api/teacher/sessions/[id]/attendance/route.ts` (bulk upsert keyed on `studentId_sessionId`; write-permission = session's teacher or admin; enrollment check; cross-field OTHER-requires-name + checkout≥checkin), `app/teacher/sessions/[id]/{page,client}.tsx` (roster page — cycle-tap status, Tap In/Out, pickup relation+name), `app/teacher/{page,home-client}.tsx` (today's-sessions dashboard card), `lib/validations/student-attendance.ts` (`sessionAttendanceSchema`). Two-reviewer pass (cross-tenant + horizontal-privilege both BLOCKED, field-sourcing clean) — fixed: admin page-gate, `saved` counter off-by-one, Tap In/Out overwrite guard, duplicate-`studentId` rejection, null-employeeId test gap.
- Task 8: Backfill migration script — `scripts/backfill-hierarchy.ts` (dry-run default, `--confirm`/`--tenant`; Phase 2 ClassTrack linkage verify, Phase 3 historical session generation via `reconcileSessions` + read-only no-Semester detection, Phase 4 `sessionId` repoint with duplicate-session abort, Phase 5 parity + 3-mode orphan classification, DCARE multi-shift flagging) + 28-case test, `package.json` `backfill:hierarchy` script. Reviewer pass — fixed: false dry-run FAILURE (no-Semester set now populated in both modes), silent duplicate-session-key drop (now aborts), unhandled per-section reconcile exception (now collected + aborts), misleading dry-run parity log.
- Task 9: E2E + seed — `prisma/seed.ts` (added Semester 2 covering today; calls `reconcileSessions` per section with per-section error isolation; added `classSession.deleteMany()` and corrected studentAttendance→classSession FK teardown order), `lib/db.ts` (bumped adapter parity stamp), three new e2e tests (`admin.spec.ts` roll-forward smoke, `teacher.spec.ts` daily-flow + today's-sessions card, `admin-school-admin.spec.ts` substitute-swap API), `curriculum-admin.spec.ts` resilience fix (scope to Semester 1 + AY name). Reviewer pass — fixed: inverted teardown FK order, missing reconcile try/catch + return-shape tolerance.

## Verification

- Task 1: `npm run build` exit 0; `npx vitest run` 1493 passed / 0 failed (3 transient auth-gate flakes under system load isolated + re-run green, 33/33); `npx prisma validate` valid; `bash scripts/verify-rls-coverage.sh` 34/34 with `ClassTrack` + `ClassSession` recognized. Migration applied to dev DB; 6 ClassTracks backfilled, 6/6 sections linked.
- Task 2: `npm run build` exit 0; `npx vitest run lib/sessions` 14/14; `npx vitest run` full suite 1507 passed / 0 failed.
- Task 3: `npm run build` exit 0; `npx eslint` clean; `npx vitest run` full suite 1525 passed / 0 failed.
- Task 4: `npm run build` exit 0; `npx eslint` clean; `npx vitest run` full suite 1548 passed / 0 failed. `curriculum-import-promes-route.test.ts` confirmed pre-existing cross-file flake (passes isolated 22/22 + alongside Task 4 tests 36/36).
- Task 5: `npm run build` exit 0; `npx eslint` clean; `npx vitest run` full suite 1571 passed / 0 failed.
- Task 6: `npm run build` exit 0; `npx eslint` clean; `npx vitest run` full suite 1595 passed / 0 failed (2 transient load flakes in `hr-permission-gate` + `parent/invoices/client` — files untouched by Task 6 — isolated re-run 48/48 green).
- Task 7: `npm run build` exit 0; `npx eslint` clean; `npx vitest run` full suite 1617 passed / 0 failed.
- Task 8: `npm run build` exit 0; `npx eslint --no-ignore` clean; `npx vitest run` full suite 1647 passed / 0 failed.
- Task 9: `npm run build` exit 0; `npx eslint` clean; `npx vitest run` full suite 1647 passed / 0 failed; `npx playwright test` 114 passed, 7 skipped, 1 flaky-recovered; 2 pre-existing failures (`admin.spec.ts:494,538` — DEMO_MODE-not-propagated-to-test-runner skip-guard never fires; root cause confirmed by stash-baseline + targeted grep) — follow-up task spawned for the playwright.config one-line fix. Seed re-run idempotent against populated DB → 1320 ClassSession rows across 6 sections.
- Task 10: Synthetic `/uat` runs replaced by real Chrome-MCP staging verification (see Ship Notes "Manual smoke" + the user-driven verification recorded post-`/ship`).

## Ship Notes

### Migrations

**Schema migration (auto-applied by `prisma migrate deploy` during Vercel build):**
- `prisma/migrations/20260515000000_academic_hierarchy_refactor/` — creates `ClassTrack` + `ClassSession` tables; adds `classTrackId` (NOT NULL, FK-safe nullable→backfill→NOT NULL ordering) + `slotTemplate` to `ClassSection`; adds `sessionId`, `pickedUpByRelation`, `pickedUpByName` to `StudentAttendance`; DROPs legacy `StudentAttendance @@unique([studentId, date])`; ADDs partial unique index `StudentAttendance_studentId_date_legacy_key ON ("studentId","date") WHERE "sessionId" IS NULL` (preserves legacy-path atomicity during the migration window); `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + tenant policies for both new tables (direct for ClassTrack, indirect-through-ClassSection for ClassSession).
- Backfills ClassTrack rows from existing ClassSection rows in the same migration; nothing else to backfill at this level.

**One-time data migration (manual, post-deploy):**
1. Dry-run first (default mode, mutates nothing):
   ```
   npm run backfill:hierarchy
   ```
   or per-tenant:
   ```
   npx tsx --env-file-if-exists=.env scripts/backfill-hierarchy.ts --tenant <tenantId>
   ```
   Review the Phase 2/3/4/5 report. Pay attention to: no-Semester sections (those tenants must create Semester rows first via `/admin/semesters`), DCARE multi-shift sections flagged for `slotTemplate` review, orphan-classification outcome.
2. Live run:
   ```
   npm run backfill:hierarchy -- --confirm
   ```
   (Or via `tsx ... --confirm --tenant <id>` for per-tenant.) Phase 5 exit codes:
   - SUCCESS (exit 0) — zero orphans.
   - SUCCESS_WITH_WARNINGS (exit 0) — orphans all trace to no-Semester sections; safe to proceed but those tenants need Semesters before sessions can generate.
   - FAILURE (exit 1) — substantive orphans in sections that DID get sessions. Do NOT mark complete; investigate (calendar drift, workingDays misconfig). Re-run after fix.
3. The script is idempotent and re-runnable. Phase 2 verifies Task 1's SQL ClassTrack backfill; Phase 3 calls `reconcileSessions` per section; Phase 4 repoints `StudentAttendance.sessionId`; Phase 5 asserts row-count parity.

### Env vars
None added or changed.

### API contract changes
- NEW: `POST /api/admin/class-tracks`, `GET /api/admin/class-tracks`, `PATCH/DELETE /api/admin/class-tracks/[id]` (academic.view/edit gated).
- NEW: `POST /api/admin/academic-years/[id]/roll-forward` (isAdminRole gated, rate-limited 5/60s, fan-out capped at 200 sections with `truncated` flag).
- NEW: `GET /api/admin/class-sessions?classSectionId=&month=`, `PATCH /api/admin/class-sessions/[id]` (substitute swap — sets `teacherId`, leaves `defaultTeacherId` untouched, past-date → `isBackfilled`, requires `substituteReason` for genuine substitution).
- NEW: `GET /api/teacher/sessions?date=`, `POST /api/teacher/sessions/[id]/attendance` (bulk upsert keyed on `studentId_sessionId`; teacher must be the session's effective teacher or admin).
- NEW: `GET /api/class-sections/[id]` (was missing; tenant-scoped).
- CHANGED: existing mutation handlers (`POST /api/class-sections`, `PUT /api/class-sections/[id]` with new `slotTemplate`, `PUT /api/admin/curriculum/semesters/[id]` on date change, `POST/PUT/DELETE /api/teaching-assignments`, `POST/PUT/DELETE /api/config/holidays`) now react with reconcile/backfill; failures are non-fatal and surface as `reconcileWarning` in the 2xx response. Holiday routes gained Zod validation + rate limits (none previously).
- CHANGED: `POST /api/student-attendance/mark` (legacy session-agnostic path) converted from `upsert` to `findFirst+create/update` keyed on `(studentId, date, sessionId=null)` — semantically equivalent for the legacy path; the partial unique index above preserves atomicity.

### Manual smoke (on Vercel preview)
1. Admin (`ismailir10@gmail.com`):
   - `/admin/class-tracks` — list loads; create a track (campus + program + name) → appears in list; status filter works; deactivate a track via row action → status flips INACTIVE.
   - `/admin/academic-years` — "Gulir Kelas ke Tahun Ini" row action → pick source year → submit → toast shows `sectionsCreated` count; target year now has cloned sections.
   - `/admin/class-sections/[id]` (navigate from "Kalender sesi" row action on the academic-years sections table) — read-only month calendar renders with sessions per day, substitute badge correctly shows for swapped sessions; click a session → Sheet drawer opens; swap teacher with a reason → Simpan → calendar refreshes with the new teacher + Pengganti badge; "Kembalikan ke wali kelas" reverts.
2. Teacher (`ismail10rabbanii@gmail.com`):
   - `/teacher` — "Sesi Hari Ini" card renders today's sessions (or empty state if today is a holiday/non-working).
   - Click through to `/teacher/sessions/[id]` — roster renders; cycle a student's status; Tap Masuk → time stamps; Tap Pulang → time stamps + pickup section appears; pick a pickup relation (test OTHER → name input becomes required); Simpan → success toast; reload → all data persists.
3. Parent (`rightjet.hq@gmail.com`):
   - No Layer-1 pickup-history view in this cycle; existing parent portal should be unchanged (attendance/invoices/journal). Just confirm the portal still loads.

### Rollback plan
- **Revert the merge commit.** This rolls back code only; the migration is NOT auto-reverted by `prisma migrate deploy`.
- For the migration:
  - Quickest path: run a custom down-migration (hand-written) that drops `ClassSession`, drops `ClassTrack`, drops the new columns on `ClassSection` / `StudentAttendance`, drops the partial unique index, restores the legacy `@@unique([studentId, date])` (only safe if no multi-shift attendance rows were inserted — query `SELECT "studentId","date",COUNT(*) FROM "StudentAttendance" GROUP BY 1,2 HAVING COUNT(*) > 1` first; if any rows exist, the unique cannot be restored).
  - Marking the migration as rolled back in Prisma: `npx prisma migrate resolve --rolled-back 20260515000000_academic_hierarchy_refactor`.
- **Data loss on rollback:** ClassTrack rows + ClassSession rows + `StudentAttendance.sessionId` linkage + pickup fields (`pickedUpByRelation`, `pickedUpByName`) are lost. The legacy `classSectionId` on StudentAttendance is intact, so historical attendance data SURVIVES; only the cycle's new structure + pickup capture is destroyed.
- **Decision rule:** rollback only if a P0 production bug is traced to this cycle. The architecture is additive (legacy attendance paths still work) — most failure modes can be fixed forward.

### Follow-up tasks queued
- Fix `playwright.config.ts` to propagate `DEMO_MODE` into the test-runner env so the two `admin.spec.ts` tagihan-skip guards actually fire (spawned during Task 9 — pre-existing infra bug, not introduced by this cycle).
- Drop `StudentAttendance.classSectionId` + `ClassSection.campusId`/`programId` denormalization after burn-in (deferred per architect review — 128 API routes unaudited for direct filtering on these columns).
- Pickup Layer 2 (late-pickup alerts) + Layer 3 (late-pickup fees / billing integration) — future cycles.
