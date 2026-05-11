import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { semesterCreateSchema, parseJakartaYmd } from "@/lib/validations/curriculum";
import {
  CURRICULUM_WRITE_BUDGET,
  CURRICULUM_WRITE_WINDOW_MS,
  ensureActiveParent,
  isUniqueViolation,
  semesterListSelect,
} from "../_helpers";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("curriculum.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["number", "startDate", "endDate", "status", "createdAt"],
    default: "startDate",
    defaultOrder: "desc",
  });
  if (sort instanceof Response) return sort;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId };
  const status = searchParams.get("status");
  if (status && status !== "all") where.status = status;
  const academicYearId = searchParams.get("academicYearId");
  if (academicYearId && academicYearId !== "all") where.academicYearId = academicYearId;

  const [data, total] = await Promise.all([
    prisma.semester.findMany({
      where,
      select: semesterListSelect,
      orderBy: sort.orderBy,
      skip,
      take,
    }),
    prisma.semester.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(data, total, page, pageSize));
}

export async function POST(req: NextRequest) {
  // Auth runs before rate-limit so an unauthenticated burst doesn't drain
  // the budget for legitimate callers sharing a NAT/proxy IP.
  const auth = await requirePermission("curriculum.write");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { success } = rateLimit(
    `curriculum-semester-create:${getClientIp(req)}`,
    CURRICULUM_WRITE_BUDGET,
    CURRICULUM_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const result = await validateBody(semesterCreateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  const parent = await ensureActiveParent(
    "academicYear",
    body.academicYearId,
    session.tenantId,
    "Tahun ajaran",
  );
  if (parent instanceof NextResponse) return parent;

  try {
    const created = await prisma.semester.create({
      data: {
        tenantId: session.tenantId,
        academicYearId: body.academicYearId,
        number: body.number,
        startDate: parseJakartaYmd(body.startDate),
        endDate: parseJakartaYmd(body.endDate),
      },
      select: semesterListSelect,
    });
    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.id,
      entity: "Semester",
      entityId: created.id,
      action: "create",
      after: { number: created.number, academicYearId: created.academicYearId },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        { error: "Semester dengan nomor ini sudah ada untuk tahun ajaran tersebut." },
        { status: 409 },
      );
    }
    throw err;
  }
}
