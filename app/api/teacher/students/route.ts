import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTeacherForClass } from "@/lib/student-journal/guards";

/**
 * GET /api/teacher/students?classId=<classSectionId>
 *
 * Returns the active enrolled roster for a class the caller teaches.
 * Authorization: TEACHER must be assigned to the class (enforced via
 * `requireTeacherForClass`, which also checks `classSection.tenantId`
 * against `session.tenantId`).
 *
 * Added in 2026-04-24 critical-money-and-auth-hotfix cycle — replaces the
 * unsafe teacher access path that previously went through `/api/students`.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const classId = searchParams.get("classId");

  if (!classId) {
    return NextResponse.json({ error: "classId is required" }, { status: 400 });
  }

  const guard = await requireTeacherForClass(classId);
  if (guard.error) return guard.error;

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId: classId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      student: {
        select: {
          id: true,
          name: true,
          nickname: true,
          gender: true,
          dateOfBirth: true,
          status: true,
        },
      },
    },
    orderBy: { student: { name: "asc" } },
  });

  return NextResponse.json({
    data: enrollments.map((e) => ({ enrollmentId: e.id, ...e.student })),
  });
}
