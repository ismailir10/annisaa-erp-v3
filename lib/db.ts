import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

async function createPrismaClient(): Promise<PrismaClient> {
  const dbUrl = process.env.DATABASE_URL || "";

  if (dbUrl.startsWith("postgres")) {
    // Production: PostgreSQL via Supabase
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const adapter = new PrismaPg({ connectionString: dbUrl });
    return new PrismaClient({ adapter });
  } else {
    // Local dev: SQLite via libSQL
    const { PrismaLibSql } = await import("@prisma/adapter-libsql");
    const adapter = new PrismaLibSql({ url: "file:dev.db" });
    return new PrismaClient({ adapter });
  }
}

// Use top-level await for initialization
let prismaPromise: Promise<PrismaClient>;

if (globalForPrisma.prisma) {
  prismaPromise = Promise.resolve(globalForPrisma.prisma);
} else {
  prismaPromise = createPrismaClient().then((client) => {
    if (process.env.NODE_ENV !== "production") {
      globalForPrisma.prisma = client;
    }
    return client;
  });
}

export const prisma = await prismaPromise;
