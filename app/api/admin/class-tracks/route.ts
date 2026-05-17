import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { classTrackCreateSchema } from "@/lib/validations/class-track";
import {
  CLASS_TRACK_WRITE_BUDGET,
  CLASS_TRACK_WRITE_WINDOW_MS,
  classTrackListSelect,
  ensureActiveParent,
  isUniqueViolation,
} from "./_helpers";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("academic.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["name", "status"],
    default: "name",
    defaultOrder: "asc",
  });
  if (sort instanceof Response) return sort;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId };
  const status = searchParams.get("status");
  if (status && status !== "all") where.status = status;
  const campusId = searchParams.get("campusId");
  if (campusId && campusId !== "all") where.campusId = campusId;
  const programId = searchParams.get("programId");
  if (programId && programId !== "all") where.programId = programId;

  const [data, total] = await Promise.all([
    prisma.classTrack.findMany({
      where,
      select: classTrackListSelect,
      orderBy: sort.orderBy,
      skip,
      take,
    }),
    prisma.classTrack.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(data, total, page, pageSize));
}

export async function POST(req: NextRequest) {
  // Auth runs before rate-limit so an unauthenticated burst doesn't drain
  // the budget for legitimate callers sharing a NAT/proxy IP.
  const auth = await requirePermission("academic.edit");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { success } = rateLimit(
    `class-track-create:${getClientIp(req)}`,
    CLASS_TRACK_WRITE_BUDGET,
    CLASS_TRACK_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const result = await validateBody(classTrackCreateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // Both FKs must resolve to an ACTIVE row in the caller's tenant before the
  // write — guards against cross-tenant campus/program references.
  const campus = await ensureActiveParent(
    "campus",
    body.campusId,
    session.tenantId,
    "Kampus",
  );
  if (campus instanceof NextResponse) return campus;
  const program = await ensureActiveParent(
    "program",
    body.programId,
    session.tenantId,
    "Program",
  );
  if (program instanceof NextResponse) return program;

  try {
    const created = await prisma.classTrack.create({
      data: {
        tenantId: session.tenantId,
        campusId: body.campusId,
        programId: body.programId,
        name: body.name,
      },
      select: classTrackListSelect,
    });
    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.id,
      entity: "ClassTrack",
      entityId: created.id,
      action: "create",
      after: {
        name: created.name,
        campusId: created.campusId,
        programId: created.programId,
      },
    });
    return NextResponse.json(created, { status: 201 });
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
