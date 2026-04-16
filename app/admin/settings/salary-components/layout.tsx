import { getSession, canViewSalary } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SalaryComponentsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !canViewSalary(session.role)) redirect("/admin/settings");
  return <>{children}</>;
}
