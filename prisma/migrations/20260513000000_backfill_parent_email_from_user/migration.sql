-- Cycle: 2026-05-13 staging-sweep-majors-cycle1 (F-7).
-- Backfill Parent.email from the linked User.email for any Parent row where
-- email IS NULL. Login auth already resolves via User.email, but any feature
-- that reads Parent.email for outbound (invoice notifications, future
-- reminders) is silently broken until this runs.
--
-- Idempotent: re-running on a post-backfill DB matches 0 rows because the
-- WHERE clause requires `"Parent".email IS NULL`. Safe to schedule.
-- Staging baseline: 200 Parent rows, all with email IS NULL — expected
-- update count = number of Parent rows with at least one ACTIVE User
-- pointing at them.

UPDATE "Parent"
SET email = u.email
FROM "User" u
WHERE u."parentId" = "Parent".id
  AND "Parent".email IS NULL
  AND u.email IS NOT NULL;
