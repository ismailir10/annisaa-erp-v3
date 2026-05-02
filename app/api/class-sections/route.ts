import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createClassSectionSchema } from "@/lib/validations/class-section";

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
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { success } = rateLimit(`create-class-section:${getClientIp(req)}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const parsed = createClassSectionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input tidak valid" },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // Block writes targeting INACTIVE/cross-tenant campus — see Campus DELETE guard.
  const activeCampus = await prisma.campus.findFirst({
    where: { id: body.campusId, tenantId: session.tenantId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!activeCampus) {
    return NextResponse.json(
      { error: "Kampus tidak ditemukan atau nonaktif." },
      { status: 400 },
    );
  }

  const section = await prisma.classSection.create({
    data: {
      tenantId: session.tenantId,
      programId: body.programId,
      academicYearId: body.academicYearId,
      name: body.name.trim(),
      capacity: body.capacity,
      campusId: body.campusId,
    },
  });

  revalidatePath("/api/class-sections");
  return NextResponse.json(section, { status: 201 });
}
