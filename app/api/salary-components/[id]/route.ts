import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { verifyTenantOwnership } from "@/lib/auth-guard";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("payroll.create");
  if ("error" in auth) return auth.error;
  const { session } = auth;

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
