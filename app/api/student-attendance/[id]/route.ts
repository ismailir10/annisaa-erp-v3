import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { updateStudentAttendanceSchema } from "@/lib/validations/student-attendance";

type Params = { params: Promise<{ id: string }> };

async function getOwnedRecord(id: string, tenantId: string) {
  const record = await prisma.studentAttendance.findUnique({
    where: { id },
    include: { classSection: { select: { tenantId: true } } },
  });
  if (!record || record.classSection.tenantId !== tenantId) return null;
  return record;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const record = await getOwnedRecord(id, session.tenantId);
  if (!record) return NextResponse.json({ error: "Record tidak ditemukan" }, { status: 404 });

  return NextResponse.json(record);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { success } = rateLimit(`update-attendance:${session.id}`, 30, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const { id } = await params;
  const existing = await getOwnedRecord(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Record tidak ditemukan" }, { status: 404 });
  if (existing.isVoided) return NextResponse.json({ error: "Record sudah dibatalkan" }, { status: 400 });

  const body = await req.json();
  const parsed = updateStudentAttendanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Input tidak valid" }, { status: 400 });
  }

  const updated = await prisma.studentAttendance.update({
    where: { id },
    data: {
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    },
  });

  return NextResponse.json(updated);
}

// Soft delete — sets isVoided = true
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { success } = rateLimit(`void-attendance:${session.id}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const { id } = await params;
  const existing = await getOwnedRecord(id, session.tenantId);
  if (!existing) return NextResponse.json({ error: "Record tidak ditemukan" }, { status: 404 });
  if (existing.isVoided) return NextResponse.json({ error: "Record sudah dibatalkan" }, { status: 400 });

  await prisma.studentAttendance.update({
    where: { id },
    data: { isVoided: true },
  });

  return NextResponse.json({ success: true });
}
