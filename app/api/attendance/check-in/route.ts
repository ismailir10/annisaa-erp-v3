import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { determineCheckInStatus, minutesLate } from "@/lib/attendance/status";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.employeeId || session.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { lat, lng } = body;

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
