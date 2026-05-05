// Seed 07 — 8 Sentra catalog rows per foundation spec §6.2.
// Idempotent via findFirst-then-update (partial unique index on (tenantId, code)
// WHERE deletedAt IS NULL — matches the cycle convention established by
// 03-programs.ts and 05-system-roles.ts).
//
// Sentra = PAUD learning-center categories. Standard 8 used in Indonesian
// kindergarten / preschool curricula. Codes UPPERCASE_SNAKE per §4.4.
// Display names in Indonesian per spec §4.5 voice convention.
import type { PrismaClient } from "@/lib/generated/prisma/client";

export const SYSTEM_SENTRA = [
  { code: "PERSIAPAN", name: "Sentra Persiapan", displayOrder: 10 },
  { code: "BALOK", name: "Sentra Balok", displayOrder: 20 },
  { code: "BAHAN_ALAM", name: "Sentra Bahan Alam", displayOrder: 30 },
  { code: "MAIN_PERAN", name: "Sentra Main Peran", displayOrder: 40 },
  { code: "SENI", name: "Sentra Seni", displayOrder: 50 },
  { code: "IMTAQ", name: "Sentra Imtaq", displayOrder: 60 },
  { code: "MEMASAK", name: "Sentra Memasak", displayOrder: 70 },
  { code: "OLAH_TUBUH", name: "Sentra Olah Tubuh", displayOrder: 80 },
] as const;

export async function seedSentra(prisma: PrismaClient, tenantId: string): Promise<void> {
  for (const s of SYSTEM_SENTRA) {
    const existing = await prisma.sentra.findFirst({
      where: { tenantId, code: s.code, deletedAt: null },
    });
    if (existing) {
      await prisma.sentra.update({
        where: { id: existing.id },
        data: { name: s.name, displayOrder: s.displayOrder, source: "SYSTEM" },
      });
      console.log(`  ✓ Sentra ${s.code} (updated)`);
    } else {
      await prisma.sentra.create({
        data: {
          tenantId,
          code: s.code,
          name: s.name,
          displayOrder: s.displayOrder,
          source: "SYSTEM",
        },
      });
      console.log(`  ✓ Sentra ${s.code} (created)`);
    }
  }
}
