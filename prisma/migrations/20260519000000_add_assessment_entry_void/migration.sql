-- Cycle: 2026-05-19 penilaian-c7a-void-schema (T1).
-- Soft-void columns on AssessmentEntry for the upcoming admin override flow
-- (lens D in the rebuilt /admin/assessments, ships C7b) plus a future-proof
-- audit trail.
--
-- C7a scope is intentionally schema-only — no @@unique swap, no consumer
-- refactor. The existing
-- "AssessmentEntry_tenantId_studentId_indicatorId_date_source_key" unique
-- stays in place so the C4/C5 walas+sentra upsert callers keep their
-- Prisma upsert key. C7b will swap that all-rows unique to a partial unique
-- WHERE voidedAt IS NULL and refactor the upserts to raw SQL ON CONFLICT
-- in the same PR. Until C7b lands, override semantics are single-row
-- in-place UPDATE: voidedAt marks the row as no-longer-authoritative;
-- raport / parent-perkembangan rollups filter on voidedAt IS NULL.
--
-- Additive only: no backfill, no destructive ALTER on existing rows.
-- Existing rows get voidedAt = NULL → continue to be the authoritative
-- entry per key, exactly as before this migration.

-- 1. Soft-void columns (all nullable; existing rows = active).
ALTER TABLE "AssessmentEntry" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "AssessmentEntry" ADD COLUMN "voidedById" TEXT;
ALTER TABLE "AssessmentEntry" ADD COLUMN "voidReason" TEXT;

-- 2. FK from voidedById → Employee.id. RESTRICT prevents accidental Employee
-- deletion losing audit attribution.
ALTER TABLE "AssessmentEntry" ADD CONSTRAINT "AssessmentEntry_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Index on voidedAt — supports the "active entries only" filter that
-- raport rollup + new admin lenses A/B run on every query.
CREATE INDEX "AssessmentEntry_voidedAt_idx" ON "AssessmentEntry"("voidedAt");
