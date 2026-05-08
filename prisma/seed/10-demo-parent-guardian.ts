// Seed 10 — Demo Parent Guardian (+ unowned fixture). Closes p2-portal-shell-sidebar
// SD2 deferral: the SELF-write canary at `lib/guardians/actions/update.ts` precheck
// `findFirst({ id, tenantId, deletedAt: null, userId: session.userId })` returns null
// for `parent@demo.local` because no demo Guardian carries the `userId` link. Real-tenant
// parents acquire the link via invitation acceptance; demo skips invitation entirely.
//
// Two rows, both idempotent:
//   1. Owned: { userId === parent@demo.local.id, fullName: 'Demo Parent Guardian' }
//      → SELF predicate at the action resolves to this row.
//   2. Unowned fixture: { userId: null, fullName: 'Demo Other Guardian' }
//      → exists so the Playwright canary's Path-B has a concrete row to assert
//        NOT_FOUND against. Without it, "regression that drops the SELF predicate"
//        detection is vacuous (the row literally wouldn't exist).
//
// Cycle: docs/cycles/2026-05-08-p2-portal-write-widening.md (T1)

import type { PrismaClient } from "@/lib/generated/prisma/client";

export const PARENT_OWNED_GUARDIAN_NAME = "Demo Parent Guardian";
export const UNOWNED_FIXTURE_GUARDIAN_NAME = "Demo Other Guardian";
const PARENT_DEMO_EMAIL = "parent@demo.local";

export async function seedDemoParentGuardian(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  const parent = await prisma.user.findFirst({
    where: { tenantId, email: PARENT_DEMO_EMAIL, deletedAt: null },
    select: { id: true },
  });
  if (!parent) {
    throw new Error(
      "seedDemoParentGuardian: parent User missing — run 08-demo-users first",
    );
  }

  // Owned row — keyed on (tenantId, userId) since real-tenant parents have
  // a 1:1 User↔Guardian link via invitation acceptance. No partial-unique
  // constraint enforces 1:1 at the DB layer (schema 1192 is `@@unique([id,
  // tenantId])` only) — idempotency is application-level.
  const existingOwned = await prisma.guardian.findFirst({
    where: { tenantId, userId: parent.id, deletedAt: null },
    select: { id: true },
  });
  if (existingOwned) {
    await prisma.guardian.update({
      where: { id: existingOwned.id },
      data: { fullName: PARENT_OWNED_GUARDIAN_NAME, deletedAt: null },
    });
    console.log(`  ✓ Guardian "${PARENT_OWNED_GUARDIAN_NAME}" (updated)`);
  } else {
    await prisma.guardian.create({
      data: {
        tenantId,
        userId: parent.id,
        fullName: PARENT_OWNED_GUARDIAN_NAME,
      },
    });
    console.log(`  ✓ Guardian "${PARENT_OWNED_GUARDIAN_NAME}" (created)`);
  }

  // Unowned fixture — keyed on (tenantId, fullName, userId IS NULL). No
  // refresh-on-hit because there are no fields to update meaningfully.
  const existingFixture = await prisma.guardian.findFirst({
    where: {
      tenantId,
      fullName: UNOWNED_FIXTURE_GUARDIAN_NAME,
      userId: null,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existingFixture) {
    console.log(`  ✓ Guardian "${UNOWNED_FIXTURE_GUARDIAN_NAME}" (already present)`);
  } else {
    await prisma.guardian.create({
      data: {
        tenantId,
        userId: null,
        fullName: UNOWNED_FIXTURE_GUARDIAN_NAME,
      },
    });
    console.log(`  ✓ Guardian "${UNOWNED_FIXTURE_GUARDIAN_NAME}" (created)`);
  }
}
