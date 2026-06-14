import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { parseJakartaYmd } from "@/lib/validations/curriculum";
import { termCreateSchema } from "@/lib/validations/raport";

const WRITE_BUDGET = 30;
const WRITE_WINDOW_MS = 60_000;

const termSelect = {
  id: true,
  semesterId: true,
  number: true,
  startDate: true,
  endDate: true,
  publishedAt: true,
  semester: { select: { id: true, number: true, academicYear: { select: { name: true } } } },
} as const;

/**
 * GET /api/admin/terms?semesterId=
 *
 * Lists triwulan terms for the tenant (optionally one semester). Read-only
 * selector data for the raport surface. Gated by `reportCard.read`.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePermission("reportCard.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId, deletedAt: null };
  const semesterId = searchParams.get("semesterId");
  if (semesterId && semesterId !== "all") where.semesterId = semesterId;

  const data = await prisma.term.findMany({
    where,
    select: termSelect,
    orderBy: [{ startDate: "desc" }, { number: "asc" }],
  });

  return NextResponse.json({ data });
}

/**
 * POST /api/admin/terms — create a triwulan term. Gated by `reportCard.write`.
 * Dates arrive as Jakarta-tz YMD and are stored as UTC-midnight DateTime.
 */
export async function POST(req: NextRequest) {
  const auth = await requirePermission("reportCard.write");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { success } = rateLimit(`term-create:${getClientIp(req)}`, WRITE_BUDGET, WRITE_WINDOW_MS);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const result = await validateBody(termCreateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // Parent semester must belong to this tenant (defense in depth).
  const semester = await prisma.semester.findFirst({
    where: { id: body.semesterId, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!semester) {
    return NextResponse.json({ error: "Semester tidak ditemukan" }, { status: 404 });
  }

  try {
    const created = await prisma.term.create({
      data: {
        tenantId: session.tenantId,
        semesterId: body.semesterId,
        number: body.number,
        startDate: parseJakartaYmd(body.startDate),
        endDate: parseJakartaYmd(body.endDate),
      },
      select: termSelect,
    });
    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.id,
      entity: "Term",
      entityId: created.id,
      action: "create",
      after: { semesterId: created.semesterId, number: created.number },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
      return NextResponse.json(
        { error: `Triwulan ${body.number} untuk semester ini sudah ada` },
        { status: 409 },
      );
    }
    throw e;
  }
}
