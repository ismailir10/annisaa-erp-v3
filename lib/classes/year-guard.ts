import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Mutations against a class belonging to an ARCHIVED AcademicYear are rejected
// — past rosters and teaching assignments are immutable for audit integrity.
// PLANNING and ACTIVE years remain writable. Used by class CRUD + subresource
// (enrollment, teaching assignment) endpoints.

export type YearGuardOk = { ok: true; tenantId: string; yearStatus: string };
export type YearGuardErr = NextResponse;

export async function ensureYearWritableForClass(
  classId: string,
  tenantId: string,
): Promise<YearGuardOk | YearGuardErr> {
  const row = await prisma.classSection.findFirst({
    where: { id: classId, tenantId },
    select: { academicYear: { select: { status: true } } },
  });
  if (!row) {
    return NextResponse.json(
      { error: "Kelas tidak ditemukan" },
      { status: 404 },
    );
  }
  if (row.academicYear.status === "ARCHIVED") {
    return NextResponse.json(
      {
        error:
          "Tahun ajaran sudah diarsipkan. Perubahan kelas tidak diizinkan.",
        code: "YEAR_ARCHIVED",
      },
      { status: 403 },
    );
  }
  return { ok: true, tenantId, yearStatus: row.academicYear.status };
}

export async function ensureYearWritableById(
  academicYearId: string,
  tenantId: string,
): Promise<YearGuardOk | YearGuardErr> {
  const year = await prisma.academicYear.findFirst({
    where: { id: academicYearId, tenantId },
    select: { status: true },
  });
  if (!year) {
    return NextResponse.json(
      { error: "Tahun ajaran tidak ditemukan" },
      { status: 400 },
    );
  }
  if (year.status === "ARCHIVED") {
    return NextResponse.json(
      {
        error:
          "Tahun ajaran sudah diarsipkan. Pembuatan kelas tidak diizinkan.",
        code: "YEAR_ARCHIVED",
      },
      { status: 403 },
    );
  }
  return { ok: true, tenantId, yearStatus: year.status };
}
