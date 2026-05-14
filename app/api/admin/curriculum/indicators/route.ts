import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { indicatorAdminCreateSchema } from "@/lib/validations/curriculum";
import {
  CURRICULUM_WRITE_BUDGET,
  CURRICULUM_WRITE_WINDOW_MS,
  achievementIndicatorListSelect,
  ensureActiveParent,
} from "../_helpers";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("curriculum.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["order", "createdAt", "status"],
    default: "order",
    defaultOrder: "asc",
  });
  if (sort instanceof Response) return sort;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId };
  const objectiveId = searchParams.get("objectiveId");
  if (objectiveId) where.objectiveId = objectiveId;
  const status = searchParams.get("status");
  if (status && status !== "all") {
    if (status !== "ACTIVE" && status !== "INACTIVE") {
      return NextResponse.json(
        { error: "Status tidak valid" },
        { status: 400 },
      );
    }
    where.status = status;
  }

  const [data, total] = await Promise.all([
    prisma.achievementIndicator.findMany({
      where,
      select: achievementIndicatorListSelect,
      orderBy: sort.orderBy,
      skip,
      take,
    }),
    prisma.achievementIndicator.count({ where }),
  ]);
  return NextResponse.json(paginatedResponse(data, total, page, pageSize));
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("curriculum.write");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { success } = rateLimit(
    `curriculum-indicator-create:${getClientIp(req)}`,
    CURRICULUM_WRITE_BUDGET,
    CURRICULUM_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429 },
    );
  }

  const result = await validateBody(
    indicatorAdminCreateSchema,
    await req.json(),
  );
  if (result.error) return result.error;
  const body = result.data;

  const parent = await ensureActiveParent(
    "learningObjective",
    body.objectiveId,
    session.tenantId,
    "Tujuan pembelajaran",
  );
  if (parent instanceof NextResponse) return parent;

  // No unique constraint on AchievementIndicator — no P2002 path.
  const created = await prisma.achievementIndicator.create({
    data: {
      tenantId: session.tenantId,
      objectiveId: body.objectiveId,
      content: body.content.trim(),
      order: body.order,
    },
    select: achievementIndicatorListSelect,
  });
  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.id,
    entity: "AchievementIndicator",
    entityId: created.id,
    action: "create",
    after: {
      objectiveId: created.objectiveId,
      content: created.content,
      order: created.order,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
