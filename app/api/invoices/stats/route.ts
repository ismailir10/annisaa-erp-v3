import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * GET /api/invoices/stats
 *
 * Returns aggregate counts + totals for the invoice stat cards in a single
 * Prisma `groupBy`. Replaces the prior pattern of firing four
 * `pageSize=1` list queries in parallel from the client to read only
 * `pagination.total` — that was four lambda invocations when one groupBy
 * is sufficient. The previous client-side approach also silently missed
 * `PARTIALLY_PAID` and `PENDING_PAYMENT_LINK`, so the four-card sum never
 * reconciled to the real total.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const groups = await prisma.invoice.groupBy({
    by: ["status"],
    where: { tenantId: session.tenantId },
    _count: { _all: true },
    _sum: { totalDue: true, totalPaid: true },
  });

  const byStatus: Record<string, number> = {};
  // Decimal-safe accumulators — `+= Number(decimal)` would drift on the
  // running grand-total across many groupBy buckets, and the stat cards
  // show that figure to admin in rupiah.
  let totalDue = new Prisma.Decimal(0);
  let totalPaid = new Prisma.Decimal(0);
  let total = 0;

  for (const g of groups) {
    const count = g._count._all ?? 0;
    byStatus[g.status] = count;
    total += count;
    if (g._sum.totalDue) totalDue = totalDue.add(g._sum.totalDue);
    if (g._sum.totalPaid) totalPaid = totalPaid.add(g._sum.totalPaid);
  }

  return NextResponse.json({
    total,
    draft: byStatus.DRAFT ?? 0,
    sent: byStatus.SENT ?? 0,
    partiallyPaid: byStatus.PARTIALLY_PAID ?? 0,
    paid: byStatus.PAID ?? 0,
    overdue: byStatus.OVERDUE ?? 0,
    cancelled: byStatus.CANCELLED ?? 0,
    pendingPaymentLink: byStatus.PENDING_PAYMENT_LINK ?? 0,
    // Decimal-safe accumulation above; coerce back to number for the JSON
    // response since school-scale rupiah amounts fit comfortably in a JS
    // number (max safe int is ~9e15, our amounts are <1e10).
    totalDue: totalDue.toNumber(),
    totalPaid: totalPaid.toNumber(),
  });
}
