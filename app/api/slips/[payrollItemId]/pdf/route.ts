import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { renderToBuffer } from "@react-pdf/renderer";
import { SalarySlipPdf, SlipData } from "@/lib/pdf/salary-slip";
import React from "react";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ payrollItemId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { payrollItemId } = await params;

  const item = await prisma.payrollItem.findUnique({
    where: { id: payrollItemId },
    include: {
      employee: true,
      payrollRun: { select: { periodStart: true, periodEnd: true, actualWorkDays: true, tenantId: true } },
      lines: { orderBy: { componentDef: { sortOrder: "asc" } } },
    },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Access control: admin can see all, teacher can only see own
  if (session.role === "TEACHER" && item.employee.id !== session.employeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: item.payrollRun.tenantId } });

  const data: SlipData = {
    schoolName: tenant?.name ?? "School",
    period: `${item.payrollRun.periodStart} s/d ${item.payrollRun.periodEnd}`,
    employeeName: item.employee.formalName ?? item.employee.nama,
    employeeCode: item.employee.kode,
    position: item.employee.jabatan,
    workingDays: item.payrollRun.actualWorkDays,
    bankName: item.employee.bankName,
    bankAccountNo: item.employee.bankAccountNo,
    incomeLines: item.lines
      .filter((l) => l.categorySnapshot === "INCOME")
      .map((l) => ({ label: l.labelSnapshot, amount: l.finalAmount })),
    deductionLines: item.lines
      .filter((l) => l.categorySnapshot === "DEDUCTION")
      .map((l) => ({ label: l.labelSnapshot, amount: l.finalAmount })),
    totalIncome: item.grossAmount,
    totalDeductions: item.deductions,
    netPay: item.netAmount,
    generatedDate: new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(React.createElement(SalarySlipPdf, { data }) as any);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="slip-gaji-${item.employee.kode}.pdf"`,
    },
  });
}
