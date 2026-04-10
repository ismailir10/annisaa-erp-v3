import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership
  const existing = await prisma.feeComponentDef.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const body = await req.json();

  // Toggle enable/disable
  if ("isEnabled" in body && Object.keys(body).length === 1) {
    const c = await prisma.feeComponentDef.update({ where: { id }, data: { isEnabled: body.isEnabled } });
    return NextResponse.json(c);
  }

  const c = await prisma.feeComponentDef.update({
    where: { id },
    data: { label: body.label?.trim(), category: body.category, isRecurring: body.isRecurring, sortOrder: body.sortOrder },
  });
  return NextResponse.json(c);
}
