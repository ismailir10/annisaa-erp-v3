-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(50) NOT NULL,
    "bootstrapStatus" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" VARCHAR(500),
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "ageMonthsMin" INTEGER NOT NULL,
    "ageMonthsMax" INTEGER NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "headEmployeeId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicTerm" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "raportDueAt" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "AcademicTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Campus_tenantId_idx" ON "Campus"("tenantId");

-- CreateIndex
CREATE INDEX "Campus_tenantId_code_idx" ON "Campus"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Program_tenantId_idx" ON "Program"("tenantId");

-- CreateIndex
CREATE INDEX "Program_tenantId_code_idx" ON "Program"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Program_headEmployeeId_idx" ON "Program"("headEmployeeId");

-- CreateIndex
CREATE INDEX "AcademicYear_tenantId_idx" ON "AcademicYear"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_tenantId_name_key" ON "AcademicYear"("tenantId", "name");

-- CreateIndex
CREATE INDEX "AcademicTerm_tenantId_idx" ON "AcademicTerm"("tenantId");

-- CreateIndex
CREATE INDEX "AcademicTerm_academicYearId_idx" ON "AcademicTerm"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicTerm_tenantId_academicYearId_code_key" ON "AcademicTerm"("tenantId", "academicYearId", "code");

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicTerm" ADD CONSTRAINT "AcademicTerm_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Partial unique indexes (codes unique among non-deleted rows) ─────────────
-- Per foundation spec §4.4: codes unique among non-deleted via WHERE deletedAt IS NULL.
CREATE UNIQUE INDEX "campus_code_active_unique"
  ON "Campus" ("tenantId", "code")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "program_code_active_unique"
  ON "Program" ("tenantId", "code")
  WHERE "deletedAt" IS NULL;

-- Exactly one current academic year per tenant.
CREATE UNIQUE INDEX "academic_year_current_unique"
  ON "AcademicYear" ("tenantId")
  WHERE "isCurrent" = true AND "deletedAt" IS NULL;

-- ── CHECK constraints (DB-level safety net per spec §4.4) ───────────────────
ALTER TABLE "AcademicYear"
  ADD CONSTRAINT "academic_year_date_range_check"
  CHECK ("startDate" < "endDate");

ALTER TABLE "AcademicTerm"
  ADD CONSTRAINT "academic_term_date_range_check"
  CHECK ("startDate" < "endDate");

