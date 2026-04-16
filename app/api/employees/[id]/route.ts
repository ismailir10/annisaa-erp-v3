import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole, canViewSalary } from "@/lib/auth";
import { validateBody } from "@/lib/api/validate";
import { updateEmployeeSchema } from "@/lib/validations/employee";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json(null, { status: 401 });

  const { id } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: { campus: { select: { name: true } } },
  });

  if (!employee || employee.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!canViewSalary(session.role)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { bankAccountNo, bankName, bpjsEnrolled, ...rest } = employee;
    return NextResponse.json(rest);
  }
  return NextResponse.json(employee);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Verify tenant ownership before any mutation
  const existing = await prisma.employee.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawBody = await req.json();

  // Deactivate shortcut — only status field, skip full validation
  if (Object.keys(rawBody).length === 1 && rawBody.status === "INACTIVE") {
    const employee = await prisma.employee.update({
      where: { id },
      data: { status: "INACTIVE" },
    });
    revalidateTag("employees-count", {});
    return NextResponse.json(employee);
  }

  const result = await validateBody(updateEmployeeSchema, rawBody);
  if (result.error) return result.error;
  const body = result.data;

  const employee = await prisma.employee.update({
    where: { id },
    data: {
      nama: body.nama?.trim(),
      formalName: body.formalName?.trim() || null,
      email: body.email?.trim(),
      noHp: body.noHp?.trim() || null,
      jabatan: body.jabatan?.trim(),
      campusId: body.campusId,
      hireDate: body.hireDate,
      bankName: body.bankName?.trim() || null,
      bankAccountNo: body.bankAccountNo?.trim() || null,
      bpjsEnrolled: body.bpjsEnrolled ?? false,
    },
  });

  return NextResponse.json(employee);
}
