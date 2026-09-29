import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth-guards";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { loadRaportDraft } from "@/lib/curriculum/raport-aggregator";
import { RAPORT_WRITE_BUDGET, RAPORT_WRITE_WINDOW_MS, resolveTerm } from "../../../_helpers";

/**
 * POST /api/admin/report-cards/[studentId]/[termId]/sync-attendance
 *
 * ACAD-2: a saved raport keeps a snapshot of Sakit / Izin / Alpa / Hari sekolah.
 * Later attendance corrections diverge from it (the parent's attendance page
 * reads live data). This re-reads the student's attendance over the term and
 * rewrites ONLY those four columns on the existing entry — narratives, levels
 * and publish state are untouched. On a PUBLISHED raport this is the
 * "republish" path: same entry, refreshed numbers, parent cache evicted the
 * same way `publish` does. Gated by `reportCard.write`. Tenant-scoped + audited.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ studentId: string; termId: string }> },
) {
  const auth = await requirePermission("reportCard.write");
  if ("error" in auth) return auth.error;
  const { session } = auth;
  const { studentId, termId } = await ctx.params;

  const { success } = rateLimit(
    `raport-sync-attendance:${getClientIp(req)}`,
    RAPORT_WRITE_BUDGET,
    RAPORT_WRITE_WINDOW_MS,
  );
  if (!success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  const term = await resolveTerm(session.tenantId, termId);
  if (!term) return NextResponse.json({ error: "Triwulan tidak ditemukan." }, { status: 404 });

  const existing = await prisma.reportCardEntry.findFirst({
    where: { tenantId: session.tenantId, studentId, termId, deletedAt: null },
    select: {
      id: true,
      status: true,
      permittedAbsenceDays: true,
      sickDays: true,
      unexcusedAbsenceDays: true,
      totalSchoolDays: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Raport belum dibuat — simpan terlebih dahulu." }, { status: 404 });
  }

  const { attendance } = await loadRaportDraft(session.tenantId, studentId, term);

  const updated = await prisma.reportCardEntry.update({
    where: { id: existing.id },
    data: {
      permittedAbsenceDays: attendance.permittedAbsenceDays,
      sickDays: attendance.sickDays,
      unexcusedAbsenceDays: attendance.unexcusedAbsenceDays,
      totalSchoolDays: attendance.totalSchoolDays,
    },
    select: {
      id: true,
      status: true,
      permittedAbsenceDays: true,
      sickDays: true,
      unexcusedAbsenceDays: true,
      totalSchoolDays: true,
    },
  });

  await recordAudit({
    tenantId: session.tenantId,
    actorId: session.id,
    entity: "ReportCardEntry",
    entityId: existing.id,
    action: "sync-attendance",
    before: {
      permittedAbsenceDays: existing.permittedAbsenceDays,
      sickDays: existing.sickDays,
      unexcusedAbsenceDays: existing.unexcusedAbsenceDays,
      totalSchoolDays: existing.totalSchoolDays,
    },
    after: { ...attendance },
  });

  // Same eviction `publish` does, so /parent/reports shows the refreshed
  // numbers without waiting out the 120s TTL.
  revalidateTag("parent-report-cards", { expire: 0 });

  return NextResponse.json({ data: updated });
}
