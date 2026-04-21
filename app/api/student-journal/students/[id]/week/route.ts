import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { weekStart, weekDates } from "@/lib/student-journal/week";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await params;

  // 1. Auth
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Role check — teacher only (parent uses /children/[id]/week)
  if (session.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Require tenantId + employeeId
  if (!session.tenantId || !session.employeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Look up student's active enrollment to get classSectionId
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: "ACTIVE" },
    select: { classSectionId: true },
  });
  if (!enrollment) {
    return NextResponse.json({ error: "Student not enrolled" }, { status: 404 });
  }

  // 5. Verify teacher is assigned to that class (and it belongs to their tenant)
  const assignment = await prisma.teachingAssignment.findFirst({
    where: {
      employeeId: session.employeeId,
      classSectionId: enrollment.classSectionId,
      classSection: { tenantId: session.tenantId },
    },
  });
  if (!assignment) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 6. Resolve weekStart param
  const { searchParams } = new URL(req.url);
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

  // 7. Compute week date range
  const dates = weekDates(ws);
  const dateEnd = dates[dates.length - 1];

  // 8. Fetch tenant template
  const tmpl = await prisma.studentJournalTemplate.findUnique({
    where: { tenantId: session.tenantId },
    select: { id: true },
  });

  if (!tmpl) {
    return NextResponse.json({
      data: { weekStart: ws, dates, categories: [], entries: [], notes: [] },
    });
  }

  // 9. Parallel fetch: SCHOOL categories + entries + notes
  const [categories, entries, notes] = await Promise.all([
    prisma.studentJournalCategory.findMany({
      where: { templateId: tmpl.id, scope: "SCHOOL", status: "ACTIVE" },
      include: {
        indicators: {
          where: { status: "ACTIVE" },
          orderBy: { order: "asc" },
        },
      },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.studentJournalEntry.findMany({
      where: {
        tenantId: session.tenantId,
        studentId,
        scope: "SCHOOL",
        date: { gte: ws, lte: dateEnd },
      },
      select: {
        id: true,
        indicatorId: true,
        date: true,
        checked: true,
        scope: true,
      },
    }),
    prisma.studentJournalNote.findMany({
      where: {
        tenantId: session.tenantId,
        studentId,
        date: { gte: ws, lte: dateEnd },
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        date: true,
        authorRole: true,
        body: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    data: { weekStart: ws, dates, categories, entries, notes },
  });
}
