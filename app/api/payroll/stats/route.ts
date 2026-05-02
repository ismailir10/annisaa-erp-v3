import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";

/**
 * GET /api/payroll/stats
 *
 * Returns aggregate counts for the payroll stat cards in a single query.
 * Replaces the prior pattern of firing three pageSize=1 list queries in
 * parallel from the client to read only `pagination.total` — that was
 * three lambda invocations when one groupBy is sufficient.
 */
export async function GET(_req: NextRequest) {
  const auth = await requirePermission("payroll.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const rows = await prisma.payrollRun.groupBy({
    by: ["status"],
    where: { tenantId: session.tenantId },
    _count: { status: true },
  });

  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = r._count.status;

  const draft = byStatus.DRAFT ?? 0;
  const approved = byStatus.APPROVED ?? 0;
  const slipsSent = byStatus.SLIPS_SENT ?? 0;
  const total = Object.values(byStatus).reduce((s, n) => s + n, 0);

  return NextResponse.json({ total, draft, approved, slipsSent });
}
