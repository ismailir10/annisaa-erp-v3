
-- Create Parent table
CREATE TABLE IF NOT EXISTS "Parent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "address" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Parent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Parent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Parent_tenantId_email_key" ON "Parent"("tenantId", "email");
CREATE INDEX IF NOT EXISTS "Parent_tenantId_status_idx" ON "Parent"("tenantId", "status");

-- Create StudentGuardian junction table
CREATE TABLE IF NOT EXISTS "StudentGuardian" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "studentId" TEXT NOT NULL,
  "parentId" TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "StudentGuardian_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudentGuardian_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudentGuardian_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudentGuardian_studentId_parentId_key" ON "StudentGuardian"("studentId", "parentId");
CREATE INDEX IF NOT EXISTS "StudentGuardian_parentId_idx" ON "StudentGuardian"("parentId");

-- Add parentId to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "customRoleId" TEXT;

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add parentId to Invoice
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Invoice_parentId_idx" ON "Invoice"("parentId");
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_status_dueDate_idx" ON "Invoice"("tenantId", "status", "dueDate");

-- Payment audit fields
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'RECORDED';
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "xenditPaymentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_xenditPaymentId_key" ON "Payment"("xenditPaymentId");
CREATE INDEX IF NOT EXISTS "Payment_invoiceId_status_idx" ON "Payment"("invoiceId", "status");
CREATE INDEX IF NOT EXISTS "Payment_createdAt_idx" ON "Payment"("createdAt");

-- Role table
CREATE TABLE IF NOT EXISTS "Role" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "permissions" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Role_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Role_tenantId_code_key" ON "Role"("tenantId", "code");

DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Additional indexes
CREATE INDEX IF NOT EXISTS "StudentEnrollment_studentId_status_idx" ON "StudentEnrollment"("studentId", "status");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_employeeId_date_idx" ON "AttendanceRecord"("employeeId", "date");

-- Migrate existing Guardian data to Parent + StudentGuardian
INSERT INTO "Parent" ("id", "tenantId", "name", "email", "phone", "whatsapp", "status", "createdAt")
SELECT "id", (SELECT "tenantId" FROM "Student" WHERE "Student"."id" = "Guardian"."studentId"), "name", "email", "phone", "whatsapp", 'ACTIVE', CURRENT_TIMESTAMP
FROM "Guardian"
ON CONFLICT DO NOTHING;

INSERT INTO "StudentGuardian" ("id", "studentId", "parentId", "relationship", "isPrimary")
SELECT gen_random_uuid()::text, "studentId", "id", "relationship", "isPrimary"
FROM "Guardian"
ON CONFLICT DO NOTHING;

-- Drop old Guardian table (after migration)
DROP TABLE IF EXISTS "Guardian";
;
