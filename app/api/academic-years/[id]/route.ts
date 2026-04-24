import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";

// Shared archive guard: block transition-to-ARCHIVED (whether via PUT
// status update or DELETE soft-delete) if any class section under the
// year still has ACTIVE student enrollments. Called from both PUT and
// DELETE so the two paths cannot diverge on the check.
async function getActiveEnrollmentBlocker(yearId: string): Promise<NextResponse | null> {
  const activeEnrollments = await prisma.studentEnrollment.count({
    where: { classSection: { academicYearId: yearId }, status: "ACTIVE" },
  });
  if (activeEnrollments > 0) {
    return NextResponse.json(
      { error: `Masih ada ${activeEnrollments} siswa aktif di tahun ajaran ini` },
      { status: 400 },
    );
  }
  return null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership
  const existing = await prisma.academicYear.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const body = await req.json();

  if (body.status === "ARCHIVED") {
    const blocker = await getActiveEnrollmentBlocker(id);
    if (blocker) return blocker;
  }

  const year = await prisma.academicYear.update({
    where: { id },
    data: {
      name: body.name?.trim(),
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status,
    },
  });
  return NextResponse.json(year);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership
  const existing = await prisma.academicYear.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  // DELETE archives the year (soft-delete). Apply the same active-enrollment
  // guard as PUT-to-ARCHIVED — the raw class-section-count check previously
  // here was stricter (blocked on any historical class section, even with
  // no active enrollments), which is inconsistent with the PUT semantics.
  const blocker = await getActiveEnrollmentBlocker(id);
  if (blocker) return blocker;

  // Soft delete — set status to ARCHIVED instead of hard delete
  await prisma.academicYear.update({ where: { id }, data: { status: "ARCHIVED" } });
  return NextResponse.json({ ok: true });
}
