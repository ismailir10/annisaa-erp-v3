// Seed orchestrator. Runs phase 1 cycle 1 seeds in order. Idempotent under
// repeat invocation. Wired via prisma.config.ts → "npx tsx prisma/seed/index.ts".
import { prisma } from "@/lib/db";
import { seedTenant } from "./00-tenant";
import { seedCampuses } from "./02-campuses";
import { seedPrograms } from "./03-programs";
import { seedAcademicYear } from "./04-academic-year";
import { seedSystemRoles } from "./05-system-roles";
import { seedPermissions } from "./06-permissions";

async function main(): Promise<void> {
  console.log("→ seed: starting");

  console.log("→ 00-tenant");
  const { tenantId } = await seedTenant(prisma);

  console.log("→ 02-campuses");
  await seedCampuses(prisma, tenantId);

  console.log("→ 03-programs");
  await seedPrograms(prisma, tenantId);

  console.log("→ 04-academic-year");
  await seedAcademicYear(prisma, tenantId);

  console.log("→ 05-system-roles");
  await seedSystemRoles(prisma, tenantId);

  console.log("→ 06-permissions");
  await seedPermissions(prisma, tenantId);

  console.log("→ seed: complete");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
