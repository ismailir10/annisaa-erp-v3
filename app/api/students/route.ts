import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status");
  const classSectionId = searchParams.get("classSectionId");

  const where: Record<string, unknown> = { tenantId: session.tenantId };
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { nickname: { contains: search } },
    ];
  }

  let studentIds: string[] | undefined;
  if (classSectionId) {
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { classSectionId, status: "ACTIVE" },
      select: { studentId: true },
    });
    studentIds = enrollments.map((e) => e.studentId);
    where.id = { in: studentIds };
  }

  const students = await prisma.student.findMany({
    where,
    include: {
      guardians: { where: { isPrimary: true }, take: 1 },
      enrollments: {
        where: { status: "ACTIVE" },
        include: { classSection: { select: { name: true, program: { select: { name: true } } } } },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(students);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Nama siswa wajib diisi" }, { status: 400 });
  }

  const student = await prisma.student.create({
    data: {
      tenantId: session.tenantId,
      name: body.name.trim(),
      nickname: body.nickname?.trim() || null,
      dateOfBirth: body.dateOfBirth || null,
      gender: body.gender || null,
      address: body.address?.trim() || null,
      notes: body.notes?.trim() || null,
      metadata: body.metadata ? JSON.stringify(body.metadata) : null,
    },
  });

  // Create guardians if provided
  if (body.guardians?.length) {
    for (const g of body.guardians) {
      await prisma.guardian.create({
        data: {
          studentId: student.id,
          name: g.name?.trim(),
          relationship: g.relationship ?? "WALI",
          phone: g.phone?.trim() || null,
          email: g.email?.trim() || null,
          whatsapp: g.whatsapp?.trim() || null,
          isPrimary: g.isPrimary ?? false,
        },
      });
    }
  }

  return NextResponse.json(student, { status: 201 });
}
