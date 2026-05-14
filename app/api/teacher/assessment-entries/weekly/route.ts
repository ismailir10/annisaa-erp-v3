import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-guards";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { loadWeeklyAssessment } from "@/lib/curriculum/weekly-assessment-loader";

const JAKARTA_TZ = "Asia/Jakarta";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("assessments.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  if (!session.employeeId) {
    return NextResponse.json(
      { error: "Akun tidak terhubung dengan staf." },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date") ?? getTodayInTimezone(JAKARTA_TZ);

  const payload = await loadWeeklyAssessment(
    session.tenantId,
    session.employeeId,
    dateParam,
  );

  if (!payload.ok) {
    // Strip `ok`, HTTP `status`, and `message` (echoed via `error`) from the
    // body so consumers don't read the numeric HTTP status as a business
    // field. Reason + any contextual data (e.g. `classSection` in the
    // no_active_week branch) survives the spread.
    const { ok: _ok, status, message: _message, ...rest } = payload;
    return NextResponse.json({ error: payload.message, ...rest }, { status });
  }

  const { ok: _ok, status, ...body } = payload;
  return NextResponse.json(body, { status });
}
