import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { generateBsiCsv, sanitizeFilename } from "@/lib/payroll/bsi-export";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("payroll.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

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
  if (payroll.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Hanya penggajian berstatus APPROVED yang bisa diekspor" },
      { status: 409 }
    );
  }

  // Filter employees with bank accounts
  const rows = payroll.items
    .filter((item) => item.employee.bankAccountNo)
    .map((item) => ({
      bankAccountNo: item.employee.bankAccountNo!,
      nama: item.employee.nama,
      netAmount: Number(item.netAmount),
      description: `Gaji ${payroll.periodStart} - ${payroll.periodEnd}`,
    }));

  const csv = generateBsiCsv(rows);
  const filename = sanitizeFilename(`payroll_${payroll.periodStart}_${payroll.periodEnd}_bsi.csv`);

  // Compare-and-swap: only write EXPORTED if run is still APPROVED. Two
  // concurrent BSI export clicks cannot both pass the status guard and both
  // write — the second arrival gets count=0 and bails with 409.
  const swap = await prisma.payrollRun.updateMany({
    where: { id, status: "APPROVED" },
    data: { status: "EXPORTED", exportedAt: new Date() },
  });
  if (swap.count === 0) {
    return NextResponse.json(
      { error: "Penggajian sudah diekspor atau statusnya berubah" },
      { status: 409 }
    );
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
