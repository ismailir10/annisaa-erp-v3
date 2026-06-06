import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { parseJakartaYmd } from "@/lib/validations/curriculum";
import { termUpdateSchema } from "@/lib/validations/raport";

const WRITE_BUDGET = 30;
const WRITE_WINDOW_MS = 60_000;

/**
 * PATCH /api/admin/terms/[id] — edit a term's number / window.
 * Gated by `reportCard.write`. Tenant-scoped.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("reportCard.write");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { id } = await ctx.params;

  const { success } = rateLimit(`term-update:${getClientIp(req)}`, WRITE_BUDGET, WRITE_WINDOW_MS);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const before = await prisma.term.findFirst({
    where: { id, tenantId: session.tenantId, deletedAt: null },
    select: { id: true, number: true, startDate: true, endDate: true },
  });
  if (!before) {
    return NextResponse.json({ error: "Triwulan tidak ditemukan" }, { status: 404 });
  }

  const result = await validateBody(termUpdateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (body.number !== undefined) data.number = body.number;
  if (body.startDate !== undefined) data.startDate = parseJakartaYmd(body.startDate);
  if (body.endDate !== undefined) data.endDate = parseJakartaYmd(body.endDate);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan" }, { status: 400 });
  }

  // Cross-field guard when only one bound changes.
  const start = data.startDate ?? before.startDate;
  const end = data.endDate ?? before.endDate;
  if (end < start) {
    return NextResponse.json(
      { error: "Tanggal selesai tidak boleh sebelum tanggal mulai" },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.term.update({
      where: { id },
      data,
      select: {
        id: true,
        semesterId: true,
        number: true,
        startDate: true,
        endDate: true,
        publishedAt: true,
      },
    });
    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.id,
      entity: "Term",
      entityId: id,
      action: "update",
    });
    return NextResponse.json({ data: updated });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json(
        { error: "Triwulan dengan nomor ini sudah ada untuk semester tsb" },
        { status: 409 },
      );
    }
    throw e;
  }
}
