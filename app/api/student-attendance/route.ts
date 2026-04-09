import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Get student attendance for a class on a date
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const classSectionId = searchParams.get("classSectionId");
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  if (!classSectionId) {
    return NextResponse.json({ error: "classSectionId required" }, { status: 400 });
  }

  // Get all enrolled students in this class
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { classSectionId, status: "ACTIVE" },
    include: { student: { select: { id: true, name: true, nickname: true, gender: true } } },
    orderBy: { student: { name: "asc" } },
  });

  // Get attendance records for this date
  const records = await prisma.studentAttendance.findMany({
    where: { classSectionId, date },
  });

  const recordMap = new Map(records.map(r => [r.studentId, r]));

  const result = enrollments.map(e => ({
    student: e.student,
    attendance: recordMap.get(e.student.id) ?? null,
  }));

  return NextResponse.json(result);
}
