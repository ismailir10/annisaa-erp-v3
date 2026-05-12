import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { validateBody } from "@/lib/api/validate";
import { updateStudentSchema } from "@/lib/validations/student";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json(null, { status: 401 });
  if (!isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const student = await prisma.student.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      guardians: { orderBy: { isPrimary: "desc" }, include: { parent: true } },
      enrollments: {
        include: {
          classSection: {
            include: {
              program: { select: { name: true, code: true } },
              academicYear: { select: { name: true } },
              campus: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(student);
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
  const existing = await prisma.student.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await validateBody(updateStudentSchema, await req.json());
  if (result.error) return result.error;
  const body = result.data;

  // Cascade: withdraw enrollments + cancel draft/sent invoices when student is deactivated or withdrawn
  if (body.status === "INACTIVE" || body.status === "WITHDRAWN") {
    await prisma.$transaction(async (tx) => {
      await tx.studentEnrollment.updateMany({
        where: { studentId: id, status: "ACTIVE" },
        data: { status: "WITHDRAWN" },
      });
      await tx.invoice.updateMany({
        where: { studentId: id, status: { in: ["DRAFT", "SENT", "PENDING_PAYMENT_LINK"] } },
        data: { status: "CANCELLED" },
      });
    });
  }

  const student = await prisma.student.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      nickname: body.nickname?.trim() || null,
      dateOfBirth: body.dateOfBirth || null,
      gender: body.gender || null,
      address: body.address?.trim() || null,
      notes: body.notes?.trim() || null,
      nis: body.nis !== undefined ? (body.nis?.trim() || null) : undefined,
      nisn: body.nisn !== undefined ? (body.nisn?.trim() || null) : undefined,
      birthPlace: body.birthPlace !== undefined ? (body.birthPlace?.trim() || null) : undefined,
      nik: body.nik !== undefined ? (body.nik?.trim() || null) : undefined,
      kkNumber: body.kkNumber !== undefined ? (body.kkNumber?.trim() || null) : undefined,
      livingWith: body.livingWith !== undefined ? (body.livingWith?.trim() || null) : undefined,
      addressLine: body.addressLine !== undefined ? (body.addressLine?.trim() || null) : undefined,
      addressVillageCode: body.addressVillageCode !== undefined ? (body.addressVillageCode?.trim() || null) : undefined,
      addressVillageName: body.addressVillageName !== undefined ? (body.addressVillageName?.trim() || null) : undefined,
      addressDistrictCode: body.addressDistrictCode !== undefined ? (body.addressDistrictCode?.trim() || null) : undefined,
      addressDistrictName: body.addressDistrictName !== undefined ? (body.addressDistrictName?.trim() || null) : undefined,
      addressRegencyCode: body.addressRegencyCode !== undefined ? (body.addressRegencyCode?.trim() || null) : undefined,
      addressRegencyName: body.addressRegencyName !== undefined ? (body.addressRegencyName?.trim() || null) : undefined,
      addressProvinceCode: body.addressProvinceCode !== undefined ? (body.addressProvinceCode?.trim() || null) : undefined,
      addressProvinceName: body.addressProvinceName !== undefined ? (body.addressProvinceName?.trim() || null) : undefined,
      metadata: body.metadata ? JSON.stringify(body.metadata) : existing.metadata,
      status: body.status ?? existing.status,
    },
  });

  return NextResponse.json(student);
}
