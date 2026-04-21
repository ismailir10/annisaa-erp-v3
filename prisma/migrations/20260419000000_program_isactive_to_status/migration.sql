-- Migrate Program.isActive (Boolean) -> Program.status (String)
-- Part of CRUD Standard Category A (binary soft-delete) alignment.

ALTER TABLE "Program" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

UPDATE "Program" SET "status" = CASE WHEN "isActive" THEN 'ACTIVE' ELSE 'INACTIVE' END;

ALTER TABLE "Program" DROP COLUMN "isActive";
