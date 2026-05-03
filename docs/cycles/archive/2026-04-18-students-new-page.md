# Students New Page

## Context
`/admin/students/new` hit the `[id]` dynamic route with `id="new"`, causing the student detail page to fetch a student with id "new" and render `<EmptyState title="Siswa tidak ditemukan" />`. No dedicated create page existed — student creation used an inline dialog on the list page (limited to 7 fields).

## Spec
- `GET /admin/students/new` renders a proper "Tambah Siswa" form page
- Collects all fields accepted by `POST /api/students` (name required; nickname, gender, dateOfBirth, nis, nisn, birthPlace, nik, kkNumber, livingWith, address, notes optional)
- On success: `router.push(/admin/students/${id})` — navigates to the new student's detail page
- Follows `app/admin/employees/new/page.tsx` pattern: back link, PageHeader, Card, handleSubmit
- List page dialog is unchanged (both coexist; the dialog remains as a quick-add shortcut)

## Tasks
- [x] Create `app/admin/students/new/page.tsx`

## Implementation
### Task 1 — `app/admin/students/new/page.tsx`
New file following the employee new-page pattern. Three field sections: Info Dasar (name, nickname, gender, dateOfBirth), Identitas Resmi (nis, nisn, birthPlace, nik, kkNumber, livingWith), Lainnya (address, notes). Submit POSTs to `/api/students`, redirects to detail page on success.

## Verification
- `npm run build` — pass
- `npx vitest run` — pass

## Ship Notes
No migrations, no new env vars. The `[id]` dynamic route is unaffected — Next.js static-segment routing gives `new/page.tsx` priority over `[id]/page.tsx`.
