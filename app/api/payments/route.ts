import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { resolveLedgerRequest } from "@/lib/finance/payments-ledger";

/**
 * GET /api/payments?dateFrom=&dateTo=&method=&search=&page=&pageSize=&sortBy=&sortOrder=
 *
 * Payments-received ledger for the admin Penerimaan surface. Read-only,
 * admin-gated, tenant-scoped via the invoice relation. Default range = today
 * (Jakarta). REVERSED payments excluded.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(session.role) || !hasPermission(session, "invoices.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await resolveLedgerRequest(
    session.tenantId,
    new URL(req.url).searchParams,
    getTodayInTimezone("Asia/Jakarta"),
    { paginate: true },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    data: result.rows,
    summary: result.summary,
    pagination: result.pagination,
    dateFrom: result.dateFrom,
    dateTo: result.dateTo,
  });
}
