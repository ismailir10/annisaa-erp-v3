import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { createStudentSchema } from "@/lib/validations/student";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const { orderBy } = parseSort(searchParams, "name", "asc");
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId };
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { nickname: { contains: search, mode: "insensitive" } },
    ];
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      skip,
      take,
      include: {
        guardians: { where: { isPrimary: true }, take: 1 },
        enrollments: {
          where: { status: "ACTIVE" },
          include: { classSection: { select: { name: true, program: { select: { name: true } } } } },
          take: 1,
        },
      },
      orderBy,
    }),
    prisma.student.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(students, total, page, pageSize));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await validateBody(createStudentSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  const student = await prisma.student.create({
    data: {
      tenantId: session.tenantId,
      name: body.name,
      nickname: body.nickname ?? null,
      dateOfBirth: body.dateOfBirth ?? null,
      gender: body.gender ?? null,
      address: body.address ?? null,
      notes: body.notes ?? null,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
    },
  });

  if (body.guardians?.length) {
    for (const g of body.guardians) {
      await prisma.guardian.create({
        data: {
          studentId: student.id,
          name: g.name,
          relationship: g.relationship,
          phone: g.phone ?? null,
          email: g.email ?? null,
          whatsapp: g.whatsapp ?? null,
          isPrimary: g.isPrimary,
        },
      });
    }
  }

  return NextResponse.json(student, { status: 201 });
}
