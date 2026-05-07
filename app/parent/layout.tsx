// Parent portal layout — wraps every /parent/** page with the sidebar shell.
// Calls assertPortalAccess('parent') BEFORE rendering children:
// unauthenticated or role-mismatched requests redirect to "/" per cycle SD1.
//
// Cycle: docs/cycles/2026-05-08-p2-portal-shell-sidebar.md (T2)

import { cookies } from "next/headers";

import { Sidebar, SIDEBAR_COOKIE_NAME } from "@/components/portal/sidebar";
import { assertPortalAccess } from "@/lib/portal/portal-guard";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await assertPortalAccess("parent");
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value === "1";

  return (
    <div className="flex min-h-dvh">
      <Sidebar portal="parent" defaultCollapsed={collapsed} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
