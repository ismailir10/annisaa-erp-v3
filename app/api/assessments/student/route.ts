import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

// Create or get student assessment
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (session.role !== "TEACHER" && !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId, templateId, period } = await req.json();
  if (!studentId || !templateId || !period) {
    return NextResponse.json({ error: "studentId, templateId, period wajib diisi" }, { status: 400 });
  }

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId: session.tenantId } });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });

  // Find or create assessment
  let assessment = await prisma.studentAssessment.findUnique({
    where: { studentId_templateId_period: { studentId, templateId, period } },
  });

  if (!assessment) {
    assessment = await prisma.studentAssessment.create({
      data: {
        studentId,
        templateId,
        period,
        createdBy: session!.id,
      },
    });
  }

  // Get full assessment with scores
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
