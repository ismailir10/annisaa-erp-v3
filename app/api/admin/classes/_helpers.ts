import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Prisma as PrismaTypes } from "@/lib/generated/prisma/client";

// Shared internals for app/api/admin/classes/** route handlers. A "Class" in
// this API is a per-year ClassSection; the cross-year ClassTrack is plumbing.

export const CLASS_WRITE_BUDGET = 30 as const;
export const CLASS_WRITE_WINDOW_MS = 60_000 as const;

export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

// A student belongs to a class's DISPLAYED roster if their enrollment is
// current (ACTIVE) — or, for a past (non-ACTIVE) academic year, if they
// completed it (GRADUATED). WITHDRAWN is always excluded. Keying on the year's
// status (not just enrollment status) is what makes this year-aware: a
// mid-year promotion/graduation flips the SOURCE enrollment to GRADUATED while
// its year may still be ACTIVE (see app/api/promotions/route.ts), and those
// promoted-out students must NOT leak back onto the still-current roster.
export function rosterEnrollmentVisible(
  enrollmentStatus: string,
  yearStatus: string,
): boolean {
  if (enrollmentStatus === "WITHDRAWN") return false;
  if (enrollmentStatus === "ACTIVE") return true;
  // GRADUATED (or any other non-WITHDRAWN status) → only for past years.
  return yearStatus !== "ACTIVE";
}

export async function ensureActiveParent(
  table: "campus" | "program",
  id: string,
  tenantId: string,
  entityLabel: string,
): Promise<{ id: string } | NextResponse> {
  const where = { id, tenantId, status: "ACTIVE" as const };
  const row =
    table === "campus"
      ? await prisma.campus.findFirst({ where, select: { id: true } })
      : await prisma.program.findFirst({ where, select: { id: true } });
  if (!row) {
    return NextResponse.json(
      { error: `${entityLabel} tidak ditemukan atau nonaktif.` },
      { status: 400 },
    );
  }
  return row;
}

export const classListSelect = {
  id: true,
  name: true,
  capacity: true,
  slotTemplate: true,
  ageGroup: true,
  status: true,
  campusId: true,
  programId: true,
  academicYearId: true,
  classTrackId: true,
  campus: { select: { id: true, name: true } },
  program: { select: { id: true, code: true, name: true } },
  academicYear: { select: { id: true, name: true, status: true } },
  classTrack: { select: { id: true, name: true, status: true } },
  // Fetch non-WITHDRAWN enrollment statuses (not a scalar _count) so the
  // enrolled count can be computed year-aware in the route via
  // rosterEnrollmentVisible. Per-section rows are small (<= capacity).
  enrollments: {
    where: { status: { not: "WITHDRAWN" } },
    select: { status: true },
  },
  teachingAssignments: {
    where: { role: "HOMEROOM" },
    take: 1,
    select: {
      id: true,
      employee: { select: { id: true, nama: true, formalName: true } },
    },
  },
} satisfies PrismaTypes.ClassSectionSelect;

export const classDetailSelect = {
  id: true,
  name: true,
  capacity: true,
  slotTemplate: true,
  ageGroup: true,
  status: true,
  campusId: true,
  programId: true,
  academicYearId: true,
  classTrackId: true,
  campus: { select: { id: true, name: true } },
  program: { select: { id: true, code: true, name: true } },
  academicYear: { select: { id: true, name: true, status: true } },
  classTrack: { select: { id: true, name: true, status: true } },
  // Fetch non-WITHDRAWN enrollments; the route filters the roster year-aware
  // (rosterEnrollmentVisible) so a current-year class shows only ACTIVE while a
  // past-year class shows its GRADUATED cohort.
  enrollments: {
    where: { status: { not: "WITHDRAWN" } },
    select: {
      id: true,
      enrollDate: true,
      status: true,
      student: { select: { id: true, name: true, nis: true } },
    },
    orderBy: { student: { name: "asc" } },
  },
  teachingAssignments: {
    select: {
      id: true,
      role: true,
      createdAt: true,
      employee: { select: { id: true, nama: true, formalName: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  },
} satisfies PrismaTypes.ClassSectionSelect;

export function auditActionForUpdate(body: Record<string, unknown>): string {
  const keys = Object.keys(body).filter((k) => body[k] !== undefined);
  if (keys.length === 1 && keys[0] === "status") {
    return `status:${String(body.status)}`;
  }
  return "update";
}
