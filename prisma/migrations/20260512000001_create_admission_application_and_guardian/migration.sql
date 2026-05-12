-- Data migration: normalize any pre-existing VISIT_SCHEDULED rows
-- (should be zero in current DB; defensive).
UPDATE "Admission" SET "status" = 'INQUIRY' WHERE "status" = 'VISIT_SCHEDULED';

-- AlterTable: Add new fields to Admission
ALTER TABLE "Admission" ADD COLUMN "admittedAt" TIMESTAMP(3);
ALTER TABLE "Admission" ADD COLUMN "admittedById" TEXT;
ALTER TABLE "Admission" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "Admission" ADD COLUMN "mergeCandidateId" TEXT;
ALTER TABLE "Admission" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "Admission" ADD COLUMN "registrationInvoiceId" TEXT;
ALTER TABLE "Admission" ADD COLUMN "submissionSource" TEXT;
ALTER TABLE "Admission" ADD COLUMN "submittedAt" TIMESTAMP(3);

-- CreateIndex: unique on registrationInvoiceId
CREATE UNIQUE INDEX "Admission_registrationInvoiceId_key" ON "Admission"("registrationInvoiceId");

-- CreateTable: AdmissionApplication
CREATE TABLE "AdmissionApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "childNickname" TEXT,
    "childBirthPlace" TEXT,
    "childNik" TEXT,
    "childKkNumber" TEXT,
    "childAnakKe" INTEGER,
    "childSaudaraTotal" INTEGER,
    "childLivingWith" TEXT,
    "residenceAddressLine" TEXT,
    "residenceVillageCode" TEXT,
    "residenceVillageName" TEXT,
    "residenceDistrictCode" TEXT,
    "residenceDistrictName" TEXT,
    "residenceRegencyCode" TEXT,
    "residenceRegencyName" TEXT,
    "residenceProvinceCode" TEXT,
    "residenceProvinceName" TEXT,
    "familyCardFileUrl" TEXT,
    "familyCardFileMimeType" TEXT,
    "familyCardUploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique on admissionId
CREATE UNIQUE INDEX "AdmissionApplication_admissionId_key" ON "AdmissionApplication"("admissionId");

-- CreateIndex: unique on (tenantId, admissionId)
CREATE UNIQUE INDEX "AdmissionApplication_tenantId_admissionId_key" ON "AdmissionApplication"("tenantId", "admissionId");

-- CreateIndex: index on tenantId
CREATE INDEX "AdmissionApplication_tenantId_idx" ON "AdmissionApplication"("tenantId");

-- CreateTable: AdmissionGuardian
CREATE TABLE "AdmissionGuardian" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nik" TEXT,
    "education" TEXT,
    "occupation" TEXT,
    "incomeRange" TEXT,
    "employerName" TEXT,
    "employerAddressLine" TEXT,
    "employerVillageCode" TEXT,
    "employerVillageName" TEXT,
    "employerDistrictCode" TEXT,
    "employerDistrictName" TEXT,
    "employerRegencyCode" TEXT,
    "employerRegencyName" TEXT,
    "employerProvinceCode" TEXT,
    "employerProvinceName" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "idCardFileUrl" TEXT,
    "idCardFileMimeType" TEXT,
    "idCardUploadedAt" TIMESTAMP(3),
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique on (applicationId, relationship)
CREATE UNIQUE INDEX "AdmissionGuardian_applicationId_relationship_key" ON "AdmissionGuardian"("applicationId", "relationship");

-- CreateIndex: unique on (tenantId, applicationId, relationship)
CREATE UNIQUE INDEX "AdmissionGuardian_tenantId_applicationId_relationship_key" ON "AdmissionGuardian"("tenantId", "applicationId", "relationship");

-- CreateIndex: index on tenantId
CREATE INDEX "AdmissionGuardian_tenantId_idx" ON "AdmissionGuardian"("tenantId");

-- CreateIndex: index on parentId
CREATE INDEX "AdmissionGuardian_parentId_idx" ON "AdmissionGuardian"("parentId");

-- AddForeignKey: AdmissionApplication → Admission (Cascade)
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: AdmissionApplication → Tenant (Restrict)
ALTER TABLE "AdmissionApplication" ADD CONSTRAINT "AdmissionApplication_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: AdmissionGuardian → AdmissionApplication (Cascade)
ALTER TABLE "AdmissionGuardian" ADD CONSTRAINT "AdmissionGuardian_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "AdmissionApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: AdmissionGuardian → Parent (SetNull)
ALTER TABLE "AdmissionGuardian" ADD CONSTRAINT "AdmissionGuardian_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: AdmissionGuardian → Tenant (Restrict)
ALTER TABLE "AdmissionGuardian" ADD CONSTRAINT "AdmissionGuardian_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Admission → Invoice (registrationInvoice, SetNull)
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_registrationInvoiceId_fkey" FOREIGN KEY ("registrationInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
