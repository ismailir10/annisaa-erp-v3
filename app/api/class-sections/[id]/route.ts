import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership via program→tenant
  const existing = await prisma.classSection.findFirst({
    where: { id, program: { tenantId: session.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const body = await req.json();

  // Prevent reducing capacity below current enrollment
  if (body.capacity !== undefined) {
    const currentEnrollment = await prisma.studentEnrollment.count({
      where: { classSectionId: id, status: "ACTIVE" },
    });
    if (body.capacity < currentEnrollment) {
      return NextResponse.json({ error: `Kapasitas tidak bisa kurang dari jumlah siswa terdaftar (${currentEnrollment})` }, { status: 400 });
    }
  }

  const section = await prisma.classSection.update({
    where: { id },
    data: { name: body.name?.trim(), capacity: body.capacity, campusId: body.campusId },
  });
  return NextResponse.json(section);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership via program→tenant
  const existing = await prisma.classSection.findFirst({
    where: { id, program: { tenantId: session.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const enrollCount = await prisma.studentEnrollment.count({ where: { classSectionId: id } });
  if (enrollCount > 0) {
    return NextResponse.json({ error: `Tidak bisa dihapus: ${enrollCount} siswa terdaftar` }, { status: 400 });
  }

  // Soft delete — ClassSection has status field (ACTIVE/INACTIVE). Set to INACTIVE.
  await prisma.classSection.update({ where: { id }, data: { status: "INACTIVE" } });
  return NextResponse.json({ ok: true });
}
