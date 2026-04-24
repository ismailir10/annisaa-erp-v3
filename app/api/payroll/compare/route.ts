import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";

// Compare two payroll runs: current vs previous
// Returns per-employee net pay from both periods for delta analysis
export async function GET(req: NextRequest) {
  const auth = await requirePermission("payroll.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const currentId = searchParams.get("current");

  if (!currentId) {
    return NextResponse.json({ error: "current payroll ID required" }, { status: 400 });
  }

  // Get current payroll — tenant check in where clause, narrow item select
  const current = await prisma.payrollRun.findFirst({
    where: { id: currentId, tenantId: session.tenantId },
    select: {
      periodStart: true,
      periodEnd: true,
      items: {
        select: {
          netAmount: true,
          employee: { select: { id: true, nama: true, kode: true } },
        },
      },
    },
  });

  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Find the previous payroll run (by periodStart, before current)
  const previous = await prisma.payrollRun.findFirst({
    where: {
      tenantId: session.tenantId,
      periodStart: { lt: current.periodStart },
    },
    orderBy: { periodStart: "desc" },
    select: {
      periodStart: true,
      periodEnd: true,
      items: {
        select: {
          netAmount: true,
          employee: { select: { id: true } },
        },
      },
    },
  });

  // Build comparison data
  const prevMap = new Map<string, number>();
  if (previous) {
    for (const item of previous.items) {
      prevMap.set(item.employee.id, Number(item.netAmount));
    }
  }

  const comparison = current.items.map((item) => {
    const prevNet = prevMap.get(item.employee.id) ?? null;
    const currentNet = Number(item.netAmount);
    const delta = prevNet !== null ? currentNet - prevNet : null;
    return {
      employeeId: item.employee.id,
      nama: item.employee.nama,
      kode: item.employee.kode,
      currentNet,
      previousNet: prevNet,
      delta,
    };
  });

  return NextResponse.json({
    currentPeriod: `${current.periodStart} — ${current.periodEnd}`,
    previousPeriod: previous ? `${previous.periodStart} — ${previous.periodEnd}` : null,
    comparison,
    totalCurrentNet: current.items.reduce((s, i) => s + Number(i.netAmount), 0),
    totalPreviousNet: previous ? previous.items.reduce((s, i) => s + Number(i.netAmount), 0) : null,
  });
}
