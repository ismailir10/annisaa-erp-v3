import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.employeeId) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  // Build date range for the month
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const records = await prisma.attendanceRecord.findMany({
    where: {
      employeeId: session.employeeId,
      date: { gte: startDate, lt: endDate },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(records);
}
