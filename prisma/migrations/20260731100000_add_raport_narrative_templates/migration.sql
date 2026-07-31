-- Kisi-kisi narrative templates (master design §2.3).
--
-- Additive only: two new tables, no ALTER on existing ones. Per (term,
-- ageGroup) a cohort carries 15 bucketed rows (5 level-bearing sections × 3
-- AchievementLevel) plus 3 closing rows.
--
-- Templates are a STARTING POINT copied into ReportCardEntry.sectionNarratives
-- at edit time — they are never read at render time, so editing a template
-- cannot retroactively change an already-authored raport.

CREATE TABLE "ReportNarrativeTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "ageGroup" "AgeGroup" NOT NULL,
    "section" "ReportSection" NOT NULL,
    "level" "AchievementLevel" NOT NULL,
    "content" TEXT NOT NULL,
    "authoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReportNarrativeTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportClosingTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "ageGroup" "AgeGroup" NOT NULL,
    "section" "ReportSection" NOT NULL,
    "content" TEXT NOT NULL,
    "authoredById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReportClosingTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportNarrativeTemplate_tenantId_termId_ageGroup_section_lev_key"
    ON "ReportNarrativeTemplate"("tenantId", "termId", "ageGroup", "section", "level");
CREATE INDEX "ReportNarrativeTemplate_tenantId_termId_idx"
    ON "ReportNarrativeTemplate"("tenantId", "termId");

CREATE UNIQUE INDEX "ReportClosingTemplate_tenantId_termId_ageGroup_section_key"
    ON "ReportClosingTemplate"("tenantId", "termId", "ageGroup", "section");
CREATE INDEX "ReportClosingTemplate_tenantId_termId_idx"
    ON "ReportClosingTemplate"("tenantId", "termId");

ALTER TABLE "ReportNarrativeTemplate" ADD CONSTRAINT "ReportNarrativeTemplate_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportNarrativeTemplate" ADD CONSTRAINT "ReportNarrativeTemplate_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportClosingTemplate" ADD CONSTRAINT "ReportClosingTemplate_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReportClosingTemplate" ADD CONSTRAINT "ReportClosingTemplate_termId_fkey"
    FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: service_role (Prisma) full access; app-layer filters carry tenantId.
ALTER TABLE "ReportNarrativeTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY reportnarrativetemplate_service_all ON "ReportNarrativeTemplate"
    AS PERMISSIVE FOR ALL TO service_role USING (true);

ALTER TABLE "ReportClosingTemplate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY reportclosingtemplate_service_all ON "ReportClosingTemplate"
    AS PERMISSIVE FOR ALL TO service_role USING (true);
