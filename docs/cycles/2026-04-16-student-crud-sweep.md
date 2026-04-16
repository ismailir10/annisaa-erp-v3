# Student & Guardian CRUD Completion Sweep

## Context

Students and Guardians are the core entities in An Nisaa' ERP. Both are at ~70% CRUD per
README.md. The DataTable list page exists for students but is missing Edit and Deactivate row
actions. The guardian model uses hard DELETE (a CLAUDE.md violation) and has no `status` field.

**Existing state:**
- `GET /api/students` + list page: complete with search/filter/pagination
- `POST /api/students` + `/admin/students/new` page: complete (student + guardian in one form)
- `GET /api/students/[id]` + detail page: complete (edit-toggle + Wali tab with add/edit/delete dialogs)
- `PUT /api/students/[id]`: exists but `updateStudentSchema` only allows ACTIVE/GRADUATED/WITHDRAWN — missing INACTIVE
- Student DataTable row: only `onView` — Edit and Deactivate are missing
- Guardian routes (`/api/students/[id]/guardians/*`): use hard DELETE (explicit comment in source)
- Guardian routes: check `session.role !== "SCHOOL_ADMIN"` instead of `!isAdminRole()` — SUPER_ADMIN is blocked (security bug)

**Goals this cycle:**
1. Add Edit + Deactivate row actions to the student DataTable
2. Replace the `/admin/students/new` page approach with an inline "Tambah Siswa" dialog on the list page
3. Add `INACTIVE` to student status enum in validation + API
4. Add `status` field to `StudentGuardian` (Prisma migration) — soft delete instead of hard delete
5. Create standalone `/api/guardians/[id]` routes (PUT + status toggle)
6. Fix `isAdminRole()` security pattern across all guardian routes

---

## Spec

### Acceptance Criteria

**Student Create (T1)**
- [x] "Tambah Siswa" button on `/admin/students` opens a Dialog (not navigates to /new)
- [x] Dialog fields: Nama, Nama Panggilan, Jenis Kelamin, Tanggal Lahir, NIS, NISN, Catatan
- [x] On success: `toast.success()`, dialog closes, navigates to new student detail
- [x] The `/admin/students/new` page is removed (button replaced by dialog)
- [x] Error handling: `toast.error()` on API failure

**Student Edit (T2)**
- [x] DataTable row ⋮ dropdown has "Edit" action
- [x] Edit dialog pre-fills all student fields
- [x] On success: `toast.success()`, dialog closes, row data refreshes
- [x] Same fields as create dialog

**Student Deactivate (T3)**
- [x] DataTable row ⋮ dropdown has "Nonaktifkan" / "Aktifkan" (context-aware)
- [x] ConfirmDialog before deactivating with cascade warning
- [x] `updateStudentSchema` accepts `status: "INACTIVE"`
- [x] `PUT /api/students/[id]` with `{ status: "INACTIVE" }` sets the student inactive (cascade: withdraw enrollments, cancel invoices)
- [x] On success: `toast.success()`, table refreshes

**Guardian Soft Delete + Schema (T4 + T5)**
- [x] `StudentGuardian` has a `status` field (`String @default("ACTIVE")`)
- [x] Migration applied: `add_guardian_status` (applied to staging DB via Supabase MCP)
- [x] DELETE on `/api/students/[id]/guardians/[guardianId]` replaced by PATCH `{ status: "INACTIVE" }`
- [x] Standalone `PUT /api/guardians/[id]` — edit contact fields + relationship
- [x] Standalone `PATCH /api/guardians/[id]` — toggle status (ACTIVE ↔ INACTIVE)
- [x] Wali tab UI: "Hapus" button now triggers soft deactivate with ConfirmDialog
- [x] Inactive guardians hidden by default in Wali tab
- [ ] `isAdminRole()` helper — deferred: helper doesn't exist on staging branch yet (will be needed after feat/role-split merges)

**End-of-cycle (T6)**
- [x] `npm run build && npx vitest run && npx playwright test` all green (20/20)
- [x] README.md CRUD table: Student → Full, StudentGuardian → Full

---

## Tasks

| # | Title | Key files | Gate |
|---|-------|-----------|------|
| T1 | Student Create dialog | `app/admin/students/page.tsx`, delete `app/admin/students/new/page.tsx` | build+vitest |
| T2 | Student Edit dialog | `app/admin/students/page.tsx` | build+vitest |
| T3 | Student Deactivate | `app/admin/students/page.tsx`, `lib/validations/student.ts`, `app/api/students/[id]/route.ts` | build+vitest |
| T4 | Guardian status migration + soft delete | `prisma/schema.prisma`, migration, `app/api/students/[id]/guardians/[guardianId]/route.ts` | build+vitest |
| T5 | Guardian standalone routes + UI update | `app/api/guardians/[id]/route.ts` (new), `app/admin/students/[id]/page.tsx` | build+vitest |
| T6 | End-of-cycle gate + README update | `README.md`, this cycle doc | build+vitest+playwright |

**Dependency order:** T1 → T2 → T3 (all on list page, sequential). T4 → T5 (schema before routes). T1–T3 and T4–T5 are independent of each other.

---

## Implementation

- T1: Student Create dialog — `app/admin/students/page.tsx` (dialog added, button changed), deleted `app/admin/students/new/page.tsx` — replaces /new page with inline "Tambah Siswa" dialog; fields: name, nickname, gender, dateOfBirth, NIS, NISN, notes; on success navigates to new student detail
- T2: Student Edit dialog — `app/admin/students/page.tsx` — added `editTarget`/`editForm`/`editing` state, Edit row action via `onEdit`, pre-filled Edit dialog, PUT /api/students/[id] on submit
- T3: Student Deactivate — `lib/validations/student.ts` (added INACTIVE to enum), `app/api/students/[id]/route.ts` (added Zod validation via validateBody), `app/admin/students/page.tsx` (ConfirmDialog + deactivateTarget state + onDeactivate row action)
- T4: Guardian soft delete — `prisma/schema.prisma` (status field + index on StudentGuardian), `prisma/migrations/20260416000002_add_guardian_status/migration.sql` (ALTER TABLE + CREATE INDEX), `app/api/students/[id]/guardians/[guardianId]/route.ts` (DELETE replaced by PATCH status toggle); Prisma client regenerated; Note: `prisma migrate dev` hangs in non-interactive shell (pooler URL); migration file created manually + `prisma db push` pending (DB connection issues) — run `npx prisma migrate deploy` on deploy
- T5: Guardian standalone routes + UI update — `app/api/guardians/[id]/route.ts` (new: PUT edit + PATCH status toggle), `app/admin/students/[id]/page.tsx` (Guardian type gets status field, `deleteGuardian` renamed to `deactivateGuardian` using PATCH to standalone route, Wali tab filters ACTIVE guardians, ConfirmDialog updated to Nonaktifkan/Aktifkan)

---

## Verification

- T1: build + vitest (69/69) passed
- T2: build + vitest (69/69) passed
- T3: build + vitest (69/69) passed
- T4: build + vitest (69/69) passed; migration file created manually (DB connection issue with pooler in non-interactive shell — migration to be applied via `prisma migrate deploy` on first deploy)
- T5: build + vitest (69/69) passed
- T6 (end-of-cycle): build + vitest (69/69) + Playwright 20/20 passed — fixed pre-existing admin spec regressions: `ADMIN_USER_ID` was redacted placeholder `"u_admin"` (corrected to `"u_school_admin"` from staging DB), "Redacted Employee" text (corrected to `"Amelia Yulyanti"`), teacher profile "Redacted Employee" (corrected to `"Eneng Rina"`).

---

## Ship Notes

**Database migration (REQUIRED on deploy):**
```sql
-- Run via Supabase SQL editor or prisma migrate deploy on the target DB:
ALTER TABLE "StudentGuardian" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
CREATE INDEX IF NOT EXISTS "StudentGuardian_studentId_status_idx" ON "StudentGuardian"("studentId", "status");
```
Already applied to staging DB via Supabase MCP during T6 gate.
Migration file: `prisma/migrations/20260416000002_add_guardian_status/migration.sql`

**New API routes:**
- `PUT /api/guardians/[id]` — edit guardian contact + relationship
- `PATCH /api/guardians/[id]` — toggle guardian status ACTIVE ↔ INACTIVE
- `PATCH /api/students/[id]/guardians/[guardianId]` — same status toggle (nested; replaces deleted DELETE handler)

**Removed routes:**
- `DELETE /api/students/[id]/guardians/[guardianId]` — replaced by PATCH status toggle

**New env vars:** none

**Rollback plan:**
- Revert the PATCH endpoint to the original DELETE handler in `app/api/students/[id]/guardians/[guardianId]/route.ts`
- The `status` column has a default of 'ACTIVE' so existing rows are unaffected; rollback does not require a migration
