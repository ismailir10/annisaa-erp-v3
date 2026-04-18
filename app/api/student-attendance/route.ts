import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parsePagination } from "@/lib/api/pagination";

/**
 * GET /api/student-attendance
 *
 * Two modes:
 *  1. Teacher / mark-attendance mode: ?classSectionId=&date=  → returns [{student, attendance}]
 *  2. Admin list mode: ?mode=list&page=&pageSize=&search=&status=&classSectionId=&dateFrom=&dateTo=
 *     → returns { data: [...], pagination: {...} }
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("mode");

  // ── Admin list mode ──────────────────────────────────────────────
  if (mode === "list") {
    const { page, pageSize, skip, take } = parsePagination(searchParams);
    const search = searchParams.get("search") ?? "";
    const statusFilter = searchParams.get("status") ?? "";
    const classSectionId = searchParams.get("classSectionId") ?? "";
    const dateFrom = searchParams.get("dateFrom") ?? "";
    const dateTo = searchParams.get("dateTo") ?? "";

    // Tenant scope via relation filter — collapses two round-trips to one
    const finalWhere = {
      isVoided: false,
      classSection: classSectionId
        ? { id: classSectionId, tenantId: session.tenantId }
        : { tenantId: session.tenantId },
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
      ...(search
        ? { student: { name: { contains: search, mode: "insensitive" as const } } }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.studentAttendance.findMany({
        where: finalWhere,
        include: {
          student: { select: { id: true, name: true, nickname: true } },
          classSection: { select: { id: true, name: true } },
        },
        orderBy: [{ date: "desc" }, { student: { name: "asc" } }],
        skip,
        take,
      }),
      prisma.studentAttendance.count({ where: finalWhere }),
    ]);

    return NextResponse.json({
      data: records,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  }

  // ── Teacher / mark-attendance mode (original behaviour) ─────────
  const classSectionId = searchParams.get("classSectionId");
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  if (!classSectionId) {
    return NextResponse.json({ error: "classSectionId required" }, { status: 400 });
  }

  const classSection = await prisma.classSection.findFirst({
    where: { id: classSectionId, tenantId: session.tenantId },
  });
  if (!classSection) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 });
  }

  const enrollments = await prisma.studentEnrollment.findMany({
    where: { classSectionId, status: "ACTIVE" },
    include: { student: { select: { id: true, name: true, nickname: true, gender: true } } },
    orderBy: { student: { name: "asc" } },
  });

  const records = await prisma.studentAttendance.findMany({
    where: { classSectionId, date, isVoided: false },
  });

  const recordMap = new Map(records.map((r) => [r.studentId, r]));

  const result = enrollments.map((e) => ({
    student: e.student,
    attendance: recordMap.get(e.student.id) ?? null,
  }));

  return NextResponse.json(result);
}
