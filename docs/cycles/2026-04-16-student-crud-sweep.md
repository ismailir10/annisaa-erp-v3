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
- [ ] "Tambah Siswa" button on `/admin/students` opens a Dialog (not navigates to /new)
- [ ] Dialog fields: Nama, Nama Panggilan, Jenis Kelamin, Tanggal Lahir, NIS, NISN, Catatan
- [ ] On success: `toast.success()`, dialog closes, table refetches, navigates to new student detail
- [ ] The `/admin/students/new` page is removed (button replaced by dialog)
- [ ] Error handling: `toast.error()` on API failure

**Student Edit (T2)**
- [ ] DataTable row ⋮ dropdown has "Edit" action
- [ ] Edit dialog pre-fills all student fields
- [ ] On success: `toast.success()`, dialog closes, row data refreshes
- [ ] Same Zod validation as create

**Student Deactivate (T3)**
- [ ] DataTable row ⋮ dropdown has "Nonaktifkan" / "Aktifkan" (context-aware)
- [ ] ConfirmDialog before deactivating: "Nonaktifkan [nama]?"
- [ ] `updateStudentSchema` accepts `status: "INACTIVE"`
- [ ] `PUT /api/students/[id]` with `{ status: "INACTIVE" }` sets the student inactive
- [ ] On success: `toast.success()`, table row status refreshes

**Guardian Soft Delete + Schema (T4 + T5)**
- [ ] `StudentGuardian` has a `status` field (`String @default("ACTIVE")`)
- [ ] Migration applied: `add_guardian_status`
- [ ] DELETE on `/api/students/[id]/guardians/[guardianId]` replaced by PUT `{ status: "INACTIVE" }`
- [ ] Standalone `PUT /api/guardians/[id]` — edit contact fields + relationship
- [ ] Standalone `PATCH /api/guardians/[id]` — toggle status (ACTIVE ↔ INACTIVE)
- [ ] Wali tab UI: "Hapus" button replaced by "Nonaktifkan" with ConfirmDialog
- [ ] Inactive guardians hidden by default in Wali tab (filter shows only ACTIVE)
- [ ] All guardian routes use `isAdminRole(session.role)` not `session.role !== "SCHOOL_ADMIN"`

**End-of-cycle (T6)**
- [ ] `npm run build && npx vitest run && npx playwright test` all green
- [ ] README.md CRUD table: Student → Full, StudentGuardian → Full

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

---

## Verification

- T1: build + vitest (69/69) passed

---

## Ship Notes

<!-- filled by /ship -->
