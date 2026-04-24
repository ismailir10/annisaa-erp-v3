-- Drop global User.email unique constraint; replace with composite
-- (tenantId, email). Single-tenant MVP today, multi-tenant prepared.
--
-- ⚠ PRE-DEPLOY DATA INTEGRITY CHECK (must return 0 rows):
--   SELECT "tenantId", email, COUNT(*)
--   FROM "User"
--   GROUP BY "tenantId", email
--   HAVING COUNT(*) > 1;
--
-- If rows are returned, the composite unique CREATE INDEX below will fail.
-- Fix duplicates first (merge or delete) before applying.
--
-- Rollback: drop the composite index, recreate the global unique:
--   DROP INDEX "User_tenantId_email_key";
--   CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
--
-- Zero-downtime on Vercel Postgres: both DDL operations are catalog-only
-- swaps on a small reference table — single-digit-ms AccessExclusiveLock
-- per statement; no row scan, no table rewrite.

DROP INDEX "User_email_key";

CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");
