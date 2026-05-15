import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, isAdminRole } from "@/lib/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { updateTeachingAssignmentSchema } from "@/lib/validations/teaching-assignment";
import { backfillSessionTeacher } from "@/lib/sessions/teacher-backfill";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { success } = rateLimit(`update-teaching-assignment:${getClientIp(req)}`, 20, 60_000);
  if (!success) return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });

  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership via employee→tenant
  const existing = await prisma.teachingAssignment.findFirst({
    where: { id, employee: { tenantId: session.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  const parsed = updateTeachingAssignmentSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const updated = await prisma.teachingAssignment.update({
    where: { id },
    data: { role: parsed.data.role },
  });

  // A role change can flip which employee is the section's effective HOMEROOM
  // (this row gained or lost HOMEROOM). Re-derive the teacher snapshot on the
  // section's future ClassSession rows whenever the HOMEROOM-ness of this
  // assignment changed. backfillSessionTeacher reads the post-update DB state,
  // so it correctly resolves whatever homeroom is now effective (or NULLs the
  // fields if none remains). The update above has already committed; a
  // backfill failure is logged but never rolls back the role change — the
  // backfill is re-runnable.
  let reconcileWarning: string | undefined;
  const homeroomChanged =
    (existing.role === "HOMEROOM") !== (parsed.data.role === "HOMEROOM");
  if (homeroomChanged) {
    try {
      await backfillSessionTeacher(updated.classSectionId, session.tenantId);
    } catch (err) {
      console.error(
        `[teaching-assignments PUT] backfillSessionTeacher failed for section ${updated.classSectionId}:`,
        err,
      );
      reconcileWarning = "Guru sesi kelas akan diperbarui otomatis.";
    }
  }

  return NextResponse.json(
    reconcileWarning ? { ...updated, reconcileWarning } : updated,
  );
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.tenantId || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Verify tenant ownership via employee→tenant
  const existing = await prisma.teachingAssignment.findFirst({
    where: { id, employee: { tenantId: session.tenantId } },
  });
  if (!existing) return NextResponse.json({ error: "Tidak ditemukan" }, { status: 404 });

  // Intentional hard delete — junction table, no status field
  await prisma.teachingAssignment.delete({ where: { id } });

  // Removing the section's HOMEROOM leaves it without an effective homeroom.
  // Re-derive the teacher snapshot on the section's future ClassSession rows:
  // backfillSessionTeacher reads the post-delete DB state, finds no HOMEROOM,
  // and NULLs teacherId/defaultTeacherId on future non-substituted rows.
  // Substituted rows (teacherId !== defaultTeacherId) are left untouched. The
  // delete above has already committed; a backfill failure is logged but never
  // rolls back the deletion — the backfill is re-runnable.
  let reconcileWarning: string | undefined;
  if (existing.role === "HOMEROOM") {
    try {
      await backfillSessionTeacher(existing.classSectionId, session.tenantId);
    } catch (err) {
      console.error(
        `[teaching-assignments DELETE] backfillSessionTeacher failed for section ${existing.classSectionId}:`,
        err,
      );
      reconcileWarning = "Guru sesi kelas akan diperbarui otomatis.";
    }
  }

  return NextResponse.json(
    reconcileWarning ? { ok: true, reconcileWarning } : { ok: true },
  );
}
