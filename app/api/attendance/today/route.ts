import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { getTodayInTimezone } from "@/lib/attendance/timezone";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json([], { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  // Default to today in Asia/Jakarta — UTC fallback previously returned the
  // wrong day between 00:00 and 06:59 WIB, showing yesterday's attendance to
  // admins checking the dashboard before school starts.
  const date = searchParams.get("date") ?? getTodayInTimezone("Asia/Jakarta");
  const campusId = searchParams.get("campusId");

  const empWhere: Record<string, unknown> = { tenantId: session.tenantId, status: "ACTIVE" };
  if (campusId && campusId !== "all") empWhere.campusId = campusId;

  // Single query: employees + their attendance record for the date via include
  // (was: two round trips — findMany employees then findMany attendanceRecords)
  const employees = await prisma.employee.findMany({
    where: empWhere,
    include: {
      campus: { select: { name: true } },
      attendanceRecords: {
        where: { date },
        select: {
          id: true,
          status: true,
          checkInTime: true,
          checkOutTime: true,
          isManualOverride: true,
          isLocked: true,
        },
      },
    },
    orderBy: { nama: "asc" },
  });

  const result = employees.map((emp) => {
    const record = emp.attendanceRecords[0] ?? null;
    return {
      employee: {
        id: emp.id,
        kode: emp.kode,
        nama: emp.nama,
        jabatan: emp.jabatan,
        campusName: emp.campus.name,
      },
      attendance: record
        ? {
            id: record.id,
            status: record.status,
            checkInTime: record.checkInTime?.toISOString() ?? null,
            checkOutTime: record.checkOutTime?.toISOString() ?? null,
            isManualOverride: record.isManualOverride,
            isLocked: record.isLocked,
          }
        : null,
    };
  });

  return NextResponse.json(result);
}
