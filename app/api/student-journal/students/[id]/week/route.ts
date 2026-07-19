import { NextRequest, NextResponse } from "next/server";
import { JournalStatus } from "@/lib/generated/prisma/enums";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { weekStart, weekDates } from "@/lib/student-journal/week";
import { resolveLastAdminEditByEntryId } from "@/lib/student-journal/audit";
import { enrichNotesWithAuthorMetadata } from "@/lib/student-journal/note-metadata";
import {
  JOURNAL_FORBIDDEN_MSG,
  JOURNAL_NOT_ENROLLED_MSG,
} from "@/lib/student-journal/messages";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

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
    return NextResponse.json({ error: JOURNAL_FORBIDDEN_MSG }, { status: 403 });
  }

  // 3. Require tenantId + employeeId
  if (!session.tenantId || !session.employeeId) {
    return NextResponse.json({ error: JOURNAL_FORBIDDEN_MSG }, { status: 403 });
  }

  // 4. Look up ALL student's active enrollments. Grant if teacher is assigned
  //    to ANY of them — students with cross-program enrollments (e.g. day-care
  //    + school) can otherwise 403 when findFirst picks the wrong class.
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      studentId,
      status: "ACTIVE",
      classSection: { tenantId: session.tenantId },
    },
    select: { classSectionId: true },
  });
  if (enrollments.length === 0) {
    return NextResponse.json({ error: JOURNAL_NOT_ENROLLED_MSG }, { status: 404 });
  }

  // 5. Verify teacher is assigned to one of the student's classes
  const assignment = await prisma.teachingAssignment.findFirst({
    where: {
      employeeId: session.employeeId,
      classSectionId: { in: enrollments.map((e) => e.classSectionId) },
      classSection: { tenantId: session.tenantId },
    },
  });
  if (!assignment) {
    return NextResponse.json({ error: JOURNAL_FORBIDDEN_MSG }, { status: 403 });
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
    const today = getTodayInTimezone("Asia/Jakarta");
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
      where: { templateId: tmpl.id, scope: "SCHOOL", status: JournalStatus.ACTIVE },
      include: {
        indicators: {
          where: { status: JournalStatus.ACTIVE },
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
        status: JournalStatus.ACTIVE,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        date: true,
        authorRole: true,
        authorUserId: true,
        body: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const lastEditByEntryId = await resolveLastAdminEditByEntryId(
    session.tenantId,
    entries.map((e) => e.id),
  );
  const entriesWithAudit = entries.map((e) => ({
    ...e,
    lastAdminEdit: lastEditByEntryId.get(e.id) ?? null,
  }));

  const notesWithAuthor = await enrichNotesWithAuthorMetadata(session.tenantId, notes);

  return NextResponse.json({
    data: {
      weekStart: ws,
      dates,
      categories,
      entries: entriesWithAudit,
      notes: notesWithAuthor,
    },
  });
}
