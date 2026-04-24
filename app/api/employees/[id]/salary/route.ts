import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, canViewSalary } from "@/lib/auth";
import { verifyTenantOwnership } from "@/lib/auth-guard";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });
  if (!canViewSalary(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!(await verifyTenantOwnership("employee", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const values = await prisma.employeeSalaryValue.findMany({
    where: { employeeId: id },
    include: { componentDef: true },
    orderBy: { componentDef: { sortOrder: "asc" } },
  });

  return NextResponse.json(values);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`employee-salary-put:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !canViewSalary(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!(await verifyTenantOwnership("employee", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body: { componentDefId: string; value: number }[] = await req.json();

  for (const item of body) {
    await prisma.employeeSalaryValue.upsert({
      where: {
        employeeId_componentDefId: {
          employeeId: id,
          componentDefId: item.componentDefId,
        },
      },
      update: { value: item.value },
      create: {
        employeeId: id,
        componentDefId: item.componentDefId,
        value: item.value,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
