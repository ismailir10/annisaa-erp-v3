import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireGuardianForStudent } from "@/lib/student-journal/guards";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { parentAttendanceQuerySchema } from "@/lib/validations/parent-attendance";

/**
 * GET /api/parent/children/[id]/attendance
 *
 * Server-paginated attendance list for a single student, scoped to the
 * authenticated guardian. Replaces the hardcoded 30-row recent fetch on
 * the parent attendance page.
 *
 * Reuses `requireGuardianForStudent` from lib/student-journal/guards.ts —
 * that helper already verifies role=GUARDIAN, tenantId, and an ACTIVE
 * StudentGuardian link. It's named for the journal feature but the check
 * is generic to "this guardian owns this student" so it's the right fit.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: studentId } = await params;

  // Light rate-limit: 60 req/min/IP (covers normal pagination + filter use)
  const { success } = rateLimit(
    `parent-attendance:${getClientIp(req)}`,
    60,
    60_000,
  );
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429 },
    );
  }

  const guard = await requireGuardianForStudent(studentId);
  if (guard.error) return guard.error;

  const parsed = parentAttendanceQuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parameter tidak valid", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { page, pageSize, status, dateFrom, dateTo, sortField, sortOrder } =
    parsed.data;

  // Date is stored as a YYYY-MM-DD string in the DB, so string range
  // comparisons (gte/lte) sort lexicographically and match calendar order.
  const dateFilter: { gte?: string; lte?: string } = {};
  if (dateFrom) dateFilter.gte = dateFrom;
  if (dateTo) dateFilter.lte = dateTo;

  const where = {
    studentId,
    isVoided: false,
    ...(status ? { status } : {}),
    ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.studentAttendance.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        date: true,
        status: true,
        checkInTime: true,
        checkOutTime: true,
        notes: true,
      },
    }),
    prisma.studentAttendance.count({ where }),
  ]);

  const data = rows.map((r) => ({
    id: r.id,
    date: r.date,
    status: r.status,
    checkInTime: r.checkInTime?.toISOString() ?? null,
    checkOutTime: r.checkOutTime?.toISOString() ?? null,
    notes: r.notes,
  }));

  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
