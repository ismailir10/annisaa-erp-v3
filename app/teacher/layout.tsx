// Teacher portal layout — wraps every /teacher/** page with the sidebar
// shell. Calls assertPortalAccess('teacher') BEFORE rendering children:
// unauthenticated or role-mismatched requests redirect to "/" per cycle SD1.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T2)

import { cookies } from "next/headers";

import { Sidebar, SIDEBAR_COOKIE_NAME } from "@/components/portal/sidebar";
import { assertPortalAccess } from "@/lib/portal/portal-guard";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertPortalAccess("teacher");
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === "1";

  return (
    <div className="flex min-h-dvh">
      <Sidebar portal="teacher" defaultCollapsed={collapsed} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
