import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

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
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, startDate, endDate, status } = await req.json();
  if (!name?.trim() || !startDate || !endDate) {
    return NextResponse.json({ error: "Nama, tanggal mulai, dan tanggal selesai wajib diisi" }, { status: 400 });
  }

  const year = await prisma.academicYear.create({
    data: { tenantId: session.tenantId, name: name.trim(), startDate, endDate, status: status ?? "PLANNING" },
  });
  return NextResponse.json(year, { status: 201 });
}
