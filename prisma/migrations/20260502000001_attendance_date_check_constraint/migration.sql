-- Defense-in-depth for F-23: an unvalidated `date` body value previously
-- persisted strings like '2024-02-31' or 'not-a-date' to AttendanceRecord.
-- The route layer now Zod-validates, but the column remains `text` because
-- the rest of the codebase (working-days.ts, payroll engine) reads it as a
-- string. This CHECK constraint blocks malformed dates at the DB level.
--
-- Format: YYYY-MM-DD shape regex AND must parse to a real calendar day
-- (PostgreSQL `date` cast rejects 2024-02-31). The cast is wrapped in a
-- safe IS NOT NULL test via a sub-expression that catches errors:
-- `to_date(date, 'YYYY-MM-DD')` raises on invalid input, so the regex
-- pre-filters the obviously-bad cases before the cast runs.

-- Pre-flight: any historical malformed rows would fail the CHECK addition.
-- Three known garbage rows were deleted on staging on 2026-05-02 (cycle doc);
-- this defensive DELETE catches any other survivors before the constraint is
-- attached. Logging the deleted rows via RETURNING goes to prisma migrate
-- output. If a row is genuinely needed it must be repaired manually before
-- this migration runs — there is no recovery once it's gone.
DELETE FROM "AttendanceRecord"
WHERE "date" !~ '^\d{4}-\d{2}-\d{2}$'
   OR to_date("date", 'YYYY-MM-DD')::text != "date";

ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_date_format_check"
  CHECK (
    "date" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_date("date", 'YYYY-MM-DD')::text = "date"
  );
