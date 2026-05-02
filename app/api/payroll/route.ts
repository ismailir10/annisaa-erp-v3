import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("payroll.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["periodStart", "periodEnd", "createdAt", "status"],
    default: "periodStart",
    defaultOrder: "desc",
  });
  if (sort instanceof Response) return sort;
  const { orderBy } = sort;
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
