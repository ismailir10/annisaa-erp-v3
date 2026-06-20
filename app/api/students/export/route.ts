import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { buildStudentCsv } from "@/lib/students/export";

/**
 * GET /api/students/export
 *
 * Filtered CSV export of student (siswa) records. Admin-only, tenant-scoped.
 * Same response contract as the other admin exports (text/csv, attachment,
 * Bahasa filename).
 *
 * Row criteria (all optional, AND-combined):
 *   search          — name / nickname (case-insensitive contains)
 *   status          — ACTIVE | INACTIVE | GRADUATED | WITHDRAWN
 *   gender          — L | P
 *   classSectionId  — matches students with an ACTIVE enrollment in that section
 *   programId       — matches students with an ACTIVE enrollment in that program
 *   academicYearId  — matches students with an ACTIVE enrollment in that year
 *
 * Column selection:
 *   columns         — comma-separated registry keys; omit ⇒ all columns.
 *                     Unknown keys ignored; CSV order is the registry's, not the request's.
 */

const VALID_STATUS = new Set(["ACTIVE", "INACTIVE", "GRADUATED", "WITHDRAWN"]);
const VALID_GENDER = new Set(["L", "P"]);

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const status = searchParams.get("status");
  const gender = searchParams.get("gender");
  const classSectionId = searchParams.get("classSectionId");
  const programId = searchParams.get("programId");
  const academicYearId = searchParams.get("academicYearId");
  const columnsParam = searchParams.get("columns");

  if (status && status !== "all" && !VALID_STATUS.has(status)) {
    return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
  }
  if (gender && gender !== "all" && !VALID_GENDER.has(gender)) {
    return NextResponse.json({ error: "Jenis kelamin tidak valid" }, { status: 400 });
  }

  const where: Prisma.StudentWhereInput = { tenantId: session.tenantId };
  if (status && status !== "all") where.status = status;
  if (gender && gender !== "all") where.gender = gender;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { nickname: { contains: search, mode: "insensitive" } },
    ];
  }

  // Class / program / year criteria all resolve against the student's ACTIVE
  // enrollment (ClassSection carries programId + academicYearId directly).
  if (classSectionId || programId || academicYearId) {
    const sectionFilter: Prisma.ClassSectionWhereInput = {};
    if (programId) sectionFilter.programId = programId;
    if (academicYearId) sectionFilter.academicYearId = academicYearId;
    where.enrollments = {
      some: {
        status: "ACTIVE",
        ...(classSectionId ? { classSectionId } : {}),
        ...(programId || academicYearId ? { classSection: sectionFilter } : {}),
      },
    };
  }

  const students = await prisma.student.findMany({
    where,
    include: {
      guardians: {
        where: { isPrimary: true },
        take: 1,
        include: { parent: { select: { name: true, phone: true } } },
      },
      enrollments: {
        where: { status: "ACTIVE" },
        take: 1,
        include: {
          classSection: {
            select: {
              name: true,
              program: { select: { name: true } },
              academicYear: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const columns = columnsParam
    ? columnsParam.split(",").map((c) => c.trim()).filter(Boolean)
    : undefined;

  const csv = buildStudentCsv(students, columns);
  const filename = `siswa_${getTodayInTimezone("Asia/Jakarta")}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
