import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

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
