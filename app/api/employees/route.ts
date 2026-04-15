import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole, canViewSalary } from "@/lib/auth";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { createEmployeeSchema } from "@/lib/validations/employee";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const canSeeSalary = canViewSalary(session.role);
  const safeEmployees = canSeeSalary
    ? employees
    : employees.map(({ bankAccountNo, bankName, bpjsEnrolled, ...rest }) => rest);
  return NextResponse.json(paginatedResponse(safeEmployees, total, page, pageSize));
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`create-employee:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await validateBody(createEmployeeSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;
  const tenantId = session.tenantId;

  // Auto-generate employee code: initials + sequence number (atomic)
  const employee = await prisma.$transaction(async (tx) => {
    // Advisory lock per tenant to serialize employee code generation
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(12345, ${tenantId}::bigint)`;

    const initials = body.nama
      .trim()
      .split(/\s+/)
      .map((w: string) => w[0]?.toUpperCase())
      .join("")
      .slice(0, 3);

    const lastEmployee = await tx.employee.findFirst({
      where: { tenantId },
      orderBy: { kode: "desc" },
    });
    const lastNum = lastEmployee?.kode.match(/(\d+)$/)?.[1];
    const nextNum = lastNum
      ? parseInt(lastNum) + 1
      : (await tx.employee.count({ where: { tenantId } })) + 1;
    const kode = `${initials}${nextNum}`;

    const emp = await tx.employee.create({
      data: {
        tenantId,
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
    await tx.user.create({
      data: {
        tenantId,
        email: body.email.trim(),
        role: "TEACHER",
        name: body.nama.trim(),
        employeeId: emp.id,
      },
    });

    return emp;
  });

  revalidateTag("employees-count", {});
  return NextResponse.json(employee, { status: 201 });
}
