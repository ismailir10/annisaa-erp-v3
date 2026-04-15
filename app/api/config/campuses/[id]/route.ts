import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { verifyTenantOwnership } from "@/lib/auth-guard";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!(await verifyTenantOwnership("campus", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, address, lat, lng } = body;

  const campus = await prisma.campus.update({
    where: { id },
    data: {
      name: name?.trim(),
      address: address?.trim() || null,
      lat: lat != null ? parseFloat(lat) : null,
      lng: lng != null ? parseFloat(lng) : null,
    },
  });

  return NextResponse.json(campus);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!(await verifyTenantOwnership("campus", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const empCount = await prisma.employee.count({ where: { campusId: id } });
  if (empCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${empCount} employees assigned` },
      { status: 400 }
    );
  }

  // Intentional hard delete — Campus has no status field (config entity)
  await prisma.campus.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
