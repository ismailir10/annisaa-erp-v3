import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["enrollDate", "createdAt", "status"],
    default: "enrollDate",
    defaultOrder: "desc",
  });
  if (sort instanceof Response) return sort;
  const { orderBy } = sort;
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status");
  const classSectionId = searchParams.get("classSectionId");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { student: { tenantId: session.tenantId } };
  if (status && status !== "all") where.status = status;
  if (classSectionId && classSectionId !== "all") where.classSectionId = classSectionId;
  if (search) {
    where.student = {
      tenantId: session.tenantId,
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { nickname: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  const [enrollments, total] = await Promise.all([
    prisma.studentEnrollment.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        student: { select: { id: true, name: true, nickname: true } },
        classSection: {
          select: {
            name: true,
            program: { select: { name: true } },
            academicYear: { select: { name: true } },
          },
        },
      },
    }),
    prisma.studentEnrollment.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(enrollments, total, page, pageSize));
}
