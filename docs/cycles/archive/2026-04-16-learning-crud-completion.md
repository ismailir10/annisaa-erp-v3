# Learning CRUD Completion — AssessmentTemplate + StudentAttendance

## Context

The 2026-04-16 CRUD audit flagged two LEARNING-module entities as missing full CRUD:
- **AssessmentTemplate** — API routes (GET list, POST create) exist but no admin UI and no [id] route (PUT update/deactivate)
- **StudentAttendance** — mark/list APIs exist but no admin list UI, no single-record PUT, and no soft-delete field

This cycle completes both entities to full CRUD compliance per CLAUDE.md standards.

## Spec

### AssessmentTemplate
- `isActive: Boolean` already in schema — maps to ACTIVE/INACTIVE for UI
- **GET /api/assessments/templates** — already exists (returns list with categories + count)
- **GET /api/assessments/templates/[id]** — new: full detail with categories + indicators
- **PUT /api/assessments/templates/[id]** — new: update name/type/programId, toggle isActive
- **Admin page `/admin/assessment-templates`**: DataTable with columns (name, program, type, categories count, assessments count, status), create dialog, edit dialog (name + type only — categories not editable inline), deactivate/activate via DataTableRowActions

### StudentAttendance
- Schema needs `isVoided Boolean @default(false)` for soft-delete compliance
- **GET /api/student-attendance** — refactor to support admin list view with pagination (date range, student search, class filter, isVoided=false default)
- **PUT /api/student-attendance/[id]** — new: edit record (status, notes)
- **DELETE /api/student-attendance/[id]** → soft delete (sets isVoided=true)
- **Admin page `/admin/student-attendance`**: DataTable with date/class/status filters, edit dialog (change status + notes), void confirm via DataTableRowActions

### Acceptance criteria
- [ ] AssessmentTemplate list page loads with DataTable, skeleton, empty state
- [ ] AssessmentTemplate create dialog works (name + type + programId)
- [ ] AssessmentTemplate edit dialog works (name + type only)
- [ ] AssessmentTemplate deactivate/activate works with ConfirmDialog
- [ ] AssessmentTemplate [id] API returns 200 with full data
- [ ] AssessmentTemplate PUT [id] returns 200 and revalidates
- [ ] StudentAttendance list page loads with DataTable, date filter, class filter
- [ ] StudentAttendance edit dialog updates status + notes
- [ ] StudentAttendance void confirm marks isVoided=true
- [ ] Both pages linked in admin sidebar under Akademik group
- [ ] `npm run build && npx vitest run` green after every task
- [ ] Playwright smoke passes end-of-cycle

## Tasks

1. **Schema migration + Zod validation schemas** — add `isVoided Boolean @default(false)` to StudentAttendance; create `lib/validations/assessment-template.ts` + `lib/validations/student-attendance.ts`
2. **AssessmentTemplate [id] API route** — `app/api/assessments/templates/[id]/route.ts` with GET + PUT
3. **StudentAttendance API improvements** — refactor GET for admin list pagination; add `app/api/student-attendance/[id]/route.ts` with GET + PUT + DELETE (void)
4. **AssessmentTemplate admin page** — `app/admin/assessment-templates/page.tsx`
5. **StudentAttendance admin page** — `app/admin/student-attendance/page.tsx`
6. **Nav update** — add both to Akademik group in `config/admin-nav.ts`

## Implementation

### Task 1 — Schema + Zod schemas
- `prisma/schema.prisma`: Added `isVoided Boolean @default(false)` + `@@index([isVoided])` to `StudentAttendance`
- `prisma/migrations/20260416000002_student_attendance_is_voided/migration.sql`: `ALTER TABLE` + index
- `lib/validations/assessment-template.ts`: `createAssessmentTemplateSchema` + `updateAssessmentTemplateSchema` (Zod v4 `.issues`)
- `lib/validations/student-attendance.ts`: `updateStudentAttendanceSchema`

### Task 2 — AssessmentTemplate [id] API
- `app/api/assessments/templates/[id]/route.ts`: GET (full detail with categories/indicators), PUT (update name/type/isActive with Zod validation + rate limit)
- `app/api/assessments/templates/route.ts`: Refactored to support paginated list (`?page=`) while keeping backward-compat full list for teacher scoring page. Added Zod validation + rate limit to POST.

### Task 3 — StudentAttendance API
- `app/api/student-attendance/route.ts`: Dual-mode GET — `?mode=list` returns paginated records with tenant-scoped classSectionId filter; original mode unchanged
- `app/api/student-attendance/[id]/route.ts`: GET (single record), PUT (edit status/notes with Zod + rate limit), DELETE (soft-delete via isVoided=true)

### Task 4 — AssessmentTemplate admin page
- `app/admin/assessment-templates/page.tsx`: DataTable with name/program/type/categories/assessments/status columns; create dialog (name+type+programId); edit dialog (name+type); deactivate/activate via ConfirmDialog; StatCards (total/active/inactive); status filter

### Task 5 — StudentAttendance admin page
- `app/admin/student-attendance/page.tsx`: DataTable with date/student/class/status columns; date-range pickers (from/to); class section + status filters via DataTableToolbar; edit dialog (status+notes); void confirm via ConfirmDialog; today's StatCards

### Task 6 — Nav update
- `config/admin-nav.ts`: Added "Kehadiran Siswa" (`CalendarCheck`) + "Template Penilaian" (`ClipboardList`) to Akademik group

## Verification

### Between-task gate (all tasks)
- `npm run build` — ✅ Compiled + TypeScript clean (82 routes, including 2 new admin pages + 2 new API routes)
- `npx vitest run` — ✅ 69/69 tests passed

### Manual smoke (pre-ship)
- Playwright end-of-cycle gate pending (`/ship` will run it)

## Ship Notes

### DB migration required
Run before deploy: `npx prisma migrate deploy` (applies `20260416000002_student_attendance_is_voided` — adds `isVoided BOOLEAN NOT NULL DEFAULT false` + index to `StudentAttendance` table).

### No new env vars
### Rollback
If needed: `ALTER TABLE "StudentAttendance" DROP COLUMN "isVoided";` — safe, column has default false so existing rows unaffected.
