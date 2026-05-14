import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateClassSectionSchema } from "@/lib/validations/class-section";
import { reconcileSessions } from "@/lib/sessions/reconcile";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { success } = rateLimit(`update-class-section:${getClientIp(req)}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const existing = await prisma.classSection.findFirst({
    where: { id, program: { tenantId: session.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const parsed = updateClassSectionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  // Block re-assignment to INACTIVE/cross-tenant campus — see Campus DELETE guard.
  if (body.campusId) {
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
  }

  if (body.capacity !== undefined) {
    const currentEnrollment = await prisma.studentEnrollment.count({
      where: { classSectionId: id, status: "ACTIVE" },
    });
    if (body.capacity < currentEnrollment) {
      return NextResponse.json({ error: `Kapasitas tidak bisa kurang dari jumlah siswa terdaftar (${currentEnrollment})` }, { status: 400 });
    }
  }

  const section = await prisma.classSection.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      capacity: body.capacity,
      campusId: body.campusId,
      status: body.status,
      slotTemplate: body.slotTemplate,
    },
  });

  // Reactive session generation: a slotTemplate change reshapes the per-day
  // slot fan-out (FULL_DAY ⇄ MORNING_AND_AFTERNOON), so the section's
  // ClassSession rows must be regenerated. Only reconcile when slotTemplate
  // actually changed — a name/capacity/campus edit leaves sessions untouched.
  // (A status flip to INACTIVE needs no reconcile: Task 2 made reconcile a
  // no-op for INACTIVE sections, so we skip it rather than spend the query.)
  // The update above has already committed; if reconcile throws we log it and
  // still return 200 — reconcile is idempotent and re-runnable, and a session
  // fan-out failure must not roll back a legitimate section update.
  let reconcileWarning: string | undefined;
  if (body.slotTemplate !== undefined && body.slotTemplate !== existing.slotTemplate) {
    try {
      await reconcileSessions(id);
    } catch (err) {
      console.error(
        `[class-sections PUT] reconcileSessions failed for section ${id}:`,
        err,
      );
      reconcileWarning = "Sesi kelas akan dibuat ulang otomatis.";
    }
  }

  return NextResponse.json(
    reconcileWarning ? { ...section, reconcileWarning } : section,
  );
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership via program→tenant
  const existing = await prisma.classSection.findFirst({
    where: { id, program: { tenantId: session.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const enrollCount = await prisma.studentEnrollment.count({ where: { classSectionId: id } });
  if (enrollCount > 0) {
    return NextResponse.json({ error: `Tidak bisa dihapus: ${enrollCount} siswa terdaftar` }, { status: 400 });
  }

  // Soft delete — ClassSection has status field (ACTIVE/INACTIVE). Set to INACTIVE.
  await prisma.classSection.update({ where: { id }, data: { status: "INACTIVE" } });
  return NextResponse.json({ ok: true });
}
