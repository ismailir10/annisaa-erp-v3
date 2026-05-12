-- Backfill: copy legacy single-field addresses into the new addressLine cols.
-- Idempotent (WHERE NULL guard) so re-running is safe.

UPDATE "Student"
SET "addressLine" = "address"
WHERE "address" IS NOT NULL AND "addressLine" IS NULL;

UPDATE "Parent"
SET "homeAddressLine" = "address"
WHERE "address" IS NOT NULL AND "homeAddressLine" IS NULL;

UPDATE "Parent"
SET "employerAddressLine" = "employerAddress"
WHERE "employerAddress" IS NOT NULL AND "employerAddressLine" IS NULL;
