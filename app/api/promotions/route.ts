import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

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

  const today = new Date().toISOString().split("T")[0];

  // Transaction: lock target section, re-check capacity, graduate old
  // enrollments, upsert new ones. `SELECT … FOR UPDATE OF cs` on ClassSection
  // prevents two concurrent bulk promotes from both seeing the same
  // active count and overflowing.
  try {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ id: string; capacity: number; active_count: bigint }>
    >`
      SELECT cs.id, cs.capacity, COUNT(se.id)::int AS active_count
      FROM "ClassSection" cs
      LEFT JOIN "StudentEnrollment" se
        ON se."classSectionId" = cs.id AND se.status = 'ACTIVE'
      WHERE cs.id = ${targetClassSectionId}
      GROUP BY cs.id, cs.capacity
      FOR UPDATE OF cs
    `;
    if (rows.length === 0) {
      throw new Error("Kelas tujuan tidak ditemukan");
    }
    const capacity = rows[0].capacity;
    const currentActive = Number(rows[0].active_count);
    const needed = currentActive + toPromote.length;
    if (needed > capacity) {
      throw new Error(
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
    const message = err instanceof Error ? err.message : "Gagal memproses promosi";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({
    promoted: toPromote.length,
    skipped,
  });
}
