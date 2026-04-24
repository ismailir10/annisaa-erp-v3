-- Add binary soft-delete status to Campus per CRUD Standard Category A.
-- DELETE endpoint now sets status = 'INACTIVE' instead of removing the row,
-- preserving FK integrity for historical Employee/ClassSection assignments.
ALTER TABLE "Campus" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
