// Seed 00 — An Nisaa Sekolahku tenant. Idempotent upsert keyed on slug.
// Reference: foundation spec §6.2 (seed list) + §18.1 (phase 1 cycle 1 scope).
import type { PrismaClient } from "@/lib/generated/prisma/client";

export const TENANT_SLUG = "an-nisaa-sekolahku";
export const TENANT_NAME = "An Nisaa Sekolahku";

export async function seedTenant(prisma: PrismaClient): Promise<{ tenantId: string }> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: { name: TENANT_NAME },
    create: {
      slug: TENANT_SLUG,
      name: TENANT_NAME,
      bootstrapStatus: "PENDING",
    },
  });
  console.log(`  ✓ Tenant ${tenant.slug} (${tenant.id})`);
  return { tenantId: tenant.id };
}
