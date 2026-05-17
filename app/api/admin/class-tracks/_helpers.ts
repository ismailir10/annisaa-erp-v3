/**
 * Shared internals for `app/api/admin/class-tracks/**` route handlers.
 *
 * Keeps each route file short: the `ClassTrack` list-select shape, the
 * unique-violation narrowing, the audit-action discriminator, and the
 * parent-tenant guard for the `Campus` / `Program` FKs.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";

/** 30 writes / min / IP — matches the curriculum write budget. */
export const CLASS_TRACK_WRITE_BUDGET = 30 as const;
export const CLASS_TRACK_WRITE_WINDOW_MS = 60_000 as const;

/**
 * Narrow a thrown value to Prisma's `P2002` unique-constraint violation —
 * a duplicate `(tenantId, campusId, programId, name)` ClassTrack.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/**
 * Audit-action discriminator. A PUT/PATCH that changes only `status` reads
 * as a soft-delete / reactivation (`status:INACTIVE` / `status:ACTIVE`);
 * a mixed change (rename + reactivate) falls back to plain `"update"`.
 */
export function auditActionForUpdate(body: Record<string, unknown>): string {
  const keys = Object.keys(body).filter((k) => body[k] !== undefined);
  if (keys.length === 1 && keys[0] === "status") {
    return `status:${String(body.status)}`;
  }
  return "update";
}

/**
 * Confirm a `Campus` or `Program` exists, is ACTIVE, and belongs to the
 * caller's tenant before a ClassTrack write proceeds. Returns the row id
 * when valid; a 400 NextResponse otherwise. Caller short-circuits on the
 * response. `entityLabel` is included in the Indonesian error copy.
 */
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

export const classTrackListSelect = {
  id: true,
  campusId: true,
  programId: true,
  name: true,
  status: true,
  campus: { select: { id: true, name: true } },
  program: { select: { id: true, code: true, name: true } },
  _count: { select: { sections: true } },
} as const;
