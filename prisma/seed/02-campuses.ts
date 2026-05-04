// Seed 02 — Campuses. Idempotent: find by (tenantId, code) since the unique
// is a partial index (WHERE deletedAt IS NULL) and Prisma upsert only accepts
// declarative @@unique. Source: docs/research/artifacts/website-an-nisaa.md.
import type { PrismaClient } from "@/lib/generated/prisma/client";

export const CAMPUSES = [
  {
    code: "METLAND",
    name: "An Nisaa Sekolahku — Metland Cibitung",
    address: "Perumahan Metland Cibitung Blok P2/2-3, Telaga Murni, Cikarang Barat",
    phone: "+62 21 8953 3593",
    email: "ceceannisaa@gmail.com",
  },
  {
    code: "ASTER",
    name: "An Nisaa Sekolahku — Taman Aster",
    address: "Perumahan Taman Aster Blok A1/16 & A1/46, RT 009 RW 07, Telaga Asih, Cikarang Barat",
    phone: "+62 21 2213 7709",
    email: "ceceannisaa@gmail.com",
  },
] as const;

export async function seedCampuses(prisma: PrismaClient, tenantId: string): Promise<void> {
  for (const c of CAMPUSES) {
    const existing = await prisma.campus.findFirst({
      where: { tenantId, code: c.code, deletedAt: null },
    });
    if (existing) {
      await prisma.campus.update({
        where: { id: existing.id },
        data: { name: c.name, address: c.address, phone: c.phone, email: c.email },
      });
      console.log(`  ✓ Campus ${c.code} (updated)`);
    } else {
      await prisma.campus.create({ data: { tenantId, ...c } });
      console.log(`  ✓ Campus ${c.code} (created)`);
    }
  }
}
