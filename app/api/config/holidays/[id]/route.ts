import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { verifyTenantOwnership } from "@/lib/auth-guard";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!(await verifyTenantOwnership("holiday", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const holiday = await prisma.holiday.update({
    where: { id },
    data: {
      date: body.date,
      name: body.name?.trim(),
      type: body.type,
      isHalfDay: body.isHalfDay ?? false,
    },
  });

  return NextResponse.json(holiday);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!(await verifyTenantOwnership("holiday", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Intentional hard delete — Holiday has no status field (config entity)
  await prisma.holiday.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
