import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

export const revalidate = 3600; // 1h — historical monthly data

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json([], { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const campusId = searchParams.get("campusId");

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const empWhere: Record<string, unknown> = { tenantId: session.tenantId, status: "ACTIVE" };
  if (campusId && campusId !== "all") empWhere.campusId = campusId;

  const employees = await prisma.employee.findMany({
    where: empWhere,
    include: { campus: { select: { name: true } } },
    orderBy: { nama: "asc" },
  });

  const records = await prisma.attendanceRecord.findMany({
    where: {
      employeeId: { in: employees.map((e) => e.id) },
      date: { gte: startDate, lt: endDate },
    },
  });

  // Group records by employee
  const recordsByEmployee = new Map<string, typeof records>();
  for (const r of records) {
    const existing = recordsByEmployee.get(r.employeeId) ?? [];
    existing.push(r);
    recordsByEmployee.set(r.employeeId, existing);
  }

  const result = employees.map((emp) => {
    const empRecords = recordsByEmployee.get(emp.id) ?? [];
    const summary = { present: 0, late: 0, absent: 0, leave: 0 };
    for (const r of empRecords) {
      if (r.status === "PRESENT" || r.status === "PRESENT_NO_CHECKOUT") summary.present++;
      else if (r.status === "LATE") summary.late++;
      else if (r.status === "ABSENT") summary.absent++;
      else if (r.status === "LEAVE") summary.leave++;
    }

    return {
      employee: { id: emp.id, kode: emp.kode, nama: emp.nama, campusName: emp.campus.name },
      records: empRecords.map((r) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        checkInTime: r.checkInTime?.toISOString() ?? null,
        checkOutTime: r.checkOutTime?.toISOString() ?? null,
        isLocked: r.isLocked,
      })),
      summary,
    };
  });

  return NextResponse.json(result);
}
