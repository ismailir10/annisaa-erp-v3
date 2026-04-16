import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, canViewSalary } from "@/lib/auth";

// Compare two payroll runs: current vs previous
// Returns per-employee net pay from both periods for delta analysis
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !canViewSalary(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const currentId = searchParams.get("current");

  if (!currentId) {
    return NextResponse.json({ error: "current payroll ID required" }, { status: 400 });
  }

  // Get current payroll
  const current = await prisma.payrollRun.findUnique({
    where: { id: currentId },
    include: {
      items: {
        include: { employee: { select: { id: true, nama: true, kode: true } } },
      },
    },
  });

  if (!current || current.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Find the previous payroll run (by periodStart, before current)
  const previous = await prisma.payrollRun.findFirst({
    where: {
      tenantId: session.tenantId,
      periodStart: { lt: current.periodStart },
    },
    orderBy: { periodStart: "desc" },
    include: {
      items: {
        include: { employee: { select: { id: true } } },
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
