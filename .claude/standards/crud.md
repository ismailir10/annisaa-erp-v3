# CRUD Standard (Inspired by ERPNext)

> Loaded on demand by `/build` when staged paths match `app/admin/**` **and** the file contains `<Dialog` / `FormField` / `<Field` / a create-or-edit form pattern.

> Every entity in the system MUST support full CRUD. No create-only or read-only entities.

Entities fall into **three categories**. Pick the right one before you build — forcing the wrong pattern makes the UI lie.

## Category A — Binary soft-delete entities (default)

**Who:** User, Campus, Holiday, OrgConfig, Employee, Student, Guardian (StudentGuardian), StudentEnrollment, TeachingAssignment, Program, ClassSection, FeeComponentDef, ProgramFeeStructure, AcademicYear, AssessmentTemplate, AssessmentCategory, AssessmentIndicator, SalaryComponentDef, LeaveRequest.

| Operation | UI Pattern | API Pattern |
|-----------|-----------|-------------|
| **Create** | Dialog form or `/new` page | `POST /api/{entity}` with Zod validation |
| **Read** | DataTable (list) + Detail page/Sheet | `GET /api/{entity}` paginated, `GET /api/{entity}/[id]` |
| **Update** | Edit dialog (same form as create, pre-filled) | `PUT /api/{entity}/[id]` with Zod validation |
| **Deactivate** | ConfirmDialog via dropdown action | `PUT /api/{entity}/[id]` with `{ status: "INACTIVE" }` |

- **NEVER hard delete records.** Use `status` field with `ACTIVE` / `INACTIVE`.
- All list queries default to `WHERE status IN ('ACTIVE')` unless filter says otherwise.
- DataTable status filter always includes "Semua Status", "Aktif", "Tidak Aktif".
- DataTable action column: `<DataTableRowActions>` with `onView` + `onEdit` + `onDeactivate`.

## Category B — State-machine entities (workflow)

**Who:** Admission, Invoice, PayrollRun.

Status is a state machine, not a binary flag — `Deactivate` doesn't apply. The terminal action is named for the domain:

| Entity | States | Terminal action | UI label | API |
|--------|--------|-----------------|----------|-----|
| Admission | `INQUIRY → VISIT_SCHEDULED → VISITED → ADMITTED → REGISTERED` · `CANCELLED` | Cancel | "Batalkan" | `PUT /api/admissions/[id]` with `{ status: "CANCELLED" }` |
| Invoice | `DRAFT → SENT → PARTIALLY_PAID → PAID` · `OVERDUE` · `CANCELLED` | Void | "Batalkan" | `POST /api/invoices/[id]/void` |
| PayrollRun | `DRAFT → APPROVED → SLIPS_SENT` | (none — workflow-only) | — | `POST /api/payroll/[id]/{approve,send-slips,export/bsi}` |

- Row action column: `<DataTableRowActions>` with `onView` + `onEdit` + `onCancel` **or** `onVoid` (domain-appropriate). Terminal action is **hidden or disabled** when the row is already in a terminal state (`CANCELLED` / `PAID` / `VOIDED`).
- PayrollRun has no terminal "cancel" — its actions are workflow transitions handled on the detail page, not the list. Its list row exposes `onView` only; this is a **documented exception**.
- All mutation endpoints still require Zod validation and `canViewSalary(session.role)` where relevant.

## Category C — Event-log entities (no CRUD, event + void)

**Who:** AttendanceRecord (employee check-in/out), StudentAttendance (daily marking).

Immutable events appended by the system; correction via override/void, not edit.

| Operation | UI Pattern | API Pattern |
|-----------|-----------|-------------|
| Create | Auto (check-in/out) or bulk-mark dialog | `POST /api/attendance/check-in`, `POST /api/student-attendance/mark` |
| Read | Daily/monthly grid (not a DataTable of events) | `GET /api/attendance?date=...` |
| Correct | Override modal on the event row | `POST /api/attendance/[id]/override`, `PUT /api/student-attendance/[id]` |
| Void | Dropdown action — clears the event | `isVoided = true` (boolean flag, not `status`) |

- These entities intentionally use `isVoided: Boolean` instead of `status: String` because voiding is reversible audit, not a lifecycle state.
- Daily-view pages (AttendanceRecord) do **not** use the standard list layout — they render a per-day grid or today-only view. Documented exception.
- **Correction semantics:** AttendanceRecord and StudentAttendance are event logs. Corrections are made via **override** (creates a new canonical event) or **void** (flips `isVoided`). There is NO row-level Edit action on these entities — exposing one (even as a relabeled dropdown item) would contradict the event-log contract. When rendering row actions on an AttendanceRecord list, use `extraActions` with an explicit `"Timpa (Override)"` label, **not** `onEdit`.

## Which category fits a new entity?

- Does the entity have a single "trash it" meaning? → **Category A**.
- Does it have multiple states with different terminal outcomes (cancel vs complete vs void)? → **Category B**.
- Is it an immutable event the system generates? → **Category C**.

## List Page Layout Standard

Every admin list page follows this exact structure:
```
PageHeader (title + count + "Tambah" button)
├── StatCards (3-4 key metrics, grid cols-2 lg:cols-4)
├── DataTableToolbar (search + status filter + any domain filters)
└── DataTable (sortable columns + standard action column)
```

## Detail Page Layout Standard

```
Back link ("← Kembali ke Daftar {Entity}")
PageHeader (title + description + StatusBadge + action buttons)
├── Summary Card (read-only info grid, 2-col)
└── Tabs (if entity has multiple concerns)
    ├── Tab 1: Primary related data
    ├── Tab 2: Secondary data
    └── Tab 3: History
```

## Edit Toggle Pattern (Detail Pages)

- **View mode** (default): fields displayed as read-only text (label + value pairs)
- Click **"Edit"** button in PageHeader → switches to **Edit mode**
- Edit mode: same layout positions, values become `<Field>` + `<FieldLabel>` + `<Input>`
- **Save** + **Cancel** (X) buttons appear in the card header
- Cancel reverts to view mode (resets form state)
- Nested entities (guardians, payments) still use **Dialog** for add/edit

```tsx
// Edit toggle pattern:
const [isEditing, setIsEditing] = useState(false);
const [editForm, setEditForm] = useState({ ... });

// View mode: read-only text
<div><p className="text-[10px] text-muted-foreground">Label</p><p className="text-sm font-medium">{value}</p></div>

// Edit mode: Field + Input
<Field><FieldLabel>Label</FieldLabel><Input value={editForm.field} onChange={...} /></Field>
```

## Form Field Standard

Use Shadcn `Field` component (`components/ui/field.tsx`) — **never** raw `Label` + `Input` or custom `FormField`.

```tsx
import { Field, FieldLabel, FieldDescription, FieldError } from "@/components/ui/field"

<Field>
  <FieldLabel>Nama Lengkap</FieldLabel>
  <Input value={...} onChange={...} />
  <FieldDescription>Optional help text</FieldDescription>
  <FieldError>{error}</FieldError>
</Field>
```

## Edit Dialog Standard (for nested entities)

- Same form fields as create dialog, pre-filled with current values
- Title: "Edit {EntityName}" (e.g., "Edit Wali")
- Save button: "Simpan" with loading state
- Cancel button: "Batal"
- On success: `toast.success()` + close dialog + refetch data
