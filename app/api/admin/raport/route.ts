import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { resolveTerm } from "./_helpers";

/**
 * GET /api/admin/raport?termId=&classSectionId=
 *
 * Roster for one class + term with each student's raport status
 * (NONE | DRAFT | PUBLISHED). Gated by `reportCard.read`. Tenant-scoped.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission("reportCard.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const termId = searchParams.get("termId");
  const classSectionId = searchParams.get("classSectionId");
  if (!termId || !classSectionId) {
    return NextResponse.json(
      { error: "Parameter termId dan classSectionId wajib diisi." },
      { status: 400 },
    );
  }

  const term = await resolveTerm(session.tenantId, termId);
  if (!term) {
    return NextResponse.json({ error: "Triwulan tidak ditemukan." }, { status: 404 });
  }

  const classSection = await prisma.classSection.findFirst({
    where: { id: classSectionId, tenantId: session.tenantId },
    select: { id: true, name: true, program: { select: { name: true } } },
  });
  if (!classSection) {
    return NextResponse.json({ error: "Kelas tidak ditemukan." }, { status: 404 });
  }

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId,
      status: "ACTIVE",
      student: { tenantId: session.tenantId },
    },
    select: { student: { select: { id: true, name: true, nickname: true } } },
    orderBy: { student: { name: "asc" } },
  });
  const students = enrollments.map((e) => e.student);

  const entries = students.length
    ? await prisma.reportCardEntry.findMany({
        where: {
          tenantId: session.tenantId,
          termId,
          deletedAt: null,
          studentId: { in: students.map((s) => s.id) },
        },
        select: { studentId: true, status: true },
      })
    : [];
  const statusByStudent = new Map(entries.map((e) => [e.studentId, e.status]));

  const roster = students.map((s) => ({
    studentId: s.id,
    name: s.name,
    nickname: s.nickname,
    status: statusByStudent.get(s.id) ?? "NONE",
  }));

  return NextResponse.json({
    data: {
      term: {
        id: term.id,
        number: term.number,
        semesterNumber: term.semester.number,
        academicYear: term.semester.academicYear.name,
      },
      classSection: { id: classSection.id, name: classSection.name, program: classSection.program.name },
      roster,
    },
  });
}
