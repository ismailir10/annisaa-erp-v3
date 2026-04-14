import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { calculateWorkingDays } from "@/lib/payroll/working-days";
import { calculatePayroll, SalaryComponent } from "@/lib/payroll/engine";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit: 2 payroll generations per minute
  const { success } = rateLimit(`payroll:${getClientIp(req)}`, 2, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  }

  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { periodStart, periodEnd } = body;

  if (!periodStart || !periodEnd) {
    return NextResponse.json({ error: "Period start and end required" }, { status: 400 });
  }

  // Prevent duplicate or overlapping payroll runs
  const existingRun = await prisma.payrollRun.findFirst({
    where: { tenantId: session.tenantId, periodStart, periodEnd },
  });
  if (existingRun) {
    return NextResponse.json(
      { error: "Penggajian untuk periode ini sudah ada", id: existingRun.id },
      { status: 409 }
    );
  }

  const overlapping = await prisma.payrollRun.findFirst({
    where: {
      tenantId: session.tenantId,
      status: { not: "CANCELLED" },
      periodStart: { lte: periodEnd },
      periodEnd: { gte: periodStart },
    },
  });
  if (overlapping) {
    return NextResponse.json(
      { error: `Periode tumpang tindih dengan penggajian ${overlapping.periodStart} - ${overlapping.periodEnd}` },
      { status: 400 }
    );
  }

  // Get org config
  const orgConfig = await prisma.orgConfig.findUnique({
    where: { tenantId: session.tenantId },
  });
  if (!orgConfig) {
    return NextResponse.json({ error: "Org config not set" }, { status: 400 });
  }

  const workingDays = JSON.parse(orgConfig.workingDays) as string[];

  // Get holidays in period
  const holidays = await prisma.holiday.findMany({
    where: {
      tenantId: session.tenantId,
      date: { gte: periodStart, lte: periodEnd },
    },
  });

  const actualWorkDays = calculateWorkingDays(periodStart, periodEnd, workingDays, holidays);

  // Get salary components
  const componentDefs = await prisma.salaryComponentDef.findMany({
    where: { tenantId: session.tenantId, isEnabled: true },
    orderBy: { sortOrder: "asc" },
  });

  const components: SalaryComponent[] = componentDefs.map((c) => ({
    id: c.id,
    code: c.code,
    label: c.label,
    category: c.category as "INCOME" | "DEDUCTION",
    calcType: c.calcType as "FIXED" | "PCT_OF_BASE" | "ATTENDANCE_BASED",
    isProRated: c.isProRated,
    sortOrder: c.sortOrder,
  }));

  // Get active employees with salary values and attendance
  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, status: "ACTIVE" },
    include: {
      salaryValues: true,
      attendanceRecords: {
        where: { date: { gte: periodStart, lte: periodEnd } },
      },
    },
  });

  // Calculate payroll
  const results = calculatePayroll(
    employees.map((e) => ({
      id: e.id,
      salaryValues: e.salaryValues.map((sv) => ({
        componentDefId: sv.componentDefId,
        value: Number(sv.value),
      })),
      attendanceRecords: e.attendanceRecords.map((r) => ({ status: r.status })),
    })),
    components,
    actualWorkDays
  );

  // Create payroll run with items and lines
  const payrollRun = await prisma.payrollRun.create({
    data: {
      tenantId: session.tenantId,
      periodStart,
      periodEnd,
      actualWorkDays,
      createdBy: session.id,
      items: {
        create: employees.map((emp) => {
          const result = results.get(emp.id)!;
          return {
            employeeId: emp.id,
            grossAmount: result.grossAmount,
            deductions: result.deductions,
            netAmount: result.netAmount,
            lines: {
              create: result.lines.map((line) => ({
                componentDefId: line.componentDefId,
                labelSnapshot: line.labelSnapshot,
                categorySnapshot: line.categorySnapshot,
                calculatedAmount: line.calculatedAmount,
                finalAmount: line.finalAmount,
              })),
            },
          };
        }),
      },
    },
  });

  return NextResponse.json({ id: payrollRun.id }, { status: 201 });
}
