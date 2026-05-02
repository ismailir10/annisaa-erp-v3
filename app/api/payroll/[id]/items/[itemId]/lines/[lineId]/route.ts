import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; lineId: string }> }
) {
  const auth = await requirePermission("payroll.create");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id: payrollRunId, lineId, itemId } = await params;

  // #9 fix: check payroll status — only DRAFT can be edited
  const payrollRun = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
  if (!payrollRun || payrollRun.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (payrollRun.status !== "DRAFT") {
    return NextResponse.json({ error: "Hanya draft yang bisa diedit" }, { status: 400 });
  }

  const body = await req.json();

  if (body.adjustmentNote === undefined || !body.adjustmentNote?.trim()) {
    return NextResponse.json({ error: "Catatan penyesuaian wajib diisi" }, { status: 400 });
  }

  const adjustmentAmount = Number(body.adjustmentAmount) || 0;
  if (isNaN(adjustmentAmount)) {
    return NextResponse.json({ error: "Jumlah penyesuaian tidak valid" }, { status: 400 });
  }

  const line = await prisma.payrollItemLine.findUnique({ where: { id: lineId } });
  if (!line || line.payrollItemId !== itemId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const finalAmount = Number(line.calculatedAmount) + adjustmentAmount;

  // Update line + recalculate item totals atomically
  await prisma.$transaction(async (tx) => {
    await tx.payrollItemLine.update({
      where: { id: lineId },
      data: {
        adjustmentAmount,
        adjustmentNote: body.adjustmentNote.trim(),
        finalAmount,
      },
    });

    const allLines = await tx.payrollItemLine.findMany({ where: { payrollItemId: itemId } });
    const gross = allLines.filter(l => l.categorySnapshot === "INCOME").reduce((s, l) => s + Number(l.finalAmount), 0);
    const ded = allLines.filter(l => l.categorySnapshot === "DEDUCTION").reduce((s, l) => s + Number(l.finalAmount), 0);

    await tx.payrollItem.update({
      where: { id: itemId },
      data: { grossAmount: gross, deductions: ded, netAmount: gross - ded },
    });
  });

  return NextResponse.json({ ok: true });
}
