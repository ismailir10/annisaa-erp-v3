import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateBsiCsv, sanitizeFilename } from "@/lib/payroll/bsi-export";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const payroll = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          employee: {
            select: { nama: true, bankAccountNo: true },
          },
        },
      },
    },
  });

  if (!payroll || payroll.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (payroll.status === "DRAFT") {
    return NextResponse.json({ error: "Payroll belum disetujui" }, { status: 400 });
  }

  // Filter employees with bank accounts
  const rows = payroll.items
    .filter((item) => item.employee.bankAccountNo)
    .map((item) => ({
      bankAccountNo: item.employee.bankAccountNo!,
      nama: item.employee.nama,
      netAmount: item.netAmount,
      description: `Gaji ${payroll.periodStart} - ${payroll.periodEnd}`,
    }));

  const csv = generateBsiCsv(rows);
  const filename = sanitizeFilename(`payroll_${payroll.periodStart}_${payroll.periodEnd}_bsi.csv`);

  // Mark as exported
  await prisma.payrollRun.update({
    where: { id },
    data: { status: "EXPORTED", exportedAt: new Date() },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
