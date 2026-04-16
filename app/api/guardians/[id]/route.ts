import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * Standalone guardian routes — operate on a StudentGuardian record by its own ID.
 * Ownership verified via guardian.student.tenantId === session.tenantId.
 *
 * PUT  /api/guardians/[id]  — edit parent contact fields + relationship
 * PATCH /api/guardians/[id] — toggle status (ACTIVE ↔ INACTIVE)
 */

async function findGuardian(id: string, tenantId: string) {
  return prisma.studentGuardian.findFirst({
    where: { id },
    include: { student: { select: { tenantId: true } }, parent: true },
  }).then((g) => (g?.student.tenantId === tenantId ? g : null));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`edit-guardian:${getClientIp(req)}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const guardian = await findGuardian(id, session.tenantId);
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

  // Update relationship / isPrimary on the junction record
  const updated = await prisma.studentGuardian.update({
    where: { id },
    data: {
      relationship: body.relationship || guardian.relationship,
      isPrimary: body.isPrimary !== undefined ? body.isPrimary : guardian.isPrimary,
    },
    include: { parent: true },
  });

  return NextResponse.json(updated);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const guardian = await findGuardian(id, session.tenantId);
  if (!guardian) return NextResponse.json({ error: "Wali tidak ditemukan" }, { status: 404 });

  const body = await req.json();
  const newStatus = body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE";

  const updated = await prisma.studentGuardian.update({
    where: { id },
    data: { status: newStatus },
    include: { parent: true },
  });

  return NextResponse.json(updated);
}
