// Seed 03 — Programs (6 jenjang). Source: foundation spec §6.2 + research
// docs/research/2026-05-04-nisaa-teacher-insights.md §6.3 ("6 jenjang berbeda
// dari ~6 bulan – 6 tahun"). Idempotent via findFirst + upsert pattern (partial
// unique index on code).
import type { PrismaClient } from "@/lib/generated/prisma/client";

export const PROGRAMS = [
  { code: "DAYCARE", name: "Daycare (D'Care)", ageMonthsMin: 6, ageMonthsMax: 24, displayOrder: 1 },
  { code: "TODDLER_1", name: "Toddler 1", ageMonthsMin: 18, ageMonthsMax: 30, displayOrder: 2 },
  { code: "TODDLER_2", name: "Toddler 2", ageMonthsMin: 24, ageMonthsMax: 36, displayOrder: 3 },
  { code: "PLAYGROUP", name: "Kelompok Bermain (KB)", ageMonthsMin: 30, ageMonthsMax: 48, displayOrder: 4 },
  { code: "TK_A", name: "TK A", ageMonthsMin: 48, ageMonthsMax: 60, displayOrder: 5 },
  { code: "TK_B", name: "TK B", ageMonthsMin: 60, ageMonthsMax: 84, displayOrder: 6 },
] as const;

export async function seedPrograms(prisma: PrismaClient, tenantId: string): Promise<void> {
  for (const p of PROGRAMS) {
    const existing = await prisma.program.findFirst({
      where: { tenantId, code: p.code, deletedAt: null },
    });
    if (existing) {
      await prisma.program.update({
        where: { id: existing.id },
        data: {
          name: p.name,
          ageMonthsMin: p.ageMonthsMin,
          ageMonthsMax: p.ageMonthsMax,
          displayOrder: p.displayOrder,
        },
      });
      console.log(`  ✓ Program ${p.code} (updated)`);
    } else {
      await prisma.program.create({ data: { tenantId, ...p } });
      console.log(`  ✓ Program ${p.code} (created)`);
    }
  }
}
