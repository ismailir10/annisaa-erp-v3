# CRUD Completeness — Existing Entities

## Context

Closes all Majors and Minors under §4 CRUD completeness of [`docs/reviews/2026-04-21-sweep.md`](../reviews/2026-04-21-sweep.md) — the five entities whose CRUD contract per the CRUD Standard (Category A / B / C) is measurably incomplete, plus four minors that touch the same admin pages. The sweep also flagged **README drift**: `README.md` §CRUD completion status currently claims "100% CRUD coverage" and marks every category "Complete," yet the sweep enumerated 5 Majors and 4 Minors that contradict that claim. This cycle lands the missing operations and corrects the README in the same pass so the table reflects reality.

Scope is deliberately existing-entity only — the 7 entities with no admin UI at all (EmailLog, Payment, StudentAssessment admin view, ProgramFeeStructure manager, etc.) stay in their own follow-up cycle (§6 on the sweep triage list). No new migrations expected: every target entity already has the required schema fields (`status` on Program / ClassSection / StudentEnrollment / TeachingAssignment, `isVoided` on StudentAttendance, `periodStart` / `periodEnd` / `actualWorkDays` / `status` on PayrollRun).

## Spec

### Acceptance criteria

- [ ] **Program** — `PUT /api/programs/[id]` accepts `{ status: "ACTIVE" | "INACTIVE" }` and toggles the row. `/admin/academic` Programs DataTable row actions expose `onDeactivate` + `onReactivate` via `DataTableRowActions`. Status filter on the list page includes Semua/Aktif/Tidak Aktif.
- [ ] **ClassSection** — `/admin/academic` Class Sections DataTable row actions expose `onDeactivate` + `onReactivate` (API `PUT /api/class-sections/[id]` already soft-deletes — UI wiring only).
- [ ] **StudentEnrollment** — `/admin/enrollments` DataTable row actions expose `onDeactivate` + `onReactivate`. `PUT /api/enrollments/[id]` accepts status transitions. Student-detail enrollments tab remains read-only (no duplicate mutation surface).
- [ ] **StudentAttendance** — `/admin/student-attendance` exposes an Override dialog via ⋮ menu on each row. Dialog writes to `PUT /api/student-attendance/[id]` (edit) or `POST /api/student-attendance/[id]/override` (confirm exact endpoint shape during Task 4 Step 1). Void action also in ⋮ menu, flips `isVoided = true`. Category C pattern — no `status` column, no binary deactivate.
- [ ] **PayrollRun** — `PUT /api/payroll/[id]` handler added accepting `{ periodStart?, periodEnd?, actualWorkDays? }`. Guards: `status === "DRAFT"` only, `SUPER_ADMIN` only, Zod validated, rate-limited. Detail page `/admin/payroll/[id]` gains an Edit toggle on the summary card for those three fields while status is DRAFT. No list-page row action (PayrollRun list is `onView` only — documented Category B exception).
- [ ] **TeachingAssignment** (minor) — Edit dialog on `/admin/teaching-assignments` (or wherever the list lives — confirm during build) for the `role` field. Uses same form shape as create.
- [ ] **Admission** (minor) — ⋮ menu shows contextual next-state transition ("Lanjutkan ke …") instead of a flat list of all targets, plus "Batalkan" terminal. Backend `PUT /api/admissions/[id]` validates transitions — reject illegal jumps.
- [ ] **AttendanceRecord** (minor) — Post-creation edit semantics documented in [`.claude/standards/crud.md`](../../.claude/standards/crud.md) §Category C (override-only, no row edit). Verify `/admin/attendance` UI enforces; close as doc-only if already compliant.
- [ ] **Invoice** (minor) — Verify `DataTableRowActions.onVoid` wired on `/admin/invoices` list + `/admin/invoices/[id]` detail. Wire if missing; close as verified if already present.
- [ ] **README.md** §CRUD completion status — corrected in place to drop false "100% / Complete" claims, list every gap closed this cycle, re-audit row-by-row against the three categories. Sweep findings under §4 marked `✅ [cycle: 2026-04-21-crud-completeness-existing]` in place.
- [ ] **e2e** — `e2e/admin.spec.ts` extended with one happy-path assertion per new row action (program deactivate, class-section deactivate, enrollment deactivate, student-attendance override, payroll edit).
- [ ] **Security checklist retained** on every mutation endpoint touched: `getSession()` + role gate + tenantId filter + Zod + `rateLimit()`.

### Non-goals

- No new migrations. If one becomes necessary mid-build, stop and surface before coding.
- No hard deletes anywhere — status toggle or `isVoided` flag only.
- No work on the 7 missing-admin-UI entities (EmailLog, Payment, StudentAssessment admin surface, ProgramFeeStructure manager, PayrollItem, InvoiceLine standalone) — separate cycle.
- No changes to Category A/B/C framework itself — standard is already correct; this cycle fills gaps against it.
- No changes to the Penilaian/Nilai/Rapor labeling work — handled in the prior nav-ia-hygiene cycle.

### Assumptions

1. `/admin/enrollments/page.tsx` is already the canonical list — no new route needed. Student-detail tab mirrors but stays read-only.
2. `/admin/student-attendance/page.tsx` is the right entry point for the override dialog (not a nested tab on the student-detail page).
3. Admission contextual-transition menu will use a single-next-state action plus terminal Cancel — the current UI shows transitions elsewhere and this cycle migrates them onto the ⋮ menu.
4. PayrollRun edit fields are limited to `periodStart`, `periodEnd`, `actualWorkDays` — any other editable fields (basis rules, component overrides) stay out of this cycle.
5. `PUT /api/enrollments/[id]` already exists or is trivial to add alongside the UI change. If absent, Task 3 gains a sub-step.
6. Playwright `admin.spec.ts` extensions continue to use demo-mode cookie injection — no live auth.

## Tasks

Phase 1 — Majors (strictly sequential; each its own commit; gate `npm run build && npx vitest run` between).

- [x] **T1 · Program Deactivate** — Add status branch to `PUT /api/programs/[id]` Zod schema (`status: z.enum(["ACTIVE","INACTIVE"]).optional()`). Wire `onDeactivate` / `onReactivate` handlers on `/admin/academic` Programs DataTable via `DataTableRowActions`. Ensure status filter on list page. Extend `e2e/admin.spec.ts` with happy-path deactivate. **Acceptance:** clicking ⋮ → Nonaktifkan on a program row sets `status=INACTIVE` and the row disappears under the Aktif filter.
- [x] **T2 · ClassSection Deactivate UI** — `/admin/academic` Class Sections DataTable row action `onDeactivate` + `onReactivate` (API already handles the write). e2e happy-path. **Acceptance:** same pattern as T1, class-section toggles. Depends on T1 only for shared-file merge hygiene on `/admin/academic/page.tsx`.
- [ ] **T3 · StudentEnrollment Deactivate** — `/admin/enrollments` row action; verify/extend `PUT /api/enrollments/[id]` status acceptance + Zod; keep student-detail enrollments tab read-only. e2e. **Acceptance:** ⋮ → Nonaktifkan on an enrollment row soft-deletes it; student-detail tab still renders, no mutation controls.
- [ ] **T4 · StudentAttendance override dialog** — `/admin/student-attendance` ⋮ menu exposes Override (opens dialog editing `{status, note}`) and Void (`isVoided=true`). Confirm `PUT /api/student-attendance/[id]` semantics in Step 1 of this task before coding — if override needs its own endpoint, add `POST /api/student-attendance/[id]/override` per Category C pattern. e2e. **Acceptance:** Override dialog writes a new status and event row reflects it; Void flips `isVoided` and the row renders struck-through per existing Category C UI.
- [ ] **T5 · PayrollRun edit** — Add `PUT` handler in `app/api/payroll/[id]/route.ts` (Zod `{ periodStart?, periodEnd?, actualWorkDays? }`, status=DRAFT guard, SUPER_ADMIN, rate-limited, tenantId-scoped). `/admin/payroll/[id]` detail page summary card gains Edit toggle per the CRUD Standard Edit Toggle Pattern; fields editable only while status=DRAFT; Save+Cancel. e2e. **Acceptance:** on a DRAFT run, editing periodStart saves and persists; attempting to edit on an APPROVED run returns 409 and UI hides the Edit button.

Phase 2 — Minors (independent; safe to dispatch in parallel via subagents — different files, no shared state).

- [ ] **T6 · TeachingAssignment edit dialog** — Edit dialog for `role` field on the teaching-assignments list page. **Acceptance:** editing a row's role persists via `PUT /api/teaching-assignments/[id]` and list re-renders.
- [ ] **T7 · Admission contextual transition menu** — ⋮ menu on `/admin/admissions` shows "Lanjutkan ke <next label>" + "Batalkan" (hidden on terminal states). Backend `PUT /api/admissions/[id]` rejects illegal transitions (add guard if missing). **Acceptance:** an INQUIRY row shows only "Lanjutkan ke Visit Scheduled" + "Batalkan"; POSTing a skip (INQUIRY → REGISTERED) returns 400.
- [ ] **T8 · AttendanceRecord edit-semantics doc** — Verify `/admin/attendance` (or equivalent page) does not expose a row Edit action; document override-only rule in `.claude/standards/crud.md` §Category C if not already clear. Close finding as doc-only. **Acceptance:** the standard file explicitly states "AttendanceRecord is corrected via override, not edit"; no UI changes if compliant.
- [ ] **T9 · Invoice void-action wiring check** — Confirm `DataTableRowActions.onVoid` is wired on `/admin/invoices` list and `/admin/invoices/[id]` detail. Wire if missing; close as verified if present. **Acceptance:** both surfaces expose Void; clicking it calls `POST /api/invoices/[id]/void`.

Phase 3 — Doc sync + sweep cite.

- [ ] **T10 · README + sweep update** — Rewrite `README.md` §CRUD completion status section to reflect reality (remove "100%" and "Complete" claims where not literally true; list the 9 gaps closed this cycle + any still open; re-audit every row in the table). Mark each addressed finding under sweep §4 with `✅ [cycle: 2026-04-21-crud-completeness-existing]` in place. **Acceptance:** README's CRUD status section and the sweep's §4 table are internally consistent; no orphan claims remain.

End-of-cycle gate before the final commit: `npm run build && npx vitest run && npx playwright test`.

## Implementation

- Subagent plan: T1–T5 dispatched sequentially as one subagent per task (shared-file risk, serial commits). T6–T9 dispatched sequentially as independent subagents (parallel-safe files, but serial commits to avoid git working-tree races in a single worktree). T10 executed inline in the main session.
- T1 · Program Deactivate — `app/api/programs/[id]/route.ts`, `app/admin/academic/page.tsx`, `e2e/admin.spec.ts` — added `rateLimit()` to PUT, wired `onActivate` + status filter (Semua/Aktif/Tidak Aktif) + Status column on Programs DataTable, added reactivate ConfirmDialog and happy-path e2e toggling `status=INACTIVE` then restoring.
- T2 · ClassSection Deactivate UI — `app/api/class-sections/[id]/route.ts`, `app/admin/academic/page.tsx`, `e2e/admin.spec.ts` — added `rateLimit()` to PUT (was missing), wired `onActivate` + `isActive` prop on class-section DataTableRowActions (Deactivate confirm already existed), added Status column + status filter (Semua/Aktif/Tidak Aktif) on Class Sections DataTable, happy-path e2e mirroring T1 shape (API-level toggle + restore). Reused existing `reactivateTarget` state already wired to `section` type from T1.

## Verification

- T1: gates passed (`npm run build` ok; `npx vitest run` 174/174 pass). Manual smoke deferred to end-of-cycle Playwright run; API-level deactivate/reactivate covered by new e2e spec.
- T2: gates passed (`npm run build` ok; `npx vitest run` 174/174 pass). API-level class-section deactivate/reactivate covered by new e2e spec; restores to ACTIVE so subsequent test runs stay idempotent.

## Ship Notes
