import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";

/**
 * GET /api/employees/stats
 *
 * Returns ACTIVE + INACTIVE counts in a single query. F-6 collapse —
 * the list page was firing two separate
 * `/api/employees?pageSize=1&status=…` requests just to populate the
 * stat cards, each running a full filtered count under the hood. A
 * single `groupBy({ by: status })` returns the same data in one round
 * trip and one query.
 */
export async function GET() {
  const auth = await requirePermission("hr.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const rows = await prisma.employee.groupBy({
    by: ["status"],
    where: { tenantId: session.tenantId },
    _count: { _all: true },
  });

  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.status] = r._count._all;
  }

  const active = counts.ACTIVE ?? 0;
  const inactive = counts.INACTIVE ?? 0;
  return NextResponse.json({ total: active + inactive, active, inactive });
}
