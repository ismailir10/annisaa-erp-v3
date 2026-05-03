import { unstable_cache } from "next/cache";
import { getSession, isAdminRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { formatDate } from "@/lib/format";
import {
  StatGrid,
  AttendanceTrendChart,
  PendingActions,
  ActivityFeed,
  QuickActions,
  type WeeklyTrend,
} from "@/components/admin/dashboard";
import { getRecentActivity, type ActivityEvent } from "@/lib/dashboard/activity-feed";

const getEmployeeCount = unstable_cache(
  async (tenantId: string) =>
    prisma.employee.count({ where: { tenantId, status: "ACTIVE" } }),
  ["employees-count"],
  { revalidate: 1800, tags: ["employees-count"] }
);

function settled<T>(result: PromiseSettledResult<T>, fallback: T, key: string): T {
  if (result.status === "fulfilled") return result.value;
  console.error("[dashboard] query failed", { key, err: result.reason });
  return fallback;
}

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) redirect("/");
  if (!session.tenantId) redirect("/");

  const tenantId = session.tenantId;
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const last7Weekdays: string[] = [];
  const d = new Date(today);
  while (last7Weekdays.length < 7) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    last7Weekdays.unshift(d.toISOString().split("T")[0]);
  }

  const canSeePayroll = hasPermission(session, "payroll.view");
  const canSeeAdmissions = hasPermission(session, "admissions.view");
  const canSeeActivity = hasPermission(session, "hr.view");

  const results = await Promise.allSettled([
    getEmployeeCount(tenantId),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { employee: { tenantId }, date: todayStr },
      _count: true,
    }),
    prisma.leaveRequest.count({
      where: { employee: { tenantId }, status: "PENDING" },
    }),
    canSeePayroll
      ? prisma.payrollRun.findFirst({
          where: { tenantId },
          orderBy: { periodStart: "desc" },
          include: { _count: { select: { items: true } } },
        })
      : Promise.resolve(null),
    prisma.attendanceRecord.groupBy({
      by: ["date", "status"],
      where: { employee: { tenantId }, date: { in: last7Weekdays } },
      _count: true,
    }),
    canSeeAdmissions
      ? prisma.admission.count({ where: { tenantId, status: "INQUIRY" } })
      : Promise.resolve(0),
    canSeeActivity
      ? getRecentActivity(tenantId, 8)
      : Promise.resolve([] as ActivityEvent[]),
  ]);

  const totalEmployees = settled(results[0], 0, "employees-count");
  const todayAttendance = settled(
    results[1],
    [] as Array<{ status: string; _count: number }>,
    "today-attendance"
  );
  const pendingLeave = settled(results[2], 0, "pending-leave");
  type PayrollRowWithCount = Awaited<ReturnType<typeof prisma.payrollRun.findFirst<{
    include: { _count: { select: { items: true } } };
  }>>>;
  const lastPayrollRow = settled(
    results[3],
    null as PayrollRowWithCount,
    "last-payroll"
  );
  const weeklyTrendRaw = settled(
    results[4],
    [] as Array<{ date: string; status: string; _count: number }>,
    "weekly-trend"
  );
  const pendingAdmissions = settled(results[5], 0, "pending-admissions");
  const recentActivity = settled(results[6], [] as ActivityEvent[], "recent-activity");

  const weeklyTrendMap = new Map<string, Record<string, number>>();
  for (const row of weeklyTrendRaw) {
    if (!weeklyTrendMap.has(row.date)) weeklyTrendMap.set(row.date, {});
    weeklyTrendMap.get(row.date)![row.status] = row._count;
  }
  const weeklyTrend: WeeklyTrend[] = last7Weekdays.map((date) => {
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
  const present =
    (statusCounts["PRESENT"] ?? 0) +
    (statusCounts["LATE"] ?? 0) +
    (statusCounts["PRESENT_NO_CHECKOUT"] ?? 0);
  const late = statusCounts["LATE"] ?? 0;
  const absent = Math.max(
    0,
    totalEmployees - present - (statusCounts["LEAVE"] ?? 0) - (statusCounts["HOLIDAY"] ?? 0)
  );

  const lastPayroll = lastPayrollRow
    ? {
        period: `${lastPayrollRow.periodStart} — ${lastPayrollRow.periodEnd}`,
        status: lastPayrollRow.status,
        employeeCount: lastPayrollRow._count.items,
      }
    : null;

  return (
    <>
      <PageHeader
        title="Dasbor"
        description={formatDate(todayStr, {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      />
      <div className="space-y-section">
        <StatGrid
          totalEmployees={totalEmployees}
          present={present}
          late={late}
          absent={absent}
        />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <AttendanceTrendChart data={weeklyTrend} className="lg:col-span-2" />
          <div className="space-y-4">
            <PendingActions
              pendingLeave={pendingLeave}
              pendingAdmissions={pendingAdmissions}
              lastPayroll={lastPayroll}
              canSeePayroll={canSeePayroll}
              canSeeAdmissions={canSeeAdmissions}
            />
            <ActivityFeed events={recentActivity} />
          </div>
        </div>
        <QuickActions canSeePayroll={canSeePayroll} />
      </div>
    </>
  );
}
