import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "GUARDIAN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const guardian = await prisma.parent.findFirst({
    where: session.parentId
      ? { id: session.parentId, tenantId: session.tenantId }
      : { email: session.email, tenantId: session.tenantId },
    select: { guardians: { select: { studentId: true } } },
  });

  if (!guardian) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const childIds = new Set(guardian.guardians.map((g) => g.studentId));

  const assessment = await prisma.studentAssessment.findUnique({
    where: { id },
    select: {
      id: true,
      period: true,
      status: true,
      studentId: true,
      template: {
        select: {
          name: true,
          tenantId: true,
          program: { select: { name: true } },
          categories: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              indicators: {
                orderBy: { sortOrder: "asc" },
                select: { id: true, description: true },
              },
            },
          },
        },
      },
      scores: { select: { indicatorId: true, score: true, notes: true } },
    },
  });

  if (
    !assessment ||
    !childIds.has(assessment.studentId) ||
    assessment.template.tenantId !== session.tenantId
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: assessment.id,
    period: assessment.period,
    status: assessment.status,
    templateName: assessment.template.name,
    programName: assessment.template.program.name,
    categories: assessment.template.categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      indicators: cat.indicators.map((ind) => ({ id: ind.id, description: ind.description })),
    })),
    scores: assessment.scores.map((s) => ({
      indicatorId: s.indicatorId,
      score: s.score,
      notes: s.notes,
    })),
  });
}
