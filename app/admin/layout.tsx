import { getSession, isAdminRole } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/admin/sidebar";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) redirect("/");

  return (
    <SidebarProvider>
      <AppSidebar permissions={session.permissions} />
      <SidebarInset>
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
      </SidebarInset>
    </SidebarProvider>
  );
}
