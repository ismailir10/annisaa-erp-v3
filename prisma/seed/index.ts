// Seed orchestrator. Runs phase 1 cycle 1+2+3 seeds in order. Idempotent
// under repeat invocation. Wired via prisma.config.ts → "npx tsx prisma/seed/index.ts".
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "@/lib/db";
import { seedTenant } from "./00-tenant";
import { seedCampuses } from "./02-campuses";
import { seedPrograms } from "./03-programs";
import { seedAcademicYear } from "./04-academic-year";
import { seedSystemRoles } from "./05-system-roles";
import { seedPermissions } from "./06-permissions";
import { seedSentra } from "./07-sentra";

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  console.log(`→ ${label}`);
  const result = await fn();
  console.log(`  ✓ ${label} (${((Date.now() - t0) / 1000).toFixed(2)}s)`);
  return result;
}

async function seedRegions(): Promise<void> {
  // 91k-row vendored snapshot from idn-area-data v4.0.1 (commit b36d0792).
  // Single transaction, idempotent via ON CONFLICT (id) DO UPDATE.
  // Regenerate via: npx tsx scripts/generate-regions-sql.ts
  const sqlPath = resolve(__dirname, "01-regions.sql");
  const sql = readFileSync(sqlPath, "utf8");
  await prisma.$executeRawUnsafe(sql);
}

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log("→ seed: starting");

  const { tenantId } = await timed("00-tenant", () => seedTenant(prisma));
  await timed("01-regions", seedRegions);
  await timed("02-campuses", () => seedCampuses(prisma, tenantId));
  await timed("03-programs", () => seedPrograms(prisma, tenantId));
  await timed("04-academic-year", () => seedAcademicYear(prisma, tenantId));
  await timed("05-system-roles", () => seedSystemRoles(prisma, tenantId));
  await timed("06-permissions", () => seedPermissions(prisma, tenantId));
  await timed("07-sentra", () => seedSentra(prisma, tenantId));

  console.log(`→ seed: complete (${((Date.now() - t0) / 1000).toFixed(2)}s total)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
