import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const { orderBy } = parseSort(searchParams, "periodStart", "desc");
  const status = searchParams.get("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId };
  if (status && status !== "all") where.status = status;

  const [runs, total] = await Promise.all([
    prisma.payrollRun.findMany({
      where,
      skip,
      take,
      include: { _count: { select: { items: true } } },
      orderBy,
    }),
    prisma.payrollRun.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(runs, total, page, pageSize));
}
