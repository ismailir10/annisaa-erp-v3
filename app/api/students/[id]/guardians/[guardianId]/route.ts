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
  const guardian = await prisma.studentGuardian.findFirst({
    where: { id: guardianId, studentId },
    include: { parent: true },
  });
  if (!guardian) return NextResponse.json({ error: "Wali tidak ditemukan" }, { status: 404 });

  const body = await req.json();

  // Update parent contact fields
  await prisma.parent.update({
    where: { id: guardian.parentId },
    data: {
      name: body.name?.trim() || guardian.parent.name,
      phone: body.phone !== undefined ? (body.phone?.trim() || null) : guardian.parent.phone,
      email: body.email !== undefined ? (body.email?.trim() || null) : guardian.parent.email,
      whatsapp: body.whatsapp !== undefined ? (body.whatsapp?.trim() || null) : guardian.parent.whatsapp,
      nik: body.parentNik !== undefined ? (body.parentNik?.trim() || null) : undefined,
      education: body.education !== undefined ? (body.education?.trim() || null) : undefined,
      occupation: body.occupation !== undefined ? (body.occupation?.trim() || null) : undefined,
      employer: body.employer !== undefined ? (body.employer?.trim() || null) : undefined,
      employerAddress: body.employerAddress !== undefined ? (body.employerAddress?.trim() || null) : undefined,
      employerCity: body.employerCity !== undefined ? (body.employerCity?.trim() || null) : undefined,
      incomeRange: body.incomeRange !== undefined ? (body.incomeRange?.trim() || null) : undefined,
    },
  });

  // Update relationship/isPrimary on the junction record
  const updated = await prisma.studentGuardian.update({
    where: { id: guardianId },
    data: {
      relationship: body.relationship || guardian.relationship,
      isPrimary: body.isPrimary !== undefined ? body.isPrimary : guardian.isPrimary,
    },
    include: { parent: true },
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

  // Verify guardian link belongs to student
  const guardian = await prisma.studentGuardian.findFirst({
    where: { id: guardianId, studentId },
    include: { parent: true },
  });
  if (!guardian) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Intentional hard delete — junction table, no status field. Removes the student↔guardian link only.
  await prisma.studentGuardian.delete({ where: { id: guardianId } });

  return NextResponse.json({ ok: true });
}
