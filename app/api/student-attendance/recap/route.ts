import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdminRole } from "@/lib/auth";
import { resolveRecapRequest } from "@/lib/attendance/student-recap";

/**
 * GET /api/student-attendance/recap?month=&year=&classSectionId=
 *
 * Monthly per-student attendance recap for the admin Rekap Bulanan view.
 * Roster-based (ACTIVE enrollments), voided records excluded. Read-only,
 * admin-gated, tenant-scoped.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await resolveRecapRequest(
    session.tenantId,
    new URL(req.url).searchParams,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ data: result.rows });
}
