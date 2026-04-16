-- Up: rename existing SCHOOL_ADMIN users to SUPER_ADMIN
-- This preserves production access for the school owner.
-- All existing admins become SUPER_ADMIN (full access including payroll/salary).
-- The SCHOOL_ADMIN role now refers to restricted admins (no salary/payroll).
UPDATE "User" SET role = 'SUPER_ADMIN' WHERE role = 'SCHOOL_ADMIN';

-- Down (reversible):
-- UPDATE "User" SET role = 'SCHOOL_ADMIN' WHERE role = 'SUPER_ADMIN';
