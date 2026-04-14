import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

// Mark attendance for multiple students at once (teacher submits class attendance)
export async function POST(req: NextRequest) {
  const { success } = rateLimit(`mark-attendance:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.employeeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { classSectionId, date, records } = body;
  // records: [{ studentId, status, checkInTime?, checkOutTime?, notes? }]

  if (!classSectionId || !date || !records?.length) {
    return NextResponse.json({ error: "Kelas, tanggal, dan data kehadiran wajib diisi" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  if (date > today) {
    return NextResponse.json({ error: "Tidak bisa mencatat kehadiran untuk tanggal yang akan datang" }, { status: 400 });
  }

  // Verify teacher is assigned to this class
  const assignment = await prisma.teachingAssignment.findFirst({
    where: { employeeId: session.employeeId, classSectionId },
  });

  // Allow admin OR assigned teacher
  if (!assignment && session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Anda tidak ditugaskan di kelas ini" }, { status: 403 });
  }

  let saved = 0;
  for (const record of records) {
    await prisma.studentAttendance.upsert({
      where: { studentId_date: { studentId: record.studentId, date } },
      update: {
        status: record.status,
        checkInTime: record.checkInTime ? new Date(record.checkInTime) : undefined,
        checkOutTime: record.checkOutTime ? new Date(record.checkOutTime) : undefined,
        notes: record.notes ?? undefined,
        checkedInBy: session.employeeId,
      },
      create: {
        studentId: record.studentId,
        classSectionId,
        date,
        status: record.status,
        checkInTime: record.checkInTime ? new Date(record.checkInTime) : null,
        checkOutTime: record.checkOutTime ? new Date(record.checkOutTime) : null,
        notes: record.notes ?? null,
        checkedInBy: session.employeeId,
      },
    });
    saved++;
  }

  return NextResponse.json({ saved, total: records.length });
}
