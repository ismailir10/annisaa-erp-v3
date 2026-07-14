import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { hasPermission } from "@/lib/permissions";
import { parsePagination, parseSort } from "@/lib/api/pagination";
import { paginatedResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { createEmployeeSchema } from "@/lib/validations/employee";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const auth = await requirePermission("hr.view");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const { searchParams } = new URL(req.url);
  const { skip, take, page, pageSize } = parsePagination(searchParams);
  const sort = parseSort(searchParams, {
    allow: ["nama", "kode", "email", "jabatan", "hireDate", "createdAt", "status"],
    default: "nama",
    defaultOrder: "asc",
  });
  if (sort instanceof Response) return sort;
  const { orderBy } = sort;
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

  // Salary fields visibility keyed to payroll.view. SUPER_ADMIN passes via
  // the short-circuit; a custom role with payroll.view also gets bank/BPJS
  // fields; SCHOOL_ADMIN default set excludes hr.*, so shape is stripped.
  const canSeeSalary = hasPermission(session, "payroll.view");
  const safeEmployees = canSeeSalary
    ? employees
    : employees.map((e) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { bankAccountNo, bankName, bpjsEnrolled, ...rest } = e;
        return rest;
      });
  return NextResponse.json(paginatedResponse(safeEmployees, total, page, pageSize));
}

export async function POST(req: NextRequest) {
  const { success } = rateLimit(`create-employee:${getClientIp(req)}`, 10, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const auth = await requirePermission("employees.create");
  if ("error" in auth) return auth.error;
  const { session } = auth;

  const result = await validateBody(createEmployeeSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;
  const tenantId = session.tenantId;

  // Block writes targeting INACTIVE/cross-tenant campus — without this,
  // a soft-deleted campus could still grow new employee dependents and
  // undermine the employee-attached guard on Campus DELETE.
  if (body.campusId) {
    const activeCampus = await prisma.campus.findFirst({
      where: { id: body.campusId, tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!activeCampus) {
      return NextResponse.json(
        { error: "Kampus tidak ditemukan atau nonaktif." },
        { status: 400 },
      );
    }
  }

  // Auto-generate employee code: initials + sequence number (atomic)
  const employee = await prisma.$transaction(async (tx) => {
    // F-25: advisory lock per tenant to serialize employee code generation.
    // Use single-arg `pg_advisory_xact_lock(hashtext(...))` for parity with
    // invoice/webhook locks (`hashtext(invoiceId)`); namespacing by string
    // prevents collision with the bare numeric `12345` previously used —
    // any future caller that picks the same arbitrary integer would deadlock
    // employee creation. `hashtext` returns int4; Postgres implicitly widens
    // it to int8 for the `pg_advisory_xact_lock(bigint)` overload.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"employee_create_" + tenantId}))`;

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
        // Undefined when the input is left blank — Prisma applies @default(12)
        // / @default(14). An explicit value (e.g. mid-year hire) is honoured.
        leaveBalanceAnnual: body.leaveBalanceAnnual,
        leaveBalanceSick: body.leaveBalanceSick,
      },
    });

    // F-26: role from validated body (defaults to TEACHER for legacy callers).
    // Upsert keyed on the composite (tenantId, email) unique index so HR
    // onboarding can attach an Employee row to a User that already exists
    // (preserved auth login, manually invited user, etc.) without hitting
    // the unique-key conflict.
    await tx.user.upsert({
      where: { tenantId_email: { tenantId, email: body.email.trim() } },
      create: {
        tenantId,
        email: body.email.trim(),
        role: body.role,
        name: body.nama.trim(),
        employeeId: emp.id,
      },
      update: {
        employeeId: emp.id,
        role: body.role,
        name: body.nama.trim(),
      },
    });

    return emp;
  });

  revalidateTag("employees-count", {});
  return NextResponse.json(employee, { status: 201 });
}
