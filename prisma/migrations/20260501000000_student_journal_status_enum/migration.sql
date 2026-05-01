-- Pre-migration check (run 2026-05-01 against staging DB):
--   StudentJournalTemplate  status: [{"ACTIVE", n=1}]
--   StudentJournalCategory  status: [{"ACTIVE", n=7}]
--   StudentJournalIndicator status: [{"ACTIVE", n=10}]
--   StudentJournalNote      status: [{"ACTIVE", n=51}]
-- All values are exactly "ACTIVE" or "INACTIVE" — enum cast is safe.

-- 1. Create enum type.
CREATE TYPE "JournalStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- 2. Alter columns. Drop default first (default ties type), cast, re-attach default.
ALTER TABLE "StudentJournalTemplate"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "JournalStatus" USING "status"::"JournalStatus",
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "StudentJournalCategory"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "JournalStatus" USING "status"::"JournalStatus",
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "StudentJournalIndicator"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "JournalStatus" USING "status"::"JournalStatus",
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

ALTER TABLE "StudentJournalNote"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "JournalStatus" USING "status"::"JournalStatus",
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
