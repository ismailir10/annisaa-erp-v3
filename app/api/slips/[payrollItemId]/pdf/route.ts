import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, canViewSalary } from "@/lib/auth";
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

  // PAYROLL SECURITY: Strict access control
  // 1. Teachers can ONLY see their own slip
  if (session.role === "TEACHER" && item.employee.id !== session.employeeId) {
    return NextResponse.json({ error: "Akses ditolak — Anda hanya dapat melihat slip gaji Anda sendiri" }, { status: 403 });
  }

  // 2. Admin must belong to same tenant
  if (canViewSalary(session.role) && item.payrollRun.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 3. No draft slips — teachers should never see unfinished payroll
  if (session.role === "TEACHER") {
    const fullRun = await prisma.payrollRun.findUnique({ where: { id: item.payrollRunId } });
    if (fullRun?.status === "DRAFT") {
      return NextResponse.json({ error: "Slip gaji belum tersedia" }, { status: 403 });
    }
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: item.payrollRun.tenantId } });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://annisaa-erp-v3.vercel.app";
  const data: SlipData = {
    schoolName: tenant?.name ?? "School",
    logoUrl: `${appUrl}/logo.png`,
    period: `${item.payrollRun.periodStart} s/d ${item.payrollRun.periodEnd}`,
    employeeName: item.employee.formalName ?? item.employee.nama,
    employeeCode: item.employee.kode,
    position: item.employee.jabatan,
    workingDays: item.payrollRun.actualWorkDays,
    bankName: item.employee.bankName,
    bankAccountNo: item.employee.bankAccountNo,
    incomeLines: item.lines
      .filter((l) => l.categorySnapshot === "INCOME")
      .map((l) => ({ label: l.labelSnapshot, amount: Number(l.finalAmount) })),
    deductionLines: item.lines
      .filter((l) => l.categorySnapshot === "DEDUCTION")
      .map((l) => ({ label: l.labelSnapshot, amount: Number(l.finalAmount) })),
    totalIncome: Number(item.grossAmount),
    totalDeductions: Number(item.deductions),
    netPay: Number(item.netAmount),
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
