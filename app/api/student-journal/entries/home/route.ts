import { NextRequest, NextResponse } from "next/server";
import { JournalStatus } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { requireGuardianForStudent } from "@/lib/student-journal/guards";
import { homeEntryBatchSchema } from "@/lib/validations/student-journal";
import { rateLimit } from "@/lib/rate-limit";
import { getTodayInTimezone } from "@/lib/attendance/timezone";
import { upsertJournalEntriesWithAudit } from "@/lib/student-journal/entry-writes";
import { isHomeEntryDateEditable } from "@/lib/student-journal/backfill";

/**
 * Indonesian copy when the parent attempts to edit a home entry outside the
 * backfill window (before the floor, or any future date). Server-side
 * enforced; the same string is surfaced by the client toast so the rule is
 * consistent across the boundary.
 */
const HOME_EDIT_WINDOW_MSG =
  "Tanggal di luar jangkauan. Hanya bisa diubah dari Senin pekan lalu sampai hari ini.";

export async function POST(req: NextRequest) {
  // Parse body first so we can extract studentId for the rate-limit key
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const parsed = homeEntryBatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Input tidak valid" },
      { status: 400 },
    );
  }

  const { studentId, date, entries } = parsed.data;

  // Rate limit per guardian-student pair
  const rl = rateLimit(`sj-home-${studentId}`, 60, 60_000);
  if (!rl.success) {
    return NextResponse.json({ error: "Terlalu banyak permintaan" }, { status: 429 });
  }

  // Auth: verify caller is a guardian of this student
  const guard = await requireGuardianForStudent(studentId);
  if (guard.error) return guard.error;
  const { session } = guard;

  // Bounded backfill window (UAT 2026-05-01 cycle T4; window widened by
  // owner decision 13 Aug 2026 — see lib/student-journal/backfill.ts). The
  // parent's "Di Rumah" tab may now backfill a missed day, but only inside a
  // visible, bounded window: from the Monday of the previous week through
  // today, inclusive. What stays forbidden is *unbounded* past-day backfill
  // and any future date — the original defect was silent, unbounded editing,
  // not backfill itself. Tenant timezone is "Asia/Jakarta" (single-tenant
  // MVP; OrgConfig.timezone defaults to it). Lift to a session-derived
  // timezone when multi-tenant arrives.
  const today = getTodayInTimezone("Asia/Jakarta");
  if (!isHomeEntryDateEditable(date, today)) {
    return NextResponse.json({ error: HOME_EDIT_WINDOW_MSG }, { status: 400 });
  }

  // Validate all indicator IDs: must be HOME-scope and belong to tenant template
  const tmpl = await prisma.studentJournalTemplate.findUnique({
    where: { tenantId: session.tenantId },
    select: { id: true },
  });
  if (!tmpl) {
    return NextResponse.json({ error: "Template tidak ditemukan" }, { status: 400 });
  }

  if (entries.length > 0) {
    const indicatorIds = [...new Set(entries.map((e) => e.indicatorId))];

    const validIndicators = await prisma.studentJournalIndicator.findMany({
      where: {
        id: { in: indicatorIds },
        status: JournalStatus.ACTIVE,
        category: {
          templateId: tmpl.id,
          scope: "HOME",
          template: { tenantId: session.tenantId },
        },
      },
      select: { id: true },
    });

    if (validIndicators.length !== indicatorIds.length) {
      return NextResponse.json({ error: "Indikator tidak valid" }, { status: 400 });
    }
  }

  // Upsert + audit in one transaction (see lib/student-journal/entry-writes).
  const saved = await upsertJournalEntriesWithAudit({
    tenantId: session.tenantId,
    actorUserId: session.id,
    date,
    scope: "HOME",
    classSectionId: null,
    entries: entries.map((e) => ({
      studentId,
      indicatorId: e.indicatorId,
      checked: e.checked,
    })),
  });

  return NextResponse.json({ data: { saved } });
}
