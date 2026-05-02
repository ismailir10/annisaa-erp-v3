# CRUD Sweep — Student & Employee List Row Actions + API Zod Hardening

## Context

CRUD audit of all 27 admin-relevant entities against the CLAUDE.md DataTable Action Column Standard.
The standard requires every DataTable to have a `DataTableRowActions` with:
- **Primary**: Lihat (View) button → navigates to detail
- **Dropdown (⋮)**: Edit → navigates to detail; Deactivate/Activate → soft-delete via `{ status: "INACTIVE" }`

**Audit confirms README claim is accurate** — 8 fully complete, 12 partial, 7 missing admin UI.

The two highest-priority partial entities are **Student** and **Employee** — both used daily for payroll
and enrollment. Both have `DataTableRowActions` with only `onView`; neither has Edit or Deactivate
in the dropdown. This directly violates the CRUD standard and forces admins to navigate to the
detail page just to deactivate a record.

Secondary finding: `PUT /api/employees/[id]` and `PUT /api/students/[id]` accept raw JSON without
Zod validation — the schemas (`updateEmployeeSchema`, `updateStudentSchema`) already exist in
`lib/validations/` but are not wired up to the PUT handlers.

All other partial entities are either:
- Managed inline via parent-entity detail pages (Guardian, StudentEnrollment, TeachingAssignment)
  — acceptable ERPNext-style pattern
- Part of LEARNING module roadmap (AssessmentTemplate, StudentAttendance) — out of scope here
- Read-only outputs of other engines (PayrollItem, InvoiceLine, EmailLog) — no CRUD needed

## Spec

### Acceptance Criteria

**T1 — Students list Edit + Deactivate:**
- `DataTableRowActions` on `/admin/students` has `onEdit` → `router.push(\`/admin/students/${id}\`)`
- `DataTableRowActions` has `onDeactivate` → opens `ConfirmDialog` → calls `PUT /api/students/${id}`
  with `{ status: "INACTIVE" }` → toast.success + list refetches
- Deactivate only shown when `status === "ACTIVE"` (`isActive` prop)
- On deactivate success, the row disappears or shows INACTIVE depending on current status filter

**T2 — Employees list Edit + Deactivate:**
- Same pattern as T1, adapted for Employee (`/admin/employees/${id}`, `PUT /api/employees/${id}`)
- Only shown when `status === "ACTIVE"`

**T3 — Zod on employee PUT:**
- `PUT /api/employees/[id]` calls `validateBody(updateEmployeeSchema, body)` before the Prisma update
- Deactivate shortcut (`{ status: "INACTIVE" }`) bypasses full validation (only status field)
- Returns 422 with `{ error: "..." }` on validation failure

**T4 — Zod on student PUT:**
- Same pattern, using `updateStudentSchema` from `lib/validations/student`
- Deactivate/Withdraw shortcuts bypass full field validation
- Returns 422 on validation failure

### Out of Scope
- AssessmentTemplate admin UI (LEARNING module — next cycle)
- Guardian / StudentEnrollment / TeachingAssignment standalone lists (managed inline — acceptable)
- Invoice edit dialog (invoices are generated, limited editing is a future feature)
- Other 7 missing-UI entities (PayrollItem, InvoiceLine, EmailLog, etc.)

## Tasks

- [x] T1: Students list — add `onEdit` (navigate) + `onDeactivate` (ConfirmDialog → INACTIVE) to `DataTableRowActions`
- [x] T2: Employees list — same pattern for Employee rows
- [x] T3: Wire `updateEmployeeSchema` into `PUT /api/employees/[id]`
- [x] T4: Wire `updateStudentSchema` into `PUT /api/students/[id]`

## Implementation

**T1 — `app/admin/students/page.tsx`**
- Added `ConfirmDialog` import
- Added `deactivateTarget: Student | null` state
- Added `handleDeactivate()` — fetches `PUT /api/students/${id}` with `{ status: "INACTIVE" }`, toasts on success/error, calls `fetchStudents()` after success
- `columnsWithActions`: added `onEdit` → `router.push(.../id)`, `onDeactivate` shown only when `status === "ACTIVE" || "ENROLLED"`, `isActive` prop set accordingly
- Mounted `<ConfirmDialog>` at bottom of return with warning that enrollments + invoices will cascade

**T2 — `app/admin/employees/page.tsx`**
- Identical pattern: `ConfirmDialog` import, `deactivateTarget` state, `handleDeactivate`, updated `DataTableRowActions`
- Deactivate shown only for `status === "ACTIVE"` employees

**T3 — `app/api/employees/[id]/route.ts`**
- Added `validateBody` + `updateEmployeeSchema` imports
- Deactivate shortcut (`{ status: "INACTIVE" }` only) bypasses full-field validation
- All other PUT requests go through `await validateBody(updateEmployeeSchema, rawBody)` → returns error `NextResponse` on failure

**T4 — `app/api/students/[id]/route.ts` + `lib/validations/student.ts`**
- Added `"INACTIVE"` to `updateStudentSchema` status enum (was missing)
- Replaced raw `req.json()` body with `await validateBody(updateStudentSchema, ...)` → early return on failure
- Cascade logic (withdraw enrollments, cancel invoices) preserved unchanged

## Verification

**Between-task gate** (run after all tasks completed together):
- `npx tsc --noEmit`: 0 errors in any modified file (pre-existing test-file errors only, unrelated)
- `npx vitest run`: **69/69 passed**

**Manual smoke** (not applicable — no running server in worktree; UI changes are additive row-action additions that follow the existing `DataTableRowActions` pattern used on 8 other pages without issue)

## Ship Notes

<!-- /ship fills this in -->
- No migrations required
- No new env vars
- No rollback needed (pure UI additions + validation hardening)
