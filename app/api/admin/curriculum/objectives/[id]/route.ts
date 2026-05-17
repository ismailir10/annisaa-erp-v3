import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { objectiveUpdateSchema } from "@/lib/validations/curriculum";
import {
  auditActionForUpdate,
  CURRICULUM_WRITE_BUDGET,
  CURRICULUM_WRITE_WINDOW_MS,
  learningObjectiveListSelect,
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
    `curriculum-objective-update:${getClientIp(req)}`,
    CURRICULUM_WRITE_BUDGET,
    CURRICULUM_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429 },
    );
  }

  const before = await prisma.learningObjective.findFirst({
    where: { id, tenantId: session.tenantId },
    select: {
      id: true,
      competencyText: true,
      content: true,
      status: true,
    },
  });
  if (!before) {
    return NextResponse.json(
      { error: "Tujuan pembelajaran tidak ditemukan" },
      { status: 404 },
    );
  }

  const result = await validateBody(objectiveUpdateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.competencyText !== undefined)
    data.competencyText = body.competencyText.trim();
  if (body.content !== undefined) data.content = body.content.trim();
  if (body.status !== undefined) data.status = body.status;
  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Tidak ada perubahan" },
      { status: 400 },
    );
  }

  // No try/catch around update: the LearningObjective unique key is
  // (tenantId, semesterId, ageGroup, element, number) — all identity fields
  // omitted from `objectiveUpdateSchema` by design. A P2002 cannot fire from
  // this route's mutable surface (competencyText + content + status).
  const updated = await prisma.learningObjective.update({
    where: { id },
    data,
    select: learningObjectiveListSelect,
  });
  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.id,
    entity: "LearningObjective",
    entityId: id,
    action: auditActionForUpdate(body),
    before: {
      competencyText: before.competencyText,
      content: before.content,
      status: before.status,
    },
    after: {
      competencyText: updated.competencyText,
      content: updated.content,
      status: updated.status,
    },
  });
  return NextResponse.json(updated);
}
