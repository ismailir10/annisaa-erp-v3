import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json([], { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];
  const campusId = searchParams.get("campusId");

  // Get all active employees
  const empWhere: Record<string, unknown> = { tenantId: session.tenantId, status: "ACTIVE" };
  if (campusId && campusId !== "all") empWhere.campusId = campusId;

  const employees = await prisma.employee.findMany({
    where: empWhere,
    include: { campus: { select: { name: true } } },
    orderBy: { nama: "asc" },
  });

  // Get attendance records for the date
  const records = await prisma.attendanceRecord.findMany({
    where: {
      date,
      employeeId: { in: employees.map((e) => e.id) },
    },
  });

  const recordMap = new Map(records.map((r) => [r.employeeId, r]));

  const result = employees.map((emp) => {
    const record = recordMap.get(emp.id);
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
