import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/student-journal/guards";
import { weekStart, weekDates } from "@/lib/student-journal/week";

/**
 * GET /api/student-journal/admin/class-roll-up?classSectionId=&weekStart=
 *
 * Returns per-student weekly completion for a class:
 * { data: { weekStart, dates, students: [{ studentId, name, checkedCount, totalCells }] } }
 *
 * totalCells = activeSchoolIndicatorCount * 5
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { searchParams } = req.nextUrl;
  const classSectionId = searchParams.get("classSectionId");
  const weekStartParam = searchParams.get("weekStart");

  if (!classSectionId) {
    return NextResponse.json(
      { error: "classSectionId query param is required" },
      { status: 400 },
    );
  }

  // Verify class belongs to tenant
  const classSection = await prisma.classSection.findFirst({
    where: { id: classSectionId, tenantId: session.tenantId },
    select: { id: true },
  });

  if (!classSection) {
    return NextResponse.json({ error: "Kelas tidak ditemukan" }, { status: 404 });
  }

  let ws: string;
  if (weekStartParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)) {
      return NextResponse.json(
        { error: "weekStart harus format YYYY-MM-DD" },
        { status: 400 },
      );
    }
    ws = weekStartParam;
  } else {
    const today = new Date().toISOString().slice(0, 10);
    ws = weekStart(today);
  }

  const dates = weekDates(ws);
  const weekEnd = dates[dates.length - 1];

  // Count active SCHOOL indicators for this tenant
  const template = await prisma.studentJournalTemplate.findUnique({
    where: { tenantId: session.tenantId },
    select: { id: true },
  });

  let activeIndicatorCount = 0;
  if (template) {
    activeIndicatorCount = await prisma.studentJournalIndicator.count({
      where: {
        category: {
          templateId: template.id,
          scope: "SCHOOL",
          status: "ACTIVE",
        },
        status: "ACTIVE",
      },
    });
  }

  const totalCells = activeIndicatorCount * 5;

  // Fetch active enrollments
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { classSectionId, status: "ACTIVE" },
    include: {
      student: { select: { id: true, name: true } },
    },
    orderBy: { student: { name: "asc" } },
  });

  if (enrollments.length === 0) {
    return NextResponse.json({
      data: { weekStart: ws, dates, students: [] },
    });
  }

  const studentIds = enrollments.map((e) => e.student.id);

  // Count checked entries per student for this week
  const checkedCounts = await prisma.studentJournalEntry.groupBy({
    by: ["studentId"],
    where: {
      tenantId: session.tenantId,
      classSectionId,
      studentId: { in: studentIds },
      scope: "SCHOOL",
      date: { gte: ws, lte: weekEnd },
      checked: true,
    },
    _count: { id: true },
  });

  const checkedMap = new Map<string, number>(
    checkedCounts.map((r) => [r.studentId, r._count.id]),
  );

  const students = enrollments.map((e) => ({
    studentId: e.student.id,
    name: e.student.name,
    checkedCount: checkedMap.get(e.student.id) ?? 0,
    totalCells,
  }));

  return NextResponse.json({ data: { weekStart: ws, dates, students } });
}
