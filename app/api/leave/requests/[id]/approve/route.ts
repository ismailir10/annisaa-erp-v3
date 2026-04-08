import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  // Approve the request
  const updated = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewedBy: session.id,
      reviewedAt: new Date(),
      reviewNote: body.note?.trim() || null,
    },
  });

  // Create LEAVE attendance records for each day in the leave period
  const start = new Date(request.startDate);
  const end = new Date(request.endDate);
  const current = new Date(start);

  while (current <= end) {
    const dow = current.getDay();
    if (dow !== 0 && dow !== 6) {
      const dateStr = current.toISOString().split("T")[0];
      await prisma.attendanceRecord.upsert({
        where: { employeeId_date: { employeeId: request.employeeId, date: dateStr } },
        update: { status: "LEAVE", isManualOverride: true, overrideReason: `Cuti: ${request.reason}`, overriddenBy: session.id, overriddenAt: new Date() },
        create: { employeeId: request.employeeId, date: dateStr, status: "LEAVE", isManualOverride: true, overrideReason: `Cuti: ${request.reason}`, overriddenBy: session.id, overriddenAt: new Date() },
      });
    }
    current.setDate(current.getDate() + 1);
  }

  return NextResponse.json(updated);
}
