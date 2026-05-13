import { assertPermission } from "@/lib/auth-guards";

/**
 * HR route-group gate.
 *
 * Wraps `employees`, `payroll`, `employee-attendance`, `leave-requests`,
 * and `salary-components` admin pages.
 * `(hr)` is a route group (parentheses) — it is invisible in the URL, so
 * `/admin/employees` still resolves. The single `assertPermission("hr.view")`
 * call here replaces per-page role checks: users lacking `hr.view` are
 * redirected to `/admin` before any page code runs. SUPER_ADMIN passes via
 * the short-circuit in `hasPermission`; SCHOOL_ADMIN lacks `hr.view` by
 * default and is bounced. Custom roles with `hr.view` granted pass through.
 */
export default async function HrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertPermission("hr.view");
  return <>{children}</>;
}
