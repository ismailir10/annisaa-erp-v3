import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

// Save assessment scores
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Only TEACHER or SCHOOL_ADMIN can save scores
  if (session.role !== "TEACHER" && !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Verify assessment belongs to tenant via student
  const assessment = await prisma.studentAssessment.findFirst({
    where: { id, student: { tenantId: session.tenantId } },
    include: { template: { select: { programId: true } } },
  });
  if (!assessment) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  // Teacher authorization: verify teacher is assigned to a class section
  // whose program matches the assessment template's program
  if (session.role === "TEACHER" && session.employeeId) {
    const assignment = await prisma.teachingAssignment.findFirst({
      where: {
        employeeId: session.employeeId,
        classSection: {
          programId: assessment.template.programId,
          tenantId: session.tenantId,
        },
      },
    });
    if (!assignment) {
      return NextResponse.json({ error: "Anda tidak berwenang menilai program ini" }, { status: 403 });
    }
  }

  const { scores, status } = await req.json();
  // scores: [{ indicatorId, score, notes }]

  // Validate scores
  if (scores?.length) {
    for (const s of scores) {
      const scoreVal = Number(s.score);
      if (Number.isNaN(scoreVal) || scoreVal < 0) {
        return NextResponse.json({ error: `Nilai tidak valid untuk indikator ${s.indicatorId}: harus >= 0` }, { status: 400 });
      }
    }
  }

  // Atomic: save all scores + update status in a single transaction
  await prisma.$transaction(async (tx) => {
    if (scores?.length) {
      for (const s of scores) {
        await tx.studentAssessmentScore.upsert({
          where: { assessmentId_indicatorId: { assessmentId: id, indicatorId: s.indicatorId } },
          update: { score: s.score, notes: s.notes ?? null },
          create: { assessmentId: id, indicatorId: s.indicatorId, score: s.score, notes: s.notes ?? null },
        });
      }
    }

    if (status) {
      await tx.studentAssessment.update({
        where: { id },
        data: {
          status,
          publishedAt: status === "PUBLISHED" ? new Date() : undefined,
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}

// Get assessment detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json(null, { status: 401 });

  const { id } = await params;

  // Verify tenant ownership via student
  const assessment = await prisma.studentAssessment.findFirst({
    where: { id, student: { tenantId: session.tenantId } },
    include: {
      student: { select: { name: true, nickname: true } },
      template: {
        include: {
          program: { select: { name: true } },
          categories: {
            orderBy: { sortOrder: "asc" },
            include: { indicators: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
      scores: true,
    },
  });

  if (!assessment) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
  return NextResponse.json(assessment);
}
