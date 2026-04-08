import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session?.employeeId) return NextResponse.json([], { status: 401 });

  const items = await prisma.payrollItem.findMany({
    where: {
      employeeId: session.employeeId,
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
