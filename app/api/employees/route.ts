import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const campusId = searchParams.get("campusId");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = { tenantId: session.tenantId };
  if (campusId) where.campusId = campusId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { nama: { contains: search } },
      { kode: { contains: search } },
      { email: { contains: search } },
    ];
  }

  const employees = await prisma.employee.findMany({
    where,
    include: { campus: { select: { name: true } } },
    orderBy: { nama: "asc" },
  });

  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { nama, email, jabatan, campusId, hireDate, formalName, noHp, bankName, bankAccountNo, bpjsEnrolled } = body;

  if (!nama?.trim() || !email?.trim() || !jabatan?.trim() || !campusId || !hireDate) {
    return NextResponse.json({ error: "Nama, email, jabatan, kampus, dan tanggal masuk wajib diisi" }, { status: 400 });
  }

  // Auto-generate employee code: initials + sequence number
  const initials = nama.trim().split(/\s+/).map((w: string) => w[0]?.toUpperCase()).join("").slice(0, 3);
  const lastEmployee = await prisma.employee.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { kode: "desc" },
  });
  // Extract trailing number from last code, increment
  const lastNum = lastEmployee?.kode.match(/(\d+)$/)?.[1];
  const nextNum = lastNum ? parseInt(lastNum) + 1 : (await prisma.employee.count({ where: { tenantId: session.tenantId } })) + 1;
  const kode = `${initials}${nextNum}`;

  const employee = await prisma.employee.create({
    data: {
      tenantId: session.tenantId,
      kode,
      nama: nama.trim(),
      formalName: formalName?.trim() || null,
      email: email.trim(),
      noHp: noHp?.trim() || null,
      jabatan: jabatan.trim(),
      campusId,
      hireDate,
      bankName: bankName?.trim() || null,
      bankAccountNo: bankAccountNo?.trim() || null,
      bpjsEnrolled: bpjsEnrolled ?? false,
    },
  });

  // Create teacher user account
  await prisma.user.create({
    data: {
      tenantId: session.tenantId,
      email: email.trim(),
      role: "TEACHER",
      name: nama.trim(),
      employeeId: employee.id,
    },
  });

  return NextResponse.json(employee, { status: 201 });
}
