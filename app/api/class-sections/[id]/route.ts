import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { updateClassSectionSchema } from "@/lib/validations/class-section";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.classSection.findFirst({
    where: { id, program: { tenantId: session.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const parsed = updateClassSectionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

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
    data: { name: body.name?.trim(), capacity: body.capacity, campusId: body.campusId, status: body.status },
  });
  return NextResponse.json(section);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
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
