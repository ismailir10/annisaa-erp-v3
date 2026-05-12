import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { themeUpdateSchema } from "@/lib/validations/curriculum";
import { auditActionForUpdate, CURRICULUM_WRITE_BUDGET, CURRICULUM_WRITE_WINDOW_MS, isUniqueViolation, themeListSelect } from "../../_helpers";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("curriculum.write");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await ctx.params;

  const { success } = rateLimit(
    `curriculum-theme-update:${getClientIp(req)}`,
    CURRICULUM_WRITE_BUDGET,
    CURRICULUM_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const before = await prisma.theme.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, name: true, order: true, status: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Tema tidak ditemukan" }, { status: 404 });
  }

  const result = await validateBody(themeUpdateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.order !== undefined) data.order = body.order;
  if (body.status !== undefined) data.status = body.status;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
  }

  try {
    const updated = await prisma.theme.update({
      where: { id },
      data,
      select: themeListSelect,
    });
    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.id,
      entity: "Theme",
      entityId: id,
      action: auditActionForUpdate(body),
      before: { name: before.name, order: before.order, status: before.status },
      after: { name: updated.name, order: updated.order, status: updated.status },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Tema dengan nama tersebut sudah ada di semester ini." },
        { status: 409 },
      );
    }
    throw err;
  }
}
