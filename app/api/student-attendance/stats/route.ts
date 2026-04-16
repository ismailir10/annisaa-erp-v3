import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth";

/**
 * GET /api/student-attendance/stats?dateFrom=&dateTo=
 *
 * Returns today's attendance counts grouped by status.
 * Admin-only — replaces 4 parallel list API calls on the admin page.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get("dateFrom") ?? new Date().toISOString().split("T")[0];
  const dateTo = searchParams.get("dateTo") ?? dateFrom;

  // Get tenant-scoped class section IDs
  const tenantClassIds = await prisma.classSection.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true },
  });
  const classIds = tenantClassIds.map((c) => c.id);
  if (classIds.length === 0) {
    return NextResponse.json({ present: 0, absent: 0, sick: 0, permission: 0 });
  }

  const stats = await prisma.studentAttendance.groupBy({
    by: ["status"],
    where: {
      isVoided: false,
      classSectionId: { in: classIds },
      date: { gte: dateFrom, lte: dateTo },
    },
    _count: { status: true },
  });

  const result = { present: 0, absent: 0, sick: 0, permission: 0 };
  for (const row of stats) {
    const key = row.status.toLowerCase() as keyof typeof result;
    if (key in result) {
      result[key] = row._count.status;
    }
  }

  return NextResponse.json(result);
}
