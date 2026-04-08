import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/admin/page-header";
import { DashboardClient } from "./dashboard-client";

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session || session.role !== "SCHOOL_ADMIN") redirect("/");

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Parallel queries for dashboard data
  const [totalEmployees, todayAttendance, pendingLeave, lastPayroll, weeklyTrend] = await Promise.all([
    prisma.employee.count({
      where: { tenantId: session.tenantId!, status: "ACTIVE" },
    }),
    prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { date: todayStr },
      _count: true,
    }),
    prisma.leaveRequest.count({
      where: { employee: { tenantId: session.tenantId! }, status: "PENDING" },
    }),
    prisma.payrollRun.findFirst({
      where: { tenantId: session.tenantId! },
      orderBy: { periodStart: "desc" },
      include: { _count: { select: { items: true } } },
    }),
    // Attendance trend: last 7 weekdays
    (async () => {
      const days: { date: string; present: number; late: number; absent: number }[] = [];
      let d = new Date(today);
      let count = 0;
      while (count < 7) {
        d.setDate(d.getDate() - 1);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        const dateStr = d.toISOString().split("T")[0];
        const records = await prisma.attendanceRecord.groupBy({
          by: ["status"],
          where: { date: dateStr },
          _count: true,
        });
        const counts: Record<string, number> = {};
        for (const r of records) counts[r.status] = r._count;
        days.unshift({
          date: dateStr,
          present: (counts["PRESENT"] ?? 0) + (counts["PRESENT_NO_CHECKOUT"] ?? 0),
          late: counts["LATE"] ?? 0,
          absent: counts["ABSENT"] ?? 0,
        });
        count++;
      }
      return days;
    })(),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of todayAttendance) statusCounts[row.status] = row._count;

  const present = (statusCounts["PRESENT"] ?? 0) + (statusCounts["LATE"] ?? 0) + (statusCounts["PRESENT_NO_CHECKOUT"] ?? 0);
  const late = statusCounts["LATE"] ?? 0;
  const absent = Math.max(0, totalEmployees - present - (statusCounts["LEAVE"] ?? 0) - (statusCounts["HOLIDAY"] ?? 0));

  return (
    <>
      <PageHeader
        title={`Selamat datang, ${session.name?.split(" ")[0] ?? "Admin"}`}
        description={today.toLocaleDateString("id-ID", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
        })}
      />
      <DashboardClient
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
