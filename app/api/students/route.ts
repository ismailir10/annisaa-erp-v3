import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { createStudentSchema } from "@/lib/validations/student";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
        guardians: { where: { isPrimary: true }, take: 1, include: { parent: true } },
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
  const { success } = rateLimit(`create-student:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

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
      const email = g.email?.trim() || null;
      let parent;
      if (email) {
        parent = await prisma.parent.upsert({
          where: { tenantId_email: { tenantId: session.tenantId, email } },
          create: { tenantId: session.tenantId, name: g.name, email, phone: g.phone ?? null, whatsapp: g.whatsapp ?? null },
          update: { name: g.name, phone: g.phone ?? null, whatsapp: g.whatsapp ?? null },
        });
      } else {
        parent = await prisma.parent.create({
          data: { tenantId: session.tenantId, name: g.name, phone: g.phone ?? null, whatsapp: g.whatsapp ?? null },
        });
      }
      await prisma.studentGuardian.create({
        data: {
          studentId: student.id,
          parentId: parent.id,
          relationship: g.relationship,
          isPrimary: g.isPrimary,
        },
      });
    }
  }

  return NextResponse.json(student, { status: 201 });
}
