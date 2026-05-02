import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api/validate";
import { attendanceCheckInSchema } from "@/lib/validations/attendance";

export async function POST(req: NextRequest) {
  const session = await getSession();
  // Permission gate (replaces legacy `session.role !== "TEACHER"` string check).
  // Same `attendance.checkin` permission covers check-out — they're a pair.
  if (!session?.employeeId || !hasPermission(session, "attendance.checkin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 5 check-outs per minute keyed by employee (not IP — spoofable)
  const { success } = rateLimit(`check-out:${session.employeeId}`, 5, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    json = {};
  }
  const result = await validateBody(attendanceCheckInSchema, json);
  if (result.error) return result.error;
  const { lat, lng } = result.data;

  const now = new Date();

  // Get org config for timezone
  const orgConfig = await prisma.orgConfig.findUnique({
    where: { tenantId: session.tenantId! },
  });
  const timezone = orgConfig?.timezone ?? "Asia/Jakarta";
  const today = getTodayInTimezone(timezone);

  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: session.employeeId, date: today } },
  });

  if (!existing) {
    return NextResponse.json({ error: "Belum check-in hari ini" }, { status: 400 });
  }
  if (existing.checkOutTime) {
    return NextResponse.json({ error: "Sudah check-out hari ini" }, { status: 400 });
  }

  const record = await prisma.attendanceRecord.update({
    where: { id: existing.id },
    data: {
      checkOutTime: now,
      checkOutLat: lat ?? null,
      checkOutLng: lng ?? null,
    },
  });

  return NextResponse.json(record);
}
