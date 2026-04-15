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

  // Count used leave days this year
  const year = new Date().getFullYear();
  const approved = await prisma.leaveRequest.findMany({
    where: {
      employeeId: session.employeeId,
      status: "APPROVED",
      startDate: { gte: `${year}-01-01` },
    },
  });

  const usedAnnual = approved.filter((r) => r.leaveType === "ANNUAL").reduce((s, r) => s + r.days, 0);
  const usedSick = approved.filter((r) => r.leaveType === "SICK").reduce((s, r) => s + r.days, 0);

  return NextResponse.json({
    annual: { total: employee.leaveBalanceAnnual, used: usedAnnual, remaining: employee.leaveBalanceAnnual - usedAnnual },
    sick: { total: employee.leaveBalanceSick, used: usedSick, remaining: employee.leaveBalanceSick - usedSick },
  });
}
