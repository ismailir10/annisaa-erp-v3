import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { verifyTenantOwnership } from "@/lib/auth-guard";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // #4 fix: verify tenant ownership
  if (!(await verifyTenantOwnership("attendanceRecord", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { status, checkInTime, checkOutTime, reason } = body;

  if (!status || !reason?.trim()) {
    return NextResponse.json({ error: "Status dan alasan wajib diisi" }, { status: 400 });
  }

  const existing = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (existing?.isLocked) {
    return NextResponse.json({ error: "Record terkunci (payroll sudah disetujui)" }, { status: 400 });
  }

  const record = await prisma.attendanceRecord.update({
    where: { id },
    data: {
      status,
      checkInTime: checkInTime ? new Date(checkInTime) : undefined,
      checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
      isManualOverride: true,
      overrideReason: reason.trim(),
      overriddenBy: session.id,
      overriddenAt: new Date(),
    },
  });

  return NextResponse.json(record);
}

// Create/update attendance record (for days with no record) — id = employeeId
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: employeeId } = await params;

  // Verify employee belongs to tenant
  if (!(await verifyTenantOwnership("employee", employeeId, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { date, status, reason } = body;

  if (!date || !status || !reason?.trim()) {
    return NextResponse.json({ error: "Tanggal, status, dan alasan wajib diisi" }, { status: 400 });
  }

  const record = await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: {
      status,
      isManualOverride: true,
      overrideReason: reason.trim(),
      overriddenBy: session.id,
      overriddenAt: new Date(),
    },
    create: {
      employeeId,
      date,
      status,
      isManualOverride: true,
      overrideReason: reason.trim(),
      overriddenBy: session.id,
      overriddenAt: new Date(),
    },
  });

  return NextResponse.json(record);
}
