import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { studentAssessmentSaveSchema } from "@/lib/validations/assessment-template";

// Save assessment scores
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (session.role !== "TEACHER" && !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 30 writes/min per user — generous for 1.2s-debounced autosave.
  const rl = rateLimit(`assessment-save:${session.id}`, 30, 60_000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan. Coba lagi sebentar." },
      { status: 429 },
    );
  }

  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = studentAssessmentSaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Data tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const assessment = await prisma.studentAssessment.findFirst({
    where: { id, student: { tenantId: session.tenantId } },
    include: {
      template: { select: { programId: true } },
      student: {
        select: {
          enrollments: {
            where: { status: "ACTIVE" },
            select: { classSectionId: true },
          },
        },
      },
    },
  });
  if (!assessment) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  // Teacher authz: must be assigned to a class the student is actively enrolled
  // in AND whose program matches the template. Program-level authz alone (the
  // staging default before this change) allowed any teacher of the program to
  // score any student — this tightens to the specific class.
  if (session.role === "TEACHER") {
    if (!session.employeeId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const enrolledClassIds = assessment.student.enrollments.map((e) => e.classSectionId);
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
          programId: assessment.template.programId,
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

  const { scores, publish, status } = parsed.data;
  // `publish: true` wins; otherwise honour explicit `status` (legacy admin UI).
  const newStatus = publish ? "PUBLISHED" : status;

  // Serializable isolation — autosave debounces at 1.2s but concurrent tabs
  // (or an autosave + explicit Save) can interleave deleteMany + createMany,
  // producing a transient empty-scores window where a reader sees 0 rows.
  // Serializable lets Postgres abort the loser on conflict (SQLSTATE 40001).
  // Prisma surfaces that as P2034; we return 409 so the autosave client
  // retries on the next keystroke rather than showing a 500 error toast.
  try {
    await prisma.$transaction(
      async (tx) => {
        if (scores?.length) {
          await tx.studentAssessmentScore.deleteMany({ where: { assessmentId: id } });
          await tx.studentAssessmentScore.createMany({
            data: scores.map((s) => ({
              assessmentId: id,
              indicatorId: s.indicatorId,
              score: s.score,
              notes: s.notes ?? null,
            })),
          });
        }

        if (newStatus) {
          await tx.studentAssessment.update({
            where: { id },
            data: {
              status: newStatus,
              publishedAt: newStatus === "PUBLISHED" ? new Date() : undefined,
            },
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2034") {
      return NextResponse.json(
        { error: "Konflik penyimpanan, coba lagi." },
        { status: 409 },
      );
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}

// Get assessment detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json(null, { status: 401 });

  const { id } = await params;

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
