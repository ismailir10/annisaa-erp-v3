import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.employeeId || session.role !== "TEACHER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit: 5 check-outs per minute keyed by employee (not IP — spoofable)
  const { success } = rateLimit(`check-out:${session.employeeId}`, 5, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const body = await req.json();
  const { lat, lng } = body;

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
