// Seed 05 — 8 system roles per foundation spec §6.2.
// Idempotent via findFirst-then-update (partial unique index on (tenantId, code)
// when deletedAt IS NULL; matching cycle convention from 03-programs.ts).
import type { PrismaClient } from "@/lib/generated/prisma/client";

export const SYSTEM_ROLES = [
  { code: "admin", name: "Administrator" },
  { code: "principal", name: "Kepala Sekolah" },
  { code: "kadiv", name: "Kepala Divisi" },
  { code: "homeroom_teacher", name: "Wali Kelas" },
  { code: "sentra_teacher", name: "Guru Sentra" },
  { code: "admission_officer", name: "Petugas Penerimaan Siswa" },
  { code: "finance_officer", name: "Petugas Keuangan" },
  { code: "parent", name: "Orang Tua" },
] as const;

export async function seedSystemRoles(prisma: PrismaClient, tenantId: string): Promise<void> {
  for (const r of SYSTEM_ROLES) {
    const existing = await prisma.role.findFirst({
      where: { tenantId, code: r.code, deletedAt: null },
    });
    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: { name: r.name, source: "SYSTEM" },
      });
      console.log(`  ✓ Role ${r.code} (updated)`);
    } else {
      await prisma.role.create({
        data: { tenantId, code: r.code, name: r.name, source: "SYSTEM" },
      });
      console.log(`  ✓ Role ${r.code} (created)`);
    }
  }
}
