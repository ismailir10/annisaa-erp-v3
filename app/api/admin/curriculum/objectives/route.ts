import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { objectiveCreateSchema } from "@/lib/validations/curriculum";
import {
  CURRICULUM_WRITE_BUDGET,
  CURRICULUM_WRITE_WINDOW_MS,
  ensureActiveParent,
  isUniqueViolation,
  learningObjectiveListSelect,
} from "../_helpers";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("curriculum.read");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["number", "element", "ageGroup", "createdAt", "status"],
    default: "number",
    defaultOrder: "asc",
  });
  if (sort instanceof Response) return sort;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId };
  const semesterId = searchParams.get("semesterId");
  if (semesterId) where.semesterId = semesterId;
  const ageGroup = searchParams.get("ageGroup");
  if (ageGroup && ageGroup !== "all") {
    if (ageGroup !== "A" && ageGroup !== "B") {
      return NextResponse.json(
        { error: "Kelompok usia tidak valid" },
        { status: 400 },
      );
    }
    where.ageGroup = ageGroup;
  }
  const element = searchParams.get("element");
  if (element && element !== "all") {
    if (
      ![
        "RELIGIOUS_MORAL",
        "IDENTITY",
        "STEAM",
        "MOTOR_SKILLS",
        "ART",
      ].includes(element)
    ) {
      return NextResponse.json(
        { error: "Elemen tidak valid" },
        { status: 400 },
      );
    }
    where.element = element;
  }
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
    prisma.learningObjective.findMany({
      where,
      select: learningObjectiveListSelect,
      orderBy: sort.orderBy,
      skip,
      take,
    }),
    prisma.learningObjective.count({ where }),
  ]);
  return NextResponse.json(paginatedResponse(data, total, page, pageSize));
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("curriculum.write");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { success } = rateLimit(
    `curriculum-objective-create:${getClientIp(req)}`,
    CURRICULUM_WRITE_BUDGET,
    CURRICULUM_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan" },
      { status: 429 },
    );
  }

  const result = await validateBody(objectiveCreateSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  const parent = await ensureActiveParent(
    "semester",
    body.semesterId,
    session.tenantId,
    "Semester",
  );
  if (parent instanceof NextResponse) return parent;

  try {
    const created = await prisma.learningObjective.create({
      data: {
        tenantId: session.tenantId,
        semesterId: body.semesterId,
        ageGroup: body.ageGroup,
        element: body.element,
        number: body.number,
        competencyText: body.competencyText.trim(),
        content: body.content.trim(),
      },
      select: learningObjectiveListSelect,
    });
    await recordAudit({
      tenantId: session.tenantId,
      actorId: session.id,
      entity: "LearningObjective",
      entityId: created.id,
      action: "create",
      after: {
        semesterId: created.semesterId,
        ageGroup: created.ageGroup,
        element: created.element,
        number: created.number,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return NextResponse.json(
        {
          error:
            "TP dengan kombinasi (semester, kelompok usia, elemen, nomor) sudah ada.",
        },
        { status: 409 },
      );
    }
    throw err;
  }
}
