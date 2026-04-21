-- CreateTable
CREATE TABLE "StudentJournalTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentJournalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentJournalCategory" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentJournalCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentJournalIndicator" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentJournalIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentJournalEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classSectionId" TEXT,
    "indicatorId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentJournalNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentJournalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentJournalAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentJournalAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentJournalTemplate_tenantId_key" ON "StudentJournalTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "StudentJournalTemplate_tenantId_idx" ON "StudentJournalTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "StudentJournalCategory_templateId_scope_status_idx" ON "StudentJournalCategory"("templateId", "scope", "status");

-- CreateIndex
CREATE INDEX "StudentJournalIndicator_categoryId_status_idx" ON "StudentJournalIndicator"("categoryId", "status");

-- CreateIndex
CREATE INDEX "StudentJournalEntry_tenantId_classSectionId_date_idx" ON "StudentJournalEntry"("tenantId", "classSectionId", "date");

-- CreateIndex
CREATE INDEX "StudentJournalEntry_tenantId_studentId_date_idx" ON "StudentJournalEntry"("tenantId", "studentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StudentJournalEntry_studentId_indicatorId_date_scope_key" ON "StudentJournalEntry"("studentId", "indicatorId", "date", "scope");

-- CreateIndex
CREATE INDEX "StudentJournalNote_tenantId_studentId_date_idx" ON "StudentJournalNote"("tenantId", "studentId", "date");

-- CreateIndex
CREATE INDEX "StudentJournalAudit_tenantId_entityType_entityId_idx" ON "StudentJournalAudit"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "StudentJournalAudit_tenantId_changedAt_idx" ON "StudentJournalAudit"("tenantId", "changedAt");

-- AddForeignKey
ALTER TABLE "StudentJournalCategory" ADD CONSTRAINT "StudentJournalCategory_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StudentJournalTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentJournalIndicator" ADD CONSTRAINT "StudentJournalIndicator_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StudentJournalCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentJournalEntry" ADD CONSTRAINT "StudentJournalEntry_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "StudentJournalIndicator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

