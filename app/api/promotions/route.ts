import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

/**
 * Domain error whose message is safe to surface to the client. Anything else
 * thrown inside the transaction (Prisma/Postgres internals) must NOT leak —
 * the 0A000 incident put a raw `prisma.$queryRaw` invocation error straight
 * into the admin dialog.
 */
class PromotionError extends Error {}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sourceClassSectionId = req.nextUrl.searchParams.get("sourceClassSectionId");
  if (!sourceClassSectionId) {
    return NextResponse.json({ error: "sourceClassSectionId wajib diisi" }, { status: 400 });
  }

  // Verify source class belongs to tenant
  const sourceSection = await prisma.classSection.findFirst({
    where: { id: sourceClassSectionId, tenantId: session.tenantId },
    select: { id: true, name: true, programId: true },
  });
  if (!sourceSection) {
    return NextResponse.json({ error: "Kelas asal tidak ditemukan" }, { status: 404 });
  }

  // Fetch all ACTIVE enrollments in source class with student data
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId: sourceClassSectionId,
      status: "ACTIVE",
      student: { tenantId: session.tenantId },
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          nickname: true,
          nis: true,
          dateOfBirth: true,
          gender: true,
          status: true,
        },
      },
    },
    orderBy: { student: { name: "asc" } },
  });

  const students = enrollments.map((e) => ({
    enrollmentId: e.id,
    ...e.student,
  }));

  return NextResponse.json({
    sourceClass: sourceSection,
    students,
  });
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`bulk-promote:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sourceClassSectionId, targetClassSectionId, excludeStudentIds } = await req.json();

  if (!sourceClassSectionId || !targetClassSectionId) {
    return NextResponse.json(
      { error: "Kelas asal dan kelas tujuan wajib dipilih" },
      { status: 400 }
    );
  }

  // Verify source class belongs to tenant
  const sourceSection = await prisma.classSection.findFirst({
    where: { id: sourceClassSectionId, tenantId: session.tenantId },
  });
  if (!sourceSection) {
    return NextResponse.json({ error: "Kelas asal tidak ditemukan" }, { status: 404 });
  }

  // Verify target class belongs to tenant. Capacity itself is re-checked and
  // row-locked inside the transaction below.
  const targetExists = await prisma.classSection.findFirst({
    where: { id: targetClassSectionId, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!targetExists) {
    return NextResponse.json({ error: "Kelas tujuan tidak ditemukan" }, { status: 404 });
  }

  // Fetch all ACTIVE enrollments in source class
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId: sourceClassSectionId,
      status: "ACTIVE",
      student: { tenantId: session.tenantId },
    },
  });

  // Filter out excluded students
  const excluded = new Set<string>(excludeStudentIds || []);
  const toPromote = enrollments.filter((e) => !excluded.has(e.studentId));
  const skipped = enrollments.length - toPromote.length;

  const today = getTodayInTimezone("Asia/Jakarta");

  // Transaction: lock target section, re-check capacity, graduate old
  // enrollments, upsert new ones. The row lock on ClassSection prevents two
  // concurrent bulk promotes from both seeing the same active count and
  // overflowing. The active count is a correlated subquery, NOT a GROUP BY —
  // Postgres rejects `FOR UPDATE` combined with `GROUP BY` (0A000), which
  // made this endpoint fail on every call until the 2026-06-12 cycle wired
  // the first UI to it. The subquery runs under the acquired lock, so the
  // race-safety is unchanged.
  try {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string; capacity: number; active_count: number }>
    >`
      SELECT cs.id, cs.capacity,
        (SELECT COUNT(*)::int FROM "StudentEnrollment" se
          WHERE se."classSectionId" = cs.id AND se.status = 'ACTIVE') AS active_count
      FROM "ClassSection" cs
      WHERE cs.id = ${targetClassSectionId}
      FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new PromotionError("Kelas tujuan tidak ditemukan");
    }
    const capacity = rows[0].capacity;
    const currentActive = Number(rows[0].active_count);
    const needed = currentActive + toPromote.length;
    if (needed > capacity) {
      throw new PromotionError(
        `Kapasitas kelas tujuan tidak cukup. Tersedia: ${capacity - currentActive}, dibutuhkan: ${toPromote.length}`,
      );
    }

    // Mark all old enrollments as GRADUATED
    await tx.studentEnrollment.updateMany({
      where: {
        id: { in: toPromote.map((e) => e.id) },
      },
      data: { status: "GRADUATED" },
    });

    // Upsert new ACTIVE enrollments
    for (const e of toPromote) {
      await tx.studentEnrollment.upsert({
        where: { studentId_classSectionId: { studentId: e.studentId, classSectionId: targetClassSectionId } },
        create: {
          studentId: e.studentId,
          classSectionId: targetClassSectionId,
          enrollDate: today,
          status: "ACTIVE",
        },
        update: {
          status: "ACTIVE",
          enrollDate: today,
        },
      });
    }
  });
  } catch (err) {
    if (err instanceof PromotionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[promotions POST] transaction failed:", err);
    return NextResponse.json(
      { error: "Gagal memproses naik kelas. Coba lagi." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    promoted: toPromote.length,
    skipped,
  });
}
