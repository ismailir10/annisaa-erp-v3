import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireGuardianForStudent } from "@/lib/student-journal/guards";
import { homeEntryBatchSchema } from "@/lib/validations/student-journal";
import { rateLimit } from "@/lib/rate-limit";

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
        status: "ACTIVE",
        category: {
          templateId: tmpl.id,
          scope: "HOME",
        },
      },
      select: { id: true },
    });

    if (validIndicators.length !== indicatorIds.length) {
      return NextResponse.json({ error: "Indikator tidak valid" }, { status: 400 });
    }
  }

  // Upsert entries in a transaction
  const saved = await prisma.$transaction(
    entries.map((entry) =>
      prisma.studentJournalEntry.upsert({
        where: {
          studentId_indicatorId_date_scope: {
            studentId,
            indicatorId: entry.indicatorId,
            date,
            scope: "HOME",
          },
        },
        update: {
          checked: entry.checked,
          recordedByUserId: session.id,
        },
        create: {
          tenantId: session.tenantId,
          studentId,
          classSectionId: null,
          indicatorId: entry.indicatorId,
          date,
          scope: "HOME",
          checked: entry.checked,
          recordedByUserId: session.id,
        },
      }),
    ),
  );

  return NextResponse.json({ data: { saved: saved.length } });
}
