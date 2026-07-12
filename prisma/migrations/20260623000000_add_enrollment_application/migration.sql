-- Cycle A: 2026-06-23 enrollment-application (T1).
-- Rich admission form digitizing the An Nisaa' paper "Permohonan Penerimaan
-- Murid Baru" + "Surat Persetujuan Orang Tua". 1:1 continuation of an
-- Admission inquiry. Additive — new table + FKs + RLS only; no changes to
-- existing tables, no backfill (existing rows unaffected).

-- CreateTable
CREATE TABLE "EnrollmentApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "studentId" TEXT,
    "programId" TEXT,
    "dcareAddon" BOOLEAN NOT NULL DEFAULT false,
    "childName" TEXT NOT NULL,
    "parentEmail" TEXT,
    "studentData" JSONB,
    "ayahData" JSONB,
    "ibuData" JSONB,
    "consentData" JSONB,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnrollmentApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentApplication_admissionId_key" ON "EnrollmentApplication"("admissionId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentApplication_accessToken_key" ON "EnrollmentApplication"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentApplication_studentId_key" ON "EnrollmentApplication"("studentId");

-- CreateIndex
CREATE INDEX "EnrollmentApplication_tenantId_status_idx" ON "EnrollmentApplication"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "EnrollmentApplication" ADD CONSTRAINT "EnrollmentApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentApplication" ADD CONSTRAINT "EnrollmentApplication_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentApplication" ADD CONSTRAINT "EnrollmentApplication_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentApplication" ADD CONSTRAINT "EnrollmentApplication_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: service-role-only (mirrors Admission + raport tables). RLS enabled so
-- authenticated/anon JWT callers can never reach rows directly; the API routes
-- are the only access path. The public token route gates on the unguessable
-- accessToken + expiry; admin routes gate via requireAdmin + session.tenantId.
ALTER TABLE "EnrollmentApplication" ENABLE ROW LEVEL SECURITY;
CREATE POLICY enrollmentapplication_service_all ON "EnrollmentApplication" AS PERMISSIVE FOR ALL TO service_role USING (true);
