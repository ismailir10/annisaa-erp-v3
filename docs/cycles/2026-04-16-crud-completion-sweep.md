# CRUD Completion Sweep — 70% → 100%

## Context

The 2026-04-16 CRUD audit (README.md) identified specific missing operations across 7 entities. Current overall CRUD completion is ~70% (8 full + 12 partial out of 27 admin-relevant entities). This cycle closes all 7 gaps identified in the audit, bringing every touched entity to full CRUD (Create, Read list, Read detail, Update, Deactivate).

**Why now:** Partial CRUD is a UX trap — admins can create data but can't manage its lifecycle. Deactivation is especially critical for Student, Guardian, and Enrollment entities where "active" status drives billing, attendance, and reporting.

## Spec

### Acceptance criteria

1. **Student list page** (`/admin/students`) has `DataTableRowActions` with "Nonaktifkan" / "Aktifkan" in the dropdown, backed by `ConfirmDialog`. API `PUT /api/students/[id]` already supports `{ status: "INACTIVE" }` — wire the UI only.

2. **Guardian standalone list** (`/admin/guardians`) — full admin list page with DataTable, search, status filter, edit dialog, and deactivate/activate actions. Model is `Parent`. New API: `GET /api/guardians` (paginated), `PUT /api/guardians/[id]`.

3. **Enrollment standalone list** (`/admin/enrollments`) — full admin list page with DataTable, search, academic-year filter, class-section filter, status filter, edit dialog (change class section), deactivate action. Model is `StudentEnrollment`. New API: `GET /api/enrollments` (paginated), `PUT /api/enrollments/[id]`.

4. **Teaching assignment standalone list** (`/admin/teaching-assignments`) — admin list page with DataTable, search, filter by employee/class/role. Delete action (junction table — no status field, hard delete is intentional per schema comment). No new API needed — existing `GET /api/teaching-assignments` and `DELETE /api/teaching-assignments/[id]` are sufficient.

5. **Assessment template admin UI** (`/admin/assessments/templates`) — admin list page with DataTable, search, program filter, create dialog (name + program + type + nested categories/indicators), edit dialog, toggle `isActive` (deactivate). New API: `PUT /api/assessments/templates/[id]`.

6. **Student assessment admin UI** (`/admin/assessments/scores`) — admin page with:
   - Step 1: Select class section → template → period
   - Step 2: DataTable of students in that class
   - Step 3: Click student → scoring Sheet/Dialog with all categories/indicators, BB/MB/BSH/BSB score selector
   - Step 4: Save scores (DRAFT) or Publish (PUBLISHED)
   - List view of existing assessments with status filter
   New API: `GET /api/assessments/students` (paginated list). Existing `POST /api/assessments/student` and `PUT /api/assessments/student/[id]` are reused.

7. **ProgramFeeStructure** — the existing fees page (`/admin/fees`) already has `isEnabled` toggle on `FeeComponentDef` via `Switch`. No hard delete exists for ProgramFeeStructure rows (they use upsert). **This task is already complete** — the audit entry was inaccurate. Verify and move on.

### Non-goals

- EmailLog, PayrollItem, InvoiceLine, Payment (admin-side), AssessmentCategory, AssessmentIndicator — deliberately no standalone UI this cycle.
- No Prisma migrations — all entities and fields exist already.
- No changes to teacher or parent portals.

### Constraints

- Shadcn-first. Use `DataTable`, `DataTableRowActions`, `ConfirmDialog`, `Field`, `StatusBadge`, `DataTableToolbar`, `StatCard`.
- Soft delete via status change, never hard DELETE (except TeachingAssignment which is a junction table).
- Tenant isolation on every new API route.
- Zod validation on every POST/PUT.
- All new pages follow List Page Layout Standard from CLAUDE.md.
- All new pages added to admin nav in `config/admin-nav.ts`.

## Tasks

### Task 1: Student deactivate action
**Files:** `app/admin/students/page.tsx`
- Add `ConfirmDialog` component import
- Add `deactivateTarget` state
- Extend `columnsWithActions` to pass `onDeactivate` / `onActivate` / `isActive` to `DataTableRowActions`
- Add `handleDeactivate` function that calls `PUT /api/students/[id]` with `{ status: "INACTIVE" }` (or `"ACTIVE"` for re-activate)
- Render `<ConfirmDialog>` at bottom of component
- Gate: `npm run build && npx vitest run`

### Task 2: Guardian standalone list page
**New files:**
- `app/api/guardians/route.ts` — `GET` (paginated list of Parents with search, status filter, include student count)
- `app/api/guardians/[id]/route.ts` — `PUT` (edit name/phone/email/etc + deactivate via `{ status: "INACTIVE" }`)
- `app/admin/guardians/page.tsx` — full list page (DataTable, search, status filter, edit dialog, deactivate)

**Modified files:**
- `config/admin-nav.ts` — add "Wali Murid" under Akademik group
- Gate: `npm run build && npx vitest run`

### Task 3: Enrollment standalone list page
**New files:**
- `app/api/enrollments/route.ts` — `GET` (paginated, with student name, class section, program, academic year, status filter)
- `app/api/enrollments/[id]/route.ts` — `PUT` (change class section, change status)
- `app/admin/enrollments/page.tsx` — full list page (DataTable, search, academic-year filter, class-section filter, status filter, edit dialog, deactivate)

**Modified files:**
- `config/admin-nav.ts` — add "Pendaftaran Kelas" under Akademik group (or "Penempatan" as a shorter label)
- Gate: `npm run build && npx vitest run`

### Task 4: Teaching assignment standalone list page
**New files:**
- `app/admin/teaching-assignments/page.tsx` — list page (DataTable, search, filter by employee/class/role, delete via ConfirmDialog)

**Modified files:**
- `config/admin-nav.ts` — add "Guru Pengajar" under Akademik group
- Gate: `npm run build && npx vitest run`

### Task 5: Assessment template admin UI
**New files:**
- `app/api/assessments/templates/[id]/route.ts` — `PUT` (edit name/type/isActive)
- `app/admin/assessments/templates/page.tsx` — list page + create/edit dialog (nested: categories → indicators)

**Modified files:**
- `app/api/assessments/templates/route.ts` — add pagination support to GET
- `config/admin-nav.ts` — add "Template Penilaian" under new or existing nav group
- Gate: `npm run build && npx vitest run`

### Task 6a: Student assessment list page
**New files:**
- `app/api/assessments/students/route.ts` — `GET` (paginated list of StudentAssessments with student name, template, period, status)
- `app/admin/assessments/page.tsx` — list page (DataTable with status filter, view scores action)

**Modified files:**
- `config/admin-nav.ts` — add "Penilaian Siswa" nav item
- Gate: `npm run build && npx vitest run`

### Task 6b: Student assessment scoring UI
**New files:**
- `app/admin/assessments/scores/page.tsx` — scoring page: select class → template → period → score students

This page reuses:
- `GET /api/teaching-assignments?classSectionId=X` to get teachers
- `GET /api/assessments/templates` to list templates
- `POST /api/assessments/student` to create/get assessment
- `PUT /api/assessments/student/[id]` to save scores

- Gate: `npm run build && npx vitest run`

### Task 7: ProgramFeeStructure verification
- Verify existing fees page has no hard-delete path for ProgramFeeStructure
- Verify `isEnabled` toggle on FeeComponentDef works as deactivate mechanism
- If changes needed, implement; otherwise mark complete
- Gate: `npm run build && npx vitest run`

### Task 8: Nav update + README + final gate
**Modified files:**
- `config/admin-nav.ts` — ensure all new pages have nav entries (done incrementally, but verify)
- `README.md` — update CRUD completion status table
- Gate: `npm run build && npx vitest run && npx playwright test`

## Implementation

- Task 1: Student deactivate action — `app/admin/students/page.tsx` — added deactivate/activate with ConfirmDialog and DataTableRowActions dropdown

## Verification

- Task 1: gates passed (build + vitest run — 6 files, 69 tests green)

## Ship Notes

_To be filled during /ship_
