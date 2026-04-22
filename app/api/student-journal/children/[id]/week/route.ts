import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireGuardianForStudent } from "@/lib/student-journal/guards";
import { weekStart, weekDates } from "@/lib/student-journal/week";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await params;

  const guard = await requireGuardianForStudent(studentId);
  if (guard.error) return guard.error;
  const { session } = guard;

  // Resolve weekStart param (default to current week)
  const { searchParams } = new URL(req.url);
  const weekStartParam = searchParams.get("weekStart");

  let ws: string;
  if (weekStartParam) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartParam)) {
      return NextResponse.json({ error: "weekStart harus format YYYY-MM-DD" }, { status: 400 });
    }
    ws = weekStartParam;
  } else {
    const today = new Date().toISOString().slice(0, 10);
    ws = weekStart(today);
  }

  const dates = weekDates(ws);
  const dateEnd = dates[dates.length - 1];

  // Fetch tenant template
  const tmpl = await prisma.studentJournalTemplate.findUnique({
    where: { tenantId: session.tenantId },
    select: { id: true },
  });

  if (!tmpl) {
    return NextResponse.json({
      data: {
        weekStart: ws,
        dates,
        schoolCategories: [],
        homeCategories: [],
        schoolEntries: [],
        homeEntries: [],
        notes: [],
      },
    });
  }

  // Fetch school and home categories with active indicators
  const [schoolCategories, homeCategories, schoolEntries, homeEntries, notes] =
    await Promise.all([
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
      prisma.studentJournalCategory.findMany({
        where: { templateId: tmpl.id, scope: "HOME", status: "ACTIVE" },
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
      prisma.studentJournalEntry.findMany({
        where: {
          tenantId: session.tenantId,
          studentId,
          scope: "HOME",
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
          authorUserId: true,
          body: true,
          createdAt: true,
        },
      }),
    ]);

  return NextResponse.json({
    data: {
      weekStart: ws,
      dates,
      schoolCategories,
      homeCategories,
      schoolEntries,
      homeEntries,
      notes,
    },
  });
}
