import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

/**
 * GET /api/enrollments/stats
 *
 * Returns aggregate counts for the enrollments stat cards in a single query.
 * Replaces the prior pattern of firing three `pageSize=1` list queries in
 * parallel from `app/admin/enrollments/page.tsx`.
 *
 * Tenant-scoped via the related `student.tenantId`. Admin-only.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.studentEnrollment.groupBy({
    by: ["status"],
    where: { student: { tenantId: session.tenantId } },
    _count: { status: true },
  });

  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = r._count.status;

  const active = byStatus.ACTIVE ?? 0;
  const withdrawn = byStatus.WITHDRAWN ?? 0;
  // `total` matches the prior `?pageSize=1` (no status filter) call which
  // counted every row regardless of status.
  const total = Object.values(byStatus).reduce((s, n) => s + n, 0);

  return NextResponse.json({ total, active, withdrawn });
}
