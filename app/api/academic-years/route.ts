import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { demoteOtherActiveYears, isAcademicYearStatus } from "@/lib/academic-year/activate";

export const revalidate = 86400; // 24h — academic years rarely change

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const years = await prisma.academicYear.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { startDate: "desc" },
  });
  return NextResponse.json(years);
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`create-academic-year:${getClientIp(req)}`, 5, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, startDate, endDate, status } = await req.json();
  if (!name?.trim() || !startDate || !endDate) {
    return NextResponse.json({ error: "Nama, tanggal mulai, dan tanggal selesai wajib diisi" }, { status: 400 });
  }
  if (status !== undefined && !isAcademicYearStatus(status)) {
    return NextResponse.json({ error: "Status tahun ajaran tidak valid" }, { status: 400 });
  }

  const tenantId = session.tenantId; // narrow before transaction closure re-widens it
  const data = { tenantId, name: name.trim(), startDate, endDate, status: status ?? "PLANNING" };

  // If created ACTIVE, demote any existing ACTIVE year first — single-active
  // invariant (at most one ACTIVE year per tenant). No exceptId: the new row
  // does not exist yet when the demotion runs.
  const year =
    data.status === "ACTIVE"
      ? await prisma.$transaction(async (tx) => {
          await demoteOtherActiveYears(tx, tenantId);
          return tx.academicYear.create({ data });
        })
      : await prisma.academicYear.create({ data });
  return NextResponse.json(year, { status: 201 });
}
