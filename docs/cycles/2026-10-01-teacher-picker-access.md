# Teacher picker for class admins (SCHOOL_ADMIN sees "Tidak ada guru tersedia")

## Context

On 2026-10-01 a school admin on staging tried to assign a wali kelas from the class detail page (`/admin/classes/[id]` → "Tambah Guru Pengajar"). The Guru picker showed "Tidak ada guru tersedia".

The data is fine: tenant `t_annisaa` has 43 active employees, 19 of them on that class's campus. The cause is a permission mismatch.

- `app/admin/classes/[id]/client.tsx` fills both teacher pickers (add-teacher and swap-session) from `GET /api/employees?status=ACTIVE&pageSize=100`.
- That HR endpoint requires `hr.view`.
- The class page's edit actions are gated on `academic.edit`. The writes they call are gated on `academic.edit` (`teaching-assignments` POST/DELETE) and `isAdminRole` (`class-sessions/[id]` PATCH).
- `SCHOOL_ADMIN` holds `academic.edit` but deliberately not `hr.view` (`lib/permissions.ts`). So the read 403s, the client swallows it into an empty list plus a transient toast, and the dialog claims no teachers exist.

The admin is allowed to make the assignment; only the picker's data source blocks them. Outcome: class admins can pick teachers, and a failed load is reported as a failure instead of as "no teachers".

## Spec

Acceptance criteria:

- [ ] New `GET /api/admin/classes/[id]/teacher-options`, gated by `requirePermission("academic.edit")`, the same permission as the assignment write it feeds.
  - [ ] It verifies the class belongs to the session tenant, and returns 404 otherwise.
  - [ ] It returns ACTIVE employees of the session tenant, selecting **only** `id`, `nama` and `formalName`. No email, phone, salary, bank or other HR fields.
  - [ ] Results are ordered by `nama` and use the standard `{ data, pagination }` shape (`parsePagination` / `paginatedResponse`, max 100), with optional `?search=` on `nama`.
- [ ] The class detail page loads both pickers (add-teacher and swap-session) from the new endpoint instead of `/api/employees`.
- [ ] The picker distinguishes three states:
  - **loading:** "Memuat daftar guru…"
  - **load failed:** an inline error with a "Coba lagi" retry, no misleading empty state
  - **genuinely empty:** "Belum ada guru aktif"
- [ ] A SCHOOL_ADMIN session (real `getSystemRolePermissions("SCHOOL_ADMIN")`) gets 200 with options. A session without `academic.edit` gets 403.

Non-goals:

- No change to `/api/employees`, `hr.view`, or any role's permission set.
- No campus filtering. The existing behaviour is tenant-wide, and cross-campus teaching assignments are allowed by the write route.
- No change to the assignment or swap write routes.

Assumptions:

1. A class-scoped route (`/api/admin/classes/[id]/teacher-options`) is preferred over a generic employee lookup. It ties the read to the exact permission and page that use it.
2. `id` + `nama` + `formalName` is the minimum the dialogs render (`Employee` type in `components/admin/classes/detail/types.ts`), so exposing these to `academic.edit` holders discloses nothing beyond the teacher names already shown on the class page.

## Tasks

- [ ] **Task 1 — teacher-options route.** Add `app/api/admin/classes/[id]/teacher-options/route.ts` and `__tests__/route.test.ts`. Accept: tests cover SCHOOL_ADMIN real permissions → 200 with only `{id,nama,formalName}`; no `academic.edit` → 403; cross-tenant or unknown class → 404; the query is tenant- and ACTIVE-scoped with a minimal `select`; `search` filters. `verify-api-auth.sh` passes. Independent.
- [ ] **Task 2 — class page uses it, with honest states.** Change `app/admin/classes/[id]/client.tsx`, `components/admin/classes/detail/add-teacher-dialog.tsx` and `swap-session-dialog.tsx`, plus `app/admin/classes/[id]/__tests__/client.test.tsx`. Accept: the fetch targets the new URL; tests cover the loading / error with retry / empty / list states, and that retry refetches. Depends on the Task 1 URL contract only.

## Implementation

## Verification

## Ship Notes
