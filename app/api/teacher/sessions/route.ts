import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

/**
 * GET /api/teacher/sessions?date=YYYY-MM-DD
 *
 * Lists the ClassSession rows the caller teaches on a given date (default:
 * today, Jakarta-tz). The `teacherId === employeeId` filter naturally
 * includes substitute-day assignments — Task 6's swap writes the effective
 * teacher onto `ClassSession.teacherId`, so a sub sees the day they cover.
 *
 * Tenancy is indirect (ClassSession has no tenantId) — scoped through
 * `classSection: { tenantId }`. Auth mirrors the legacy mark route:
 * TEACHER or admin, both needing an employeeId. Because the filter is keyed
 * on `teacherId === employeeId`, an admin only sees sessions where they are
 * personally the teacher — which is the intended behaviour here.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isTeacher = session.role === "TEACHER";
  const isAdmin = isAdminRole(session.role);
  if (!isTeacher && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!session.employeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : getTodayInTimezone("Asia/Jakarta");

  const sessions = await prisma.classSession.findMany({
    where: {
      date,
      teacherId: session.employeeId,
      classSection: { tenantId: session.tenantId },
    },
    select: {
      id: true,
      date: true,
      slot: true,
      classSection: {
        select: {
          id: true,
          name: true,
          // Lightweight roster count — ACTIVE enrollments only.
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      },
    },
    orderBy: { slot: "asc" },
  });

  return NextResponse.json(
    sessions.map((s) => ({
      id: s.id,
      date: s.date,
      slot: s.slot,
      classSection: { id: s.classSection.id, name: s.classSection.name },
      rosterCount: s.classSection._count.enrollments,
    })),
  );
}
