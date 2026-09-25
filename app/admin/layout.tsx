import { getSession, isAdminRole, homePathForRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/admin/sidebar";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/");
  if (!isAdminRole(session.role)) redirect(homePathForRole(session.role));

  return (
    <SidebarProvider>
      <AppSidebar permissions={session.permissions} />
      {/* min-w-0 is load-bearing: this is a flex child, and a flex item's
          default `min-width: auto` refuses to shrink below its content. A
          wide table would otherwise stretch this column past the viewport,
          carrying the header and its action buttons off-screen instead of
          letting the table's own overflow-x-auto scroll it. */}
      <div className="relative flex w-full min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <AdminBreadcrumb />
          <div className="ml-auto flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-muted">
              <span className="text-xs font-bold text-primary">
                {session.name?.[0] ?? "A"}
              </span>
            </div>
          </div>
        </header>
        <main className="px-page-x py-page-y">{children}</main>
      </div>
    </SidebarProvider>
  );
}
