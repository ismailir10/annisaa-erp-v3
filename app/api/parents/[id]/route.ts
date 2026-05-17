import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateParentSchema, toggleParentStatusSchema } from "@/lib/validations/parent";

/**
 * Parent-level routes — operate on a Parent row by its id, the shape returned
 * by GET /api/guardians (which despite the URL queries `prisma.parent`).
 *
 * GET   — full parent with linked students + invoices (guardian detail page)
 * PUT   — edit parent contact + government-compliance fields
 * PATCH — toggle Parent.status (ACTIVE ↔ INACTIVE) used by Nonaktifkan
 *
 * Junction-level edits (relationship, isPrimary, per-student status) live at
 * /api/guardians/[id] which operates on StudentGuardian. The two URL trees
 * coexist intentionally; the previous bug was that /admin/guardians sent
 * Parent ids to /api/guardians/[id], which 404s because the handler queries
 * StudentGuardian.
 */

async function findParent(id: string, tenantId: string) {
  return prisma.parent.findFirst({ where: { id, tenantId } });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`parent-detail:${getClientIp(req)}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const parent = await prisma.parent.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      guardians: {
        where: { status: "ACTIVE" },
        include: {
          student: {
            select: { id: true, name: true, status: true, gender: true },
          },
        },
      },
      invoices: {
        select: {
          id: true,
          invoiceNumber: true,
          periodLabel: true,
          totalDue: true,
          totalPaid: true,
          status: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!parent) {
    return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json(parent);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { success } = rateLimit(`parent-edit:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parent = await findParent(id, session.tenantId);
  if (!parent) return NextResponse.json({ error: "Wali tidak ditemukan" }, { status: 404 });

  const parsed = updateParentSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, { status: 400 });
  }
  const d = parsed.data;

  const updated = await prisma.parent.update({
    where: { id },
    data: {
      name: d.name?.trim() ?? parent.name,
      phone: d.phone !== undefined ? (d.phone?.trim() || null) : parent.phone,
      email: d.email !== undefined ? (d.email?.trim() || null) : parent.email,
      whatsapp: d.whatsapp !== undefined ? (d.whatsapp?.trim() || null) : parent.whatsapp,
      address: d.address !== undefined ? (d.address?.trim() || null) : parent.address,
      nik: d.nik !== undefined ? (d.nik?.trim() || null) : undefined,
      education: d.education !== undefined ? (d.education?.trim() || null) : undefined,
      occupation: d.occupation !== undefined ? (d.occupation?.trim() || null) : undefined,
      employer: d.employer !== undefined ? (d.employer?.trim() || null) : undefined,
      employerAddress: d.employerAddress !== undefined ? (d.employerAddress?.trim() || null) : undefined,
      employerCity: d.employerCity !== undefined ? (d.employerCity?.trim() || null) : undefined,
      incomeRange: d.incomeRange !== undefined ? (d.incomeRange?.trim() || null) : undefined,
    },
  });

  return NextResponse.json(updated);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parent = await findParent(id, session.tenantId);
  if (!parent) return NextResponse.json({ error: "Wali tidak ditemukan" }, { status: 404 });

  const parsed = toggleParentStatusSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, { status: 400 });
  }

  const updated = await prisma.parent.update({
    where: { id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json(updated);
}
