import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/student-journal/guards";
import { weekStart, weekDates } from "@/lib/student-journal/week";

/**
 * GET /api/student-journal/admin/classes?weekStart=
 *
 * Returns all active classes for the tenant with a weekly completion summary:
 * - classSectionId, className, programName
 * - studentCount: active enrollments
 * - completionPct: (checkedCount / (studentCount * indicatorCount * 5)) * 100
 * - lastFilledAt: MAX(updatedAt) for entries in that class-week scope
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const { session } = guard;

  const { searchParams } = req.nextUrl;
  const weekStartParam = searchParams.get("weekStart");

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

  // Fetch tenant template to count active SCHOOL indicators
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

  // Fetch all active class sections for the tenant
  const classSections = await prisma.classSection.findMany({
    where: {
      tenantId: session.tenantId,
      status: "ACTIVE",
    },
    include: {
      program: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });

  if (classSections.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const classSectionIds = classSections.map((c) => c.id);

  // Count active enrollments per class
  const enrollmentCounts = await prisma.studentEnrollment.groupBy({
    by: ["classSectionId"],
    where: {
      classSectionId: { in: classSectionIds },
      status: "ACTIVE",
    },
    _count: { studentId: true },
  });

  const enrollmentMap = new Map<string, number>(
    enrollmentCounts.map((e) => [e.classSectionId, e._count.studentId]),
  );

  // Count checked entries per class for the week
  const checkedCounts = await prisma.studentJournalEntry.groupBy({
    by: ["classSectionId"],
    where: {
      tenantId: session.tenantId,
      classSectionId: { in: classSectionIds },
      scope: "SCHOOL",
      date: { gte: ws, lte: weekEnd },
      checked: true,
    },
    _count: { id: true },
  });

  const checkedMap = new Map<string, number>(
    checkedCounts
      .filter((e): e is typeof e & { classSectionId: string } => e.classSectionId !== null)
      .map((e) => [e.classSectionId, e._count.id]),
  );

  // Get last filled timestamp per class
  const lastFilledRows = await prisma.studentJournalEntry.groupBy({
    by: ["classSectionId"],
    where: {
      tenantId: session.tenantId,
      classSectionId: { in: classSectionIds },
      scope: "SCHOOL",
      date: { gte: ws, lte: weekEnd },
    },
    _max: { updatedAt: true },
  });

  const lastFilledMap = new Map<string, Date | null>(
    lastFilledRows
      .filter((e): e is typeof e & { classSectionId: string } => e.classSectionId !== null)
      .map((e) => [e.classSectionId, e._max.updatedAt ?? null]),
  );

  const data = classSections.map((cs) => {
    const studentCount = enrollmentMap.get(cs.id) ?? 0;
    const checkedCount = checkedMap.get(cs.id) ?? 0;
    const denominator = studentCount * activeIndicatorCount * 5;
    const completionPct =
      denominator > 0 ? Math.round((checkedCount / denominator) * 100) : 0;
    const lastFilledAt = lastFilledMap.get(cs.id) ?? null;

    return {
      classSectionId: cs.id,
      className: cs.name,
      programName: cs.program.name,
      studentCount,
      completionPct,
      lastFilledAt: lastFilledAt ? lastFilledAt.toISOString() : null,
    };
  });

  return NextResponse.json({ data });
}
