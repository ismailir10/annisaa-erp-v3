import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";

/**
 * GET /api/leave/stats — F-21
 *
 * Returns aggregate counts for the admin leave page stat cards in a single
 * `groupBy` query. Replaces the prior pattern of three sequential
 * `/api/leave/requests?status=...&pageSize=1` calls (~140 ms each, ~420 ms
 * total) used purely to read `pagination.total`. One query is cheaper and
 * cleaner.
 *
 * Tenant-scoped via the related employee — `LeaveRequest` has no direct
 * `tenantId` column. Pattern parity with `/api/payroll/stats`.
 */
export async function GET(_req: NextRequest) {
  const auth = await requirePermission("leave.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const rows = await prisma.leaveRequest.groupBy({
    by: ["status"],
    where: { employee: { tenantId: session.tenantId } },
    _count: { status: true },
  });

  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = r._count.status;

  const pending = byStatus.PENDING ?? 0;
  const approved = byStatus.APPROVED ?? 0;
  const rejected = byStatus.REJECTED ?? 0;
  const total = pending + approved + rejected;

  return NextResponse.json({ total, pending, approved, rejected });
}
