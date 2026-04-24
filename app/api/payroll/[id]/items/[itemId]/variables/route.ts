import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { verifyTenantOwnership } from "@/lib/auth-guard";
import { calculateEmployeePayroll, SalaryComponent } from "@/lib/payroll/engine";
import { countAttendanceDays } from "@/lib/payroll/working-days";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requirePermission("payroll.create");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id: payrollRunId, itemId } = await params;

  // #8 fix: authorize BEFORE mutating
  const payrollRun = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
  if (!payrollRun || payrollRun.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // #9 fix: only allow editing DRAFT payrolls (409 matches peer payroll routes).
  if (payrollRun.status !== "DRAFT") {
    return NextResponse.json({ error: "Hanya draft yang bisa diedit" }, { status: 409 });
  }
  if (!(await verifyTenantOwnership("payrollItem", itemId, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  // Reads that can safely live outside the tx (no mutation, no ordering risk).
  const componentDefs = await prisma.salaryComponentDef.findMany({
    where: { tenantId: session.tenantId, isEnabled: true },
    orderBy: { sortOrder: "asc" },
  });

  const components: SalaryComponent[] = componentDefs.map((c) => ({
    id: c.id, code: c.code, label: c.label,
    category: c.category as "INCOME" | "DEDUCTION",
    calcType: c.calcType as "FIXED" | "PCT_OF_BASE" | "ATTENDANCE_BASED",
    isProRated: c.isProRated, sortOrder: c.sortOrder,
  }));

  // Atomic: variables update + line rebuild + totals update must commit
  // together, else PayrollItem totals desync from its lines on any mid-
  // sequence failure.
  await prisma.$transaction(async (tx) => {
    const item = await tx.payrollItem.update({
      where: { id: itemId },
      data: {
        overtimeHours: body.overtimeHours ?? 0,
        outdoorDays: body.outdoorDays ?? 0,
        holidayWorkedDays: body.holidayWorkedDays ?? 0,
        dcDays: body.dcDays ?? 0,
      },
    });

    const salaryValues = await tx.employeeSalaryValue.findMany({
      where: { employeeId: item.employeeId },
    });

    const attendance = await tx.attendanceRecord.findMany({
      where: {
        employeeId: item.employeeId,
        date: { gte: payrollRun.periodStart, lte: payrollRun.periodEnd },
      },
    });

    const { daysPresent, daysLeave } = countAttendanceDays(attendance);

    const result = calculateEmployeePayroll(
      components,
      salaryValues.map((sv) => ({ componentDefId: sv.componentDefId, value: Number(sv.value) })),
      daysPresent, daysLeave, payrollRun.actualWorkDays,
      {
        overtimeHours: Number(item.overtimeHours),
        outdoorDays: item.outdoorDays,
        holidayWorkedDays: item.holidayWorkedDays,
        dcDays: item.dcDays,
      }
    );

    await tx.payrollItemLine.deleteMany({ where: { payrollItemId: itemId } });

    await tx.payrollItemLine.createMany({
      data: result.lines.map((line) => ({
        payrollItemId: itemId,
        componentDefId: line.componentDefId,
        labelSnapshot: line.labelSnapshot,
        categorySnapshot: line.categorySnapshot,
        calculatedAmount: line.calculatedAmount,
        finalAmount: line.finalAmount,
      })),
    });

    await tx.payrollItem.update({
      where: { id: itemId },
      data: {
        grossAmount: result.grossAmount,
        deductions: result.deductions,
        netAmount: result.netAmount,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
