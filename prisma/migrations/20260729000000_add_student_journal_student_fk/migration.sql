-- StudentJournalEntry.studentId and StudentJournalNote.studentId carried no
-- foreign key to Student, unlike every other student-owned table. Deleting a
-- Student therefore left journal rows behind as silent orphans (7,560 entries
-- + 50 notes observed on staging during the 2026-07-29 data cleanup).
--
-- This migration is written to be safe to apply against a live database that
-- may already contain orphans, and safe to re-run:
--   1. purge orphans first, or the ADD CONSTRAINT below fails with 23503
--   2. add constraints only when absent (no ALTER TABLE ... IF NOT EXISTS in PG)
--
-- CI Playwright runs against the real staging Supabase and mutates these
-- tables, so step 1 must not be assumed to be a no-op even though both
-- staging and prod measured zero orphans when this migration was authored.

-- 1. Purge pre-existing orphans -------------------------------------------
DELETE FROM "StudentJournalEntry" e
WHERE NOT EXISTS (SELECT 1 FROM "Student" s WHERE s.id = e."studentId");

DELETE FROM "StudentJournalNote" n
WHERE NOT EXISTS (SELECT 1 FROM "Student" s WHERE s.id = n."studentId");

-- 2. Index the FK column on StudentJournalNote -----------------------------
-- Cascade deletes probe by studentId alone. StudentJournalNote's only
-- covering index is @@index([tenantId, studentId, date]) — tenantId-leading,
-- so unusable for a studentId-only predicate. StudentJournalEntry needs no
-- equivalent: its @@unique([studentId, indicatorId, date, scope]) is already
-- studentId-leading.
CREATE INDEX IF NOT EXISTS "StudentJournalNote_studentId_idx"
  ON "StudentJournalNote" ("studentId");

-- 3. Add the foreign keys --------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StudentJournalEntry_studentId_fkey'
      AND conrelid = '"StudentJournalEntry"'::regclass
  ) THEN
    ALTER TABLE "StudentJournalEntry"
      ADD CONSTRAINT "StudentJournalEntry_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'StudentJournalNote_studentId_fkey'
      AND conrelid = '"StudentJournalNote"'::regclass
  ) THEN
    ALTER TABLE "StudentJournalNote"
      ADD CONSTRAINT "StudentJournalNote_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
