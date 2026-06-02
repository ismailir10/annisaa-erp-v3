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
  status: true,
  campusId: true,
  programId: true,
  academicYearId: true,
  classTrackId: true,
  campus: { select: { id: true, name: true } },
  program: { select: { id: true, code: true, name: true } },
  academicYear: { select: { id: true, name: true, status: true } },
  classTrack: { select: { id: true, name: true, status: true } },
  _count: {
    select: { enrollments: { where: { status: "ACTIVE" } } },
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
  status: true,
  campusId: true,
  programId: true,
  academicYearId: true,
  classTrackId: true,
  campus: { select: { id: true, name: true } },
  program: { select: { id: true, code: true, name: true } },
  academicYear: { select: { id: true, name: true, status: true } },
  classTrack: { select: { id: true, name: true, status: true } },
  enrollments: {
    where: { status: "ACTIVE" },
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
