# Super Admin vs Admin — Permission-Based RBAC + Sidebar Settings Unpin

## Context

RBAC scaffold exists but is half-wired. `lib/permissions.ts` defines `PERMISSION_GROUPS` (hr / academic / finance / settings) with granular codes (`payroll.view`, `employees.view`, `leave.approve`, etc.) and a `hasPermission()` helper. The admin UI at `/admin/settings/roles` already lets admins create custom roles with permission checkboxes, and the Prisma `Role` table stores per-role permission JSON. What's missing:

1. **Server never reads custom-role permissions.** `getSession()` in `lib/auth.ts` returns no `permissions` field — it only surfaces the enum role. `hasPermission()` therefore can never consult custom-role grants.
2. **`SCHOOL_ADMIN` is hardcoded to "all permissions."** `hasPermission()` short-circuits `session.role === "SCHOOL_ADMIN"` → returns `true` unconditionally. HR fence impossible at permission layer while this stands.
3. **API + page code bypasses `hasPermission()` entirely.** Payroll/salary routes gate on a separate `canViewSalary(role)` (role-enum equality). Every other HR route is ungated beyond "admin or not."
4. **Nav config carries `superAdminOnly?: boolean`** — a flag, not a permission. Can't evolve with custom roles.

Business need: split the two admin personas. `SUPER_ADMIN` (owner) retains full reach. `SCHOOL_ADMIN` (ops) must lose all HR surfaces — employees, payroll, leave approval, employee attendance, salary components. Custom roles (e.g. a future "Finance Admin") must continue to work via the existing permission-picker UI.

Second issue: `Pengaturan` is pinned in `<SidebarFooter>`. Move into normal `<SidebarContent>` scroll flow. Logout stays footer.

Intended outcome: single permission-based gate powers sidebar filtering, page access, and API authorization. No inline role-string comparisons remain for HR surfaces. Custom roles with `payroll.view` (and friends) work end-to-end.

## Spec

### Acceptance criteria

- [ ] `SessionUser` type carries a `permissions: string[]` field, populated from `SUPER_ADMIN` defaults, enum-role defaults (via `getSystemRolePermissions`), OR the user's `customRole.permissions` JSON (in that precedence order).
- [ ] `getSystemRolePermissions("SCHOOL_ADMIN")` returns a set that **excludes** every `hr.*` permission (employees, attendance, leave, payroll). It still includes academic + finance + settings-user-admin permissions so ops can run day-to-day.
- [ ] `getSystemRolePermissions("SUPER_ADMIN")` returns `ALL_PERMISSIONS`.
- [ ] `hasPermission(session, perm)` drops the `role === "SCHOOL_ADMIN" → true` short-circuit. It consults `session.permissions` only. `SUPER_ADMIN` short-circuit stays because its permission set is always `ALL_PERMISSIONS`.
- [ ] A server helper `requirePermission(perm)` returns `{ session }` on pass, `403` on fail — one helper, reused across all HR routes and any future gated route.
- [ ] Route group `app/admin/(hr)/layout.tsx` wraps `employees`, `payroll`, `attendance`, `leave`, and the `settings/salary-components` page. Single layout calls `requirePermission("hr.view")` (or a group-level perm) and redirects to `/admin` on fail. No per-page redirect copy-paste.
- [ ] All HR API handlers (`/api/employees/**`, `/api/payroll/**`, `/api/salary-components/**`, `/api/slips/**`, `/api/attendance/**`, `/api/leave/**`) gate on specific `hr.*` permissions via `requirePermission()`. `SCHOOL_ADMIN` → 403. `SUPER_ADMIN` or custom role with the grant → pass.
- [ ] Admin nav config uses `permission?: PermissionCode` at item + group level (replacing `superAdminOnly`). Sidebar filters by `hasPermission()`.
- [ ] `Pengaturan` renders inside `<SidebarContent>` as the last collapsible group. `<SidebarFooter>` contains only Logout + separator.
- [ ] Playwright covers: (a) `SCHOOL_ADMIN` sees no HR nav / cannot reach `/admin/employees`; (b) `SUPER_ADMIN` sees full nav; (c) a custom role seeded with `payroll.view` can load `/admin/payroll`.
- [ ] `npm run build && npx vitest run && npx playwright test` green.

### Non-goals

- No change to `TEACHER` or `GUARDIAN` portals or bottom nav.
- No DB-layer RLS in this cycle — app-layer permission gate only. (RLS noted as follow-up in Ship Notes.)
- No audit-log table — log follow-up cycle.
- Only **one** new permission code added: `hr.view` (coarse parent gate for the HR route group). All other codes reused as-is.
- No deprecation of the `Role` enum field on `User` — still the source of truth for persona (admin vs teacher vs guardian). Permissions layer on top.
- No migration of existing custom roles — empty in prod today.

### Assumptions (confirm before /build)

1. **HR scope = `employees.*`, `attendance.*`, `leave.*`, `payroll.*`.** All four `PERMISSION_GROUPS.hr.permissions` families come out of `SCHOOL_ADMIN` default set. `settings.salary-components` page gates on `payroll.view` since it configures payroll inputs.
2. **`SCHOOL_ADMIN` keeps:** all `academic.*`, all `finance.*` (invoices, fees, payments), `settings.view/edit`, `users.view/edit` (user management stays admin). **Loses:** all `hr.*`.
3. **`SUPER_ADMIN` seeded as system role alongside `SCHOOL_ADMIN`.** Already exists as enum value but `SYSTEM_ROLES` card list in `/admin/settings/roles/page.tsx` doesn't show it — add it.
4. **Precedence when user has both enum role and custom role:** custom role wins. Matches current `customRoleId` relation shape.
5. **Sidebar fetches permissions from layout (server) into a client prop** — same pattern as current `canSeeSalary`. No client-side DB call.
6. **Permission code shape stays dotted** (`hr.payroll.view` not `hr:payroll:view`). Matches existing codes.

**→ Correct me now or /build proceeds.**

## Tasks

### 1. Session wiring — surface permissions on every request ✅

- Extend `SessionUser` in `lib/auth.ts` to include `permissions: string[]` and `customRoleCode: string | null`.
- In `getSession()` (and `getDemoSession()`): after loading the `User`, also load `customRole` (via Prisma relation). Populate `permissions` as:
  1. If `user.customRoleId` → parse `customRole.permissions` JSON.
  2. Else → `getSystemRolePermissions(user.role)`.
- Update 10s `userCache` shape to store the derived permission array (recompute only on miss).
- Acceptance: `getSession()` returns `permissions` for every active user. TS strict. Vitest for 4 cases (super-admin, school-admin, teacher, custom-role user).
- Dependencies: none. Blocks all other tasks.

### 2. Permissions table — add hr.view, fix SCHOOL_ADMIN defaults, add SUPER_ADMIN ✅

- Edit `lib/permissions.ts`:
  - Add `"hr.view": "Akses modul SDM"` as **first** entry in `PERMISSION_GROUPS.hr.permissions` — coarse parent gate.
  - Remove `if (session.role === "SCHOOL_ADMIN") return true` short-circuit in `hasPermission()`. Keep array check. Add `if (session.role === "SUPER_ADMIN") return true` (owner escape hatch — matches enum semantics).
  - Rewrite `getSystemRolePermissions`: explicit enumeration per role.
    - `SUPER_ADMIN` → `ALL_PERMISSIONS`.
    - `SCHOOL_ADMIN` → every non-`hr.*` code. Explicit list, not `.filter(startsWith)` — safer against future HR code additions.
    - `TEACHER`, `GUARDIAN` → unchanged.
- Edit `SYSTEM_ROLES` card list in `app/admin/settings/roles/page.tsx` to show `SUPER_ADMIN` + `SCHOOL_ADMIN` as separate cards.
- Acceptance: `hasPermission({role:"SCHOOL_ADMIN", permissions:getSystemRolePermissions("SCHOOL_ADMIN")}, "hr.view") === false`. `hasPermission({role:"SUPER_ADMIN", permissions:ALL_PERMISSIONS}, "hr.view") === true`.
- Dependencies: Task 1.

### 3. Server guard helper — `requirePermission(perm)` ✅

- New file or extension to `lib/auth.ts`: `requirePermission(perm: PermissionCode): Promise<{ session: SessionUser } | { error: Response }>`.
- On fail, returns a `403` Response with shape `{ error: "forbidden", missing: perm }`. On pass, returns `{ session }`.
- Also export `assertPermission(perm)` for page-level use — throws `notFound()` or calls `redirect('/admin')` so callers can `await assertPermission(...)` at the top of server components.
- Acceptance: unit test both helpers — pass + fail paths.
- Dependencies: Tasks 1, 2.

### 4. Route group layout — single page gate for HR ✅

- Create `app/admin/(hr)/layout.tsx`. Contents: `await assertPermission("hr.view")` — redirects on fail. Returns `children` on pass.
- Move page dirs under the `(hr)` group (folder name only, no URL change since route groups are invisible): `employees`, `payroll`, `attendance`, `leave`.
- `app/admin/settings/salary-components/page.tsx` stays where it is — add `await assertPermission("hr.view")` at the top.
- Acceptance: SCHOOL_ADMIN GET `/admin/employees` → 307 redirect to `/admin`. SUPER_ADMIN → 200.
- Dependencies: Task 3.

### 5. API guards — replace ad-hoc checks with `requirePermission()` ✅

- Audit every handler under `app/api/employees/**`, `app/api/payroll/**`, `app/api/salary-components/**`, `app/api/slips/**`, `app/api/attendance/**`, `app/api/leave/**`.
- Replace inline `canViewSalary(session.role)` or bare `isAdminRole` checks with `requirePermission("payroll.view"|"employees.view"|...)` keyed to the specific operation (read vs write).
- Delete `canViewSalary` once no callers remain (`grep -r canViewSalary`).
- Acceptance: one vitest per HR domain asserting 403 for SCHOOL_ADMIN, 200/expected for SUPER_ADMIN.
- Dependencies: Task 3.

### 6. Nav config — permission-driven filtering ✅

- Edit `config/admin-nav.ts`: replace `superAdminOnly?: boolean` on `NavItem` and `NavGroup` with `permission?: PermissionCode`.
- Annotate: SDM group `permission: "hr.view"`. Individual HR items carry the coarse gate (sidebar hides whole group in one filter). Mutation perms (`payroll.approve`, `leave.approve`, `employees.edit`) still gate action buttons inside pages. `Komponen Gaji` → `hr.view`.
- Edit `components/admin/sidebar.tsx`:
  - Layout (server) passes `session.permissions` down instead of just `canSeeSalary`.
  - Client filter: `items.filter(i => !i.permission || permissions.includes(i.permission))` for items and groups.
- Drop `canSeeSalary` prop entirely.
- Acceptance: SCHOOL_ADMIN sees sidebar without SDM group and without `Komponen Gaji`. Custom role with only `payroll.view` sees Penggajian + Komponen Gaji, nothing else HR.
- Dependencies: Tasks 1, 2.

### 7. Sidebar layout — unpin Pengaturan

- Edit `components/admin/sidebar.tsx`: move the Pengaturan `<Collapsible>` out of `<SidebarFooter>` into the end of `<SidebarContent>`. Keep Logout + separator in footer.
- Cross-check `.claude/standards/design-system.html` sidebar recipe (frontend pre-commit gate requires `design-system` token in this cycle doc — token present above).
- Acceptance: visual snapshot — Settings scrolls with other groups; Logout alone in footer. Playwright confirms `[data-sidebar="footer"]` contains only the Keluar button.
- Dependencies: none (independent file section but same file as Task 6 — sequence after Task 6 to avoid merge churn).

### 8. Tests — vitest + Playwright coverage

- Vitest:
  - `getSystemRolePermissions` truth table for all four roles.
  - `hasPermission` with each role + permission combo.
  - `requirePermission` pass/fail.
  - One API handler per HR domain — 403 vs 200.
- Playwright in `e2e/admin.spec.ts`:
  - Switch demo cookie to seeded SCHOOL_ADMIN user → sidebar SDM absent; GET `/admin/employees` lands on `/admin`.
  - SUPER_ADMIN → sidebar full; `/admin/employees` 200.
  - Settings not in footer (assertion on DOM).
- Seed: `prisma/seed.ts` adds a SUPER_ADMIN user (`superadmin@demo.local`) distinct from the existing admin (`admin@demo.local` which becomes SCHOOL_ADMIN).
- Acceptance: full gate `npm run build && npx vitest run && npx playwright test` green.
- Dependencies: Tasks 1–7.

## Implementation

- Subagent plan: Task 1 (foundation) sequential. Tasks 2 needs 1. Task 3 needs 1+2. After 3: Tasks 4, 5, 6 parallel (different files). Task 7 sequential after 6 (same file). Task 8 last. Each task: dispatched to general-purpose subagent, then code-reviewer on diff. Security-sensitive tasks (1, 3, 5) get superpowers:code-reviewer additional pass.
- Task 1: Session wiring — `lib/auth.ts` (+163/-26), `lib/__tests__/auth.permissions.test.ts` (new, 6 cases), 16 test files updated to include `permissions: []` + `customRoleCode: null` on SessionUser literals. Added `derivePermissions()` with strict `Array.isArray + every string` guard; falls back to role defaults on malformed JSON with `console.error` (user-input `customRole.code` wrapped in `JSON.stringify` per security review). Cache extended to store derived fields — derivation only on miss. Reviewers clean (feature-dev + superpowers). Log-injection nit fixed pre-commit.
- Task 2: Permissions table — `lib/permissions.ts` (added `hr.view`, dropped SCHOOL_ADMIN short-circuit, added SUPER_ADMIN short-circuit, explicit SCHOOL_ADMIN non-HR enumeration), `app/admin/settings/roles/page.tsx` (SUPER_ADMIN card first, grid 3→4 cols, `ALL_PERMISSIONS.length` instead of inline re-derive), `lib/__tests__/permissions.test.ts` (new, 14 cases incl. missing-key + null contract). Reviewer: 2 low-severity nits — both applied pre-commit.
- Task 3: Guard helpers — `lib/auth-guards.ts` (new, `requirePermission` for API + `assertPermission` for pages), `lib/__tests__/auth-guards.test.ts` (new, 8 cases). Both reviewers flagged redirect-loop risk on `/admin` target — fixed by adding explicit WARNING block in `assertPermission` JSDoc documenting the no-self-gate contract. Added null-permissions defense test per reviewer ask.
- Task 4: HR route group — `app/admin/(hr)/layout.tsx` (new, `assertPermission("hr.view")`); 4 dirs moved via `git mv` (employees, payroll, attendance, leave); `app/admin/settings/salary-components/layout.tsx` rewritten to use `assertPermission("hr.view")` (page is client — layout wraps); inner `app/admin/(hr)/payroll/layout.tsx` narrowed to `assertPermission("payroll.view")` for future HR-assistant role. URL paths unchanged (route group parens URL-invisible). Reviewer clean.
- Task 5: API guards — every HR handler now uses `requirePermission(perm)`. Employees: GET/list hr.view, POST employees.create, PUT employees.edit. Payroll: GET payroll.view, PUT/generate payroll.create, approve payroll.approve, send-slips payroll.send_slips. Salary-components: GET payroll.view, POST/PUT payroll.create (fixed post-review — was payroll.view). Slips [payrollItemId]/pdf admin path: payroll.view. Attendance admin (today/monthly/export): attendance.view; override: attendance.override. Leave admin: leave.view + leave.approve. Self-service untouched (attendance/{my,check-in,check-out}, leave/my, slips/my). `canViewSalary` deleted. `requirePermission` return narrowed to `SessionUser & { tenantId: string }`. Tightened `app/api/employees/positions/route.ts` (previously tenant-only) to `hr.view`. New `app/api/__tests__/hr-permission-gate.test.ts` (11 cases). Security review clean on role-trust / tenant-isolation / mass-assignment / rate-limiting.
- Task 6: Nav permissions — `config/admin-nav.ts` swaps `superAdminOnly: boolean` for `permission?: PermissionCode` on NavItem + NavGroup (SDM group `hr.view`, Komponen Gaji `hr.view`). `components/admin/sidebar.tsx` prop `canSeeSalary` → `permissions: string[]`; filter via `.includes()`. `app/admin/layout.tsx` passes `session.permissions`. `app/admin/page.tsx` derives `canSeeSalary={hasPermission(session, "payroll.view")}` (kept DashboardClient prop stable — min blast). Reviewer clean.

## Verification

<!-- filled by /build. Must include: design-system cross-check for sidebar layout -->

- Task 1: `npm run build && npx vitest run` green. 340 passed / 42 todo / 2 skipped. No TS errors.
- Task 2: `npm run build && npx vitest run` green. 354 passed / 42 todo / 2 skipped. No frontend diff so no design-system cross-check needed yet (deferred to Task 7 sidebar edit).
- Task 3: `npm run build && npx vitest run` green. 362 passed / 42 todo / 2 skipped.
- Task 5 (API guards): `npm run build && npx vitest run` green. 370 passed / 42 todo / 2 skipped. Security review clean on role-trust / tenant-isolation / mass-assignment / rate-limiting. Salary-components write perm corrected post-review (payroll.view → payroll.create).

## Ship Notes

<!-- filled by /ship. Must flag:
  - Seed adds SUPER_ADMIN demo user — document credentials.
  - Prod rollout migration: `prisma/migrations/YYYYMMDD_promote_owner_to_super_admin/migration.sql` — idempotent UPDATE by email, guarded on current role=SCHOOL_ADMIN. Owner email committed in migration file; CTO confirms email before merge to main.
  - Rollback: single `UPDATE User SET role='SCHOOL_ADMIN' WHERE role='SUPER_ADMIN'` reverses (valid while feature is new + solo owner).
  - Existing SCHOOL_ADMIN accounts lose HR access on deploy — expected + required.
  - Follow-up cycles: (a) Supabase RLS on hr.* tables; (b) audit log for HR reads.
-->
