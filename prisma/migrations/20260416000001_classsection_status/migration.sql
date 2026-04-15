-- Add status field to ClassSection (ACTIVE | INACTIVE soft-delete support)
-- CLAUDE.md: "Models that need status added: Guardian, ClassSection, FeeComponentDef"

ALTER TABLE "ClassSection" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
