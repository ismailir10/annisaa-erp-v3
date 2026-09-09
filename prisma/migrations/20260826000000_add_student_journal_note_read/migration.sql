-- StudentJournalNoteRead — read watermark for the Buku Penghubung note thread
-- (docs/cycles/2026-08-26-journal-notes-cycle-b.md).
--
-- One row per reader per student, holding the moment that reader last opened
-- the notes surface. Unread for a reader is every ACTIVE note on that student
-- written by somebody else after `lastReadAt`. Deliberately NOT a per-note
-- receipt table: the badge only ever needs "how many since I last looked", and
-- a receipt per note per reader would grow with notes × readers for no
-- additional answer.
--
-- Additive only: one new table, no ALTER on any existing table, no backfill.
-- The absence of a row is meaningful — it reads as "nothing unread" — so no
-- seeding is required or wanted here.

CREATE TABLE "StudentJournalNoteRead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentJournalNoteRead_pkey" PRIMARY KEY ("id")
);

-- One watermark per reader per student; the upsert on mark-read keys off this.
CREATE UNIQUE INDEX "StudentJournalNoteRead_userId_studentId_key"
    ON "StudentJournalNoteRead"("userId", "studentId");

CREATE INDEX "StudentJournalNoteRead_tenantId_studentId_idx"
    ON "StudentJournalNoteRead"("tenantId", "studentId");

-- Tenant-scoped table: RLS on, service_role passthrough, matching every other
-- tenant-scoped table in this schema (scripts/verify-rls-coverage.sh enforces
-- that both statements exist).
ALTER TABLE "StudentJournalNoteRead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY studentjournalnoteread_service_all ON "StudentJournalNoteRead"
    AS PERMISSIVE FOR ALL TO service_role USING (true);
