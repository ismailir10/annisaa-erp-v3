import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const classSectionId = searchParams.get("classSectionId");
  const employeeId = searchParams.get("employeeId");

  const where: Record<string, unknown> = {
    employee: { tenantId: session.tenantId },
  };
  if (classSectionId) where.classSectionId = classSectionId;
  if (employeeId) where.employeeId = employeeId;

  const assignments = await prisma.teachingAssignment.findMany({
    where,
    include: {
      employee: { select: { id: true, nama: true, kode: true, jabatan: true } },
      classSection: {
        select: { id: true, name: true, program: { select: { name: true } }, campus: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assignments);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { employeeId, classSectionId, role } = await req.json();
  if (!employeeId || !classSectionId) {
    return NextResponse.json({ error: "Guru dan kelas wajib dipilih" }, { status: 400 });
  }

  // Check for duplicate
  const existing = await prisma.teachingAssignment.findUnique({
    where: { employeeId_classSectionId: { employeeId, classSectionId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Guru sudah ditugaskan ke kelas ini" }, { status: 400 });
  }

  const assignment = await prisma.teachingAssignment.create({
    data: { employeeId, classSectionId, role: role ?? "HOMEROOM" },
  });

  return NextResponse.json(assignment, { status: 201 });
}
