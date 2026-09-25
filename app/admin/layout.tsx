import { getSession, isAdminRole, homePathForRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

  const [campuses, years] = session.tenantId ? await Promise.all([
    prisma.campus.findMany({ where: { tenantId: session.tenantId, status: "ACTIVE" }, select: { name: true }, orderBy: { name: "asc" } }).catch(() => null),
    prisma.academicYear.findMany({ where: { tenantId: session.tenantId, status: "ACTIVE" }, select: { name: true }, orderBy: { startDate: "desc" } }).catch(() => null),
  ]) : [null, null];
  const campusContext = campuses === null ? "Kampus belum tersedia" : campuses.length === 1 ? campuses[0].name : campuses.length ? `Semua kampus (${campuses.length})` : "Kampus belum diatur";
  const yearContext = years === null ? "Tahun ajaran belum tersedia" : years.length ? years.map(year => year.name).join(", ") : "Belum ada tahun ajaran aktif";

  return (
    <SidebarProvider>
      <AppSidebar permissions={session.permissions} />
      {/* min-w-0 is load-bearing: this is a flex child, and a flex item's
          default `min-width: auto` refuses to shrink below its content. A
          wide table would otherwise stretch this column past the viewport,
          carrying the header and its action buttons off-screen instead of
          letting the table's own overflow-x-auto scroll it. */}
      <div className="relative flex w-full min-w-0 flex-1 flex-col bg-background">
        <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border bg-card px-page-x py-3">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold break-words">{campusContext}</p>
            <p className="text-small text-muted-foreground break-words">{yearContext}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-full bg-muted">
              <span className="text-xs font-bold text-primary">
                {session.name?.[0] ?? "A"}
              </span>
            </div>
          </div>
        </header>
        <main className="min-w-0 px-page-x py-page-y"><div className="mb-field"><AdminBreadcrumb /></div>{children}</main>
      </div>
    </SidebarProvider>
  );
}
