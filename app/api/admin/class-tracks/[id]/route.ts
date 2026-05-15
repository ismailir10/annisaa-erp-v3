import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { classTrackUpdateSchema } from "@/lib/validations/class-track";
import {
  auditActionForUpdate,
  CLASS_TRACK_WRITE_BUDGET,
  CLASS_TRACK_WRITE_WINDOW_MS,
  classTrackListSelect,
  isUniqueViolation,
} from "../_helpers";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("academic.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await ctx.params;

  const row = await prisma.classTrack.findFirst({
    where: { id, tenantId: session.tenantId },
    select: classTrackListSelect,
  });
  if (!row) {
    return NextResponse.json(
      { error: "Rombongan belajar tidak ditemukan" },
      { status: 404 },
    );
  }
  return NextResponse.json(row);
}

/**
 * Update a ClassTrack. Handles rename and the status flip (soft-delete /
 * reactivation). `campusId` / `programId` are identity fields — not editable.
 * PUT and PATCH share this handler: both are partial-merge semantics.
 */
async function update(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("academic.edit");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await ctx.params;

  const { success } = rateLimit(
    `class-track-update:${getClientIp(req)}`,
    CLASS_TRACK_WRITE_BUDGET,
    CLASS_TRACK_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const before = await prisma.classTrack.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, name: true, status: true },
  });
  if (!before) {
    return NextResponse.json(
      { error: "Rombongan belajar tidak ditemukan" },
      { status: 404 },
    );
  }

  const result = await validateBody(classTrackUpdateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.status !== undefined) data.status = body.status;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
  }

  try {
    // Tenant scope is intrinsic to the mutation — `updateMany` accepts the
    // non-unique `{ id, tenantId }` filter so a cross-tenant id can never be
    // written even if the `findFirst` guard above were ever removed. The
    // guard still runs first so the 404 path returns the correct shape.
    await prisma.classTrack.updateMany({
      where: { id, tenantId: session.tenantId },
      data,
    });
    const updated = await prisma.classTrack.findFirstOrThrow({
      where: { id, tenantId: session.tenantId },
      select: classTrackListSelect,
    });
    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.id,
      entity: "ClassTrack",
      entityId: id,
      action: auditActionForUpdate(body),
      before: { name: before.name, status: before.status },
      after: { name: updated.name, status: updated.status },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        {
          error:
            "Rombongan belajar dengan nama ini sudah ada untuk kampus dan program tersebut.",
        },
        { status: 409 },
      );
    }
    throw err;
  }
}

export const PUT = update;
export const PATCH = update;

/**
 * Soft-delete per CRUD Standard Category A — sets `status = "INACTIVE"`,
 * never hard-deletes. A track with active `ClassSection`s can still be
 * deactivated: the sections stay (the confirm dialog surfaces the count).
 * Reactivate via PUT/PATCH { status: "ACTIVE" }.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("academic.edit");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await ctx.params;

  const { success } = rateLimit(
    `class-track-delete:${getClientIp(req)}`,
    CLASS_TRACK_WRITE_BUDGET,
    CLASS_TRACK_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const before = await prisma.classTrack.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, name: true, status: true },
  });
  if (!before) {
    return NextResponse.json(
      { error: "Rombongan belajar tidak ditemukan" },
      { status: 404 },
    );
  }

  // Tenant scope intrinsic to the mutation — `updateMany` accepts the
  // non-unique `{ id, tenantId }` filter (see PUT/PATCH handler above).
  await prisma.classTrack.updateMany({
    where: { id, tenantId: session.tenantId },
    data: { status: "INACTIVE" },
  });
  const updated = await prisma.classTrack.findFirstOrThrow({
    where: { id, tenantId: session.tenantId },
    select: classTrackListSelect,
  });
  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.id,
    entity: "ClassTrack",
    entityId: id,
    action: "status:INACTIVE",
    before: { name: before.name, status: before.status },
    after: { name: updated.name, status: updated.status },
  });
  return NextResponse.json({ ok: true });
}
