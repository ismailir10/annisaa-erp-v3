import { unstable_cache } from "next/cache";
import { getSession, isAdminRole, canViewSalary } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { formatDate } from "@/lib/format";
import { DashboardClient } from "./dashboard-client";

const getEmployeeCount = unstable_cache(
  async (tenantId: string) =>
    prisma.employee.count({ where: { tenantId, status: "ACTIVE" } }),
  ["employees-count"],
  { revalidate: 1800, tags: ["employees-count"] }
);

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) redirect("/");
  if (!session.tenantId) redirect("/");

  const tenantId = session.tenantId;
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Calculate last 7 weekdays for trend query
  const last7Weekdays: string[] = [];
  const d = new Date(today);
  while (last7Weekdays.length < 7) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    last7Weekdays.unshift(d.toISOString().split("T")[0]);
  }

  // Parallel queries for dashboard data
  const [totalEmployees, todayAttendance, pendingLeave, lastPayroll, weeklyTrendRaw] = await Promise.all([
    getEmployeeCount(tenantId),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { employee: { tenantId }, date: todayStr },
      _count: true,
    }),
    prisma.leaveRequest.count({
      where: { employee: { tenantId }, status: "PENDING" },
    }),
    prisma.payrollRun.findFirst({
      where: { tenantId },
      orderBy: { periodStart: "desc" },
      include: { _count: { select: { items: true } } },
    }),
    // Attendance trend: single query for all 7 weekdays
    prisma.attendanceRecord.groupBy({
      by: ["date", "status"],
      where: { employee: { tenantId }, date: { in: last7Weekdays } },
      _count: true,
    }),
  ]);

  // Aggregate weekly trend data by date
  const weeklyTrendMap = new Map<string, Record<string, number>>();
  for (const row of weeklyTrendRaw) {
    if (!weeklyTrendMap.has(row.date)) {
      weeklyTrendMap.set(row.date, {});
    }
    weeklyTrendMap.get(row.date)![row.status] = row._count;
  }

  const weeklyTrend = last7Weekdays.map((date) => {
    const counts = weeklyTrendMap.get(date) || {};
    return {
      date,
      present: (counts["PRESENT"] ?? 0) + (counts["PRESENT_NO_CHECKOUT"] ?? 0),
      late: counts["LATE"] ?? 0,
      absent: counts["ABSENT"] ?? 0,
    };
  });

  const statusCounts: Record<string, number> = {};
  for (const row of todayAttendance) statusCounts[row.status] = row._count;

  const present = (statusCounts["PRESENT"] ?? 0) + (statusCounts["LATE"] ?? 0) + (statusCounts["PRESENT_NO_CHECKOUT"] ?? 0);
  const late = statusCounts["LATE"] ?? 0;
  const absent = Math.max(0, totalEmployees - present - (statusCounts["LEAVE"] ?? 0) - (statusCounts["HOLIDAY"] ?? 0));

  return (
    <>
      <PageHeader
        title="Dasbor"
        description={formatDate(today.toISOString().split("T")[0], {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        })}
      />
      <DashboardClient
        canSeeSalary={canViewSalary(session.role)}
        totalEmployees={totalEmployees}
        present={present}
        late={late}
        absent={absent}
        pendingLeave={pendingLeave}
        lastPayroll={lastPayroll ? {
          period: `${lastPayroll.periodStart} — ${lastPayroll.periodEnd}`,
          status: lastPayroll.status,
          employeeCount: lastPayroll._count.items,
        } : null}
        weeklyTrend={weeklyTrend}
      />
    </>
  );
}
