import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

// Create or get student assessment
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (session.role !== "TEACHER" && !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = rateLimit(`assessment-create:${session.id}`, 30, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }

  const { studentId, templateId, period } = await req.json();
  if (!studentId || !templateId || !period) {
    return NextResponse.json(
      { error: "studentId, templateId, period wajib diisi" },
      { status: 400 },
    );
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
    include: {
      enrollments: {
        where: { status: "ACTIVE" },
        select: { classSectionId: true },
      },
    },
  });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });

  const template = await prisma.assessmentTemplate.findFirst({
    where: { id: templateId, tenantId: session.tenantId },
    select: { id: true, programId: true, isActive: true },
  });
  if (!template) {
    return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 404 });
  }

  // Teacher authz: must be assigned to a class the student is enrolled in,
  // AND that class's program must match the template.
  if (session.role === "TEACHER") {
    if (!session.employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const enrolledClassIds = student.enrollments.map((e) => e.classSectionId);
    if (enrolledClassIds.length === 0) {
      return NextResponse.json(
        { error: "Anda tidak berwenang menilai kelas ini." },
        { status: 403 },
      );
    }
    const assignment = await prisma.teachingAssignment.findFirst({
      where: {
        employeeId: session.employeeId,
        classSectionId: { in: enrolledClassIds },
        classSection: {
          tenantId: session.tenantId,
          programId: template.programId,
          status: "ACTIVE",
        },
      },
      select: { id: true },
    });
    if (!assignment) {
      return NextResponse.json(
        { error: "Anda tidak berwenang menilai kelas ini." },
        { status: 403 },
      );
    }
  }

  let assessment = await prisma.studentAssessment.findUnique({
    where: { studentId_templateId_period: { studentId, templateId, period } },
  });

  if (!assessment) {
    assessment = await prisma.studentAssessment.create({
      data: {
        studentId,
        templateId,
        period,
        createdBy: session.id,
      },
    });
  }

  const full = await prisma.studentAssessment.findUnique({
    where: { id: assessment.id },
    include: {
      student: { select: { name: true, nickname: true } },
      template: {
        include: {
          categories: {
            orderBy: { sortOrder: "asc" },
            include: { indicators: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
      scores: true,
    },
  });

  return NextResponse.json(full);
}
