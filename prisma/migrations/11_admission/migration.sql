-- 11_admission — Admission funnel + MPLS cohort schema (foundation §4.1
-- Admission/MPLS rows + §10A.4 funnel narrative + §6.4 composite-FK pattern).
-- Cycle: p2-admission-funnel-schema (2026-05-09). Split from original
-- p2-admission-funnel per §18.2 cap (≈30 files full scope > 25 cap).
-- UI half (public /daftar form, admin review screen, ACCEPTED side-effect
-- bundle, MPLS UI, email templates, Playwright) ships in p2-admission-funnel-ui.
--
-- Design locks (mirrors 08_guardians + 10_addresses):
--   * REVOKE ALL FROM anon, authenticated  (matches §6.3 canonical form)
--   * NO FORCE ROW LEVEL SECURITY          (service-role seed must bypass)
--
-- 8-state machine for AdmissionStatus (DRAFT through ACCEPTED/REJECTED/
-- WITHDRAWN). Foundation §10A.4 line 852 sketches a 13-state finance-coupled
-- taxonomy — scope-locked out of this cycle per cycle-doc Assumption 1; future
-- P3 cycles extend additively (`ALTER TYPE ... ADD VALUE`).
--
-- Soft-delete: YES on Admission + MplsCohort. NO on InitialAssessment +
-- MplsMember + MplsAttendance (operational records — mirrors §16_scaffold's
-- ExportJob/EmailLog/WebhookEvent precedent).
--
-- PII annotations (5 new triples, total 10/10):
--   Admission.applicantNik    redact
--   Admission.fatherNik       redact
--   Admission.motherNik       redact
--   Admission.fatherPhone     mask:last4
--   Admission.motherPhone     mask:last4
--
-- Composite-FK column-list SET NULL (Postgres 15.4+; Supabase 15.6+ compatible):
--   Admission.acceptedStudentId             → Student(id, tenantId)
--   Admission.siblingDetectedFromHouseholdId → Household(id, tenantId)
-- Both use `SET NULL ("<colname>")` syntax — only the FK column nulls; tenantId
-- stays bound. Mirrors Guardian.userId (08_guardians) + Household.addressId
-- (10_addresses) precedents. Prisma schema uses SINGLE-column relations on
-- both — REJECT `prisma migrate dev` regeneration (issue #25061 dodge).

-- ── CreateEnum AdmissionStatus ───────────────────────────────────────────────
CREATE TYPE "AdmissionStatus" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'INTERVIEW_SCHEDULED',
  'OFFER_EXTENDED',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN'
);

-- ── CreateEnum AdmissionSource ───────────────────────────────────────────────
CREATE TYPE "AdmissionSource" AS ENUM (
  'ONLINE',
  'WALK_IN',
  'REFERRAL'
);

-- ── CreateEnum MplsCohortStatus ──────────────────────────────────────────────
CREATE TYPE "MplsCohortStatus" AS ENUM (
  'PLANNED',
  'ACTIVE',
  'COMPLETED'
);

-- ── CreateTable Admission ────────────────────────────────────────────────────
-- Per spec §4.1 + §10A.4. Tenant-scoped, soft-delete. Parent-snapshot fields
-- (father*/mother*) denormalized at submission (NOT FK to Guardian) — at submit
-- the family is not yet a Household; ACCEPTED transition (UI cycle) creates
-- Guardian rows from these snapshots while preserving the original declaration.
-- applicantGender CHECK ('MALE','FEMALE') — schema-light single-binary-value
-- field per Student.gender precedent in 07_students.

CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "AdmissionSource" NOT NULL DEFAULT 'ONLINE',
    "referralSourceText" VARCHAR(200),
    "applicantFullName" VARCHAR(255) NOT NULL,
    "applicantNickname" VARCHAR(100),
    "applicantNik" VARCHAR(16),
    "applicantBirthDate" DATE,
    "applicantGender" VARCHAR(10),
    "applicantBirthPlace" VARCHAR(100),
    "fatherName" VARCHAR(255),
    "fatherNik" VARCHAR(16),
    "fatherPhone" VARCHAR(20),
    "fatherOccupation" VARCHAR(100),
    "fatherMonthlyIncome" INTEGER,
    "motherName" VARCHAR(255),
    "motherNik" VARCHAR(16),
    "motherPhone" VARCHAR(20),
    "motherOccupation" VARCHAR(100),
    "motherMonthlyIncome" INTEGER,
    "siblingDetectedFromHouseholdId" TEXT,
    "acceptedStudentId" TEXT,
    "submittedAt" TIMESTAMPTZ,
    "decidedAt" TIMESTAMPTZ,
    "interviewScheduledFor" TIMESTAMPTZ,
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Admission_applicantGender_check"
      CHECK ("applicantGender" IS NULL OR "applicantGender" IN ('MALE', 'FEMALE'))
);

-- Composite (id, tenantId) unique — FK target shape per §6.4 (no children this
-- cycle, but consumers in p2-admission-funnel-ui and p3 finance cycles will
-- compose-FK back to Admission).
CREATE UNIQUE INDEX "Admission_id_tenantId_key" ON "Admission"("id", "tenantId");

CREATE INDEX "Admission_tenantId_idx"                  ON "Admission"("tenantId");
CREATE INDEX "Admission_tenantId_status_idx"           ON "Admission"("tenantId", "status");
CREATE INDEX "Admission_tenantId_source_idx"           ON "Admission"("tenantId", "source");
CREATE INDEX "Admission_tenantId_programId_idx"        ON "Admission"("tenantId", "programId");
CREATE INDEX "Admission_tenantId_academicYearId_idx"   ON "Admission"("tenantId", "academicYearId");
CREATE INDEX "Admission_tenantId_submittedAt_idx"      ON "Admission"("tenantId", "submittedAt");
CREATE INDEX "Admission_tenantId_applicantFullName_idx" ON "Admission"("tenantId", "applicantFullName");

-- ── CreateTable InitialAssessment ────────────────────────────────────────────
-- Per spec §4.1 + §10A.4 detail-tab pattern (line 853). Tenant-scoped, NO
-- soft-delete. Minimal shape this cycle — score Int? + notes Text. Richer
-- per-domain rubric structure deferred to a P5/P6 assessment cycle.

CREATE TABLE "InitialAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "assessorEmployeeId" TEXT NOT NULL,
    "assessmentDate" DATE NOT NULL,
    "score" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "InitialAssessment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InitialAssessment_score_check"
      CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))
);

CREATE UNIQUE INDEX "InitialAssessment_id_tenantId_key" ON "InitialAssessment"("id", "tenantId");
CREATE INDEX "InitialAssessment_tenantId_idx"                    ON "InitialAssessment"("tenantId");
CREATE INDEX "InitialAssessment_tenantId_admissionId_idx"        ON "InitialAssessment"("tenantId", "admissionId");
CREATE INDEX "InitialAssessment_tenantId_assessorEmployeeId_idx" ON "InitialAssessment"("tenantId", "assessorEmployeeId");

-- ── CreateTable MplsCohort ───────────────────────────────────────────────────
-- Per spec §4.1 + §10A.4. Tenant-scoped, soft-delete (admin archives past waves).

CREATE TABLE "MplsCohort" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "MplsCohortStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "MplsCohort_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MplsCohort_dateRange_check"
      CHECK ("endDate" >= "startDate")
);

CREATE UNIQUE INDEX "MplsCohort_id_tenantId_key" ON "MplsCohort"("id", "tenantId");
CREATE INDEX "MplsCohort_tenantId_idx"                ON "MplsCohort"("tenantId");
CREATE INDEX "MplsCohort_tenantId_academicYearId_idx" ON "MplsCohort"("tenantId", "academicYearId");
CREATE INDEX "MplsCohort_tenantId_status_idx"         ON "MplsCohort"("tenantId", "status");

-- ── CreateTable MplsMember ───────────────────────────────────────────────────
-- Junction (cohort, admission). NO soft-delete (junction; parent's lifecycle
-- drives this row's lifecycle).

CREATE TABLE "MplsMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "MplsMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MplsMember_id_tenantId_key"                       ON "MplsMember"("id", "tenantId");
CREATE UNIQUE INDEX "MplsMember_tenantId_cohortId_admissionId_key"     ON "MplsMember"("tenantId", "cohortId", "admissionId");
CREATE INDEX "MplsMember_tenantId_idx"             ON "MplsMember"("tenantId");
CREATE INDEX "MplsMember_tenantId_cohortId_idx"    ON "MplsMember"("tenantId", "cohortId");
CREATE INDEX "MplsMember_tenantId_admissionId_idx" ON "MplsMember"("tenantId", "admissionId");

-- ── CreateTable MplsAttendance ───────────────────────────────────────────────
-- Per-day fact for an MPLS cohort member. NO soft-delete (operational fact).
-- cohortDay CHECK 1..30.

CREATE TABLE "MplsAttendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "cohortDay" INTEGER NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "MplsAttendance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MplsAttendance_cohortDay_check"
      CHECK ("cohortDay" >= 1 AND "cohortDay" <= 30)
);

CREATE UNIQUE INDEX "MplsAttendance_id_tenantId_key"                    ON "MplsAttendance"("id", "tenantId");
CREATE UNIQUE INDEX "MplsAttendance_tenantId_memberId_cohortDay_key"    ON "MplsAttendance"("tenantId", "memberId", "cohortDay");
CREATE INDEX "MplsAttendance_tenantId_idx"          ON "MplsAttendance"("tenantId");
CREATE INDEX "MplsAttendance_tenantId_memberId_idx" ON "MplsAttendance"("tenantId", "memberId");

-- ── Foreign keys (composite per §6.4) ────────────────────────────────────────

-- Admission → Tenant: Restrict per §4.4 (never cascade Tenant).
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Admission → Program: composite (programId, tenantId).
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_programId_tenantId_fkey"
  FOREIGN KEY ("programId", "tenantId") REFERENCES "Program"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Admission → AcademicYear: composite (academicYearId, tenantId).
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_academicYearId_tenantId_fkey"
  FOREIGN KEY ("academicYearId", "tenantId") REFERENCES "AcademicYear"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Admission → Address: composite (addressId, tenantId). Restrict — addresses
-- are reusable across rows; an admission-bound address must not vanish.
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_addressId_tenantId_fkey"
  FOREIGN KEY ("addressId", "tenantId") REFERENCES "Address"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Admission → Student (acceptedStudentId): composite (acceptedStudentId, tenantId)
-- with column-list `SET NULL ("acceptedStudentId")` per Postgres 15.4+ syntax.
-- Only acceptedStudentId nulls when the Student is hard-deleted; tenantId stays
-- bound. Preserves §6.4 tenant alignment. Mirrors Guardian.userId precedent in
-- 08_guardians + Household.addressId in 10_addresses.
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_acceptedStudentId_tenantId_fkey"
  FOREIGN KEY ("acceptedStudentId", "tenantId") REFERENCES "Student"("id", "tenantId")
  ON DELETE SET NULL ("acceptedStudentId") ON UPDATE CASCADE;

-- Admission → Household (siblingDetectedFromHouseholdId): composite with
-- column-list `SET NULL ("siblingDetectedFromHouseholdId")`. Same split-view
-- pattern as acceptedStudentId.
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_siblingDetectedFromHouseholdId_tenantId_fkey"
  FOREIGN KEY ("siblingDetectedFromHouseholdId", "tenantId") REFERENCES "Household"("id", "tenantId")
  ON DELETE SET NULL ("siblingDetectedFromHouseholdId") ON UPDATE CASCADE;

-- InitialAssessment → Tenant.
ALTER TABLE "InitialAssessment" ADD CONSTRAINT "InitialAssessment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- InitialAssessment → Admission: composite (admissionId, tenantId). Cascade on
-- Admission hard-delete (admin tool path). Soft-delete on Admission cascades
-- via app-layer filter (UI cycle's dataFetcher — Assumption 5 in cycle doc).
ALTER TABLE "InitialAssessment" ADD CONSTRAINT "InitialAssessment_admissionId_tenantId_fkey"
  FOREIGN KEY ("admissionId", "tenantId") REFERENCES "Admission"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- InitialAssessment → Employee: composite (assessorEmployeeId, tenantId).
-- Restrict — assessor record must not vanish without admin intervention.
ALTER TABLE "InitialAssessment" ADD CONSTRAINT "InitialAssessment_assessorEmployeeId_tenantId_fkey"
  FOREIGN KEY ("assessorEmployeeId", "tenantId") REFERENCES "Employee"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- MplsCohort → Tenant.
ALTER TABLE "MplsCohort" ADD CONSTRAINT "MplsCohort_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- MplsCohort → AcademicYear: composite.
ALTER TABLE "MplsCohort" ADD CONSTRAINT "MplsCohort_academicYearId_tenantId_fkey"
  FOREIGN KEY ("academicYearId", "tenantId") REFERENCES "AcademicYear"("id", "tenantId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- MplsMember → Tenant.
ALTER TABLE "MplsMember" ADD CONSTRAINT "MplsMember_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- MplsMember → MplsCohort: composite. Cascade on cohort hard-delete.
ALTER TABLE "MplsMember" ADD CONSTRAINT "MplsMember_cohortId_tenantId_fkey"
  FOREIGN KEY ("cohortId", "tenantId") REFERENCES "MplsCohort"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- MplsMember → Admission: composite. Cascade on admission hard-delete.
ALTER TABLE "MplsMember" ADD CONSTRAINT "MplsMember_admissionId_tenantId_fkey"
  FOREIGN KEY ("admissionId", "tenantId") REFERENCES "Admission"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- MplsAttendance → Tenant.
ALTER TABLE "MplsAttendance" ADD CONSTRAINT "MplsAttendance_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- MplsAttendance → MplsMember: composite. Cascade on member hard-delete.
ALTER TABLE "MplsAttendance" ADD CONSTRAINT "MplsAttendance_memberId_tenantId_fkey"
  FOREIGN KEY ("memberId", "tenantId") REFERENCES "MplsMember"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-Level Security (spec §6.3) ───────────────────────────────────────────
-- 5 ENABLE + 10 policies (2 per table — tenant_isolation_select + no_writes_via_postgrest).
-- Mirrors 08_guardians + 10_addresses. Soft-delete-aware tables include
-- `deletedAt IS NULL` in tenant_isolation_select USING; non-soft-delete tables
-- (InitialAssessment, MplsMember, MplsAttendance) omit the deletedAt clause.

-- Admission (soft-delete)
ALTER TABLE "Admission" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Admission" FROM anon, authenticated;
GRANT SELECT ON "Admission" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Admission"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Admission"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- InitialAssessment (no soft-delete)
ALTER TABLE "InitialAssessment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "InitialAssessment" FROM anon, authenticated;
GRANT SELECT ON "InitialAssessment" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "InitialAssessment"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "InitialAssessment"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- MplsCohort (soft-delete)
ALTER TABLE "MplsCohort" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MplsCohort" FROM anon, authenticated;
GRANT SELECT ON "MplsCohort" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "MplsCohort"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "MplsCohort"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- MplsMember (no soft-delete)
ALTER TABLE "MplsMember" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MplsMember" FROM anon, authenticated;
GRANT SELECT ON "MplsMember" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "MplsMember"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "MplsMember"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- MplsAttendance (no soft-delete)
ALTER TABLE "MplsAttendance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MplsAttendance" FROM anon, authenticated;
GRANT SELECT ON "MplsAttendance" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "MplsAttendance"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "MplsAttendance"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
