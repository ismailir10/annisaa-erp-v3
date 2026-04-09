import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json(null, { status: 401 });

  const { id } = await params;
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      guardians: { orderBy: { isPrimary: "desc" } },
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

  if (!student || student.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(student);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.student.findUnique({ where: { id } });
  if (!existing || existing.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const student = await prisma.student.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      nickname: body.nickname?.trim() || null,
      dateOfBirth: body.dateOfBirth || null,
      gender: body.gender || null,
      address: body.address?.trim() || null,
      notes: body.notes?.trim() || null,
      metadata: body.metadata ? JSON.stringify(body.metadata) : existing.metadata,
      status: body.status ?? existing.status,
    },
  });

  return NextResponse.json(student);
}
