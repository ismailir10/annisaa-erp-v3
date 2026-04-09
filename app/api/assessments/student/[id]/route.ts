import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Save assessment scores
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { scores, status } = await req.json();
  // scores: [{ indicatorId, score, notes }]

  if (scores?.length) {
    for (const s of scores) {
      await prisma.studentAssessmentScore.upsert({
        where: { assessmentId_indicatorId: { assessmentId: id, indicatorId: s.indicatorId } },
        update: { score: s.score, notes: s.notes ?? null },
        create: { assessmentId: id, indicatorId: s.indicatorId, score: s.score, notes: s.notes ?? null },
      });
    }
  }

  // Update status if provided
  if (status) {
    await prisma.studentAssessment.update({
      where: { id },
      data: {
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : undefined,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

// Get assessment detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json(null, { status: 401 });

  const { id } = await params;
  const assessment = await prisma.studentAssessment.findUnique({
    where: { id },
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

  return NextResponse.json(assessment);
}
