import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api/validate";
import { markAttendanceSchema } from "@/lib/validations/student-attendance";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

// Mark attendance for multiple students at once (teacher submits class attendance)
export async function POST(req: NextRequest) {
  const { success } = rateLimit(`mark-attendance:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isTeacher = session.role === "TEACHER";
  const isAdmin = isAdminRole(session.role);
  if (!isTeacher && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // `checkedInBy` is a non-null FK to Employee — both teachers and admins
  // writing here must have an employeeId.
  if (!session.employeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await validateBody(markAttendanceSchema, await req.json());
  if (result.error) return result.error;
  const { classSectionId, date, records } = result.data;

  // Jakarta TZ — UTC split returned yesterday between 00:00–06:59 WIB
  // and caused false 400s for early-morning teacher attendance marking.
  const today = getTodayInTimezone("Asia/Jakarta");
  if (date > today) {
    return NextResponse.json({ error: "Tidak bisa mencatat kehadiran untuk tanggal yang akan datang" }, { status: 400 });
  }

  // Verify teacher is assigned to this class (tenant-scoped via classSection).
  // Admins bypass this check but still need the class to belong to their tenant.
  if (isTeacher) {
    const assignment = await prisma.teachingAssignment.findFirst({
      where: {
        employeeId: session.employeeId!,
        classSectionId,
        classSection: { tenantId: session.tenantId },
      },
    });
    if (!assignment) {
      return NextResponse.json({ error: "Anda tidak ditugaskan di kelas ini" }, { status: 403 });
    }
  } else {
    const classSection = await prisma.classSection.findFirst({
      where: { id: classSectionId, tenantId: session.tenantId },
      select: { id: true },
    });
    if (!classSection) {
      return NextResponse.json({ error: "Kelas tidak ditemukan" }, { status: 404 });
    }
  }

  let saved = 0;
  await prisma.$transaction(async (tx) => {
    // Validate all students are enrolled in this class
    const studentIds = records.map((r: { studentId: string }) => r.studentId);
    const activeEnrollments = await tx.studentEnrollment.findMany({
      where: {
        studentId: { in: studentIds },
        classSectionId,
        status: "ACTIVE",
      },
      select: { studentId: true },
    });
    const enrolledIds = new Set(activeEnrollments.map((e) => e.studentId));
    const notEnrolled = studentIds.filter((id: string) => !enrolledIds.has(id));
    if (notEnrolled.length > 0) {
      throw new Error(`Siswa tidak terdaftar di kelas ini: ${notEnrolled.join(", ")}`);
    }

    // If this class has exactly one ClassSession for this date (the common
    // single-shift case — KB/TKIT/PopUp), write into that session's row so
    // this legacy tab and the session-based "Sesi Hari Ini" card can never
    // both create a row for the same student/day (was silently double-
    // counting in the admin monthly recap, which groups by status without
    // deduping by date — see docs/cycles/2026-07-12-pilot-readiness-audit.md
    // T2). Multi-shift days (DCARE MORNING+AFTERNOON) have >1 session and
    // fall back to the pre-existing sessionId:null path unchanged — Task 7
    // still owns fully resolving that case.
    const daySessions = await tx.classSession.findMany({
      where: { classSectionId, date },
      select: { id: true },
    });
    const singleSessionId = daySessions.length === 1 ? daySessions[0].id : null;

    for (const record of records) {
      if (singleSessionId) {
        await tx.studentAttendance.upsert({
          where: {
            studentId_sessionId: { studentId: record.studentId, sessionId: singleSessionId },
          },
          create: {
            studentId: record.studentId,
            classSectionId,
            sessionId: singleSessionId,
            date,
            status: record.status,
            checkInTime: record.checkInTime ? new Date(record.checkInTime) : null,
            checkOutTime: record.checkOutTime ? new Date(record.checkOutTime) : null,
            notes: record.notes ?? null,
            checkedInBy: session.employeeId!,
          },
          update: {
            status: record.status,
            checkInTime: record.checkInTime ? new Date(record.checkInTime) : undefined,
            checkOutTime: record.checkOutTime ? new Date(record.checkOutTime) : undefined,
            notes: record.notes ?? undefined,
            checkedInBy: session.employeeId!,
          },
        });
        saved++;
        continue;
      }

      // The legacy @@unique([studentId, date]) was dropped (cycle
      // 2026-05-15 academic-hierarchy-refactor) to allow DCARE multi-shift
      // attendance; uniqueness moved to (studentId, sessionId). This
      // session-agnostic path still keeps one row per student/date
      // (sessionId stays NULL here), so find-then-update/create on
      // [studentId, date] preserves the prior upsert behavior. Task 7
      // reworks this path onto ClassSession.
      const existing = await tx.studentAttendance.findFirst({
        where: { studentId: record.studentId, date, sessionId: null },
        select: { id: true },
      });
      if (existing) {
        await tx.studentAttendance.update({
          where: { id: existing.id },
          data: {
            status: record.status,
            checkInTime: record.checkInTime ? new Date(record.checkInTime) : undefined,
            checkOutTime: record.checkOutTime ? new Date(record.checkOutTime) : undefined,
            notes: record.notes ?? undefined,
            checkedInBy: session.employeeId!,
          },
        });
      } else {
        await tx.studentAttendance.create({
          data: {
            studentId: record.studentId,
            classSectionId,
            date,
            status: record.status,
            checkInTime: record.checkInTime ? new Date(record.checkInTime) : null,
            checkOutTime: record.checkOutTime ? new Date(record.checkOutTime) : null,
            notes: record.notes ?? null,
            checkedInBy: session.employeeId!,
          },
        });
      }
      saved++;
    }
  });

  return NextResponse.json({ saved, total: records.length });
}
