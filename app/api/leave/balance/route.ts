import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Teacher: get my leave balance
export async function GET() {
  const session = await getSession();
  if (!session?.employeeId) return NextResponse.json(null, { status: 401 });

  const employee = await prisma.employee.findUnique({
    where: { id: session.employeeId },
    select: { leaveBalanceAnnual: true, leaveBalanceSick: true },
  });

  if (!employee) return NextResponse.json(null, { status: 404 });

  // Count used leave days this year via DB aggregation (no rows fetched to app layer)
  const year = new Date().getFullYear();
  const yearStart = `${year}-01-01`;
  const [annualAgg, sickAgg] = await Promise.all([
    prisma.leaveRequest.aggregate({
      _sum: { days: true },
      where: { employeeId: session.employeeId, status: "APPROVED", leaveType: "ANNUAL", startDate: { gte: yearStart } },
    }),
    prisma.leaveRequest.aggregate({
      _sum: { days: true },
      where: { employeeId: session.employeeId, status: "APPROVED", leaveType: "SICK", startDate: { gte: yearStart } },
    }),
  ]);

  const usedAnnual = annualAgg._sum.days ?? 0;
  const usedSick = sickAgg._sum.days ?? 0;

  return NextResponse.json({
    annual: { total: employee.leaveBalanceAnnual, used: usedAnnual, remaining: employee.leaveBalanceAnnual - usedAnnual },
    sick: { total: employee.leaveBalanceSick, used: usedSick, remaining: employee.leaveBalanceSick - usedSick },
  });
}
