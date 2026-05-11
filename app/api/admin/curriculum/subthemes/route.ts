import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { subThemeCreateSchema } from "@/lib/validations/curriculum";
import {
  CURRICULUM_WRITE_BUDGET,
  CURRICULUM_WRITE_WINDOW_MS,
  ensureActiveParent,
  isUniqueViolation,
  subThemeListSelect,
} from "../_helpers";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("curriculum.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["order", "name", "status", "createdAt"],
    default: "order",
    defaultOrder: "asc",
  });
  if (sort instanceof Response) return sort;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId };
  const themeId = searchParams.get("themeId");
  if (themeId) where.themeId = themeId;
  const status = searchParams.get("status");
  if (status && status !== "all") where.status = status;

  const [data, total] = await Promise.all([
    prisma.subTheme.findMany({ where, select: subThemeListSelect, orderBy: sort.orderBy, skip, take }),
    prisma.subTheme.count({ where }),
  ]);
  return NextResponse.json(paginatedResponse(data, total, page, pageSize));
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("curriculum.write");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { success } = rateLimit(
    `curriculum-subtheme-create:${getClientIp(req)}`,
    CURRICULUM_WRITE_BUDGET,
    CURRICULUM_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const result = await validateBody(subThemeCreateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  const parent = await ensureActiveParent("theme", body.themeId, session.tenantId, "Tema");
  if (parent instanceof NextResponse) return parent;

  try {
    const created = await prisma.subTheme.create({
      data: {
        tenantId: session.tenantId,
        themeId: body.themeId,
        name: body.name.trim(),
        order: body.order,
      },
      select: subThemeListSelect,
    });
    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.id,
      entity: "SubTheme",
      entityId: created.id,
      action: "create",
      after: { themeId: created.themeId, name: created.name, order: created.order },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Subtema dengan nama tersebut sudah ada di tema ini." },
        { status: 409 },
      );
    }
    throw err;
  }
}
