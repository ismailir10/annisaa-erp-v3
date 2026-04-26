import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

/**
 * GET /api/invoices/stats
 *
 * Returns aggregate counts + totals for the invoice stat cards in a single
 * Prisma `groupBy`. Replaces the prior pattern of firing four `pageSize=1`
 * list queries in parallel from the client to read only `pagination.total`.
 * The four-card sum also missed `PARTIALLY_PAID` + `PENDING_PAYMENT_LINK`
 * before, so the totals never reconciled.
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
  let totalDue = 0;
  let totalPaid = 0;
  let total = 0;

  for (const g of groups) {
    const count = g._count._all ?? 0;
    byStatus[g.status] = count;
    total += count;
    totalDue += Number(g._sum.totalDue ?? 0);
    totalPaid += Number(g._sum.totalPaid ?? 0);
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
    totalDue,
    totalPaid,
  });
}
