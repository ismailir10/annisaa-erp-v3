import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
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
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
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

  // Verify target class belongs to tenant and check capacity
  const targetSection = await prisma.classSection.findFirst({
    where: { id: targetClassSectionId, tenantId: session.tenantId },
    include: {
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!targetSection) {
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

  // Check capacity for all students being promoted
  const currentActive = targetSection._count.enrollments;
  const needed = currentActive + toPromote.length;
  if (needed > targetSection.capacity) {
    return NextResponse.json(
      {
        error: `Kapasitas kelas tujuan tidak cukup. Tersedia: ${targetSection.capacity - currentActive}, dibutuhkan: ${toPromote.length}`,
      },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().split("T")[0];

  // Transaction: graduate old enrollments + create new ones
  await prisma.$transaction(async (tx) => {
    // Mark all old enrollments as GRADUATED
    await tx.studentEnrollment.updateMany({
      where: {
        id: { in: toPromote.map((e) => e.id) },
      },
      data: { status: "GRADUATED" },
    });

    // Create new ACTIVE enrollments
    await tx.studentEnrollment.createMany({
      data: toPromote.map((e) => ({
        studentId: e.studentId,
        classSectionId: targetClassSectionId,
        enrollDate: today,
        status: "ACTIVE",
      })),
    });
  });

  return NextResponse.json({
    promoted: toPromote.length,
    skipped,
  });
}
