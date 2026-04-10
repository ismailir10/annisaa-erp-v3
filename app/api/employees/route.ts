import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { createEmployeeSchema } from "@/lib/validations/employee";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  }

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const { orderBy } = parseSort(searchParams, "nama", "asc");
  const search = searchParams.get("search") ?? "";
  const campusId = searchParams.get("campusId");
  const status = searchParams.get("status");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { tenantId: session.tenantId };
  if (campusId && campusId !== "all") where.campusId = campusId;
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { nama: { contains: search, mode: "insensitive" } },
      { kode: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const [employees, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      skip,
      take,
      include: { campus: { select: { name: true } } },
      orderBy,
    }),
    prisma.employee.count({ where }),
  ]);

  return NextResponse.json(paginatedResponse(employees, total, page, pageSize));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await validateBody(createEmployeeSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // Auto-generate employee code: initials + sequence number
  const initials = body.nama
    .trim()
    .split(/\s+/)
    .map((w: string) => w[0]?.toUpperCase())
    .join("")
    .slice(0, 3);

  const lastEmployee = await prisma.employee.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { kode: "desc" },
  });
  const lastNum = lastEmployee?.kode.match(/(\d+)$/)?.[1];
  const nextNum = lastNum
    ? parseInt(lastNum) + 1
    : (await prisma.employee.count({ where: { tenantId: session.tenantId } })) + 1;
  const kode = `${initials}${nextNum}`;

  const employee = await prisma.employee.create({
    data: {
      tenantId: session.tenantId,
      kode,
      nama: body.nama.trim(),
      formalName: body.formalName?.trim() || null,
      email: body.email.trim(),
      noHp: body.noHp?.trim() || null,
      jabatan: body.jabatan.trim(),
      campusId: body.campusId,
      hireDate: body.hireDate,
      bankName: body.bankName?.trim() || null,
      bankAccountNo: body.bankAccountNo?.trim() || null,
      bpjsEnrolled: body.bpjsEnrolled ?? false,
    },
  });

  // Create teacher user account
  await prisma.user.create({
    data: {
      tenantId: session.tenantId,
      email: body.email.trim(),
      role: "TEACHER",
      name: body.nama.trim(),
      employeeId: employee.id,
    },
  });

  return NextResponse.json(employee, { status: 201 });
}
