# ADR — Role split: SUPER_ADMIN vs SCHOOL_ADMIN; permission-based RBAC for HR

**Status:** Accepted, 2026-05-03 (codifies decisions from 2026-04-16 + 2026-04-25)
**Cycle origin:** [2026-04-16-role-split.md](../cycles/archive/2026-04-16-role-split.md), [2026-04-25-super-admin-rbac-sidebar-fix.md](../cycles/archive/2026-04-25-super-admin-rbac-sidebar-fix.md)
**Related:** [2026-05-03-supabase-ssr-auth.md](2026-05-03-supabase-ssr-auth.md)

---

## Context

The original role enum was `SUPER_ADMIN | TEACHER | GUARDIAN`. Adding the school-admin (registrar / staff) persona forced a choice: extend the enum, or generalize. School admin needs everything an admin owner does **except** salary, payroll, employee compensation, and bank export — these are owner-only because they expose individual employee pay (Indonesian privacy norms + reduced internal-leak surface). Role-string checks (`if role === "SUPER_ADMIN"`) scattered across handlers were already drifting; a third tier (`SCHOOL_ADMIN`) would worsen the drift unless we shifted to permission strings.

## Decision

1. **Add `SCHOOL_ADMIN` to the role enum.** `SUPER_ADMIN` keeps everything; `SCHOOL_ADMIN` excludes the `hr.*` permission family.
2. **Replace role-string checks with permission strings** for HR/finance gates. Each role maps to a permission set via `getSystemRolePermissions(role)` in `lib/permissions.ts`. Routes call `hasPermission(session, "hr.payroll.view")` etc. Role checks remain for portal-routing-level distinctions only (admin vs teacher vs parent).
3. **Permission catalog lives in one file** (`lib/permissions.ts`) and is enumerated in `lib/__tests__/permissions.test.ts` (golden snapshot — adding a permission requires a deliberate test update).
4. **Salary, payroll-approve, payroll-export-bsi, and employee-status routes are protected by `hr.*` permission checks**, not by `role === "SUPER_ADMIN"`. Tests in `app/api/__tests__/{employee-salary-auth,payroll-auth,hr-permission-gate}.test.ts` pin this.
5. **Sidebar nav filters items by permission, not role**, so a `SCHOOL_ADMIN` user does not see "Payroll" / "Salary" entries at all.
6. **`AuditLog` writes are forced for sensitive HR mutations** (salary edit, payroll approve/cancel, employee status change). See ADR for AuditLog (TBD) — for now, append-only, before/after JSON, tenant-scoped, recorded inside the same transaction so the audit cannot be lost on partial failure.

## Consequences

**Accepted:**
- Adding a new HR-sensitive route requires (a) adding the permission to the catalog, (b) wiring a `hasPermission()` check, (c) adding a test asserting `SCHOOL_ADMIN` → 403. This is friction by design.
- `SUPER_ADMIN` still bypasses every check — it is the trust root. Limit who has it (today: school owner only).
- Custom-role builder (deferred) would later let a school assemble its own permission bundle. The catalog + permission-string design supports this without re-architecture.

**Rejected alternatives:**
- Open-ended role string + per-route ACL table: heavier than the team needs at this size.
- Single `ADMIN` role with feature flags: doesn't scale to "school owner vs school staff" semantics; flags are about rollout, not authorization.
- Pure RLS at the DB layer: doesn't fit the service-role-write model decided in [2026-05-03-supabase-ssr-auth.md](2026-05-03-supabase-ssr-auth.md).

## Verification

- `lib/__tests__/permissions.test.ts` golden snapshot
- `lib/__tests__/auth.permissions.test.ts` boundary cases
- `app/api/__tests__/hr-permission-gate.test.ts` end-to-end gate
- `app/api/__tests__/employee-salary-auth.test.ts` + `payroll-auth.test.ts` confirm `SCHOOL_ADMIN` 403 on each
- Playwright `e2e/admin-school-admin.spec.ts` walks the SCHOOL_ADMIN UI and confirms payroll routes are absent + return 403 if visited directly
