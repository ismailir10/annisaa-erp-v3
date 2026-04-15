import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) { console.error("No tenant found"); process.exit(1); }
  const tenantId = tenant.id;
  console.log("Tenant:", tenant.name);

  const existing = await prisma.user.findMany({ where: { role: { in: ["SCHOOL_ADMIN", "SUPER_ADMIN"] } } });
  console.log("Before:", existing.map(u => `${u.id.slice(0,12)}:${u.role}`));

  // Run data migration: rename SCHOOL_ADMIN → SUPER_ADMIN
  const migrated = await prisma.$executeRaw`UPDATE "User" SET role = 'SUPER_ADMIN' WHERE role = 'SCHOOL_ADMIN'`;
  console.log(`Migrated ${migrated} SCHOOL_ADMIN rows → SUPER_ADMIN`);

  // Upsert u_super_admin
  const superEmail = "admin@annisaa.sch.id";
  const existingSuper = await prisma.user.findFirst({ where: { tenantId, email: superEmail } });
  if (existingSuper && existingSuper.id !== "u_super_admin") {
    // Can't change ID, so update the existing record's role and check if u_super_admin needs creating
    const stableExists = await prisma.user.findUnique({ where: { id: "u_super_admin" } });
    if (!stableExists) {
      await prisma.user.create({ data: { id: "u_super_admin", tenantId, email: "demo_super@annisaa.sch.id", role: "SUPER_ADMIN", name: "Super Admin" } });
      console.log("Created u_super_admin with alternate email (original admin has different id)");
    }
  } else if (!existingSuper) {
    try {
      await prisma.user.create({ data: { id: "u_super_admin", tenantId, email: superEmail, role: "SUPER_ADMIN", name: "Super Admin" } });
      console.log("Created u_super_admin");
    } catch {
      // ID exists but email different — ensure role is correct
      await prisma.user.update({ where: { id: "u_super_admin" }, data: { role: "SUPER_ADMIN" } });
    }
  } else {
    await prisma.user.update({ where: { id: existingSuper.id }, data: { role: "SUPER_ADMIN" } });
    if (existingSuper.id !== "u_super_admin") {
      try {
        await prisma.user.create({ data: { id: "u_super_admin", tenantId, email: "demo_super@annisaa.sch.id", role: "SUPER_ADMIN", name: "Super Admin" } });
      } catch { /* already exists */ }
    }
    console.log("Updated existing super admin");
  }

  // Upsert u_school_admin
  const stableSchool = await prisma.user.findUnique({ where: { id: "u_school_admin" } });
  if (!stableSchool) {
    await prisma.user.create({ data: { id: "u_school_admin", tenantId, email: "schooladmin@annisaa.sch.id", role: "SCHOOL_ADMIN", name: "Admin Sekolah" } });
    console.log("Created u_school_admin");
  } else {
    await prisma.user.update({ where: { id: "u_school_admin" }, data: { role: "SCHOOL_ADMIN", name: "Admin Sekolah" } });
    console.log("Updated u_school_admin");
  }

  // Ensure u_super_admin exists (final check)
  const finalSuper = await prisma.user.findUnique({ where: { id: "u_super_admin" } });
  if (!finalSuper) {
    await prisma.user.create({ data: { id: "u_super_admin", tenantId, email: "demo_super@annisaa.sch.id", role: "SUPER_ADMIN", name: "Super Admin" } });
  }

  const after = await prisma.user.findMany({ where: { role: { in: ["SCHOOL_ADMIN", "SUPER_ADMIN"] } } });
  console.log("After:", after.map(u => `${u.id}:${u.role}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
