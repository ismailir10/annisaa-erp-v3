import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { semesterUpdateSchema, parseJakartaYmd } from "@/lib/validations/curriculum";
import { auditActionForUpdate, CURRICULUM_WRITE_BUDGET, CURRICULUM_WRITE_WINDOW_MS, semesterListSelect } from "../../_helpers";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("curriculum.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await ctx.params;

  const row = await prisma.semester.findFirst({
    where: { id, tenantId: session.tenantId },
    select: semesterListSelect,
  });
  if (!row) {
    return NextResponse.json({ error: "Semester tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requirePermission("curriculum.write");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await ctx.params;

  const { success } = rateLimit(
    `curriculum-semester-update:${getClientIp(req)}`,
    CURRICULUM_WRITE_BUDGET,
    CURRICULUM_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const before = await prisma.semester.findFirst({
    where: { id, tenantId: session.tenantId },
    select: { id: true, number: true, startDate: true, endDate: true, status: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Semester tidak ditemukan" }, { status: 404 });
  }

  const result = await validateBody(semesterUpdateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.number !== undefined) data.number = body.number;
  if (body.startDate !== undefined) data.startDate = parseJakartaYmd(body.startDate);
  if (body.endDate !== undefined) data.endDate = parseJakartaYmd(body.endDate);
  if (body.status !== undefined) data.status = body.status;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
  }

  // Cross-field date check after merging existing values (start<end across PUT).
  const finalStart = data.startDate ?? before.startDate;
  const finalEnd = data.endDate ?? before.endDate;
  if (finalStart >= finalEnd) {
    return NextResponse.json(
      { error: "Tanggal mulai harus sebelum tanggal selesai", errors: [{ field: "endDate", message: "Tanggal mulai harus sebelum tanggal selesai" }] },
      { status: 400 },
    );
  }

  const updated = await prisma.semester.update({
    where: { id },
    data,
    select: semesterListSelect,
  });

  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.id,
    entity: "Semester",
    entityId: id,
    action: auditActionForUpdate(body),
    before: {
      number: before.number,
      startDate: before.startDate.toISOString(),
      endDate: before.endDate.toISOString(),
      status: before.status,
    },
    after: {
      number: updated.number,
      startDate: updated.startDate.toISOString(),
      endDate: updated.endDate.toISOString(),
      status: updated.status,
    },
  });

  return NextResponse.json(updated);
}
