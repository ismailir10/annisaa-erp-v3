import Link from "next/link";
import { getSession, isAdminRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { formatDate, formatDateShort } from "@/lib/format";
import { StatGrid, AttendanceTrendChart, ActivityFeed, QuickActions, type WeeklyTrend } from "@/components/admin/dashboard";
import { AdminWorkQueue, DashboardRetry } from "@/components/admin/dashboard/admin-work-queue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRecentActivity } from "@/lib/dashboard/activity-feed";
import { buildAdminWorkQueue, unavailableAdminQueueSections, adminWorkPermissions, canViewAdminActivity, type AdminQueueSection } from "@/lib/dashboard/admin-work-queue";

async function loadSection<T>(allowed: boolean, key: string, query: () => Promise<T[]>): Promise<AdminQueueSection<T>> {
  if (!allowed) return { status: "hidden" };
  try { return { status: "ready", records: await query() }; }
  catch (error) { console.error("[dashboard] source unavailable", { key, error }); return { status: "unavailable" }; }
}

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role) || !session.tenantId) redirect("/");
  const tenantId = session.tenantId;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
  const can = (permission: string) => hasPermission(session, permission);
  const permitted = adminWorkPermissions(session);
  const canSeeAttendance = can("hr.view") && can("attendance.view");
  const dates: string[] = [];
  const cursor = new Date(`${today}T12:00:00Z`);
  while (dates.length < 7) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) dates.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  const [enrollments, leave, invoices, payroll, attendance, activity] = await Promise.all([
    loadSection(permitted.enrollments, "enrollments", () => prisma.enrollmentApplication.findMany({ where: { tenantId, studentId: null, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } }, select: { id: true, childName: true, status: true }, orderBy: { updatedAt: "asc" } })),
    loadSection(permitted.leave, "leave", () => prisma.leaveRequest.findMany({ where: { status: "PENDING", employee: { tenantId } }, select: { id: true, leaveType: true, startDate: true, endDate: true, status: true, employee: { select: { nama: true } } }, orderBy: { createdAt: "asc" } })),
    loadSection(permitted.invoices, "invoices", () => prisma.invoice.findMany({ where: { tenantId, status: "PENDING_PAYMENT_LINK" }, select: { id: true, invoiceNumber: true, periodLabel: true, dueDate: true, status: true, student: { select: { name: true } } }, orderBy: { dueDate: "asc" } })),
    loadSection(permitted.payroll, "payroll", () => prisma.payrollRun.findMany({ where: { tenantId, status: "DRAFT" }, select: { id: true, periodStart: true, periodEnd: true, status: true }, orderBy: { periodStart: "asc" } })),
    loadSection(canSeeAttendance, "attendance", async () => {
      const [total, rows] = await Promise.all([
        prisma.employee.count({ where: { tenantId, status: "ACTIVE" } }),
        prisma.attendanceRecord.groupBy({ by: ["date", "status"], where: { employee: { tenantId, status: "ACTIVE" }, date: { in: [...new Set([...dates, today])] } }, _count: true }),
      ]);
      return [{ total, rows }];
    }),
    loadSection(can("hr.view"), "activity", async () => (await getRecentActivity(tenantId, 12)).filter(event => canViewAdminActivity(session, event.href))),
  ]);
  const sources = { enrollments, leave, invoices, payroll };
  const items = buildAdminWorkQueue(sources);
  const deadlines = items.filter(item => item.dueDate).slice(0, 3);
  const attendanceSummary = attendance.status === "ready" ? attendance.records[0] : null;
  const todayRows = attendanceSummary?.rows.filter(row => row.date === today) ?? [];
  const count = (status: string) => todayRows.find(row => row.status === status)?._count ?? 0;
  const trend: WeeklyTrend[] = dates.map(date => {
    const rows = attendanceSummary?.rows.filter(row => row.date === date) ?? [];
    const value = (status: string) => rows.find(row => row.status === status)?._count ?? 0;
    return { date, present: value("PRESENT") + value("PRESENT_NO_CHECKOUT"), late: value("LATE"), absent: value("ABSENT") };
  });
  return <>
    <PageHeader title="Perlu ditangani" description="Pekerjaan yang menunggu keputusan atau pemeriksaan Anda." actions={<p className="text-body text-muted-foreground">{formatDate(today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>} />
    <div className="space-y-section">
      <div className="grid min-w-0 items-start gap-section xl:grid-cols-[minmax(0,1fr)_18rem]">
        <AdminWorkQueue items={items} unavailable={unavailableAdminQueueSections(sources)} />
        <div className="space-y-field">
          {invoices.status !== "hidden" && <Card><CardHeader><CardTitle>Tenggat tagihan terdekat</CardTitle></CardHeader><CardContent>
            {invoices.status === "unavailable" ? <div className="space-y-field"><p className="text-body text-muted-foreground">Tanggal tagihan belum dapat dimuat.</p><DashboardRetry /></div> : deadlines.length ? <ul className="space-y-field">{deadlines.map(item => <li key={item.id}><Link href={item.href} className="block rounded-md py-2 text-body outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="font-semibold">{formatDateShort(item.dueDate!)}</p><p className="text-muted-foreground">{item.title}</p></Link></li>)}</ul> : <p className="text-body text-muted-foreground">Tidak ada tenggat dari tagihan yang perlu Anda tangani.</p>}
          </CardContent></Card>}
          {activity.status === "ready" && <ActivityFeed events={activity.records} />}
          {activity.status === "unavailable" && <Card><CardContent className="space-y-field"><p>Aktivitas belum dapat dimuat.</p><DashboardRetry /></CardContent></Card>}
        </div>
      </div>
      {attendanceSummary && <section aria-label="Ringkasan kehadiran karyawan" className="space-y-field"><h2 className="text-h2 font-semibold">Kehadiran karyawan</h2><StatGrid totalEmployees={attendanceSummary.total} present={count("PRESENT") + count("PRESENT_NO_CHECKOUT")} late={count("LATE")} absent={count("ABSENT")} /><AttendanceTrendChart data={trend} /></section>}
      {attendance.status === "unavailable" && <Card><CardContent className="space-y-field"><p>Ringkasan kehadiran belum dapat dimuat. Jumlah belum diketahui.</p><DashboardRetry /></CardContent></Card>}
      <QuickActions canSeePayroll={can("payroll.view") && can("payroll.create")} canSeeHr={can("hr.view")} canSeeAttendance={canSeeAttendance} canSeeLeave={can("leave.view")} canCreateEmployee={can("employees.create")} />
    </div>
  </>;
}
