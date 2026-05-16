import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateGuardianSchema, toggleGuardianStatusSchema } from "@/lib/validations/guardian";

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
  const { success } = rateLimit(`guardian-edit:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const guardian = await findGuardian(id, session.tenantId);
  if (!guardian) return NextResponse.json({ error: "Wali tidak ditemukan" }, { status: 404 });

  const body = await req.json();
  const parsed = updateGuardianSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, { status: 400 });
  }

  const d = parsed.data;

  // Update parent contact fields
  await prisma.parent.update({
    where: { id: guardian.parentId },
    data: {
      name: d.name?.trim() || guardian.parent.name,
      phone: d.phone !== undefined ? (d.phone?.trim() || null) : guardian.parent.phone,
      email: d.email !== undefined ? (d.email?.trim() || null) : guardian.parent.email,
      whatsapp: d.whatsapp !== undefined ? (d.whatsapp?.trim() || null) : guardian.parent.whatsapp,
      nik: d.parentNik !== undefined ? (d.parentNik?.trim() || null) : undefined,
      education: d.education !== undefined ? (d.education?.trim() || null) : undefined,
      occupation: d.occupation !== undefined ? (d.occupation?.trim() || null) : undefined,
      employer: d.employer !== undefined ? (d.employer?.trim() || null) : undefined,
      employerAddress: d.employerAddress !== undefined ? (d.employerAddress?.trim() || null) : undefined,
      employerCity: d.employerCity !== undefined ? (d.employerCity?.trim() || null) : undefined,
      incomeRange: d.incomeRange !== undefined ? (d.incomeRange?.trim() || null) : undefined,
      address: d.address !== undefined ? (d.address?.trim() || null) : undefined,
      childrenTotal: d.childrenTotal !== undefined ? d.childrenTotal : undefined,
    },
  });

  // Update relationship / isPrimary on the junction record
  const updated = await prisma.studentGuardian.update({
    where: { id },
    data: {
      relationship: d.relationship || guardian.relationship,
      isPrimary: d.isPrimary !== undefined ? d.isPrimary : guardian.isPrimary,
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
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const guardian = await findGuardian(id, session.tenantId);
  if (!guardian) return NextResponse.json({ error: "Wali tidak ditemukan" }, { status: 404 });

  const body = await req.json();
  const parsed = toggleGuardianStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, { status: 400 });
  }
  const newStatus = parsed.data.status;

  const updated = await prisma.studentGuardian.update({
    where: { id },
    data: { status: newStatus },
    include: { parent: true },
  });

  return NextResponse.json(updated);
}
