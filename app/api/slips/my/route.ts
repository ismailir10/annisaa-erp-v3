import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session?.employeeId || !session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Role check: Only TEACHER can access their payroll slips
  if (session.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await prisma.payrollItem.findMany({
    where: {
      employeeId: session.employeeId,
      // Tenant isolation: Ensure payroll items belong to the teacher's tenant via employee
      employee: {
        tenantId: session.tenantId,
      },
      payrollRun: { status: { in: ["APPROVED", "EXPORTED", "SLIPS_SENT"] } },
    },
    include: {
      payrollRun: {
        select: { periodStart: true, periodEnd: true, status: true },
      },
    },
    orderBy: { payrollRun: { periodStart: "desc" } },
  });

  return NextResponse.json(items);
}
