import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, canViewSalary } from "@/lib/auth";
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
  if (!session?.tenantId || !canViewSalary(session.role)) {
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

  // Parallelise the 4 independent setup queries — none depend on each other
  const [orgConfig, holidays, componentDefs, employees] = await Promise.all([
    prisma.orgConfig.findUnique({ where: { tenantId: session.tenantId } }),
    prisma.holiday.findMany({
      where: {
        tenantId: session.tenantId,
        date: { gte: periodStart, lte: periodEnd },
      },
    }),
    prisma.salaryComponentDef.findMany({
      where: { tenantId: session.tenantId, isEnabled: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.employee.findMany({
      where: { tenantId: session.tenantId, status: "ACTIVE" },
      include: {
        salaryValues: true,
        attendanceRecords: {
          where: { date: { gte: periodStart, lte: periodEnd } },
        },
      },
    }),
  ]);

  if (!orgConfig) {
    return NextResponse.json({ error: "Org config not set" }, { status: 400 });
  }

  const workingDays = JSON.parse(orgConfig.workingDays) as string[];
  const actualWorkDays = calculateWorkingDays(periodStart, periodEnd, workingDays, holidays);

  const components: SalaryComponent[] = componentDefs.map((c) => ({
    id: c.id,
    code: c.code,
    label: c.label,
    category: c.category as "INCOME" | "DEDUCTION",
    calcType: c.calcType as "FIXED" | "PCT_OF_BASE" | "ATTENDANCE_BASED",
    isProRated: c.isProRated,
    sortOrder: c.sortOrder,
  }));

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

  // Pre-generate item IDs so PayrollItemLines can reference them without an
  // extra round trip. Replaces 1 + N + N×M individual INSERTs with 3 bulk
  // statements inside an interactive transaction:
  //   - 1 INSERT into PayrollRun
  //   - 1 INSERT ... VALUES (...) × N into PayrollItem (createMany)
  //   - 1 INSERT ... VALUES (...) × N×M into PayrollItemLine (createMany)
  const itemData = employees.map((emp) => {
    const result = results.get(emp.id)!;
    return {
      id: crypto.randomUUID(),
      employeeId: emp.id,
      grossAmount: result.grossAmount,
      deductions: result.deductions,
      netAmount: result.netAmount,
    };
  });

  const lineData = employees.flatMap((emp, i) => {
    const result = results.get(emp.id)!;
    return result.lines.map((line) => ({
      payrollItemId: itemData[i].id,
      componentDefId: line.componentDefId,
      labelSnapshot: line.labelSnapshot,
      categorySnapshot: line.categorySnapshot,
      calculatedAmount: line.calculatedAmount,
      finalAmount: line.finalAmount,
    }));
  });

  const payrollRun = await prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: {
        tenantId: session.tenantId!, // non-null confirmed by auth check at line 16
        periodStart,
        periodEnd,
        actualWorkDays,
        createdBy: session.id,
      },
      select: { id: true },
    });

    await tx.payrollItem.createMany({
      data: itemData.map((item) => ({ ...item, payrollRunId: run.id })),
    });

    await tx.payrollItemLine.createMany({ data: lineData });

    return run;
  });

  return NextResponse.json({ id: payrollRun.id }, { status: 201 });
}
