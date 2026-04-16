import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const { orderBy } = parseSort(searchParams, "createdAt", "desc");
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status");
  const templateId = searchParams.get("templateId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { student: { tenantId: session.tenantId } };
  if (status && status !== "all") where.status = status;
  if (templateId && templateId !== "all") where.templateId = templateId;
  if (search) {
    where.student = {
      tenantId: session.tenantId,
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { nickname: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [assessments, total] = await Promise.all([
    prisma.studentAssessment.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        student: { select: { id: true, name: true, nickname: true } },
        template: { select: { id: true, name: true, program: { select: { name: true } } } },
        _count: { select: { scores: true } },
      },
    }),
    prisma.studentAssessment.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(assessments, total, page, pageSize));
}
