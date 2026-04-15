import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Cache GET responses for 2 hours — class sections change ~once per semester
export const revalidate = 7200;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const { searchParams } = new URL(req.url);
  const programId = searchParams.get("programId");
  const academicYearId = searchParams.get("academicYearId");

  const where: Record<string, unknown> = { tenantId: session.tenantId };
  if (programId) where.programId = programId;
  if (academicYearId) where.academicYearId = academicYearId;

  const sections = await prisma.classSection.findMany({
    where,
    include: {
      program: { select: { name: true, code: true } },
      academicYear: { select: { name: true } },
      campus: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(sections);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId || session.role !== "SCHOOL_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const section = await prisma.classSection.create({
    data: {
      tenantId: session.tenantId,
      programId: body.programId,
      academicYearId: body.academicYearId,
      name: body.name?.trim(),
      capacity: body.capacity ?? 20,
      campusId: body.campusId,
    },
  });

  revalidatePath("/api/class-sections");
  return NextResponse.json(section, { status: 201 });
}
