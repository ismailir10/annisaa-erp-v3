import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateTeachingAssignmentSchema } from "@/lib/validations/teaching-assignment";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { success } = rateLimit(`update-teaching-assignment:${getClientIp(req)}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership via employee→tenant
  const existing = await prisma.teachingAssignment.findFirst({
    where: { id, employee: { tenantId: session.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const parsed = updateTeachingAssignmentSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const updated = await prisma.teachingAssignment.update({
    where: { id },
    data: { role: parsed.data.role },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership via employee→tenant
  const existing = await prisma.teachingAssignment.findFirst({
    where: { id, employee: { tenantId: session.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  // Intentional hard delete — junction table, no status field
  await prisma.teachingAssignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
