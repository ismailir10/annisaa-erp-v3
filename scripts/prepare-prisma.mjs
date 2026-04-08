/**
 * Pre-build script: switches Prisma provider to PostgreSQL if DATABASE_URL
 * points to a PostgreSQL database (Vercel/production).
 * Keeps SQLite for local dev.
 */
import { readFileSync, writeFileSync } from "fs";

const schemaPath = "prisma/schema.prisma";
const schema = readFileSync(schemaPath, "utf-8");
const dbUrl = process.env.DATABASE_URL || "";

if (dbUrl.startsWith("postgres")) {
  console.log("🔄 Switching Prisma to PostgreSQL for production build...");
  const updated = schema.replace(
    /provider\s*=\s*"sqlite"/,
    'provider = "postgresql"'
  );
  writeFileSync(schemaPath, updated);
  console.log("✅ Prisma schema set to PostgreSQL");
} else {
  console.log("📁 Using SQLite (local dev)");
}
