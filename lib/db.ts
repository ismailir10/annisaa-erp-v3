// Runtime Prisma client — uses @prisma/adapter-pg against Supabase.
// NOTE: prisma/seed.ts uses @prisma/adapter-libsql against a local file:dev.db
// for local seeding; the seed is run manually (or via CI seed step) and does
// not share this module's adapter. Keep both in sync when schema changes.
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured. Set it in .env");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
