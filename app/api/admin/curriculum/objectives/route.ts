import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { learningObjectiveListSelect } from "../_helpers";

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
