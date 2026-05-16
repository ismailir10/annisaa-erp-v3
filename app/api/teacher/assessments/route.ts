import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { getCurrentPeriodFromDb } from "@/lib/academic-period-db";

/**
 * GET /api/teacher/assessments
 *
 * Returns, for each class the caller teaches (or every active class in the
 * tenant if the caller is an admin previewing), the list of AssessmentTemplates
 * available to that class's program along with counts of StudentAssessment
 * rows for the current academic period grouped by status.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.tenantId) return NextResponse.json({ error: "Tenant missing" }, { status: 403 });

  const isTeacher = session.role === "TEACHER";
  const isAdmin = isAdminRole(session.role);
  if (!isTeacher && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period = await getCurrentPeriodFromDb(session.tenantId);

  // 1. Gather the set of class sections we're reporting on.
  type ClassSectionLite = {
    id: string;
    name: string;
    program: { id: string; name: string };
  };

  let classSections: ClassSectionLite[] = [];

  if (isTeacher) {
    if (!session.employeeId) {
      return NextResponse.json({ period, classes: [] });
    }
    const assignments = await prisma.teachingAssignment.findMany({
      where: {
        employeeId: session.employeeId,
        classSection: { tenantId: session.tenantId, status: "ACTIVE" },
      },
      select: {
        classSection: {
          select: {
            id: true,
            name: true,
            program: { select: { id: true, name: true } },
          },
        },
      },
    });
    // De-dup by classSection.id in case of multiple TeachingAssignment rows per class.
    const seen = new Set<string>();
    for (const a of assignments) {
      if (!seen.has(a.classSection.id)) {
        seen.add(a.classSection.id);
        classSections.push(a.classSection);
      }
    }
  } else {
    // Admin preview path — all active classes in tenant.
    classSections = await prisma.classSection.findMany({
      where: { tenantId: session.tenantId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        program: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });
  }

  if (classSections.length === 0) {
    return NextResponse.json({ period, classes: [] });
  }

  // 2. Fetch all relevant templates in one query.
  const programIds = Array.from(new Set(classSections.map((c) => c.program.id)));
  const templates = await prisma.assessmentTemplate.findMany({
    where: {
      tenantId: session.tenantId,
      programId: { in: programIds },
      isActive: true,
    },
    select: { id: true, name: true, type: true, programId: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
  const templatesByProgram = new Map<string, typeof templates>();
  for (const t of templates) {
    const arr = templatesByProgram.get(t.programId) ?? [];
    arr.push(t);
    templatesByProgram.set(t.programId, arr);
  }

  // 3. Fetch active enrollments + existing assessments for this period in two queries.
  const classSectionIds = classSections.map((c) => c.id);
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId: { in: classSectionIds },
      status: "ACTIVE",
      student: { tenantId: session.tenantId },
    },
    select: { studentId: true, classSectionId: true },
  });
  const studentsByClass = new Map<string, Set<string>>();
  const studentIds = new Set<string>();
  for (const e of enrollments) {
    if (!studentsByClass.has(e.classSectionId)) {
      studentsByClass.set(e.classSectionId, new Set());
    }
    studentsByClass.get(e.classSectionId)!.add(e.studentId);
    studentIds.add(e.studentId);
  }

  const templateIds = templates.map((t) => t.id);
  const assessments = studentIds.size && templateIds.length
    ? await prisma.studentAssessment.findMany({
        where: {
          templateId: { in: templateIds },
          period,
          studentId: { in: Array.from(studentIds) },
        },
        select: { studentId: true, templateId: true, status: true },
      })
    : [];

  // Build (classId|templateId) -> { draft, published } counts.
  const enrollmentByStudent = new Map<string, string>();
  for (const e of enrollments) enrollmentByStudent.set(e.studentId, e.classSectionId);

  const counts = new Map<string, { draft: number; published: number }>();
  for (const a of assessments) {
    const classId = enrollmentByStudent.get(a.studentId);
    if (!classId) continue;
    const key = `${classId}|${a.templateId}`;
    const bucket = counts.get(key) ?? { draft: 0, published: 0 };
    if (a.status === "PUBLISHED") bucket.published += 1;
    else bucket.draft += 1;
    counts.set(key, bucket);
  }

  // 4. Assemble response.
  const classes = classSections.map((cs) => {
    const studentsTotal = studentsByClass.get(cs.id)?.size ?? 0;
    const tmpls = templatesByProgram.get(cs.program.id) ?? [];
    return {
      classSection: { id: cs.id, name: cs.name, program: cs.program },
      templates: tmpls.map((t) => {
        const c = counts.get(`${cs.id}|${t.id}`) ?? { draft: 0, published: 0 };
        const studentsDraft = c.draft;
        const studentsPublished = c.published;
        const studentsPending = Math.max(0, studentsTotal - studentsDraft - studentsPublished);
        return {
          template: { id: t.id, name: t.name, type: t.type },
          studentsTotal,
          studentsDraft,
          studentsPublished,
          studentsPending,
        };
      }),
    };
  });

  return NextResponse.json({ period, classes });
}
