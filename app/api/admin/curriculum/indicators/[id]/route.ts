import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { indicatorUpdateSchema } from "@/lib/validations/curriculum";
import {
  auditActionForUpdate,
  CURRICULUM_WRITE_BUDGET,
  CURRICULUM_WRITE_WINDOW_MS,
  achievementIndicatorListSelect,
} from "../../_helpers";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("curriculum.write");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await ctx.params;

  const { success } = rateLimit(
    `curriculum-indicator-update:${getClientIp(req)}`,
    CURRICULUM_WRITE_BUDGET,
    CURRICULUM_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429 },
    );
  }

  const before = await prisma.achievementIndicator.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, content: true, order: true, status: true },
  });
  if (!before) {
    return NextResponse.json(
      { error: "Indikator tidak ditemukan" },
      { status: 404 },
    );
  }

  const result = await validateBody(indicatorUpdateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.content !== undefined) data.content = body.content.trim();
  if (body.order !== undefined) data.order = body.order;
  if (body.status !== undefined) data.status = body.status;
  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Tidak ada perubahan" },
      { status: 400 },
    );
  }

  // No unique constraint on AchievementIndicator — no P2002 path.
  const updated = await prisma.achievementIndicator.update({
    where: { id },
    data,
    select: achievementIndicatorListSelect,
  });
  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.id,
    entity: "AchievementIndicator",
    entityId: id,
    action: auditActionForUpdate(body),
    before: {
      content: before.content,
      order: before.order,
      status: before.status,
    },
    after: {
      content: updated.content,
      order: updated.order,
      status: updated.status,
    },
  });
  return NextResponse.json(updated);
}
