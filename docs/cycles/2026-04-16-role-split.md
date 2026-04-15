# Role Split: SUPER_ADMIN + SCHOOL_ADMIN (salary protection)

## Context

Today there is one admin role (`SCHOOL_ADMIN`) that has full access to everything —
payroll, salary values, bank account numbers, and all HR data. The school owner
needs a second admin persona that can manage students, admissions, academics,
attendance, and invoices but **cannot see salary figures or access payroll at all**.

Salary is the most sensitive data in the system. A privilege-escalation bug here
is a direct leak of employee compensation to potentially the wrong people. This
cycle deserves full security review before ship.

**Prod impact:** Every current `SCHOOL_ADMIN` DB record must become `SUPER_ADMIN`
so that the owner's production login is unaffected. The new `SCHOOL_ADMIN` string
value is added as a restricted variant.

---

## Spec

### Role semantics

| Role | Access |
|------|--------|
| `SUPER_ADMIN` | Everything — full parity with the current SCHOOL_ADMIN |
| `SCHOOL_ADMIN` | Students, admissions, academics, attendance, invoices, employees (basic info only) |
| `TEACHER` | Own attendance, own leave slips, assigned classes |
| `GUARDIAN` | Own child's data only |

### Acceptance criteria

1. `canViewSalary(role)` returns `true` for `SUPER_ADMIN` only.
2. `isAdminRole(role)` returns `true` for both `SUPER_ADMIN` and `SCHOOL_ADMIN`.
3. All `/api/payroll/*` routes return **403** for `SCHOOL_ADMIN` (not 200, not empty data).
4. `/api/employees/[id]/salary` GET and PUT return **403** for `SCHOOL_ADMIN`.
5. `GET /api/employees` and `GET /api/employees/[id]` strip `bankAccountNo`, `bankName`,
   `bpjsEnrolled` from the response when called by `SCHOOL_ADMIN`.
6. `GET /api/employees` and `POST /api/employees` remain accessible to both admin roles.
7. `PUT /api/employees/[id]` (basic info edit) remains accessible to both admin roles.
8. `/admin/payroll/*` pages redirect `SCHOOL_ADMIN` to `/admin` (server-side, before
   any render, via a layout Server Component gate).
9. The admin sidebar hides "Penggajian" and "Komponen Gaji" for `SCHOOL_ADMIN`.
10. The employee detail page hides the "Gaji" tab and bank/BPJS card fields for
    `SCHOOL_ADMIN`.
11. The admin layout (`/admin`) accepts both `SUPER_ADMIN` and `SCHOOL_ADMIN`.
12. Demo mode has both a `SUPER_ADMIN` user (`u_super_admin`) and a `SCHOOL_ADMIN`
    user (`u_school_admin`) as cookie-injectable fixtures.
13. Existing DB rows: a SQL data migration renames `SCHOOL_ADMIN` → `SUPER_ADMIN`
    (reversible — down migration renames back).
14. The seed creates the primary admin as `SUPER_ADMIN` and a second fixture as
    `SCHOOL_ADMIN`.
15. All Vitest role-check and field-stripping tests pass.
16. Playwright `admin-school-admin.spec.ts` passes — proves 403 from SCHOOL_ADMIN
    persona, no payroll link in sidebar, no salary section in employee detail.

### What is NOT in scope

- Per-module permission flags beyond salary/payroll
- New roles beyond `SUPER_ADMIN` and `SCHOOL_ADMIN`
- The `/uat` command (separate cycle)
- Storing role in Supabase JWT claims (separate hardening cycle)

---

## Tasks

> Ordered: each task can be committed independently after the between-task gate passes.

### T1 — Auth helpers (`lib/auth.ts`)

**Files:** `lib/auth.ts`

- Add `"SUPER_ADMIN"` to the `SessionUser` `role` union:
  `role: "SUPER_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "GUARDIAN"`
- Export three helpers:
  ```ts
  export const isSuperAdmin = (role: string) => role === "SUPER_ADMIN";
  export const isAdminRole  = (role: string) => role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN";
  export const canViewSalary = (role: string) => role === "SUPER_ADMIN";
  ```
- Update demo login redirect in `/api/auth/login/route.ts`:
  `role === "SCHOOL_ADMIN" || role === "SUPER_ADMIN"` → redirect to `/admin`
- Update admin layout gate: `session.role !== "SCHOOL_ADMIN"` →
  `!isAdminRole(session.role)` (in `app/admin/layout.tsx`)

**Gate:** `npm run build && npx vitest run`

---

### T2 — Data migration + seed

**Files:** `prisma/migrations/YYYYMMDD_add_super_admin_role/migration.sql`,
`prisma/seed.ts`

- Write a raw SQL migration (placed in `prisma/migrations/`):
  ```sql
  -- Up: rename existing SCHOOL_ADMIN users to SUPER_ADMIN
  UPDATE "User" SET role = 'SUPER_ADMIN' WHERE role = 'SCHOOL_ADMIN';
  -- Down (reversible):
  -- UPDATE "User" SET role = 'SCHOOL_ADMIN' WHERE role = 'SUPER_ADMIN';
  ```
  **Note:** no Prisma schema change required — `User.role` is already a `String`.
  The migration is a data-only migration using `prisma migrate diff` as a carrier
  or a raw SQL file applied via `prisma migrate deploy`.
- Update seed:
  - Change admin user fixture: `role: "SUPER_ADMIN"`, id: `"u_super_admin"`
  - Add a second admin fixture: `{ id: "u_school_admin", email: "schooladmin@annisaa.sch.id", role: "SCHOOL_ADMIN", name: "Admin Sekolah" }`
  - Use upsert (`upsert({ where: { email: ... }, ... })`) so re-seeding is idempotent

**Gate:** `npm run build && npx vitest run`

---

### T3 — API: payroll route role-check sweep

**Files:** all `app/api/payroll/**/*.ts` (9 files)

Current pattern in every handler:
```ts
if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Change every instance to:
```ts
if (!session?.tenantId || !canViewSalary(session.role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Import `canViewSalary` from `@/lib/auth` in each file.

Special case — `GET /api/payroll/route.ts` currently returns empty data instead of
403 for non-SCHOOL_ADMIN. Fix to return 403 consistently:
```ts
if (!session?.tenantId || !canViewSalary(session.role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

**Files to touch:**
- `app/api/payroll/route.ts`
- `app/api/payroll/generate/route.ts`
- `app/api/payroll/compare/route.ts`
- `app/api/payroll/[id]/route.ts`
- `app/api/payroll/[id]/approve/route.ts`
- `app/api/payroll/[id]/export/bsi/route.ts`
- `app/api/payroll/[id]/send-slips/route.ts`
- `app/api/payroll/[id]/items/[itemId]/variables/route.ts`
- `app/api/payroll/[id]/items/[itemId]/lines/[lineId]/route.ts`

**Gate:** `npm run build && npx vitest run`

---

### T4 — API: employee route role-check + field stripping

**Files:** `app/api/employees/**/*.ts`

**`GET /api/employees/route.ts`** — accessible to both admin roles; strip salary
fields for `SCHOOL_ADMIN`:
```ts
const canSeePayData = canViewSalary(session.role);
const safeEmployees = employees.map(e => {
  if (canSeePayData) return e;
  const { bankAccountNo, bankName, bpjsEnrolled, ...rest } = e;
  return rest;
});
return NextResponse.json(paginatedResponse(safeEmployees, total, page, pageSize));
```

**`POST /api/employees/route.ts`** — change role check from `SCHOOL_ADMIN` to
`isAdminRole`:
```ts
if (!session?.tenantId || !isAdminRole(session.role)) {
```

**`GET /api/employees/[id]/route.ts`** — add field stripping:
```ts
const canSeePayData = canViewSalary(session.role);
const data = canSeePayData
  ? employee
  : (({ bankAccountNo, bankName, bpjsEnrolled, ...rest }) => rest)(employee);
return NextResponse.json(data);
```

**`PUT /api/employees/[id]/route.ts`** — change role check to `isAdminRole`:
```ts
if (!session?.tenantId || !isAdminRole(session.role)) {
```

**`GET /api/employees/[id]/salary/route.ts`** — add SUPER_ADMIN-only gate:
```ts
if (!session?.tenantId || !canViewSalary(session.role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

**`PUT /api/employees/[id]/salary/route.ts`** — change existing SCHOOL_ADMIN check
to `canViewSalary`:
```ts
if (!session?.tenantId || !canViewSalary(session.role)) {
```

**Gate:** `npm run build && npx vitest run`

---

### T5 — Payroll page server-side gate

**Files:** `app/admin/payroll/layout.tsx` (new)

Create a minimal Server Component layout that redirects non-SUPER_ADMIN before any
payroll page renders:

```tsx
import { getSession } from "@/lib/auth";
import { canViewSalary } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function PayrollLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !canViewSalary(session.role)) redirect("/admin");
  return <>{children}</>;
}
```

Also gate the salary-components settings page (`app/admin/settings/salary-components/`).
Add the same gate pattern as a Server Component check at the top of the page
(`app/admin/settings/salary-components/page.tsx`) — redirect to `/admin/settings`
for `SCHOOL_ADMIN`.

**Gate:** `npm run build && npx vitest run`

---

### T6 — Sidebar + nav config

**Files:** `config/admin-nav.ts`, `components/admin/sidebar.tsx`, `app/admin/layout.tsx`

1. Add `superAdminOnly?: boolean` to `NavItem` type in `config/admin-nav.ts`.
2. Mark two items as `superAdminOnly: true`:
   - `{ label: "Penggajian", href: "/admin/payroll", superAdminOnly: true }`
   - `{ label: "Komponen Gaji", href: "/admin/settings/salary-components", superAdminOnly: true }`
3. In `app/admin/layout.tsx`, pass `role={session.role}` to `<AppSidebar>`.
4. In `components/admin/sidebar.tsx`:
   - Accept `role: string` prop on `AppSidebar`
   - Filter items: `items.filter(item => !item.superAdminOnly || canViewSalary(role))`
   - Apply filter to both `groups[].items` and `settings`
   - Import `canViewSalary` from `@/lib/auth`

**Gate:** `npm run build && npx vitest run`

---

### T7 — Employee UI: hide salary tab + fields for SCHOOL_ADMIN

**Files:** `app/admin/employees/[id]/page.tsx`

The employee detail page is a Client Component that fetches data from the API. Since
`GET /api/employees/[id]/salary` now returns 403 for SCHOOL_ADMIN, the UI needs to
handle that gracefully and hide salary-related sections rather than showing an error.

1. After fetching salary values, check for 403: if the response is 403, treat
   `salaryValues` as `null` (not empty array) to distinguish "not allowed" from
   "no components configured".
2. Conditionally render the "Gaji" tab in `<TabsList>` — only when `salaryValues !== null`.
3. Conditionally render bank/BPJS card fields in the profile view — only when
   `employee.bankAccountNo !== undefined` (stripped server-side for SCHOOL_ADMIN).
4. In edit mode, hide bank name, bank account, and BPJS fields from the form when
   those fields are absent from the fetched employee object.

No role prop needed — the API response itself signals what the user can see.

**Gate:** `npm run build && npx vitest run`

---

### T8 — Vitest unit tests

**Files:** `lib/__tests__/auth-helpers.test.ts` (new),
`app/api/__tests__/payroll-auth.test.ts` (new),
`app/api/__tests__/employee-salary-auth.test.ts` (new)

**`auth-helpers.test.ts`:**
```ts
describe("canViewSalary", () => {
  it("returns true for SUPER_ADMIN", () => expect(canViewSalary("SUPER_ADMIN")).toBe(true));
  it("returns false for SCHOOL_ADMIN", () => expect(canViewSalary("SCHOOL_ADMIN")).toBe(false));
  it("returns false for TEACHER", () => expect(canViewSalary("TEACHER")).toBe(false));
  it("returns false for GUARDIAN", () => expect(canViewSalary("GUARDIAN")).toBe(false));
});
describe("isAdminRole", () => {
  it("returns true for SUPER_ADMIN", () => expect(isAdminRole("SUPER_ADMIN")).toBe(true));
  it("returns true for SCHOOL_ADMIN", () => expect(isAdminRole("SCHOOL_ADMIN")).toBe(true));
  it("returns false for TEACHER", () => expect(isAdminRole("TEACHER")).toBe(false));
});
```

**`payroll-auth.test.ts`:** Use `createMockSession` helper with each role, call the
`GET /api/payroll` handler, assert 403 for SCHOOL_ADMIN/TEACHER/GUARDIAN and 200 for
SUPER_ADMIN.

**`employee-salary-auth.test.ts`:** Test that `GET /api/employees/[id]/salary`
returns 403 for SCHOOL_ADMIN and 200 for SUPER_ADMIN. Test that
`GET /api/employees` strips `bankAccountNo` etc. for SCHOOL_ADMIN.

**Gate:** `npm run build && npx vitest run` — all new tests must be green.

---

### T9 — Playwright: admin-school-admin.spec.ts

**Files:** `e2e/admin-school-admin.spec.ts` (new), `e2e/admin.spec.ts` (update)

**New spec — SCHOOL_ADMIN persona:**
```ts
const SCHOOL_ADMIN_USER_ID = "u_school_admin";

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([{
    name: "school-erp-session",
    value: SCHOOL_ADMIN_USER_ID,
    domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax",
  }]);
  await page.goto("/admin");
  await page.waitForURL("**/admin", { timeout: 15_000 });
});

test("payroll page redirects to /admin", async ({ page }) => {
  await page.goto("/admin/payroll");
  await expect(page).toHaveURL(/\/admin$/);
});

test("payroll API returns 403", async ({ page }) => {
  const res = await page.request.get("/api/payroll");
  expect(res.status()).toBe(403);
});

test("sidebar has no Penggajian link", async ({ page }) => {
  await expect(page.locator("text=Penggajian")).not.toBeVisible();
});

test("employee detail has no Gaji tab", async ({ page }) => {
  await page.goto("/admin/employees");
  // Click first employee row
  await page.locator("[data-testid='employee-row']").first().click();
  await page.waitForURL("**/admin/employees/**");
  await expect(page.getByRole("tab", { name: "Gaji" })).not.toBeVisible();
});

test("employee salary API returns 403", async ({ page }) => {
  // Get first employee ID from the list API
  const listRes = await page.request.get("/api/employees?pageSize=1");
  const { data } = await listRes.json();
  const empId = data[0].id;
  const salaryRes = await page.request.get(`/api/employees/${empId}/salary`);
  expect(salaryRes.status()).toBe(403);
});
```

**Update `e2e/admin.spec.ts`:** rename `ADMIN_USER_ID = "u_admin"` →
`ADMIN_USER_ID = "u_super_admin"` to reflect the new fixture ID.

**Gate:** `npm run build && npx vitest run && npx playwright test`

---

### T10 — Docs

**Files:** `README.md`, `CLAUDE.md`

**README.md** — update "Data Access Rules" table:
```
| SUPER_ADMIN   | Everything — payroll, salary, all HR data, all modules |
| SCHOOL_ADMIN  | Students, admissions, academics, attendance, invoices, employees (no salary/payroll) |
| TEACHER       | Own attendance, own leave slips, assigned classes only |
| GUARDIAN      | Own child's data only (invoices, attendance, reports) |
```

**CLAUDE.md** — update security checklist section:
```
| Role | Access |
|------|--------|
| SUPER_ADMIN | All tenant data, including payroll and salary fields |
| SCHOOL_ADMIN | All tenant data EXCEPT: /api/payroll/*, /api/employees/*/salary, salary fields in employee responses |
| TEACHER | Own attendance, own slips, assigned classes only |
| GUARDIAN | Own child's data only |
```
Also add to the "Security Checklist for New Routes" section:
- `[ ] Salary-bearing routes: check `canViewSalary(session.role)` not just `isAdminRole()`

**Gate:** `npm run build && npx vitest run`

---

## Implementation

- T1: Auth helpers — `lib/auth.ts`, `app/admin/layout.tsx`, `app/api/auth/login/route.ts`, `vitest.config.ts` — added `SUPER_ADMIN` to SessionUser union, exported `isSuperAdmin`/`isAdminRole`/`canViewSalary` helpers, updated layout gate and demo login redirect, fixed vitest worktree exclusion
- T2: Data migration + seed — `prisma/migrations/20260416000002_rename_school_admin_to_super_admin/migration.sql`, `prisma/seed.ts`, `e2e/admin.spec.ts` — reversible SQL migration renames SCHOOL_ADMIN→SUPER_ADMIN in prod, seed creates u_super_admin + u_school_admin fixtures with stable IDs, Playwright spec updated to u_super_admin
- T3: Payroll route sweep — all 9 `app/api/payroll/**` routes — changed `session.role !== "SCHOOL_ADMIN"` → `!canViewSalary(session.role)`, fixed payroll/route.ts silent-fail to proper 403, added `canViewSalary` import to each handler
- T4: Employee route role-check + field stripping — `app/api/employees/route.ts`, `app/api/employees/[id]/route.ts`, `app/api/employees/[id]/salary/route.ts` — POST/PUT locked to `isAdminRole`, GET salary locked to `canViewSalary`, GET list+detail strips `bankAccountNo`/`bankName`/`bpjsEnrolled` for non-SUPER_ADMIN
- T5: Payroll page server-side gate — `app/admin/payroll/layout.tsx` (new), `app/admin/settings/salary-components/layout.tsx` (new) — Server Component layouts redirect non-SUPER_ADMIN before any page renders
- T6: Sidebar + nav config — `config/admin-nav.ts`, `components/admin/sidebar.tsx`, `app/admin/layout.tsx` — added `superAdminOnly` to NavItem type, marked Penggajian + Komponen Gaji as superAdminOnly, sidebar filters items via `canSeeSalary` boolean prop (avoids server-only import in client component)
- T7: Employee UI — `app/admin/employees/[id]/page.tsx` — salary fetch returns null on 403, Gaji tab hidden when salaryValues===null, Rekening & BPJS section hidden when server stripped fields
- T8: Vitest unit tests — `lib/__tests__/auth-helpers.test.ts`, `app/api/__tests__/payroll-auth.test.ts`, `app/api/__tests__/employee-salary-auth.test.ts` — 21 new tests covering all three helper functions, payroll route role gating, employee salary route gating, and field stripping behavior

---

## Verification

### Security checklist (must all pass before `/ship`)

- [ ] `grep -r "SCHOOL_ADMIN" app/api/payroll/` returns nothing (all checks now use `canViewSalary`)
- [ ] `grep -r "SCHOOL_ADMIN" app/api/employees/` returns nothing (all checks now use `canViewSalary` or `isAdminRole`)
- [ ] `GET /api/payroll` with SCHOOL_ADMIN session → 403 (not 200, not empty array)
- [ ] `GET /api/employees/[id]/salary` with SCHOOL_ADMIN session → 403
- [ ] `GET /api/employees/[id]` with SCHOOL_ADMIN session → response excludes `bankAccountNo`, `bankName`, `bpjsEnrolled`
- [ ] `/admin/payroll` with SCHOOL_ADMIN session → redirected to `/admin` (layout gate)
- [ ] Sidebar rendered for SCHOOL_ADMIN → no "Penggajian" link, no "Komponen Gaji" link
- [ ] Employee detail for SCHOOL_ADMIN → no "Gaji" tab, no bank/BPJS fields
- [ ] SQL migration is reversible (down migration comment present in migration file)
- [ ] Seed has two admin fixtures: `u_super_admin` (SUPER_ADMIN) + `u_school_admin` (SCHOOL_ADMIN)
- [ ] Playwright `admin-school-admin.spec.ts` — all 5 tests green

### Gates

| Gate | Status |
|------|--------|
| `npm run build` | T1–T8 ✓ |
| `npx vitest run` | T1–T8 ✓ (90/90) |
| `npx playwright test` | pending |

---

## Ship Notes

### Migrations

Run after deploy:
```sql
UPDATE "User" SET role = 'SUPER_ADMIN' WHERE role = 'SCHOOL_ADMIN';
```

**Rollback (if needed):**
```sql
UPDATE "User" SET role = 'SCHOOL_ADMIN' WHERE role = 'SUPER_ADMIN';
```

### New env vars
None.

### New demo fixtures
| ID | Role | Email | Purpose |
|----|------|-------|---------|
| `u_super_admin` | `SUPER_ADMIN` | `admin@annisaa.sch.id` | Main owner — full access |
| `u_school_admin` | `SCHOOL_ADMIN` | `schooladmin@annisaa.sch.id` | Staff admin — no salary |

### Rollback plan
1. Run the SQL rollback above to restore all users to `SCHOOL_ADMIN`.
2. Revert the `lib/auth.ts` `SessionUser` type change (remove `SUPER_ADMIN`).
3. Re-deploy.
