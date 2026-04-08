import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const holidays = await prisma.holiday.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(holidays);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { date, name, type, isHalfDay } = body;

  if (!date || !name?.trim() || !type) {
    return NextResponse.json({ error: "Date, name, and type required" }, { status: 400 });
  }

  // Check duplicate
  const existing = await prisma.holiday.findUnique({
    where: { tenantId_date: { tenantId: session.tenantId, date } },
  });
  if (existing) {
    return NextResponse.json({ error: "Tanggal sudah ada" }, { status: 400 });
  }

  const holiday = await prisma.holiday.create({
    data: {
      tenantId: session.tenantId,
      date,
      name: name.trim(),
      type,
      isHalfDay: isHalfDay ?? false,
    },
  });

  return NextResponse.json(holiday, { status: 201 });
}
