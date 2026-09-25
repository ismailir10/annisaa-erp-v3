import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { hasPermission } from "@/lib/permissions";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import type { WeeklyTrend } from "@/components/admin/dashboard";

/**
 * 7-weekday employee attendance trend (present/late/absent counts), same
 * shape and query the admin dashboard used to compute inline before the
 * DMMT overhaul moved `<AttendanceTrendChart>` onto the employee-attendance
 * page. Gated the same way the dashboard gated it: `hr.view` AND
 * `attendance.view` — a role missing either never saw this data before.
 */
export async function GET() {
  const auth = await requirePermission("attendance.view");
  if ("error" in auth) return auth.error;
  if (!hasPermission(auth.session, "hr.view")) {
    return NextResponse.json({ error: "forbidden", missing: "hr.view" }, { status: 403 });
  }
  const { session } = auth;
  const tenantId = session.tenantId;

  const today = getTodayInTimezone("Asia/Jakarta");
  const dates: string[] = [];
  const cursor = new Date(`${today}T12:00:00Z`);
  while (dates.length < 7) {
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) dates.unshift(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const rows = await prisma.attendanceRecord.groupBy({
    by: ["date", "status"],
    where: { employee: { tenantId, status: "ACTIVE" }, date: { in: dates } },
    _count: true,
  });

  const value = (date: string, status: string) => rows.find(row => row.date === date && row.status === status)?._count ?? 0;
  const trend: WeeklyTrend[] = dates.map(date => ({
    date,
    present: value(date, "PRESENT") + value(date, "PRESENT_NO_CHECKOUT"),
    late: value(date, "LATE"),
    absent: value(date, "ABSENT"),
  }));

  return NextResponse.json(trend);
}
