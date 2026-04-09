import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const section = await prisma.classSection.update({
    where: { id },
    data: { name: body.name?.trim(), capacity: body.capacity, campusId: body.campusId },
  });
  return NextResponse.json(section);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const enrollCount = await prisma.studentEnrollment.count({ where: { classSectionId: id } });
  if (enrollCount > 0) return NextResponse.json({ error: `Tidak bisa dihapus: ${enrollCount} siswa terdaftar` }, { status: 400 });
  await prisma.classSection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
