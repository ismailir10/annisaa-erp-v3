import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`promote-student:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId } = await params;
  const { targetClassSectionId, notes } = await req.json();

  if (!targetClassSectionId) {
    return NextResponse.json({ error: "Kelas tujuan wajib dipilih" }, { status: 400 });
  }

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
  });
  if (!student) {
    return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });
  }

  // Find current ACTIVE enrollment
  const currentEnrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: "ACTIVE" },
  });
  if (!currentEnrollment) {
    return NextResponse.json({ error: "Siswa tidak memiliki enrollment aktif" }, { status: 400 });
  }

  // Validate target class exists, belongs to tenant, and has capacity
  const targetSection = await prisma.classSection.findFirst({
    where: { id: targetClassSectionId, tenantId: session.tenantId },
    include: {
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!targetSection) {
    return NextResponse.json({ error: "Kelas tujuan tidak ditemukan" }, { status: 404 });
  }

  const activeCount = targetSection._count.enrollments;
  if (activeCount >= targetSection.capacity) {
    return NextResponse.json(
      { error: `Kelas tujuan penuh (${activeCount}/${targetSection.capacity})` },
      { status: 400 }
    );
  }

  const today = new Date().toISOString().split("T")[0];

  // Transaction: graduate old enrollment + create new one
  const newEnrollment = await prisma.$transaction(async (tx) => {
    await tx.studentEnrollment.update({
      where: { id: currentEnrollment.id },
      data: { status: "GRADUATED", notes: notes || undefined },
    });

    return tx.studentEnrollment.create({
      data: {
        studentId,
        classSectionId: targetClassSectionId,
        enrollDate: today,
        status: "ACTIVE",
        notes: notes || undefined,
      },
      include: {
        classSection: { select: { id: true, name: true } },
      },
    });
  });

  return NextResponse.json(newEnrollment, { status: 201 });
}
