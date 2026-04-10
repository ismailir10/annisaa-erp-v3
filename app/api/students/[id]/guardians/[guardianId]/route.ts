import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; guardianId: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId, guardianId } = await params;

  // Verify student belongs to tenant
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
  });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });

  // Verify guardian belongs to student
  const guardian = await prisma.guardian.findFirst({
    where: { id: guardianId, studentId },
  });
  if (!guardian) return NextResponse.json({ error: "Wali tidak ditemukan" }, { status: 404 });

  const body = await req.json();

  const updated = await prisma.guardian.update({
    where: { id: guardianId },
    data: {
      name: body.name?.trim() || guardian.name,
      relationship: body.relationship || guardian.relationship,
      phone: body.phone !== undefined ? (body.phone?.trim() || null) : guardian.phone,
      email: body.email !== undefined ? (body.email?.trim() || null) : guardian.email,
      whatsapp: body.whatsapp !== undefined ? (body.whatsapp?.trim() || null) : guardian.whatsapp,
      isPrimary: body.isPrimary !== undefined ? body.isPrimary : guardian.isPrimary,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; guardianId: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: studentId, guardianId } = await params;

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: session.tenantId },
  });
  if (!student) return NextResponse.json({ error: "Siswa tidak ditemukan" }, { status: 404 });

  await prisma.guardian.delete({ where: { id: guardianId } });

  return NextResponse.json({ ok: true });
}
