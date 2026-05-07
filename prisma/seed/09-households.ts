// Seed 09 — Demo Households. Idempotent via findFirst-then-create on
// (tenantId, code). The partial-unique index (tenantId, code) WHERE
// deletedAt IS NULL AND code IS NOT NULL lives in migration 07 only —
// schema does NOT declare @@unique([tenantId, code]) (would clash with the
// partial), so prisma.upsert is unavailable. P2002 from `create` is swallowed
// to handle a concurrent reseed race (e.g. `bash scripts/reseed-staging.sh`
// triggered twice in quick succession).
//
// Cycle: docs/cycles/2026-05-08-p2-entity-actions.md (T4)
import type { PrismaClient } from "@/lib/generated/prisma/client";

export const HOUSEHOLDS = [
  { code: "KK-001", notes: "Demo household — KK-001" },
  { code: "KK-002", notes: "Demo household — KK-002" },
  { code: "KK-003", notes: "Demo household — KK-003" },
  { code: "KK-004", notes: "Demo household — KK-004" },
  { code: "KK-005", notes: "Demo household — KK-005" },
  { code: "KK-006", notes: "Demo household — KK-006" },
  { code: "KK-007", notes: "Demo household — KK-007" },
  { code: "KK-008", notes: "Demo household — KK-008" },
] as const;

export async function seedHouseholds(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  for (const h of HOUSEHOLDS) {
    const existing = await prisma.household.findFirst({
      where: { tenantId, code: h.code, deletedAt: null },
    });
    if (existing) {
      console.log(`  ✓ Household ${h.code} (already present)`);
      continue;
    }
    try {
      await prisma.household.create({
        data: { tenantId, code: h.code, notes: h.notes },
      });
      console.log(`  ✓ Household ${h.code} (created)`);
    } catch (err: unknown) {
      // P2002 = Prisma unique constraint violation. Concurrent reseed window
      // between findFirst and create — let the other worker keep its row.
      // Narrow the swallow to violations that name `code` in `meta.target`
      // (i.e. the partial-unique on (tenantId, code) defined in migration 07);
      // a future @@unique on a different column would re-throw normally so
      // we don't silently mask a real schema bug.
      const e = err as { code?: string; meta?: { target?: string[] | string } };
      if (e?.code === "P2002") {
        const target = e.meta?.target;
        const onCodeIndex =
          (Array.isArray(target) && target.includes("code")) ||
          (typeof target === "string" && target.includes("code"));
        if (onCodeIndex) {
          console.log(`  ✓ Household ${h.code} (raced — already present)`);
          continue;
        }
      }
      throw err;
    }
  }
}
