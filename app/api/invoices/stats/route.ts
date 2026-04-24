import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

/**
 * GET /api/invoices/stats
 *
 * Returns aggregate counts for the invoices stat cards in a single query.
 * Replaces the prior pattern of firing four `pageSize=1` list queries in
 * parallel from `app/admin/invoices/page.tsx` just to read
 * `pagination.total` per status — that was four lambda invocations + four
 * `findMany` round-trips when one `groupBy` is sufficient.
 *
 * Tenant-scoped via `tenantId`. Admin-only.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.invoice.groupBy({
    by: ["status"],
    where: { tenantId: session.tenantId },
    _count: { status: true },
  });

  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = r._count.status;

  const draft = byStatus.DRAFT ?? 0;
  const sent = byStatus.SENT ?? 0;
  const paid = byStatus.PAID ?? 0;
  const overdue = byStatus.OVERDUE ?? 0;
  // `total` mirrors the prior client behavior (sum of the four buckets we
  // displayed). Other statuses (e.g. VOID) are intentionally excluded so the
  // stat cards stay aligned with the pre-refactor numbers.
  const total = draft + sent + paid + overdue;

  return NextResponse.json({ total, draft, sent, paid, overdue });
}
