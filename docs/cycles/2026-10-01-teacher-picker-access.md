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

- [x] **Task 1 — teacher-options route.** Add `app/api/admin/classes/[id]/teacher-options/route.ts` and `__tests__/route.test.ts`. Accept: tests cover SCHOOL_ADMIN real permissions → 200 with only `{id,nama,formalName}`; no `academic.edit` → 403; cross-tenant or unknown class → 404; the query is tenant- and ACTIVE-scoped with a minimal `select`; `search` filters. `verify-api-auth.sh` passes. Independent.
- [x] **Task 2 — class page uses it, with honest states.** Change `app/admin/classes/[id]/client.tsx`, `components/admin/classes/detail/add-teacher-dialog.tsx` and `swap-session-dialog.tsx`, plus `app/admin/classes/[id]/__tests__/client.test.tsx`. Accept: the fetch targets the new URL; tests cover the loading / error with retry / empty / list states, and that retry refetches. Depends on the Task 1 URL contract only.

## Implementation

- Subagent plan: driver=claude-opus-5-5, dirty-work=Sonnet; tasks [1,2] parallel (disjoint files, shared only the URL/response contract fixed in the Spec). The driver reviewed each diff, did the security review of the route, and ran the gates.
- Task 1: teacher-options route — `app/api/admin/classes/[id]/teacher-options/route.ts` + `__tests__/route.test.ts`.
  - It uses `requirePermission("academic.edit")`, then checks that the class is in the tenant (404 "Kelas tidak ditemukan", same as its sibling).
  - It queries ACTIVE employees in the tenant with `select { id, nama, formalName }`, `orderBy nama asc`, `parsePagination` (max 100), an optional insensitive `search`, and returns `paginatedResponse`.
  - The tests mock only `getSession` and `prisma`, so the real `requirePermission` and the real `getSystemRolePermissions("SCHOOL_ADMIN" | "TEACHER")` run. That is exactly the integration that broke.
  - Security review (driver), against the `security.md` checklist:
    - The session and permission gate come before any query.
    - Every query filters on the tenant.
    - There is no write, so neither Zod validation nor a rate limit applies; `GET /api/employees` has neither either.
    - No HR field is selected: no email, phone, salary or bank.
- Task 2: class page uses it, with honest states.
  - Files: `app/admin/classes/[id]/client.tsx`, `components/admin/classes/detail/{add-teacher-dialog,swap-session-dialog,teachers-section}.tsx`, new `teacher-option-items.tsx`, and `app/admin/classes/[id]/__tests__/client.test.tsx`.
  - `loadTeacherOptions` (a `useCallback`, gated on `canWrite`) fetches `/api/admin/classes/${classId}/teacher-options?pageSize=100` and tracks `employeesStatus: loading | ready | error`. The page-load toast is removed, because the dialog now reports the failure inline.
  - `TeacherOptionItems` and `TeacherOptionsError` hold the shared copy, so both pickers say the same thing:
    - loading: "Memuat daftar guru…"
    - empty: "Belum ada guru aktif"
    - error: a disabled "Daftar guru belum tersedia" option, plus `role="alert"` "Daftar guru gagal dimuat." and a "Coba lagi" link button that re-runs the loader
  - The swap dialog gained the empty state it never had.
  - `teachers-section.tsx` only forwards the two new props to the add dialog it renders.
  - `CLAUDE.md` counts were regenerated: 199 → 200 routes, 67 → 68 active cycles.
  - Driver review: no bugs. Low note, not fixed: overlapping retries could resolve out of order, but every request hits the same URL and returns the same data, so the final state is the same.

## Verification

- design-system: copy and states follow `design-system.html` and `voice.md`. The inline destructive error text plus a link-style "Coba lagi" matches the existing `DashboardRetry` idiom, and no new tokens or components were added.
- Task 2 (whole-tree gate, covers Tasks 1–2; local disposable Postgres):
  - `DEMO_MODE=true npm run build`: exit 0.
  - `npx vitest run`: exit 0, `Test Files 478 passed | 2 skipped (480)`, `Tests 4399 passed | 42 todo (4441)`. That includes `client.test.tsx` 20/20, with the new "teacher picker source and states" block: the URL is the new endpoint and never `/api/employees`; a 403 shows the error, not the empty copy, and retry refetches and then lists the teacher; empty shows "Belum ada guru aktif"; loading shows "Memuat daftar guru…".
  - `npx tsc --noEmit`: exit 0. eslint on the touched dirs: clean.
- Task 1: `npx vitest run "app/api/admin/classes/[id]/teacher-options"` gave 6/6, covering SCHOOL_ADMIN 200 with the exact `where`/`select`/`orderBy`, TEACHER 403 with no employee query, no session 401, a cross-tenant class 404, `search`, and `pageSize=500` capped at 100. `bash scripts/verify-api-auth.sh` reported `API auth coverage OK: 200 / 200 routes`, and eslint and tsc were clean for these files. The full build + vitest gate runs after Task 2: the parallel implementer is still editing the class page, so a whole-tree build now would race it.

## Ship Notes
