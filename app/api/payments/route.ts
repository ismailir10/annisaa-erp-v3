import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { resolveLedgerRequest } from "@/lib/finance/payments-ledger";

/**
 * GET /api/payments?dateFrom=&dateTo=&method=
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
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await resolveLedgerRequest(
    session.tenantId,
    new URL(req.url).searchParams,
    getTodayInTimezone("Asia/Jakarta"),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    data: result.rows,
    summary: result.summary,
    dateFrom: result.dateFrom,
    dateTo: result.dateTo,
  });
}
