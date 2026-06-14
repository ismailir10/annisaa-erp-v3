import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createClassSectionSchema } from "@/lib/validations/class-section";
import { reconcileSessions } from "@/lib/sessions/reconcile";

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

  // Block writes targeting a cross-tenant program — body.programId is written
  // directly into ClassTrack + ClassSection below, so it must belong to the
  // caller's tenant.
  const tenantProgram = await prisma.program.findFirst({
    where: { id: body.programId, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!tenantProgram) {
    return NextResponse.json(
      { error: "Program tidak ditemukan." },
      { status: 400 },
    );
  }

  // Every ClassSection belongs to a stable multi-year ClassTrack
  // (cycle 2026-05-15 academic-hierarchy-refactor). Resolve-or-create
  // the track for this (campus, program, name) tuple — ClassTrack is now
  // silent plumbing (its dedicated CRUD UI was retired in the kelas-page
  // cycle); a section created without a pre-existing track still needs one.
  const sectionName = body.name.trim();
  const classTrack = await prisma.classTrack.upsert({
    where: {
      tenantId_campusId_programId_name: {
        tenantId: session.tenantId,
        campusId: body.campusId,
        programId: body.programId,
        name: sectionName,
      },
    },
    update: {},
    create: {
      tenantId: session.tenantId,
      campusId: body.campusId,
      programId: body.programId,
      name: sectionName,
    },
  });

  const section = await prisma.classSection.create({
    data: {
      tenantId: session.tenantId,
      classTrackId: classTrack.id,
      programId: body.programId,
      academicYearId: body.academicYearId,
      name: sectionName,
      ageGroup: body.ageGroup,
      capacity: body.capacity,
      campusId: body.campusId,
    },
  });

  // Reactive session generation — the new section's ClassSession rows are
  // generated now, not via an admin "Generate" button. The create above has
  // already committed and is independently valid; if reconcile throws we log
  // it and still return 201 — reconcile is idempotent and re-runnable, and a
  // session fan-out failure must not roll back a legitimate section create.
  let reconcileWarning: string | undefined;
  try {
    await reconcileSessions(section.id);
  } catch (err) {
    console.error(
      `[class-sections POST] reconcileSessions failed for section ${section.id}:`,
      err,
    );
    reconcileWarning = "Sesi kelas akan dibuat ulang otomatis.";
  }

  revalidatePath("/api/class-sections");
  return NextResponse.json(
    reconcileWarning ? { ...section, reconcileWarning } : section,
    { status: 201 },
  );
}
