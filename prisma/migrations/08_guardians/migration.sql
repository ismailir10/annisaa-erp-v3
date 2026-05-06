-- 08_guardians — Guardian + StudentGuardian + GuardianInvitation
-- (foundation spec §6.1 row "08_guardians" + §6.4 composite-FK pattern +
-- §6.3 RLS + §4.5 PII) + SELECT-only RLS + defense-in-depth REVOKE.
--
-- Design locks (per p1-regions-seed reviewer + p2-students-guardians-household
-- design-lock):
--   * REVOKE ALL FROM anon, authenticated  (matches §6.3 canonical form)
--   * NO FORCE ROW LEVEL SECURITY          (service-role seed must bypass)
--
-- Soft-delete asymmetry (per cycle assumption 7):
--   * YES: Guardian, StudentGuardian (admin-correctable; relationship history
--     retained; soft-delete-aware partial-unique guard relies on deletedAt).
--   * NO:  GuardianInvitation (operational; status enum carries lifecycle;
--     matches ExportJob/EmailLog precedent in 16_scaffold and
--     StudentIdentifierSequence in 07_students).
--
-- Partial-unique PRIMARY guard on StudentGuardian (per cycle assumption 8):
--   `("studentId", "tenantId", "relationship")` scope +
--   `WHERE "isPrimary" = true AND "deletedAt" IS NULL` clause.
--   Diverges from migration 07 StudentIdentifier's global-PRIMARY guard:
--   Indonesian PAUD admission forms commonly designate primary FATHER and
--   primary MOTHER simultaneously as canonical contacts for each role. A
--   global single-PRIMARY-per-student rule would block legitimate two-parent
--   families. Relationship-scoped permits one PRIMARY per relationship type
--   per student (PRIMARY FATHER + PRIMARY MOTHER + PRIMARY GUARDIAN +
--   PRIMARY OTHER all coexist). Soft-delete-aware so an ended relationship's
--   PRIMARY slot frees up — same shape rationale as migration 07 §4.5.
--
-- GuardianInvitation token shape (per cycle assumption 1):
--   Token is a 32-byte base64url string (256 bits entropy, ~43 chars URL-safe),
--   app-generated via `crypto.randomBytes(32).toString('base64url')`. NOT
--   pgcrypto-generated — schema column has no DEFAULT. Stored as
--   `VARCHAR(64)` (room for future prefix-tagging without column-type bump).
--   GLOBAL unique (assumption 2) — collision astronomically unlikely at
--   256 bits; global unique simplifies the consume route which can resolve
--   token → invitation row across all tenants then app-layer-gate on tenantId.
--   Status (PENDING / ACCEPTED / EXPIRED / REVOKED) carries lifecycle.
--   Single-use enforced by atomic `UPDATE ... WHERE status='PENDING'` at
--   consume (assumption 4); no row-lock needed under MVCC.
--   expiresAt enforced app-layer at consume (assumption 3); no DB trigger.
--   pg-boss sweep PENDING+expired → EXPIRED deferred to p3+.
--
-- Guardian.userId composite FK with column-list SET NULL (assumption 5):
--   `(userId, tenantId) → User(id, tenantId) ON DELETE SET NULL ("userId")`.
--   Postgres 15.4+ column-list SET NULL syntax — Supabase 15.6+ confirmed
--   compatible. Nulls only userId on User hard-delete; tenantId stays bound
--   to Guardian (preserves §6.4 tenant alignment). The Prisma schema uses
--   a SINGLE-column relation view (`fields: [userId]`, NOT composite) to
--   dodge Prisma issue #25061 (composite SetNull would null tenantId via
--   the client-side disconnect path); DB-layer composite FK is the source
--   of truth for tenant alignment. `prisma migrate dev` will detect drift
--   and propose regeneration — REJECT in PR review.
--
-- No advisory-lock helper function (per cycle assumption 9):
--   Guardian has no NIS-equivalent allocator. Migration test asserts absence
--   to prevent future drift.
--
-- storage.objects RLS NOT re-added (per cycle assumption 11):
--   Migration 07 already declared `tenant_scoped_storage_select` +
--   `no_writes_via_postgrest_storage` policies on storage.objects. CREATE
--   POLICY here would error on duplicate. Migration test asserts no
--   `CREATE POLICY ... ON storage.objects` AND no `ALTER TABLE storage.objects`
--   in this file (DDL-shape negative assertion only — bare prose mention
--   in this comment block is acceptable).

-- ── CreateTable Guardian ─────────────────────────────────────────────────
-- Tenant-scoped, soft-delete, audit per §4.4. `nik` is Indonesian national
-- ID; PII (T2 schema annotates with /// @PII redact). `phone` PII (mask:last4).
-- `userId` is the optional link to a User row created at invitation acceptance
-- (NULL until accepted, populated atomically inside the consume transaction).
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "fullName" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "nik" VARCHAR(16),
    "phone" VARCHAR(20),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- ── CreateTable StudentGuardian ──────────────────────────────────────────
-- Tenant-scoped, soft-delete, audit per §4.4. Relationship enum via CHECK
-- (no Prisma enum — schema-light, mirrors Student.gender / StudentIdentifier.kind
-- precedent). Composite FKs to Student + Guardian per §6.4 with CASCADE on
-- hard-delete (admin-tool path).
CREATE TABLE "StudentGuardian" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "relationship" VARCHAR(20) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" VARCHAR(2000),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "StudentGuardian_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StudentGuardian_relationship_check"
      CHECK ("relationship" IN ('FATHER', 'MOTHER', 'GUARDIAN', 'OTHER'))
);

-- ── CreateTable GuardianInvitation ───────────────────────────────────────
-- Tenant-scoped, NO soft-delete (operational; status enum carries lifecycle).
-- Token + status enum + expiresAt + acceptedAt. Composite FKs to Student +
-- Guardian per §6.4 with CASCADE on hard-delete. No deletedAt / deletedById
-- per the operational-record convention (matches ExportJob/EmailLog precedent).
CREATE TABLE "GuardianInvitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "acceptedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "GuardianInvitation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GuardianInvitation_status_check"
      CHECK ("status" IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'))
);

-- ── Composite uniques on (id, tenantId) — required as FK targets ────────
-- Per §6.4: Guardian referenced by composite FKs from StudentGuardian +
-- GuardianInvitation in this migration (and from future portal-invitation
-- consumer cycles). StudentGuardian + GuardianInvitation each carry their
-- own (id, tenantId) for symmetry with §6.4 — keeps future cross-row
-- references uniform.
CREATE UNIQUE INDEX "Guardian_id_tenantId_key" ON "Guardian"("id", "tenantId");
CREATE UNIQUE INDEX "StudentGuardian_id_tenantId_key" ON "StudentGuardian"("id", "tenantId");
CREATE UNIQUE INDEX "GuardianInvitation_id_tenantId_key" ON "GuardianInvitation"("id", "tenantId");

-- ── Token global unique (per assumption 2) ──────────────────────────────
-- 256-bit entropy → collision astronomically unlikely. Global unique (not
-- partial-WHERE) because invitations are append-only by status, not
-- soft-deleted; the token itself is immutable across the row's lifecycle.
CREATE UNIQUE INDEX "GuardianInvitation_token_key" ON "GuardianInvitation"("token");

-- ── Lookup indexes ──────────────────────────────────────────────────────
-- Plain B-tree only — no trigram GIN this cycle. Fuzzy guardian search lands
-- with the scaffold cycle (p2-students-guardians-scaffold).

-- Standalone FK-column indexes (leading on the FK column, not tenantId) cover
-- cascade scans on ON DELETE CASCADE / SET NULL paths — Postgres does not use
-- a `(tenantId, fkColumn)` compound index when only the FK column is supplied
-- as the predicate (which is what the planner sees during a parent-row delete
-- cascade). These are cheap at PAUD scale and prevent seq-scan regression
-- when admin tools eventually hard-delete a Guardian or User row with many
-- linked invitations + join rows.

-- Guardian
CREATE INDEX "Guardian_tenantId_idx" ON "Guardian"("tenantId");
CREATE INDEX "Guardian_userId_idx" ON "Guardian"("userId");
CREATE INDEX "Guardian_tenantId_userId_idx" ON "Guardian"("tenantId", "userId");
CREATE INDEX "Guardian_tenantId_fullName_idx" ON "Guardian"("tenantId", "fullName");

-- StudentGuardian
CREATE INDEX "StudentGuardian_tenantId_idx" ON "StudentGuardian"("tenantId");
CREATE INDEX "StudentGuardian_guardianId_idx" ON "StudentGuardian"("guardianId");
CREATE INDEX "StudentGuardian_tenantId_studentId_idx" ON "StudentGuardian"("tenantId", "studentId");
CREATE INDEX "StudentGuardian_tenantId_guardianId_idx" ON "StudentGuardian"("tenantId", "guardianId");

-- GuardianInvitation
CREATE INDEX "GuardianInvitation_tenantId_idx" ON "GuardianInvitation"("tenantId");
CREATE INDEX "GuardianInvitation_guardianId_idx" ON "GuardianInvitation"("guardianId");
CREATE INDEX "GuardianInvitation_tenantId_studentId_idx" ON "GuardianInvitation"("tenantId", "studentId");
CREATE INDEX "GuardianInvitation_tenantId_guardianId_idx" ON "GuardianInvitation"("tenantId", "guardianId");
CREATE INDEX "GuardianInvitation_tenantId_status_idx" ON "GuardianInvitation"("tenantId", "status");

-- ── Partial unique index — single PRIMARY per relationship per student ──
-- Per cycle assumption 8. Scoped per relationship type so PRIMARY FATHER +
-- PRIMARY MOTHER coexist. deletedAt-aware so ended relationships free the
-- PRIMARY slot for re-assignment.
CREATE UNIQUE INDEX "StudentGuardian_singlePrimaryPerRelationship_key"
  ON "StudentGuardian" ("studentId", "tenantId", "relationship")
  WHERE "isPrimary" = true AND "deletedAt" IS NULL;

-- ── Foreign keys ────────────────────────────────────────────────────────
-- Tenant FKs Restrict per §4.4 (never cascade Tenant).
-- Composite FKs per §6.4 for tenant-aligned children + cross-row references.
-- StudentGuardian → Student/Guardian: CASCADE on hard-delete (admin-tool path).
-- GuardianInvitation → Student/Guardian: CASCADE on hard-delete.
-- Guardian → User: column-list SET NULL ("userId") — preserves tenantId.

-- Guardian
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Column-list SET NULL: only "userId" is nulled when the User row is hard-
-- deleted. tenantId remains bound. Postgres 15.4+ syntax. Supabase compatible.
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_userId_tenantId_fkey"
  FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId")
  ON DELETE SET NULL ("userId") ON UPDATE CASCADE;

-- StudentGuardian
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_studentId_tenantId_fkey"
  FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_guardianId_tenantId_fkey"
  FOREIGN KEY ("guardianId", "tenantId") REFERENCES "Guardian"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- GuardianInvitation
ALTER TABLE "GuardianInvitation" ADD CONSTRAINT "GuardianInvitation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GuardianInvitation" ADD CONSTRAINT "GuardianInvitation_studentId_tenantId_fkey"
  FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuardianInvitation" ADD CONSTRAINT "GuardianInvitation_guardianId_tenantId_fkey"
  FOREIGN KEY ("guardianId", "tenantId") REFERENCES "Guardian"("id", "tenantId")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ══════════════════════════════════════════════════════════════════════
-- Row-Level Security (spec §6.3)
-- ══════════════════════════════════════════════════════════════════════
-- SELECT-only policies. Service-role bypasses RLS for app writes. REVOKE ALL
-- strips PostgREST write paths (defense-in-depth). NO FORCE ROW LEVEL
-- SECURITY per design lock from p1-regions-seed.
--
-- Soft-delete asymmetry on tenant_isolation_select USING clause:
--   * deletedAt IS NULL clause:    Guardian, StudentGuardian
--   * NO deletedAt clause:         GuardianInvitation (operational record)

-- Guardian
ALTER TABLE "Guardian" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Guardian" FROM anon, authenticated;
GRANT SELECT ON "Guardian" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Guardian"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Guardian"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- StudentGuardian
ALTER TABLE "StudentGuardian" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "StudentGuardian" FROM anon, authenticated;
GRANT SELECT ON "StudentGuardian" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "StudentGuardian"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "StudentGuardian"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- GuardianInvitation (no soft-delete — omit deletedAt clause per assumption 7)
ALTER TABLE "GuardianInvitation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "GuardianInvitation" FROM anon, authenticated;
GRANT SELECT ON "GuardianInvitation" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "GuardianInvitation"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
  );
CREATE POLICY "no_writes_via_postgrest" ON "GuardianInvitation"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
