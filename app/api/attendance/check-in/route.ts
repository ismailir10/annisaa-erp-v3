import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { determineCheckInStatus, minutesLate } from "@/lib/attendance/status";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { rateLimit } from "@/lib/rate-limit";
import { validateBody } from "@/lib/api/validate";
import { attendanceCheckInSchema } from "@/lib/validations/attendance";

export async function POST(req: NextRequest) {
  const session = await getSession();
  // Permission gate (replaces legacy `session.role !== "TEACHER"` string check):
  // any caller with a linked Employee row AND `attendance.checkin` may
  // self-clock-in. Closes F-09 — non-teaching staff with Employee rows were
  // previously locked out by the role-string compare.
  if (!session?.employeeId || !hasPermission(session, "attendance.checkin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 5 check-ins per minute keyed by employee (not IP — spoofable)
  const { success } = rateLimit(`check-in:${session.employeeId}`, 5, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan. Coba lagi nanti." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    // Empty bodies are allowed — geo coords are optional. Default to {}.
    json = {};
  }
  const result = await validateBody(attendanceCheckInSchema, json);
  if (result.error) return result.error;
  const { lat, lng } = result.data;

  const now = new Date();

  // Get org config for timezone and status determination
  const orgConfig = await prisma.orgConfig.findUnique({
    where: { tenantId: session.tenantId! },
  });

  // #13 fix: use school timezone for date, not UTC
  const timezone = orgConfig?.timezone ?? "Asia/Jakarta";
  const today = getTodayInTimezone(timezone);

  // Check if already checked in today
  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId: session.employeeId, date: today } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Sudah check-in hari ini", record: existing },
      { status: 400 }
    );
  }

  const status = orgConfig
    ? determineCheckInStatus(now, orgConfig.workStartTime, orgConfig.gracePeriodMinutes, timezone)
    : "PRESENT";

  const late = orgConfig
    ? minutesLate(now, orgConfig.workStartTime, timezone)
    : 0;

  const record = await prisma.attendanceRecord.create({
    data: {
      employeeId: session.employeeId,
      date: today,
      checkInTime: now,
      checkInLat: lat ?? null,
      checkInLng: lng ?? null,
      status,
    },
  });

  return NextResponse.json({ ...record, minutesLate: late });
}
