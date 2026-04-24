-- Promote the live owner account to SUPER_ADMIN so HR access is retained
-- after the permission-based RBAC split ships. The new SCHOOL_ADMIN
-- default permission set excludes every hr.* code, so without this
-- promotion the owner would lose payroll/employees/leave/attendance
-- after deploy.
--
-- Idempotent: guarded on current role = 'SCHOOL_ADMIN'. Re-running is a
-- no-op once the owner is already SUPER_ADMIN.
--
-- !!! CTO ACTION REQUIRED BEFORE MERGE TO main !!!
-- The email below is the owner's git-config email; verify it matches the
-- live owner row in production (`SELECT email, role FROM "User"
-- WHERE role = 'SCHOOL_ADMIN' ORDER BY "createdAt" ASC;`) and adjust if
-- the canonical owner email differs (e.g. the production seed uses
-- `admin@annisaa.sch.id`). This file is the single touchpoint — fix here,
-- not in app code.
--
-- ROLLBACK (targeted — mirrors the forward guard to avoid demoting any
-- other future SUPER_ADMIN. Verify the specific row first):
--   SELECT email, role FROM "User" WHERE email = 'ismailir10@gmail.com';
--   UPDATE "User" SET role = 'SCHOOL_ADMIN'
--   WHERE email = 'ismailir10@gmail.com' AND role = 'SUPER_ADMIN';
UPDATE "User"
SET role = 'SUPER_ADMIN'
WHERE email = 'ismailir10@gmail.com'
  AND role = 'SCHOOL_ADMIN';
