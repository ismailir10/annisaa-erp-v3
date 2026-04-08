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
  if (!(await verifyTenantOwnership("salaryComponentDef", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  // Toggle enable/disable
  if ("isEnabled" in body && Object.keys(body).length === 1) {
    const component = await prisma.salaryComponentDef.update({
      where: { id },
      data: { isEnabled: body.isEnabled },
    });
    return NextResponse.json(component);
  }

  const component = await prisma.salaryComponentDef.update({
    where: { id },
    data: {
      label: body.label?.trim(),
      category: body.category,
      calcType: body.calcType,
      isProRated: body.isProRated ?? false,
      sortOrder: body.sortOrder ?? 0,
    },
  });

  return NextResponse.json(component);
}
