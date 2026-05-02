import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { parseWorkingDays } from "@/lib/payroll/working-days";

const DAY_MAP: Record<number, string> = {
  0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission("leave.approve");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;
  const body = await req.json();

  const request = await prisma.leaveRequest.findUnique({
    where: { id },
    include: { employee: { select: { tenantId: true } } },
  });

  if (!request || request.employee.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (request.status !== "PENDING") {
    return NextResponse.json({ error: "Hanya pengajuan PENDING yang bisa disetujui" }, { status: 400 });
  }

  // F-08: holiday-aware attendance creation. Previous loop skipped weekends
  // only — approved leave that spanned a public holiday wrote a LEAVE row
  // for the holiday, double-counting against payroll's holiday-aware day
  // arithmetic.
  const [orgConfig, holidays] = await Promise.all([
    prisma.orgConfig.findUnique({
      where: { tenantId: session.tenantId! },
      select: { workingDays: true },
    }),
    prisma.holiday.findMany({
      where: {
        tenantId: session.tenantId!,
        date: { gte: request.startDate, lte: request.endDate },
      },
      select: { date: true },
    }),
  ]);
  const workingDayCodes = parseWorkingDays(orgConfig?.workingDays);
  const effectiveWorkingDays =
    workingDayCodes.length > 0 ? workingDayCodes : ["MON", "TUE", "WED", "THU", "FRI"];
  // Normalise to YYYY-MM-DD to defend against any historical row that wasn't
  // inserted via the API's Zod path (e.g. direct SQL imports). Set lookup
  // would silently miss a non-truncated value otherwise.
  const holidaySet = new Set(holidays.map((h) => h.date.slice(0, 10)));

  // Atomic: approve leave + create attendance records
  const updated = await prisma.$transaction(async (tx) => {
    const approved = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        reviewedBy: session.id,
        reviewedAt: new Date(),
        reviewNote: body.note?.trim() || null,
      },
    });

    // Create LEAVE attendance records for each working, non-holiday day in
    // the leave period. Weekends and holidays are skipped to stay aligned
    // with `calculateWorkingDays`.
    const start = new Date(request.startDate + "T00:00:00");
    const end = new Date(request.endDate + "T00:00:00");
    const current = new Date(start);

    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, "0");
      const d = String(current.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;
      const dayName = DAY_MAP[current.getDay()];

      const isWorkingDay = effectiveWorkingDays.includes(dayName);
      const isHoliday = holidaySet.has(dateStr);

      if (isWorkingDay && !isHoliday) {
        // Skip days already locked by approved payroll — overwriting would
        // desync the run from attendance and corrupt historical slips.
        const existing = await tx.attendanceRecord.findUnique({
          where: { employeeId_date: { employeeId: request.employeeId, date: dateStr } },
          select: { isLocked: true },
        });
        if (!existing?.isLocked) {
          await tx.attendanceRecord.upsert({
            where: { employeeId_date: { employeeId: request.employeeId, date: dateStr } },
            update: { status: "LEAVE", isManualOverride: true, overrideReason: `Cuti: ${request.reason}`, overriddenBy: session.id, overriddenAt: new Date() },
            create: { employeeId: request.employeeId, date: dateStr, status: "LEAVE", isManualOverride: true, overrideReason: `Cuti: ${request.reason}`, overriddenBy: session.id, overriddenAt: new Date() },
          });
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return approved;
  });

  return NextResponse.json(updated);
}
