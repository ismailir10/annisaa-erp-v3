import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { verifyTenantOwnership } from "@/lib/auth-guard";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  ATTENDANCE_STATUSES,
  attendanceOverrideSchema,
} from "@/lib/validations/attendance";

// PUT updates an existing record by id; date is immutable.
// Allow datetimes with or without timezone offset — legacy callers send
// `2026-04-15T07:00:00` (no Z) and `2026-04-15T07:00:00.000Z` interchangeably.
const updateOverrideSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES),
  checkInTime: z.string().datetime({ local: true }).optional(),
  checkOutTime: z.string().datetime({ local: true }).optional(),
  reason: z
    .string()
    .trim()
    .min(1, "Alasan wajib diisi")
    .max(500, "Alasan maksimal 500 karakter"),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { success } = rateLimit(`attendance-override-put:${getClientIp(req)}`, 30, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const auth = await requirePermission("attendance.override");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id } = await params;

  if (!(await verifyTenantOwnership("attendanceRecord", id, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON valid" }, { status: 400 });
  }

  const result = await validateBody(updateOverrideSchema, rawBody);
  if (result.error) return result.error;
  const { status, checkInTime, checkOutTime, reason } = result.data;

  const existing = await prisma.attendanceRecord.findUnique({ where: { id } });
  if (existing?.isLocked) {
    return NextResponse.json(
      { error: "Record terkunci (payroll sudah disetujui)" },
      { status: 400 }
    );
  }

  const record = await prisma.attendanceRecord.update({
    where: { id },
    data: {
      status,
      checkInTime: checkInTime ? new Date(checkInTime) : undefined,
      checkOutTime: checkOutTime ? new Date(checkOutTime) : undefined,
      isManualOverride: true,
      overrideReason: reason,
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
  const { success } = rateLimit(`attendance-override-post:${getClientIp(req)}`, 30, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const auth = await requirePermission("attendance.override");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { id: employeeId } = await params;

  if (!(await verifyTenantOwnership("employee", employeeId, session.tenantId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON valid" }, { status: 400 });
  }

  const result = await validateBody(attendanceOverrideSchema, rawBody);
  if (result.error) return result.error;
  const { date, status, reason } = result.data;

  // Mirror the PUT guard at line 58: a payroll-locked record cannot be
  // overwritten by re-hitting POST on the same {employeeId, date} composite key.
  const existing = await prisma.attendanceRecord.findUnique({
    where: { employeeId_date: { employeeId, date } },
  });
  if (existing?.isLocked) {
    return NextResponse.json(
      { error: "Record terkunci (payroll sudah disetujui)" },
      { status: 400 }
    );
  }

  const record = await prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId, date } },
    update: {
      status,
      isManualOverride: true,
      overrideReason: reason,
      overriddenBy: session.id,
      overriddenAt: new Date(),
    },
    create: {
      employeeId,
      date,
      status,
      isManualOverride: true,
      overrideReason: reason,
      overriddenBy: session.id,
      overriddenAt: new Date(),
    },
  });

  return NextResponse.json(record);
}
