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

type PayrollRowWithCount = Awaited<ReturnType<typeof prisma.payrollRun.findFirst<{
  include: { _count: { select: { items: true } } };
}>>>;

function settled<T>(result: PromiseSettledResult<T>, fallback: T, key: string): T {
  if (result.status === "fulfilled") return result.value;
  console.error("[dashboard] query failed", { key, err: result.reason });
  return fallback;
}

// School ERP runs in Indonesian schools — use Asia/Jakarta (WIB, UTC+7) for the
// current date, otherwise the dashboard shows zeroes during 00:00–07:00 local.
function jakartaDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || !isAdminRole(session.role)) redirect("/");
  if (!session.tenantId) redirect("/");

  const tenantId = session.tenantId;
  const todayStr = jakartaDateStr(new Date());

  // FIND-013: include today in the 7-weekday window. Pre-fix the cursor
  // decremented BEFORE adding to the array, so the trend silently excluded
  // today's row — and on a fresh staging DB where the only AttendanceRecord
  // rows were for today, the panel rendered "Data kehadiran belum tersedia"
  // despite there being data. The fix adds today first, then walks back.
  const last7Weekdays: string[] = [];
  const cursor = new Date(`${todayStr}T00:00:00+07:00`);
  if (cursor.getDay() !== 0 && cursor.getDay() !== 6) {
    last7Weekdays.push(jakartaDateStr(cursor));
  }
  while (last7Weekdays.length < 7) {
    cursor.setDate(cursor.getDate() - 1);
    if (cursor.getDay() === 0 || cursor.getDay() === 6) continue;
    last7Weekdays.unshift(jakartaDateStr(cursor));
  }

  const canSeePayroll = hasPermission(session, "payroll.view");
  const canSeeAdmissions = hasPermission(session, "admissions.view");
  const canSeeLeave = hasPermission(session, "leave.view");
  const canSeeHr = hasPermission(session, "hr.view");
  const canSeeActivity = canSeeHr;

  const results = await Promise.allSettled([
    getEmployeeCount(tenantId),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { employee: { tenantId }, date: todayStr },
      _count: true,
    }),
    canSeeLeave
      ? prisma.leaveRequest.count({
          where: { employee: { tenantId }, status: "PENDING" },
        })
      : Promise.resolve(0),
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

  // Stat grid uses the same present/late split as the chart: late is its own
  // status, not folded into present. This keeps both surfaces telling the same
  // story about a single day.
  const statusCounts: Record<string, number> = {};
  for (const row of todayAttendance) statusCounts[row.status] = row._count;
  const present =
    (statusCounts["PRESENT"] ?? 0) + (statusCounts["PRESENT_NO_CHECKOUT"] ?? 0);
  const late = statusCounts["LATE"] ?? 0;
  const absent = Math.max(
    0,
    totalEmployees -
      present -
      late -
      (statusCounts["LEAVE"] ?? 0) -
      (statusCounts["HOLIDAY"] ?? 0)
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
          <div className="flex flex-col gap-4">
            <PendingActions
              pendingLeave={pendingLeave}
              pendingAdmissions={pendingAdmissions}
              lastPayroll={lastPayroll}
              canSeePayroll={canSeePayroll}
              canSeeAdmissions={canSeeAdmissions}
              canSeeLeave={canSeeLeave}
            />
            <ActivityFeed events={recentActivity} />
          </div>
        </div>
        <QuickActions canSeePayroll={canSeePayroll} canSeeHr={canSeeHr} />
      </div>
    </>
  );
}
