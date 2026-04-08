import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const dbUrl = process.env.DATABASE_URL || "";

  if (dbUrl.startsWith("postgres")) {
    const adapter = new PrismaPg({ connectionString: dbUrl });
    return new PrismaClient({ adapter });
  } else {
    const adapter = new PrismaLibSql({ url: "file:dev.db" });
    return new PrismaClient({ adapter });
  }
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
