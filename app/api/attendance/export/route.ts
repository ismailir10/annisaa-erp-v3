import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const employees = await prisma.employee.findMany({
    where: { tenantId: session.tenantId, status: "ACTIVE" },
    include: {
      campus: { select: { name: true } },
      attendanceRecords: {
        where: { date: { gte: startDate, lt: endDate } },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { nama: "asc" },
  });

  // Build CSV
  const monthLabel = new Date(year, month - 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const header = "Kode,Nama,Kampus,Jabatan,Hadir,Terlambat,Tidak Hadir,Cuti,Total Hari";

  const rows = employees.map((emp) => {
    let present = 0, late = 0, absent = 0, leave = 0;
    for (const r of emp.attendanceRecords) {
      if (r.status === "PRESENT" || r.status === "PRESENT_NO_CHECKOUT") present++;
      else if (r.status === "LATE") late++;
      else if (r.status === "ABSENT") absent++;
      else if (r.status === "LEAVE") leave++;
    }
    return `${emp.kode},"${emp.nama}","${emp.campus.name}","${emp.jabatan}",${present},${late},${absent},${leave},${present + late}`;
  });

  const csv = [header, ...rows].join("\r\n") + "\r\n";
  const filename = `kehadiran_${monthLabel.replace(/\s/g, "_")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
