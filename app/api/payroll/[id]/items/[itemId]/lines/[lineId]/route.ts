import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; lineId: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  const adjustmentAmount = parseFloat(body.adjustmentAmount) || 0;

  const line = await prisma.payrollItemLine.findUnique({ where: { id: lineId } });
  if (!line || line.payrollItemId !== itemId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const finalAmount = Number(line.calculatedAmount) + adjustmentAmount;

  await prisma.payrollItemLine.update({
    where: { id: lineId },
    data: {
      adjustmentAmount,
      adjustmentNote: body.adjustmentNote.trim(),
      finalAmount,
    },
  });

  // Recalculate item totals
  const allLines = await prisma.payrollItemLine.findMany({ where: { payrollItemId: itemId } });
  const gross = allLines.filter(l => l.categorySnapshot === "INCOME").reduce((s, l) => s + Number(l.finalAmount), 0);
  const ded = allLines.filter(l => l.categorySnapshot === "DEDUCTION").reduce((s, l) => s + Number(l.finalAmount), 0);

  await prisma.payrollItem.update({
    where: { id: itemId },
    data: { grossAmount: gross, deductions: ded, netAmount: gross - ded },
  });

  return NextResponse.json({ ok: true });
}
