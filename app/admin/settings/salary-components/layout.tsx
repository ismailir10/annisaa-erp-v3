import { assertPermission } from "@/lib/auth-guards";

/**
 * Salary-components gate.
 *
 * This page configures payroll inputs (component catalog — tunjangan,
 * potongan, calc types) and so belongs behind the HR gate. It lives under
 * `settings/` rather than the `(hr)` route group because it sits in the
 * Pengaturan nav section, so it can't inherit the route-group layout.
 * A server layout here applies `hr.view` without having to convert the
 * client `page.tsx` into a server wrapper.
 *
 * Previously this layout used `canViewSalary(session.role)` — replaced with
 * the permission-based gate so custom roles with `hr.view` granted can reach
 * the page, and SCHOOL_ADMIN (which lost `hr.*`) is correctly blocked.
 */
export default async function SalaryComponentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertPermission("hr.view");
  return <>{children}</>;
}
