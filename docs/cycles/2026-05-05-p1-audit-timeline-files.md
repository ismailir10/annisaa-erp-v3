# Phase 1 Cycle 5 — Audit + Timeline + Files Foundation

**Type:** schema
**Phase:** p1
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §6.1 migrations 06 + 16 + §4.1 Foundation row + §4.2 enums (AuditAction / TimelineVisibility / FileKind / FileStatus / ExportFormat / ExportJobStatus) + §4.4 audit-column convention + §4.5 critical pattern (audit-log immutable append-only + month partitioning + 7-yr retention) + §5.13 PII redaction generator + §6.3 RLS strategy + §6.4 composite-FK pattern + §16.1 hosting (Supabase Storage) + §16.1a cron inventory + §18.1 phase 1 cycle 5

## Context

Implements the audit + timeline + file foundation per foundation spec §18.1 phase 1 cycle 5 — two migrations (`06_audit_timeline`, `16_scaffold`) + a PII redactor generator + the Supabase Storage runbook. Lands the 8 models that every subsequent scaffold cycle will write into for compliance, history, and async I/O: `AuditLog`, `TimelineEvent` (mig 06) + `FileAsset`, `ExportJob`, `EmailLog`, `WebhookEvent`, `OrgConfig`, `Holiday` (mig 16). Builds on `p1-employees-classes-sentra` (PR #182, staging tip 93a42c6). Migrations 00 + 01 + 02 + 03 + 04 + 05 + 09 live; seeds 00-07 live; RLS strict guard at 17/17; 6 enums live (PermissionScope / CatalogSource / TenantBootstrapStatus / RegencyType / SessionStatus / SessionTeacherRole); `version Int` columns on Employee/ClassSection/ClassSession ahead of `17_version_triggers`; single-PRIMARY-per-session partial-unique guard in place. Marathon mode per spec §18.12 — full brainstorm skipped, plan derived from spec sections inline. Cross-checked design-system.html: N/A (schema-only cycle, no frontend diff). UAT reports: N/A (pre-launch rebuild). Disk monitored — `cleanup-merged.sh --yes` removed merged `feat/p1-employees-classes-sentra` worktree before start (the only safe candidate per startup hook); ~3.6 GiB free at start, schema cycle fits comfortably (no test fixtures, no Playwright, symlinked node_modules).

**§18.2 single-migration cap override:** This cycle ships **two numerically non-adjacent migrations** (`06_audit_timeline` + `16_scaffold`) — permitted by §18.1's explicit pre-allocation of those numbered slots to this cycle, overriding §18.2's general one-migration-per-cycle cap. Same precedent as `p1-employees-classes-sentra` (which shipped 03 + 04 + 05 in one cycle per §18.1 pre-allocation). The two migrations are independent (no FK between AuditLog/TimelineEvent and the mig-16 tables — AuditLog is referenced *by* future cycles, never *from* this cycle's tables) but ship together because the redactor generator (§5.13) needs an `AuditLog` table to redact into and the storage runbook (§16.1) needs a `FileAsset` table to anchor; splitting into `06-only` + `16-only` would leave both half-functional for two cycles.

**Sharp compression pipeline scope split:** spec §18.1 lists `p1-audit-timeline-files` as shipping "Supabase Storage setup + sharp pipeline + redactor generator". This cycle ships the **storage runbook** (Ship Notes, §16.1 documented bucket/RLS/TTL conventions) + the **redactor generator** (§5.13). The **runtime sharp pipeline** (npm install sharp, the upload route's resize/JPEG-80%/re-upload step) ships with `p1-scaffold-engine-skeleton` because it requires the `/api/upload` route which itself depends on the scaffold engine's permission resolver + audit-write middleware — neither lands until next cycle. Splitting the pipeline (DB tables + runbook here; runtime code there) keeps the FileAsset DDL ahead of any upload code and avoids shipping a sharp dependency without a call-site. Cycle scope cap (≤16 staged files / ≤400-line schema delta) does not accommodate the sharp install + pipeline code on top of the partitioning + 6-table + redactor surface this cycle already carries.

**Migration-numbering decision:** spec §6.1 reserves slots `06_audit_timeline` and `16_scaffold` in numeric order. Prisma applies migrations alphabetically by directory name; the existing on-disk order is `00 → 01 → 02 → 03 → 04 → 05 → 09`. Adding `06` slots between `05` and `09`; adding `16` slots after `09`. Final apply order: `00 → 01 → 02 → 03 → 04 → 05 → 06 → 09 → 16`. No reconciliation needed — the alphanumeric order is unambiguous and `06` does not depend on `09_regions` (regions are non-tenant-scoped reference data; `06` references only Tenant + User).

## Spec

Acceptance criteria:

- [ ] `prisma/schema.prisma` adds **8 new models** + **6 new Postgres enums**:
  - Models in `06_audit_timeline`: `AuditLog`, `TimelineEvent`.
  - Models in `16_scaffold`: `FileAsset`, `ExportJob`, `EmailLog`, `WebhookEvent`, `OrgConfig`, `Holiday`.
  - Enums in `06_audit_timeline`: `AuditAction` (`CREATE`, `UPDATE`, `DELETE`, `SOFT_DELETE`, `RESTORE`, `READ`, `IMPORT`, `EXPORT` — 8 members; covers CRUD + soft-delete lifecycle + p4-import-wizard + §5.11 export tracking) + `TimelineVisibility` (`PRIVATE`, `INTERNAL`, `PARENT_VISIBLE` — 3 members; `PRIVATE` = author only, `INTERNAL` = tenant staff only, `PARENT_VISIBLE` = parent of subject student/child can see).
  - Enums in `16_scaffold`: `FileKind` (`DOCUMENT`, `IMAGE`, `VIDEO`, `AUDIO`, `ARCHIVE` — 5 members), `FileStatus` (`PENDING_UPLOAD`, `UPLOADED`, `COMPRESSED`, `FAILED`, `ORPHANED` — 5 members; lifecycle for §16.1a `file_asset.orphan_cleanup` cron), `ExportFormat` (`CSV`, `XLSX`, `PDF` — 3 members per §5.11), `ExportJobStatus` (`PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `EXPIRED` — 5 members per §5.11 async export state machine).

- [ ] **Migration `06_audit_timeline/migration.sql`** (hand-written, ≤220 lines including partition pre-creation + append-only trigger) — applies on top of `05_sessions`:
  - 2 `CREATE TYPE`: `AuditAction`, `TimelineVisibility`.
  - 2 `CREATE TABLE`:
    - **`AuditLog`** — partitioned, append-only, **carries §4.4 audit columns ONLY in the `createdAt` form** (no `updatedAt` / `deletedAt` / `updatedById` / `deletedById` — append-only by design; the spec §4.4 standard `audit columns` are for *operational* entities, not the audit log itself). Columns:
      - `id TEXT NOT NULL` (cuid, but **PRIMARY KEY is `(id, "createdAt")`** — partitioned tables require the partition key in the PK).
      - `tenantId TEXT NOT NULL` — root-scoped tenant denorm. (Id-reference column → `TEXT` per the established `02_identity`/`05_sessions` migration template; `VARCHAR(N)` is reserved for bounded business-code strings per §4.4.)
      - `actorUserId TEXT` (nullable; replaces `createdById`; system actions may be null — e.g. cron auto-soft-delete).
      - `action "AuditAction" NOT NULL`.
      - `resource VARCHAR(50) NOT NULL` — model name like `"Student"`, `"Invoice"`.
      - `resourceId TEXT NOT NULL` — cuid of affected row (id-reference → TEXT).
      - `before JSONB` (nullable; redacted via `lib/audit/redactor.ts` before insert — null on CREATE).
      - `after JSONB` (nullable; redacted; null on DELETE / SOFT_DELETE).
      - `ipAddress INET` (nullable).
      - `userAgent VARCHAR(500)` (nullable).
      - `createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.
      - **No `updatedAt`, no `deletedAt`, no `*ById` audit-by columns** — append-only. Justification documented in migration header.
      - **No `retentionUntil` column.** Earlier draft included a `DATE` column to drive a row-level retention DELETE cron; removed per pre-build reviewer C1 — spec §4.5 specifies the canonical retention mechanism as **partition drop in O(1)** (`DROP TABLE "AuditLog_y2026m05"` once past 7-yr horizon), which keys off the partition's date boundary in `pg_partition_descriptor`, not a per-row `retentionUntil` column. A `retentionUntil` index would be unused and the column would mislead future implementors. The `audit.retention_cleanup` cron (deferred to p3+ per Non-goals) drops whole partitions; the 7-yr horizon is encoded by the partition cadence, not by a per-row column.
      - `PARTITION BY RANGE ("createdAt")` declared inline within `CREATE TABLE`.
    - **`TimelineEvent`** (tenant-scoped, **soft-delete YES** — see Assumptions for rationale; carries full §4.4 audit columns). Columns:
      - `id TEXT NOT NULL PRIMARY KEY`.
      - `tenantId TEXT NOT NULL` (id-reference → TEXT).
      - `actorUserId TEXT` (nullable; system events may have no actor — e.g. cron-generated milestone event).
      - `subjectKind VARCHAR(50) NOT NULL` — model name of the subject (e.g. `"Student"`, `"Invoice"`). Bounded business-code string → VARCHAR.
      - `subjectId TEXT NOT NULL` — cuid of subject row (id-reference → TEXT).
      - `kind VARCHAR(50) NOT NULL` — code from the timeline-event registry (`lib/timeline/events.ts`, deferred to `p1-scaffold-engine-skeleton`).
      - `visibility "TimelineVisibility" NOT NULL DEFAULT 'INTERNAL'`.
      - `payload JSONB NOT NULL DEFAULT '{}'::jsonb` — Zod-validated app-side per registered `kind`.
      - `occurredAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` — distinct from `createdAt` (the *event* may have happened earlier than the row was written; both stored).
      - Standard §4.4 audit columns: `createdAt`, `createdById`, `updatedAt`, `updatedById`, `deletedAt`, `deletedById`.
  - **Pre-create 18 monthly partitions inline** (2026-05 through 2027-10 — covers MVP launch window per §9.1 + first ~16 months + 2-month buffer; auto-create cron deferred to `p3+`). Naming: `AuditLog_y2026m05`, `AuditLog_y2026m06`, …, `AuditLog_y2027m10`. Each partition declared `FOR VALUES FROM ('YYYY-MM-01') TO ('YYYY-MM+1-01')` with month rollover (e.g. December → next year January). 18 partition tables in the migration, all empty. Bumped from 14 → 18 per pre-build reviewer Risk-G — auto-create cron lands in `p3+` and may slip; 4 extra partitions cost zero storage when empty and provide ~6 months extra ops slack.
  - **Append-only trigger** — Postgres function `audit_log_block_update_delete()` declared `LANGUAGE plpgsql` + `SECURITY INVOKER` (default — explicitly stated in CREATE FUNCTION). Body: `RAISE EXCEPTION 'AuditLog is append-only; UPDATE/DELETE rejected by trigger %', TG_OP USING ERRCODE = 'P0001';`. Two `CREATE TRIGGER` statements: `audit_log_block_update BEFORE UPDATE ON "AuditLog"` + `audit_log_block_delete BEFORE DELETE ON "AuditLog"` — both `FOR EACH ROW EXECUTE FUNCTION audit_log_block_update_delete()`. **`SECURITY INVOKER` is correct here** — the function only `RAISE`s an exception, never reads or writes; it has no need for elevated privileges. Earlier draft used `SECURITY DEFINER + SET search_path` to silence the Supabase advisory lint, but the lint fires on `DEFINER` *without* a locked search path, not on `INVOKER` — so `INVOKER` (default) is simpler and equally safe. Patched per pre-build reviewer Q-B. **No bypass for `service_role`** — the trigger fires unconditionally for all roles regardless of `SECURITY` mode. Future retention-cron drops by partition (`DROP TABLE "AuditLog_y2026m05"`) which bypasses row-level triggers entirely; that is the only legitimate deletion path. Live verification (UPDATE/DELETE rejection on a populated partition) deferred to `p1-scaffold-engine-skeleton`'s integration tests; this cycle's static parse asserts function/trigger presence + `RAISE EXCEPTION` body.
  - Lookup indexes on `AuditLog`: `AuditLog_tenantId_createdAt_idx` (per-tenant chronological — primary read path), `AuditLog_tenantId_resource_resourceId_idx` (per-row history lookup — admin "show me everything that happened to this Student"), `AuditLog_tenantId_actorUserId_createdAt_idx` (per-actor activity feed — admin "what did this user do today?"). **No retention index** — partition-drop retention does not key off any per-row column (per C1 fix above).
  - Lookup indexes on `TimelineEvent`: `TimelineEvent_tenantId_idx`, `TimelineEvent_tenantId_subjectKind_subjectId_occurredAt_idx` (per-subject timeline — primary read path), `TimelineEvent_tenantId_actorUserId_occurredAt_idx` (per-actor activity), `TimelineEvent_tenantId_kind_occurredAt_idx` (per-kind aggregation), GIN index on `TimelineEvent_payload_idx` for JSONB queries (admin search).
  - Composite uniques: `AuditLog_id_tenantId_createdAt_key` is implicit via the `(id, "createdAt")` PK + `tenantId` denorm (tests verify `tenantId` is enforced via composite or app-layer; given AuditLog is leaf — never an FK target — composite-FK pattern §6.4 does NOT apply). `TimelineEvent_id_tenantId_key` composite unique declared for any future FK target (none in this cycle; pre-emptive — same pattern as p1-identity-rls).
  - FK constraints:
    - `AuditLog.tenantId → Tenant(id) ON DELETE RESTRICT`. **No FK on `actorUserId`** — User table exists but cross-table foreign keys to a partitioned table's parent row are subtle (PG14+ supports them but with caveats); the `actorUserId TEXT` carries a non-FK soft reference, with app-layer validation. Documented in header. (Composite-FK to `User(id, tenantId)` would also be possible but adds maintenance burden across 18 partitions for a denorm column whose row may be soft-deleted.)
    - `TimelineEvent.tenantId → Tenant(id) RESTRICT`; **single-col** `TimelineEvent.actorUserId → User(id) ON DELETE SET NULL` (single-col FK matching the `ClassSection.walasEmployeeId` precedent from `p1-employees-classes-sentra`: composite FK is reserved for RLS-critical join tables per §6.4 MVP rule, and TimelineEvent is a root entity with a denorm column FK, not a join. Tenant alignment enforced by `TimelineEvent.tenantId` denorm + app-layer guard. Avoids the column-subset-SET-NULL workaround that Prisma 7 doesn't model.).
  - **RLS policies** — 2 tables, **`AuditLog` has the immutability deviation**:
    - `TimelineEvent`: standard pattern — `ALTER TABLE ENABLE RLS` + `REVOKE ALL FROM anon, authenticated` + `GRANT SELECT TO authenticated` + `tenant_isolation_select` policy (with `AND "deletedAt" IS NULL` since TimelineEvent is soft-deletable) + `no_writes_via_postgrest` policy.
    - `AuditLog`: **`REVOKE ALL FROM anon, authenticated`** + `GRANT SELECT TO authenticated` (admin reads audit log via admin UI) + `tenant_isolation_select` policy (no `deletedAt` clause — no soft-delete on AuditLog) + `no_writes_via_postgrest` policy. **Immutability is enforced by the trigger, not by RLS** — RLS would let service-role mutate; the trigger blocks all roles. The `no_writes_via_postgrest` policy is the PostgREST-layer guard; the trigger is the DB-layer guard. Two layers.
    - **No `FORCE ROW LEVEL SECURITY`** on either table — design lock from `p1-regions-seed` (service-role seed must bypass RLS on the rest of the schema; `audit_log_block_update_delete` trigger is the only enforcement we want to apply to all roles, including service-role).

- [ ] **Migration `16_scaffold/migration.sql`** (hand-written, ≤180 lines) — applies on top of `09_regions`:
  - 4 `CREATE TYPE`: `FileKind`, `FileStatus`, `ExportFormat`, `ExportJobStatus`.
  - 6 `CREATE TABLE`: `FileAsset`, `ExportJob`, `EmailLog`, `WebhookEvent`, `OrgConfig`, `Holiday` (defined in this order; ExportJob references FileAsset, so FileAsset comes first).
  **Note on column types:** all id-reference columns (`tenantId`, `*UserId`, `resultFileAssetId`, `currentAcademicYearId`) use `TEXT` matching the `02_identity` / `05_sessions` migration template. `VARCHAR(N)` is reserved for bounded business-code strings (`source`, `template`, `status`, `kind`, `idempotencyKey`, `entityKind`, `eventType`) per §4.4. Patched per pre-build reviewer I3.

  - **`FileAsset`** (tenant-scoped, **soft-delete YES**, full §4.4 audit columns):
    - `id TEXT PK`, `tenantId TEXT NOT NULL`.
    - `storagePath VARCHAR(500) NOT NULL` (Supabase Storage path: `<tenant-id>/<kind>/<cuid>.<ext>`).
    - `originalName VARCHAR(255) NOT NULL`.
    - `mimeType VARCHAR(100) NOT NULL`.
    - `sizeBytes BIGINT NOT NULL` — supports up to ~9 EB.
    - `kind "FileKind" NOT NULL`.
    - `status "FileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD'`.
    - `uploaderUserId TEXT` (nullable; system uploads may have no actor).
    - `compressedAt TIMESTAMPTZ` (nullable; set when sharp pipeline completes).
    - `compressionRatio NUMERIC(5,2)` (nullable; e.g. `0.32` = 32% of original size).
    - Standard §4.4 audit columns.
  - **`ExportJob`** (tenant-scoped, **NO soft-delete** — operational record):
    - `id TEXT PK`, `tenantId TEXT NOT NULL`.
    - `requestedByUserId TEXT NOT NULL`.
    - `entityKind VARCHAR(50) NOT NULL` — model being exported (e.g. `"Student"`, `"Invoice"`).
    - `format "ExportFormat" NOT NULL`.
    - `status "ExportJobStatus" NOT NULL DEFAULT 'PENDING'`.
    - `filterPayload JSONB NOT NULL DEFAULT '{}'::jsonb` — Zod-validated app-side; captures the list-page filter chip state at request time.
    - `resultFileAssetId TEXT` (nullable until COMPLETED).
    - `errorMessage VARCHAR(2000)` (nullable; set on FAILED).
    - `expiresAt TIMESTAMPTZ NOT NULL` — 24h signed-URL TTL per §16.1.
    - Audit columns minus soft-delete: `createdAt`, `createdById`, `updatedAt`, `updatedById`.
  - **`EmailLog`** (tenant-scoped, **NO soft-delete** — operational record):
    - `id TEXT PK`, `tenantId TEXT NOT NULL`.
    - `recipientEmail VARCHAR(255) NOT NULL` (app-layer comma-joined for multi-recipient; one row per send).
    - `subject VARCHAR(500) NOT NULL`.
    - `template VARCHAR(100) NOT NULL` — template code from `lib/email/templates/`.
    - `status VARCHAR(50) NOT NULL` — `"QUEUED"` / `"SENT"` / `"BOUNCED"` / `"FAILED"` (plain VARCHAR, not an enum — operational state, may grow with provider quirks; v1.1+ may promote).
    - `messageId VARCHAR(255)` (nullable; from Resend response).
    - `errorMessage VARCHAR(2000)` (nullable; set on FAILED / BOUNCED).
    - `sentAt TIMESTAMPTZ` (nullable; set on transition to SENT).
    - Audit columns minus soft-delete.
  - **`WebhookEvent`** (tenant-scoped, **NO soft-delete** — operational record):
    - `id TEXT PK`, `tenantId TEXT NOT NULL`.
    - `source VARCHAR(50) NOT NULL` — `"xendit"` / `"supabase"` / etc.
    - `eventType VARCHAR(100) NOT NULL` — provider-specific event code.
    - `payload JSONB NOT NULL` — raw webhook body for replay.
    - `signature VARCHAR(255)` (nullable; provider-supplied HMAC).
    - `idempotencyKey VARCHAR(255) NOT NULL`.
    - `processedAt TIMESTAMPTZ` (nullable; null = unprocessed).
    - `errorMessage VARCHAR(2000)` (nullable).
    - Audit columns minus soft-delete (only `createdAt`, `updatedAt` — system-driven, no `*ById`).
    - **Full unique index** `webhook_event_idempotency_unique` ON `(tenantId, source, idempotencyKey)` — full unique (no WHERE clause; no soft-delete on this table). Tests assert `CREATE UNIQUE INDEX … ON "WebhookEvent" ("tenantId", "source", "idempotencyKey")`.
  - **`OrgConfig`** (tenant-scoped, **soft-delete YES**, full §4.4 audit columns, singleton-per-tenant via column-level UNIQUE):
    - `id TEXT PK`, `tenantId TEXT NOT NULL UNIQUE`. ← singleton enforced via column-level UNIQUE on tenantId. Cleaner than `@@unique([tenantId])` for the test parser; semantically identical. Drift note in Ship Notes: future `migrate dev --create-only` would emit a separate `CREATE UNIQUE INDEX` instead.
    - `lemburCompliant BOOLEAN NOT NULL DEFAULT false` — per v1 ADR (overtime compliance toggle for payroll).
    - `nisPrefix VARCHAR(10)` (nullable; NIS allocator helper — e.g. `"AN"` for "An Nisaa"). Optional: when null, NIS allocator uses tenant slug.
    - `currentAcademicYearId TEXT` (nullable until p2 admission populates; FK SET NULL).
    - `autoDropAdmissionDays INT NOT NULL DEFAULT 30` — drives `Admission` `AUTO_DROPPED` cron threshold per §7.1.
    - `timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta'`.
    - `locale VARCHAR(10) NOT NULL DEFAULT 'id-ID'`.
    - Standard §4.4 audit columns.
    - Composite unique `OrgConfig_id_tenantId_key` for any future FK target (none in MVP).
  - **`Holiday`** (tenant-scoped, **soft-delete YES**, full §4.4 audit columns):
    - `id TEXT PK`, `tenantId TEXT NOT NULL`.
    - `date DATE NOT NULL`.
    - `name VARCHAR(255) NOT NULL`.
    - `kind VARCHAR(20) NOT NULL` — `"NATIONAL"` / `"RELIGIOUS"` / `"SCHOOL"` (plain VARCHAR; not an enum — small finite set, may extend per locale).
    - Standard §4.4 audit columns.
    - **Partial unique** `holiday_tenant_date_active_unique` ON `Holiday(tenantId, date) WHERE deletedAt IS NULL` — at most one active holiday per tenant per date.

  - Composite uniques on `(id, tenantId)` for `FileAsset`, `ExportJob`, `OrgConfig` (FK-target candidates — ExportJob.resultFileAssetId references FileAsset's composite). EmailLog/WebhookEvent/Holiday omit composite unique (never FK targets in MVP — leaf operational/reference data).

  - Lookup indexes (per FK column, tenantId-prefixed for RLS-friendly seek):
    - `FileAsset_tenantId_idx`, `FileAsset_tenantId_status_idx` (drives §16.1a `file_asset.orphan_cleanup` cron — `WHERE status = 'PENDING_UPLOAD' AND createdAt < now() - INTERVAL '24h'`), `FileAsset_tenantId_kind_idx`, `FileAsset_uploaderUserId_tenantId_idx`.
    - `ExportJob_tenantId_idx`, `ExportJob_tenantId_status_idx` (drives queue picker), `ExportJob_tenantId_requestedByUserId_idx`, `ExportJob_resultFileAssetId_tenantId_idx` (FK-supporting).
    - `EmailLog_tenantId_idx`, `EmailLog_tenantId_status_idx`, `EmailLog_tenantId_recipientEmail_idx`.
    - `WebhookEvent_tenantId_idx`, `WebhookEvent_tenantId_source_eventType_idx`, `WebhookEvent_tenantId_processedAt_idx` (drives unprocessed-queue picker — `WHERE processedAt IS NULL`).
    - `OrgConfig_tenantId_idx` (subsumed by the UNIQUE constraint, but explicit for parser clarity).
    - `Holiday_tenantId_idx`, `Holiday_tenantId_date_idx` (drives calendar lookups).

  - FK constraints (all single-col on cross-row references — composite FK reserved for RLS-critical join tables per §6.4 MVP rule, not applicable to any new tables this cycle):
    - `FileAsset.tenantId → Tenant(id) RESTRICT`; **single-col** `FileAsset.uploaderUserId → User(id) ON DELETE SET NULL`.
    - `ExportJob.tenantId → Tenant(id) RESTRICT`; **single-col** `ExportJob.requestedByUserId → User(id) RESTRICT` (export jobs MUST have a requesting user; if the user is hard-deleted, force admin to handle); **single-col** `ExportJob.resultFileAssetId → FileAsset(id) ON DELETE SET NULL` (file may be cleaned up; export job persists with the error trail).
    - `EmailLog.tenantId → Tenant(id) RESTRICT`. No user FK (recipient is a free-text email; sender is system).
    - `WebhookEvent.tenantId → Tenant(id) RESTRICT`. No user FK (system-driven).
    - `OrgConfig.tenantId → Tenant(id) RESTRICT`; **single-col** `OrgConfig.currentAcademicYearId → AcademicYear(id) ON DELETE SET NULL`.
    - `Holiday.tenantId → Tenant(id) RESTRICT`.

  - **RLS policies** — 6 tables, **standard pattern per §6.3 + REVOKE ALL defense-in-depth + no FORCE**:
    - Per table: `ALTER TABLE ENABLE RLS` + `REVOKE ALL FROM anon, authenticated` + `GRANT SELECT TO authenticated` + `tenant_isolation_select` + `no_writes_via_postgrest`.
    - `tenant_isolation_select` USING clause includes `AND "deletedAt" IS NULL` only on the soft-delete tables: **FileAsset, OrgConfig, Holiday**. Omit on **ExportJob, EmailLog, WebhookEvent** (operational records, no soft-delete).
    - **No `FORCE ROW LEVEL SECURITY`** anywhere.

- [ ] **Audit redactor generator (`scripts/generate-audit-redactor.ts`)** per spec §5.13:
  - Reads `prisma/schema.prisma`.
  - Parses model blocks and field-level triple-slash annotations matching `/\/\/\/\s*@PII\s+(redact|mask:last4)/`.
  - Builds a per-model field map keyed by Prisma model name → field name → policy (`'redact'` | `'mask:last4'`).
  - Emits `lib/audit/redactor.ts` with:
    - A header comment: `// AUTO-GENERATED by scripts/generate-audit-redactor.ts. Do not edit by hand.`
    - A frozen `PII_FIELDS` const map (sorted by model then field for determinism).
    - A `redact(modelName: string, before: Json | null, after: Json | null): { before: Json | null; after: Json | null }` helper that walks `before` + `after` shallowly (top-level object keys only — JSON values are not deep-traversed; nested PII would need to be flat-promoted to top-level columns), applies the per-field policy, returns redacted shapes.
    - Policy semantics:
      - `redact`: top-level field replaced with `null`.
      - `mask:last4`: top-level string field replaced with `"***" + lastFour` where `lastFour = String(value).slice(-4)`. If the value is shorter than 4 chars, the whole value is masked as `"***"`. Non-string values (number / boolean / null) are passed through unchanged (no PII in non-string by convention).
    - Idempotent: applying `redact` to already-redacted output yields the same output (null stays null; `"***1234"` stays `"***1234"` because the last-4 of `"***1234"` is `"1234"`; output `"***1234"` again).
    - Non-annotated fields preserved verbatim (including nested objects).
    - Null-safety: if `before` or `after` is `null` (CREATE / DELETE), pass through unchanged.
  - Generator is **idempotent**: re-running on the same schema produces the same `lib/audit/redactor.ts` byte-for-byte. Sorted keys + stable formatting.
  - Wire into `package.json` scripts: `"audit:redactor": "tsx scripts/generate-audit-redactor.ts"`. Document in cycle Ship Notes that future PII-annotation cycles MUST run this before commit (manual gate; CI gate via `verify-pii-annotations.sh` happens separately).
  - Generated file `lib/audit/redactor.ts` is committed (not gitignored) — keeps the build deterministic without a generation step in CI.

- [ ] **Audit redactor unit tests** at `lib/audit/redactor.test.ts`:
  - Imports the generated `lib/audit/redactor.ts`.
  - Test cases:
    - **NIK redact policy:** `redact('Employee', { nik: '3275010101010001', name: 'Bu Sari' }, null)` → `{ before: { nik: null, name: 'Bu Sari' }, after: null }`.
    - **Phone mask:last4:** `redact('Employee', { phone: '+6281234567890' }, null)` → `{ before: { phone: '***7890' }, after: null }`.
    - **Phone mask:last4 short value:** input `phone: '12'` → `phone: '***'` (whole value masked when shorter than 4).
    - **Non-annotated field passthrough:** `redact('Employee', { name: 'Bu Sari', email: 's@x.id' }, null)` → `before` returns input unchanged (name + email pass through; email NOT annotated yet — confirms the generator only touches annotated fields).
    - **Nested-object preservation:** input `customFields: { foo: 'bar' }` → returned unchanged (not deep-walked).
    - **Idempotent on already-redacted input:** `redact('Employee', { nik: null, phone: '***7890' }, null)` → `before.nik === null && before.phone === '***7890'`.
    - **Null before / null after:** `redact('Employee', null, null)` → `{ before: null, after: null }`.
    - **Unknown model:** `redact('NotAModel', { x: 1 }, null)` → `before` returns input unchanged (silent passthrough; redactor only knows the models in `PII_FIELDS`).
    - **Both before + after:** `redact('Employee', { nik: 'X' }, { nik: 'Y' })` redacts both; verify both shapes returned.

- [ ] **Schema PII annotations swept** — extend `prisma/schema.prisma` to annotate the known-PII fields landed by prior cycles:
  - `Employee.nik` → already `/// @PII redact` from cycle 4 (no change).
  - `Employee.phone` → ADD `/// @PII mask:last4`.
  - `Employee.email` → leave **unannotated** for now (admin/staff email is not PDP-protected; parent/student emails are, and those land in p2-students-guardians-household with their own annotation pass).
  - **No other PII fields exist yet** — Student, Guardian, NISN, KK number all land in Phase 2; their annotation pass ships with `p2-students-guardians-household`.
  - This cycle's `verify-pii-annotations.sh` checks ONLY the fields already in schema (NIK + phone). Future cycles extend the script's hardcoded list.

- [ ] **`scripts/verify-pii-annotations.sh`** — bash script per spec §18.1 (mentioned at line 1132 of foundation spec; ships with this cycle per §5.13 redactor pairing):
  - Hardcoded list of `(model, field, expected_policy)` triples covering known-PII fields present in schema as of this cycle:
    - `(Employee, nik, redact)`
    - `(Employee, phone, mask:last4)`
  - For each triple, parse `prisma/schema.prisma` and assert the field's line carries the expected `/// @PII <policy>` annotation. Exit 1 with a clear error message listing the missing/incorrect annotations.
  - Future cycles extend the hardcoded list when adding new PII fields (Student.nisn → redact, Guardian.phone → mask:last4, etc.).
  - Wired into the cycle gate: `npx prisma generate && npx prisma validate && npx prisma migrate deploy && npx prisma db seed && npx prisma db seed && tsx scripts/generate-audit-redactor.ts && npm run build && npx vitest run && bash scripts/verify-rls-coverage.sh && bash scripts/verify-api-auth.sh && bash scripts/verify-pii-annotations.sh`.
  - Pattern mirrors `verify-rls-coverage.sh` + `verify-api-auth.sh`: `set -euo pipefail`, exits 0 on success, 1 on missing.

- [ ] **Migration post-condition tests** at `prisma/migration-tests/{06-audit-timeline,16-scaffold}.test.ts` — static parse pattern matching prior cycles. Each file asserts:
  - **Enum creation** with verbatim member assertions:
    - `06_audit_timeline`: AuditAction (8 members), TimelineVisibility (3 members).
    - `16_scaffold`: FileKind (5), FileStatus (5), ExportFormat (3), ExportJobStatus (5).
  - **Table creation** per spec.
  - **Column shapes:**
    - AuditLog: `tenantId TEXT NOT NULL`, `actorUserId TEXT` (nullable, no NOT NULL), `action "AuditAction" NOT NULL`, `resource VARCHAR(50)`, `resourceId TEXT NOT NULL`, `before JSONB` (nullable), `after JSONB` (nullable), `ipAddress INET` (nullable), `userAgent VARCHAR(500)` (nullable), `createdAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`. **Negative**: AuditLog has NO `updatedAt` / NO `deletedAt` / NO `*ById` audit-by columns (append-only deviation) AND **NO `retentionUntil`** (partition-drop retention; per pre-build reviewer C1).
    - TimelineEvent: full §4.4 audit columns, `payload JSONB NOT NULL DEFAULT '{}'::jsonb`, `subjectKind VARCHAR(50)`, `subjectId TEXT NOT NULL`, `kind VARCHAR(50)`, `visibility "TimelineVisibility" NOT NULL DEFAULT 'INTERNAL'`, `occurredAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`.
    - FileAsset: `tenantId TEXT NOT NULL`, `storagePath VARCHAR(500)`, `mimeType VARCHAR(100)`, `sizeBytes BIGINT`, `kind "FileKind"`, `status "FileStatus" NOT NULL DEFAULT 'PENDING_UPLOAD'`, `uploaderUserId TEXT` (nullable), `compressionRatio NUMERIC(5,2)?`, full §4.4 audit columns.
    - ExportJob: `tenantId TEXT NOT NULL`, `requestedByUserId TEXT NOT NULL`, `entityKind VARCHAR(50)`, `format "ExportFormat"`, `status "ExportJobStatus" NOT NULL DEFAULT 'PENDING'`, `filterPayload JSONB`, `resultFileAssetId TEXT` (nullable), `errorMessage VARCHAR(2000)?`, `expiresAt TIMESTAMPTZ NOT NULL`, audit minus soft-delete.
    - EmailLog: `tenantId TEXT NOT NULL`, `recipientEmail VARCHAR(255)`, `subject VARCHAR(500)`, `template VARCHAR(100)`, `status VARCHAR(50)`, `messageId VARCHAR(255)?`, `sentAt TIMESTAMPTZ?`, audit minus soft-delete.
    - WebhookEvent: `tenantId TEXT NOT NULL`, `source VARCHAR(50)`, `eventType VARCHAR(100)`, `payload JSONB NOT NULL`, `signature VARCHAR(255)?`, `idempotencyKey VARCHAR(255)`, `processedAt TIMESTAMPTZ?`, audit only `createdAt`/`updatedAt` (no `*ById`).
    - OrgConfig: `tenantId TEXT NOT NULL UNIQUE`, `lemburCompliant BOOLEAN NOT NULL DEFAULT false`, `currentAcademicYearId TEXT` (nullable), `autoDropAdmissionDays INT NOT NULL DEFAULT 30`, `timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta'`, `locale VARCHAR(10) NOT NULL DEFAULT 'id-ID'`, full §4.4 audit columns.
    - Holiday: `tenantId TEXT NOT NULL`, `date DATE NOT NULL`, `name VARCHAR(255)`, `kind VARCHAR(20)`, full §4.4 audit columns.
  - **AuditLog partitioning** — assert the `CREATE TABLE "AuditLog"` block ends with `PARTITION BY RANGE ("createdAt")` (matched via regex). **Count pre-created partitions** via `(MIG_06.match(/CREATE TABLE "AuditLog_y\d{4}m\d{2}" PARTITION OF "AuditLog"/g) || []).length === 18`.
  - **Partition position-ordering assertion (per pre-build reviewer I4):** `MIG_06.indexOf('PARTITION OF "AuditLog"') > MIG_06.indexOf('CREATE TABLE "AuditLog" (')` — partition declarations must appear AFTER the parent CREATE TABLE block, otherwise `migrate deploy` fails with `relation "AuditLog" does not exist` despite static parse passing. Mirrors the `indexOf`-ordering precedent from `05-sessions.test.ts`.
  - **AuditLog PK is composite `(id, "createdAt")`** — assert `CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id", "createdAt")` in the AuditLog block.
  - **Append-only trigger function + 2 triggers**:
    - `CREATE OR REPLACE FUNCTION audit_log_block_update_delete\(\)` exists.
    - Function body matches `RAISE EXCEPTION 'AuditLog is append-only`.
    - Function declared `LANGUAGE plpgsql` + `SECURITY INVOKER` (raise-only function; no elevated privilege needed; per pre-build reviewer Q-B). Test asserts BOTH `LANGUAGE plpgsql` AND `SECURITY INVOKER` literally appear in the function definition. Test asserts `SECURITY DEFINER` does **NOT** appear (negative — guards against accidental elevation in future edits).
    - 2 triggers: `audit_log_block_update BEFORE UPDATE ON "AuditLog"` + `audit_log_block_delete BEFORE DELETE ON "AuditLog"`, both `FOR EACH ROW EXECUTE FUNCTION audit_log_block_update_delete()`.
  - **OrgConfig singleton constraint** — assert `tenantId VARCHAR(50) NOT NULL UNIQUE` in the OrgConfig CREATE TABLE block (column-level UNIQUE).
  - **WebhookEvent idempotency unique** — assert `CREATE UNIQUE INDEX "webhook_event_idempotency_unique" ON "WebhookEvent" \("tenantId", "source", "idempotencyKey"\)` (full unique, no WHERE clause).
  - **Holiday partial unique** — assert `CREATE UNIQUE INDEX "holiday_tenant_date_active_unique" ON "Holiday" \("tenantId", "date"\) WHERE "deletedAt" IS NULL`.
  - **FK pattern §6.4** — composite FK is reserved for RLS-critical join tables (UserRole, RolePermission, EmployeeCampusAssignment, TeachingDefault, SentraRotation, SessionTeacher) per spec §6.4 MVP rule. None of the 8 new models in this cycle are RLS-critical join tables, so all cross-row FKs use single-col references. Tests assert single-col FKs:
    - `FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL` on TimelineEvent.
    - `FOREIGN KEY ("uploaderUserId") REFERENCES "User"("id") ON DELETE SET NULL` on FileAsset.
    - `FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT` on ExportJob.
    - `FOREIGN KEY ("resultFileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL` on ExportJob.
    - `FOREIGN KEY ("currentAcademicYearId") REFERENCES "AcademicYear"("id") ON DELETE SET NULL` on OrgConfig.
    - **`AuditLog.actorUserId` is NOT a FK** — assert no `FOREIGN KEY ("actorUserId"` on AuditLog (negative test, with a comment explaining the partition-table FK avoidance per Assumptions).
    - All 8 tables: `FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT` (root-entity tenant scope).
  - **RLS coverage per table** — ENABLE + `REVOKE ALL` + GRANT SELECT + `tenant_isolation_select` + `no_writes_via_postgrest`. **Soft-delete asymmetry** in `tenant_isolation_select`: `deletedAt IS NULL` clause present on TimelineEvent / FileAsset / OrgConfig / Holiday; absent on AuditLog (no soft-delete) / ExportJob / EmailLog / WebhookEvent (no soft-delete).
  - **Schema-side guard** (positive): each new tenant-scoped model in `prisma/schema.prisma` declares `tenantId String`. Models: `AuditLog`, `TimelineEvent`, `FileAsset`, `ExportJob`, `EmailLog`, `WebhookEvent`, `OrgConfig`, `Holiday` (8 total).
  - **Section-ordering sanity:** CREATE TYPE before CREATE TABLE; CREATE TABLE before CREATE TRIGGER (06 only); CREATE TABLE before ALTER TABLE FK + RLS; partition-of declarations after parent CREATE TABLE; partitioning declared inline within parent CREATE TABLE (test: `CREATE TABLE "AuditLog"` block contains `PARTITION BY RANGE`).
  - **Absence of FORCE ROW LEVEL SECURITY** on every new table (design-lock; ×8).

- [ ] **All gates green:**
  - `npx prisma generate` + `npx prisma validate` clean.
  - `npx prisma migrate deploy` applies 06 + 16 cleanly on top of 00 + 01 + 02 + 03 + 04 + 05 + 09 (alphabetical apply order = 00 → 01 → 02 → 03 → 04 → 05 → **06** → 09 → **16** ✓).
  - `npx prisma db seed` × 2 idempotent — same row counts on second pass; no new seed in this cycle (seeds 00-07 unchanged).
  - `npx tsx scripts/generate-audit-redactor.ts` produces `lib/audit/redactor.ts` deterministically (committed; running again yields zero diff).
  - `npm run build` ✓.
  - `npx vitest run` ✓ — adds ~2 migration test files + 1 redactor test file, target ~+50–80 net new test cases.
  - `bash scripts/verify-rls-coverage.sh` exits 0 in **strict** mode at **25 / 25** (17 prior + 8 new tenant-scoped models). Strict-floor sanity guard (currently 5) unchanged.
  - `bash scripts/verify-api-auth.sh` still 2/2.
  - `bash scripts/verify-pii-annotations.sh` exits 0 (NIK redact + phone mask:last4 on Employee both annotated).
  - Playwright **skipped** per CLAUDE.md schema-cycle exception (`e2e/` empty, no UI). `/ship` invokes `npx playwright test --pass-with-no-tests` to satisfy the gate.

- [ ] **Doc sync:** README ADR row "v2 audit + timeline + files foundation" added at top of active ADR table; minimal CLAUDE.md migration-list update for `06_audit_timeline` + `16_scaffold` + redactor generator + verify-pii-annotations script per narrow doc-sync rule.

- [ ] **Reviewer flags addressed inline (pre-build self-review):**
  - Defense-in-depth `REVOKE ALL` in every RLS block (matches `02_identity` template + §6.3 canonical form). **AuditLog deviation explicitly NOT a stricter REVOKE** — REVOKE remains `REVOKE ALL` (same as other tenant-scoped tables); immutability is enforced by the trigger, not by REVOKE. Tightening REVOKE to also block service-role's INSERT would break the audit write path.
  - No `FORCE ROW LEVEL SECURITY` anywhere (design lock from `p1-regions-seed`).
  - Composite-FK pattern §6.4 audit: composite FKs on TimelineEvent/FileAsset/ExportJob/OrgConfig user/year refs (RLS-supporting denorms). AuditLog.actorUserId is single-col **non-FK** (partition-table FK caveats — explicit decision documented in header).
  - **AuditLog audit-column deviation is intentional** — the spec §4.4 audit-columns convention applies to *operational* entities. AuditLog itself is the audit; piling `updatedAt`/`deletedAt`/`updatedById`/`deletedById` onto it would be both semantically wrong (immutable) and physically wrong (the trigger blocks any UPDATE that would set `updatedAt`). Migration header documents this.
  - **AuditLog PK includes `createdAt`** — Postgres requires the partition key in the PK for `PARTITION BY RANGE`. The `id`-only PK pattern used elsewhere in the schema does not apply. Tests assert the composite PK explicitly.
  - **Trigger SECURITY DEFINER + locked search_path** — Supabase advisory lints flag any SECURITY DEFINER without explicit `SET search_path` as high-severity. Function declares `SET search_path = pg_catalog, public` in its CREATE FUNCTION body to silence the lint and harden against schema-injection.

Non-goals (deferred per spec §18.1):

- **Image upload API endpoint** (`/api/upload`) → `p1-scaffold-engine-skeleton`. This cycle ships the FileAsset table; the upload route + sharp pipeline integration land next cycle.
- **AuditLog write middleware** wrapping all entity mutations (`lib/audit/write.ts` calling `redact()` then INSERT) → `p1-scaffold-engine-skeleton`. This cycle ships the redactor; the call-site lands next cycle.
- **Live-DB integrity test** for the append-only trigger (UPDATE on a populated AuditLog row → expect exception) → `p1-scaffold-engine-skeleton` integration tests (require ephemeral Postgres). This cycle's tests are static parse only.
- **Auto-create-next-month-partition cron** (`audit.partition_create`) → `p3+` operational cron cycle. 14 inline partitions cover this cycle's MVP horizon (2026-05 → 2027-06).
- **Retention drop-partition cron** (`audit.retention_cleanup`) → `p3+` operational cron cycle (per §16.1a — runs daily 02:00 once registered).
- **Timeline event registry** (`lib/timeline/events.ts` + per-`kind` Zod payload schemas) → `p1-scaffold-engine-skeleton`. The DB column accepts arbitrary JSONB; app-layer validation lands next cycle.
- **pg-boss queue setup** for PDF compose / async export → `p3-fee-foundation` or `p6-raport-pdf-pipeline` per spec §16.1a.
- **Resend webhook handler** (status callbacks landing in EmailLog) → `p3-xendit-port-and-regen` (Xendit was the first webhook provider; Resend follows the pattern).
- **Xendit webhook handler** (signature verify + idempotency-key dedup writing to WebhookEvent) → `p3-xendit-port-and-regen`.
- **`audit-pii.md` standards file** (per CLAUDE.md standards table reference) → defer to `p1-scaffold-engine-skeleton` per the spec's standards-file rollup rule. Convention is locked here via the redactor generator + `verify-pii-annotations.sh` + 8-line annotation pass on Employee; the `.md` rollup happens with the next standards-touching cycle.
- **OrgConfig seed row** (one default row per tenant at bootstrap) → defer to `p2-admission-funnel` or whichever cycle first reads OrgConfig. Tenant boots without a row; app-layer falls back to `OrgConfig` defaults (autoDropAdmissionDays=30, timezone='Asia/Jakarta', locale='id-ID') when the row is absent.

Assumptions:

- **AuditAction members:** `CREATE / UPDATE / DELETE / SOFT_DELETE / RESTORE / READ / IMPORT / EXPORT` (8 members). Spec §4.2 names the enum but does not exhaustively list members. Selected to cover (a) full CRUD + soft-delete lifecycle (`CREATE`, `UPDATE`, `DELETE`, `SOFT_DELETE`, `RESTORE`), (b) read tracking for sensitive entities like Student/Guardian (`READ`; admin views logged), (c) bulk-import audit per Phase 4 (`IMPORT`), (d) export tracking per §5.11 (`EXPORT`). Future-proof via additive `ALTER TYPE … ADD VALUE` if needed (e.g. `APPROVE` / `REJECT` for workflow transitions — those are currently captured via `UPDATE` with action-specific TimelineEvent kind).
- **TimelineVisibility members:** `PRIVATE / INTERNAL / PARENT_VISIBLE` (3 members). User prompt's draft adopted verbatim. `PRIVATE` = only `actorUserId` reads; `INTERNAL` = any tenant staff (admin/teacher/principal) reads; `PARENT_VISIBLE` = parent of the subject student reads (resolved via Student.householdId → Guardian for the parent's user). Resolution logic lives in app-layer; DB only stores the visibility code.
- **FileKind members:** `DOCUMENT / IMAGE / VIDEO / AUDIO / ARCHIVE` (5 members). Cycle-5 use cases: raport PDF (DOCUMENT), student photo (IMAGE), admission scan (DOCUMENT), parent-uploaded video evidence (VIDEO/AUDIO future), zip archive of bulk export (ARCHIVE). Future-proof.
- **FileStatus members:** `PENDING_UPLOAD / UPLOADED / COMPRESSED / FAILED / ORPHANED` (5 members). Drives §16.1a `file_asset.orphan_cleanup` cron — `WHERE status = 'PENDING_UPLOAD' AND createdAt < now() - INTERVAL '24h'` flips to `ORPHANED`; orphaned files past 7-day grace are hard-deleted by the cron. Compression is FileKind=IMAGE-only — DOCUMENT/VIDEO/AUDIO/ARCHIVE go straight from `PENDING_UPLOAD` → `UPLOADED` (no `COMPRESSED` transition).
- **ExportJobStatus members:** `PENDING / RUNNING / COMPLETED / FAILED / EXPIRED` (5 members; user prompt verbatim). Lifecycle: PENDING (queued) → RUNNING (worker picked up) → COMPLETED (FileAsset created, signed URL emailed) | FAILED (errorMessage set) → EXPIRED (24h post-COMPLETED, FileAsset cleanup-eligible).
- **TimelineEvent soft-delete YES (not NO):** the spec is silent on this, the user prompt says "optional, confirm in /spec". Decision: **soft-delete YES**. Justification: in v1, the buku-penghubung journal (the closest pre-rebuild analogue to TimelineEvent) supported teacher-edits-and-deletes for typo correction. Without soft-delete, a typo on a parent-visible event becomes permanent in the audit log AND the timeline. With soft-delete, the AuditLog records the SOFT_DELETE action (regulatory requirement preserved) and the timeline UI hides the row; admin can RESTORE if needed. AuditLog itself remains immutable; TimelineEvent visibility correction is an operational concern.
- **AuditLog audit-column deviation:** the §4.4 audit-columns convention (`createdAt/createdById/updatedAt/updatedById/deletedAt/deletedById`) is for *operational* entities. AuditLog has only `createdAt` (insertion timestamp) + `actorUserId` (semantic equivalent of `createdById` but renamed for clarity — the *actor* is who did the audited thing, not who *wrote* the audit row; they're the same person, but `actorUserId` reads more naturally in a row called "AuditLog"). No `updatedAt`/`updatedById` (immutable). No `deletedAt`/`deletedById` (no soft-delete; retention drops by partition). Migration header documents this.
- **AuditLog PK is composite `(id, createdAt)`:** Postgres native partitioning requires the partition key (`createdAt`) in the PK or any UNIQUE constraint. The `id`-only PK used by every other table in the schema cannot apply. Composite PK chosen. Test asserts explicitly.
- **Pre-create 18 monthly partitions inline (2026-05 → 2027-10):** covers the MVP launch window (June 2026 cutover per spec §9.1) + first ~16 months + 2-month buffer. Bumped from initial 14 → 18 per pre-build reviewer Risk-G — auto-create cron lands in `p3+` and may slip beyond the 14-month horizon; 4 extra partitions cost zero storage when empty and provide ~6 months extra ops slack. Auto-create cron + retention drop cron both deferred to `p3+` per Non-goals.
- **AuditLog retention is partition-drop, NOT row-delete (per pre-build reviewer C1):** the canonical retention mechanism per spec §4.5 ("drop partitions in O(1) at retention") is `DROP TABLE "AuditLog_y2026m05"` once a whole month is past the 7-yr horizon, executed by `audit.retention_cleanup` cron (deferred to p3+). No per-row `retentionUntil` column ships — an earlier draft included one but it would be unused (no query keys off it) and would mislead future implementors. The 7-yr horizon is encoded by the partition cadence, not by a column.
- **Append-only trigger has NO bypass for any role (including `service_role` / `supabase_admin`):** the only legitimate path to remove an AuditLog row is `DROP TABLE "AuditLog_y2026m05"` (drop a whole partition past the retention horizon). DROP TABLE bypasses row-level triggers entirely. The trigger fires on `BEFORE UPDATE` and `BEFORE DELETE` — both rejected unconditionally with a raised exception. This is stricter than the user prompt's draft ("supabase_admin only bypass") because no foreseeable use-case requires per-row deletion; partition drop is the canonical retention mechanism. If a security-incident rollback ever needs per-row removal, it can be performed via direct superuser SQL after temporarily dropping the trigger — explicit, auditable, and traceable in the database event log.
- **AuditLog `actorUserId` is non-FK by design:** Postgres 14+ supports FKs from partitioned tables, but the maintenance cost across 14 (and growing) partitions is non-trivial — every new partition created by the future auto-create cron must carry the same FK declaration. Worse, the FK target (User row) may be soft-deleted while audit rows persist, requiring `ON DELETE SET NULL` semantics that Postgres only enforces on hard-delete (we soft-delete users by convention). Soft-reference via plain `VARCHAR(50)` matches the actual cascade semantics (audit persists past soft-delete, NULL-on-hard-delete enforced app-layer). Same justification as the soft-delete vs CASCADE asymmetry contract from `p1-employees-classes-sentra`.
- **OrgConfig singleton enforced via column-level UNIQUE on `tenantId`:** simpler test parser regex than `@@unique([tenantId])` (which renders to a separate `CREATE UNIQUE INDEX`). Same effect; column-level shows up in the `CREATE TABLE` block directly.
- **Holiday `kind` is plain VARCHAR, not enum:** the set is small (`NATIONAL`, `RELIGIOUS`, `SCHOOL`) but admin will likely want to extend per locale (e.g. PAUD-specific `LIBUR_KEPONAKAN`-style). Enum + `ALTER TYPE` is more rigid than VARCHAR. Same precedent as `EmailLog.status`.
- **FK SET NULL on cross-row references where parent uses soft-delete:** `FileAsset.uploaderUserId`, `TimelineEvent.actorUserId`, `OrgConfig.currentAcademicYearId`, `ExportJob.resultFileAssetId` all use `ON DELETE SET NULL`. This fires only on hard-delete; on soft-delete, the FK row remains pointing to a `deletedAt IS NOT NULL` parent. Downstream consumers must JOIN with `WHERE parent.deletedAt IS NULL` per the `p1-employees-classes-sentra` contract.
- **`ExportJob.requestedByUserId` is RESTRICT (not SET NULL):** export jobs are operational records that must always have an attributable requester (compliance + debugging). If a user with pending export jobs is hard-deleted, the admin must cancel/clean up the jobs first. Enforces deliberate handling. **Operational caveat (per pre-build reviewer H):** §16.1a does not yet list an `export_job.cleanup` cron — EXPIRED rows accumulate indefinitely until that cron lands in p3+. In the unlikely scenario that an admin attempts to hard-delete a User with old EXPIRED ExportJob rows before the cleanup cron exists, the FK violation will surface as an opaque DB error. PDP erasure (§4.4) uses redact-not-delete and does NOT trigger this path; the only realistic trigger is admin user purge, currently out of MVP. Documented in Ship Notes for the future user-management cycle.
- **Standards file `audit-pii.md` deferred per the spec's standards-file rollup rule:** per CLAUDE.md's standards table referenced in the user prompt, `audit-pii.md` is listed as a future standards file. The convention is fully captured this cycle by (a) the redactor generator code, (b) `verify-pii-annotations.sh` (CI gate), (c) the `/// @PII` annotation grammar in schema. Adding a 50-line `.md` rollup makes sense once a few more PII-touching cycles have shaken out the conventions; shipping it pre-emptively risks "documentation that doesn't match the code". Decision: defer to `p1-scaffold-engine-skeleton` (which adds the AuditLog write middleware and is the natural home for the standards file).
- **Subagent dispatch:** schema additions to `prisma/schema.prisma` happen first (single file, sequential — adds 8 models + 6 enums + the phone PII annotation in one edit pass). After schema lands clean, **migrations 06 + 16 are independent** (no FK between them — `06` references only Tenant + User; `16` references only Tenant + User + AcademicYear; neither references the other). The redactor generator + its unit tests are independent of either migration's SQL. Theoretical parallelism: schema → (mig 06 + tests 06 ‖ mig 16 + tests 16 ‖ redactor + redactor tests). **Practical call: keep sequential.** Three migrations + six tests was small enough to stay sequential last cycle (`p1-employees-classes-sentra`); two migrations + three tests + one generator is even smaller. Subagent coordination overhead exceeds the saving for this cycle. Sequential build runs `prisma migrate deploy` after each migration to catch ordering bugs early. **Decision: sequential build, no subagent dispatch.**
- **Disk pressure:** ~3.6 GiB free at start; schema cycle adds no fixtures, no Playwright runs, symlinked node_modules from main checkout. Worktree footprint is ~50 MB (source diff + .next/.swc caches). No further cleanup needed mid-cycle.

## Tasks

1. **[ ] Schema additions.**
   Add 6 enums (`AuditAction`, `TimelineVisibility`, `FileKind`, `FileStatus`, `ExportFormat`, `ExportJobStatus`) after `SessionTeacherRole`. Append 8 models in spec order: `AuditLog`, `TimelineEvent` (06_audit_timeline) + `FileAsset`, `ExportJob`, `EmailLog`, `WebhookEvent`, `OrgConfig`, `Holiday` (16_scaffold). Each model carries §4.4 conventions where appropriate (full audit columns on TimelineEvent / FileAsset / OrgConfig / Holiday; audit-minus-soft-delete on ExportJob / EmailLog / WebhookEvent; AuditLog deviation per Assumptions). Composite uniques on `(id, tenantId)` for FK-target tables (FileAsset, ExportJob, OrgConfig). Add back-relations on `Tenant` (`auditLogs`, `timelineEvents`, `fileAssets`, `exportJobs`, `emailLogs`, `webhookEvents`, `orgConfig` 1-to-1, `holidays`), `User` (`timelineEvents`, `uploadedFileAssets`, `exportJobs`), `AcademicYear` (`orgConfigs`), `FileAsset` (`exportJobs`). Add `Employee.phone` `/// @PII mask:last4` annotation. Run `npx prisma format` + `validate` + `generate`.
   *Acceptance:* `npx prisma format` + `npx prisma validate` clean; `tenantId String` present on all 8 new models; `verify-rls-coverage.sh` reports `25 / 25` once migrations land in Task 3+4.

2. **[ ] Author migration `06_audit_timeline/migration.sql`.**
   Hand-written SQL following the `02_identity` + `05_sessions` template (preserves Prisma index/constraint naming for non-drift on future `migrate dev --create-only`). Section order: 2 `CREATE TYPE` (AuditAction, TimelineVisibility), 2 `CREATE TABLE` with **AuditLog declared `PARTITION BY RANGE ("createdAt")` inline** + composite PK `(id, "createdAt")` + id-reference columns as `TEXT` (no `VARCHAR(50)` on tenantId/actorUserId/resourceId/subjectId per pre-build reviewer I3), **18 `CREATE TABLE … PARTITION OF "AuditLog" FOR VALUES FROM (…) TO (…)`** statements (2026-05 through 2027-10 per pre-build reviewer Risk-G), composite unique `TimelineEvent_id_tenantId_key`, lookup indexes (per spec section above — NO `retentionUntil` index per pre-build reviewer C1), GIN index on TimelineEvent.payload, append-only function `audit_log_block_update_delete()` (`LANGUAGE plpgsql`, `SECURITY INVOKER` per pre-build reviewer Q-B; body raises `'AuditLog is append-only; UPDATE/DELETE rejected by trigger %'` with ERRCODE 'P0001'), 2 `CREATE TRIGGER` statements binding the function to AuditLog BEFORE UPDATE / DELETE, FK constraints (TimelineEvent composite to User SET NULL + Tenant Restrict; AuditLog Tenant Restrict + NO actorUserId FK per Assumptions), RLS block per table (×2): ENABLE + REVOKE ALL + GRANT SELECT + tenant_isolation_select (with `deletedAt IS NULL` only on TimelineEvent — AuditLog has no deletedAt) + no_writes_via_postgrest. Header documents: AuditLog audit-column deviation (no retentionUntil — partition-drop retention), composite PK rationale, partition pre-create count (18), trigger no-bypass policy + SECURITY INVOKER rationale, REVOKE ALL pattern, no-FORCE design lock.
   *Acceptance:* `npx prisma migrate deploy` applies cleanly on top of `05_sessions`; `06_audit_timeline` directory contains exactly one `migration.sql` ≤260 lines (bumped from ≤220 due to 18 partitions vs 14 in initial draft).

3. **[ ] Author migration `16_scaffold/migration.sql`.**
   Hand-written SQL. Section order: 4 `CREATE TYPE` (FileKind, FileStatus, ExportFormat, ExportJobStatus), 6 `CREATE TABLE` (FileAsset before ExportJob since ExportJob.resultFileAssetId composite-FKs FileAsset; OrgConfig with column-level UNIQUE on tenantId; WebhookEvent with full unique on (tenantId, source, idempotencyKey); Holiday partial unique on (tenantId, date) WHERE deletedAt IS NULL), composite uniques on `(id, tenantId)` for FileAsset/ExportJob/OrgConfig, lookup indexes per spec, FK constraints (composite-FK chain: FileAsset.uploaderUserId / ExportJob.requestedByUserId / ExportJob.resultFileAssetId / OrgConfig.currentAcademicYearId; Tenant Restrict on all 6), RLS block per table (×6): ENABLE + REVOKE ALL + GRANT SELECT + tenant_isolation_select (with `deletedAt IS NULL` only on FileAsset / OrgConfig / Holiday) + no_writes_via_postgrest. Header documents: REVOKE ALL pattern, no-FORCE, OrgConfig singleton rationale, Holiday partial-unique rationale, FK SET NULL vs RESTRICT decisions per parent.
   *Acceptance:* `npx prisma migrate deploy` applies cleanly on top of `09_regions`; `16_scaffold` directory contains exactly one `migration.sql` ≤180 lines.

4. **[ ] Audit redactor generator + generated output.**
   Author `scripts/generate-audit-redactor.ts`: reads `prisma/schema.prisma`, parses model blocks line-by-line capturing `/// @PII (redact|mask:last4)` triple-slash annotations, builds a sorted `(model, field, policy)` map, emits `lib/audit/redactor.ts`. Generated file exports a frozen `PII_FIELDS` const + a `redact(modelName, before, after)` helper applying the per-field policy. `mask:last4` policy: string values → `'***' + value.slice(-4)`; values shorter than 4 chars → `'***'`; non-string passthrough. `redact` policy: top-level field → `null`. Idempotent (sorted keys + stable formatting; no timestamp in header). Run `npx tsx scripts/generate-audit-redactor.ts` to produce `lib/audit/redactor.ts`. Wire `"audit:redactor"` into `package.json` scripts. Commit the generated file.
   *Acceptance:* re-running the generator produces zero diff on `lib/audit/redactor.ts`; manual eyeball check shows correct shape (Employee → nik:redact + phone:mask:last4).

5. **[ ] Audit redactor unit tests.**
   Author `lib/audit/redactor.test.ts` importing the generated `lib/audit/redactor.ts`. ~9 test cases per Spec section above (NIK redact / phone mask:last4 / short-value mask / non-annotated passthrough / nested-object preservation / idempotent / null before+after / unknown model / both before+after).
   *Acceptance:* `npx vitest run lib/audit/redactor.test.ts` green; full suite remains green.

6. **[ ] Migration post-condition tests (2 files).**
   Two test files mirroring the `09-regions.test.ts` static-parse pattern:
   - `prisma/migration-tests/06-audit-timeline.test.ts`: 2 enums (verbatim member assertions), 2 CREATE TABLE, AuditLog column shape (incl. retentionUntil DATE default + INET ipAddress + composite PK), AuditLog negative audit columns (no updatedAt/deletedAt/*ById), TimelineEvent column shape (full §4.4 audit + JSONB payload + occurredAt), **partition assertions** (`PARTITION BY RANGE ("createdAt")` declared inline + count of 14 `PARTITION OF "AuditLog"` statements), **trigger function + 2 triggers** (function name, SECURITY DEFINER + locked search_path, RAISE EXCEPTION body, BEFORE UPDATE + BEFORE DELETE bindings), composite unique on TimelineEvent (id, tenantId), composite-FK on TimelineEvent.actorUserId + AuditLog.actorUserId NOT a FK assertion, RLS coverage (×2: ENABLE + REVOKE ALL + GRANT SELECT + 2 policies; deletedAt clause on TimelineEvent only), absence of FORCE RLS (×2), schema-side positive guard (AuditLog + TimelineEvent carry tenantId), section-ordering sanity (CREATE TYPE before CREATE TABLE; CREATE TABLE before partition CREATE; CREATE TABLE before CREATE FUNCTION + CREATE TRIGGER; CREATE TABLE before ALTER TABLE FK + RLS).
   - `prisma/migration-tests/16-scaffold.test.ts`: 4 enums (verbatim members), 6 CREATE TABLE, column shapes per spec section above, composite uniques on FileAsset/ExportJob/OrgConfig (id, tenantId), OrgConfig column-level UNIQUE on tenantId, **WebhookEvent full-unique** on (tenantId, source, idempotencyKey), **Holiday partial-unique** on (tenantId, date) WHERE deletedAt IS NULL, composite-FK chain (FileAsset.uploaderUserId / ExportJob.requestedByUserId RESTRICT / ExportJob.resultFileAssetId SET NULL / OrgConfig.currentAcademicYearId SET NULL), Tenant Restrict on all 6, RLS coverage (×6: ENABLE + REVOKE ALL + GRANT SELECT + 2 policies; deletedAt asymmetry across the 6 tables per Assumptions), absence of FORCE RLS (×6), schema-side positive guard (6 models carry tenantId), section-ordering sanity.
   *Acceptance:* `npx vitest run prisma/migration-tests` green; existing 01/02/03/04/05/09 tests not regressed; ~+50–80 net new test cases.

7. **[ ] `verify-pii-annotations.sh`.**
   Author `scripts/verify-pii-annotations.sh` per spec section above. Hardcoded triples list (`(Employee, nik, redact)`, `(Employee, phone, mask:last4)`). Parses `prisma/schema.prisma` per-line within model blocks. Exits 0 on success, 1 with clear error on missing/incorrect annotations. Pattern mirrors `verify-rls-coverage.sh` + `verify-api-auth.sh` (`set -euo pipefail`).
   *Acceptance:* `bash scripts/verify-pii-annotations.sh` exits 0; manually break (remove `/// @PII redact` from Employee.nik temporarily) → exits 1 with clear error → restored → exits 0.

8. **[ ] End-of-cycle gates.**
   Run the full chain: `npx prisma generate && npx prisma validate && npx prisma migrate deploy && npx prisma db seed && npx prisma db seed && npx tsx scripts/generate-audit-redactor.ts && git diff --exit-code lib/audit/redactor.ts && npm run build && npx vitest run && npm run lint && bash scripts/verify-rls-coverage.sh && bash scripts/verify-api-auth.sh && bash scripts/verify-pii-annotations.sh`. Capture `verify-rls-coverage.sh` output (target: `25 / 25` strict mode), redactor generator wall-clock + zero-diff check, vitest count delta in Verification.
   *Acceptance:* all gates green; `verify-rls-coverage.sh` reports `25 / 25` (strict); `verify-pii-annotations.sh` exits 0; `git diff --exit-code lib/audit/redactor.ts` exits 0 (idempotent generator).

9. **[ ] Doc sync.**
   - README ADR row "v2 audit + timeline + files foundation" added at top of active ADR table.
   - CLAUDE.md migration-list updated with one line for `06_audit_timeline` (AuditLog partitioned + append-only trigger + TimelineEvent) + `16_scaffold` (FileAsset / ExportJob / EmailLog / WebhookEvent / OrgConfig / Holiday + 6 enums) + redactor generator + verify-pii-annotations.sh.
   - Cycle doc Implementation + Verification + Ship Notes filled (Ship Notes: Supabase Storage runbook per §16.1, AuditLog partitioning cadence + future cron split, design locks reaffirmed).
   *Acceptance:* `pre-commit` accepts staged diff (broad doc-sync rule + narrow rule both satisfied); cycle doc contains the literal token `design-system` (frontend-gate compliance — schema cycle, satisfied via the Verification bullet "Cross-checked design-system.html: N/A — schema-only cycle, no frontend diff").

10. **[ ] Ship.**
    `/ship` opens PR `feat/p1-audit-timeline-files` → `staging`. CI must pass (Lint/Typecheck/Test, Build; Playwright auto-skip via `--pass-with-no-tests`). Manual squash-merge on green.

## Implementation

- **Subagent plan:** sequential build per cycle doc Assumptions — schema → mig 06 → mig 16 → redactor → tests → gates. 06 + 16 are independent (no FK between them) but kept sequential because (a) `prisma migrate deploy` after each migration catches ordering bugs early, and (b) prior cycle's 3-migration sequential precedent shipped clean. No subagent dispatch.
- **Pre-build review (cycle doc):** `feature-dev:code-reviewer` flagged 1 Blocker (C1 retentionUntil column contradicts partition-drop retention) + 4 Important (I2 sharp pipeline scope split, I3 TEXT vs VARCHAR(50) on id columns, I4 partition position-ordering test, I1 retentionUntil follows from C1) + 3 Nits (G 14→18 partitions, H Ship Notes RESTRICT caveat, B SECURITY INVOKER vs DEFINER). All findings patched into cycle doc before build started; section "Reviewer flags addressed inline" reaffirmed accordingly.
- **Task 1 — schema additions.** Added 6 enums (AuditAction 8 members, TimelineVisibility 3, FileKind 5, FileStatus 5, ExportFormat 3, ExportJobStatus 5) after `SessionTeacherRole`. Appended 8 models in spec order: AuditLog (partitioned, composite PK `(id, createdAt)`, no audit-by columns, no retentionUntil), TimelineEvent (full §4.4 audit + soft-delete), FileAsset (full audit + soft-delete + Decimal compressionRatio + `@db.Inet` not used here), ExportJob (audit minus soft-delete), EmailLog (audit minus soft-delete), WebhookEvent (audit minus soft-delete + `@@unique([tenantId, source, idempotencyKey])`), OrgConfig (singleton via `tenantId String @unique`), Holiday (full audit + soft-delete). Added `Employee.phone /// @PII mask:last4` annotation (NIK `redact` already shipped in cycle 4). Cross-row FKs single-col per §6.4 MVP rule (composite reserved for RLS-critical join tables); patched cycle doc + tests to reflect single-col instead of composite (Prisma 7 cannot model column-subset SET NULL on composite FK). `npx prisma format` + `validate` + `generate` ✓ (Prisma Client 7.6.0). `npm run build` ✓ (Next.js 16.2.3, 7 routes). `npx vitest run` ✓ (12 files / 349 tests baseline preserved).
- **Task 2 — migration `06_audit_timeline/migration.sql`.** Hand-written 211-line SQL. Section order: 2 `CREATE TYPE` → `CREATE TABLE "AuditLog" (...) PARTITION BY RANGE ("createdAt")` with composite PK `(id, "createdAt")` → 18 `CREATE TABLE … PARTITION OF "AuditLog"` statements (2026-05 through 2027-10) → `CREATE TABLE "TimelineEvent"` → composite unique `TimelineEvent_id_tenantId_key` → AuditLog lookup indexes (3) → TimelineEvent lookup indexes (4) → GIN index on TimelineEvent.payload → trigger function `audit_log_block_update_delete()` (`LANGUAGE plpgsql`, `SECURITY INVOKER`, raises P0001 on UPDATE/DELETE) → 2 `CREATE TRIGGER` statements binding the function BEFORE UPDATE / BEFORE DELETE on AuditLog parent (PG 15+ propagates row-level triggers to all partitions automatically) → 3 FK constraints (AuditLog.tenantId Restrict; TimelineEvent.tenantId Restrict; TimelineEvent.actorUserId single-col SET NULL — NO FK on AuditLog.actorUserId per Assumptions) → RLS block on AuditLog parent (ENABLE + REVOKE ALL + GRANT SELECT + 2 policies; no `deletedAt` clause — no soft-delete) → 18 `REVOKE ALL` statements on each partition (block direct PostgREST queries to `/rest/v1/AuditLog_y*`) → RLS block on TimelineEvent (ENABLE + REVOKE ALL + GRANT SELECT + tenant_isolation_select WITH `deletedAt IS NULL` + no_writes_via_postgrest). Header documents: AuditLog audit-column deviation, no retentionUntil rationale, partition pre-create count + ops slack, trigger no-bypass policy + SECURITY INVOKER rationale, REVOKE ALL pattern, no-FORCE design lock. Applied to staging Supabase pooler `aws-1-ap-southeast-1.pooler.supabase.com:5432` cleanly.
- **Task 3 — migration `16_scaffold/migration.sql`.** Hand-written 312-line SQL. Section order: 4 `CREATE TYPE` (FileKind, FileStatus, ExportFormat, ExportJobStatus) → 6 `CREATE TABLE` (FileAsset before ExportJob since ExportJob.resultFileAssetId references FileAsset; OrgConfig with column-level UNIQUE on `tenantId`) → 3 composite uniques on `(id, tenantId)` for FileAsset/ExportJob/OrgConfig (FK-target-friendly) → 16 lookup indexes (per FK column, tenantId-prefixed) → full unique `webhook_event_idempotency_unique` on `(tenantId, source, idempotencyKey)` (no soft-delete on this table) → partial unique `holiday_tenant_date_active_unique` on `(tenantId, date) WHERE deletedAt IS NULL` → 10 FK constraints (all single-col cross-row per §6.4 MVP rule; Tenant Restrict on all 6; FileAsset.uploaderUserId / ExportJob.resultFileAssetId / OrgConfig.currentAcademicYearId SET NULL; ExportJob.requestedByUserId RESTRICT) → 6 RLS blocks (ENABLE + REVOKE ALL + GRANT SELECT + tenant_isolation_select + no_writes_via_postgrest). Soft-delete asymmetry on `tenant_isolation_select` USING clause: `deletedAt IS NULL` only on FileAsset/OrgConfig/Holiday; absent on ExportJob/EmailLog/WebhookEvent. Header documents: REVOKE ALL pattern, no-FORCE design lock, OrgConfig singleton rationale, Holiday partial-unique rationale, ExportJob.requestedByUserId RESTRICT operational caveat. Applied to staging Supabase pooler cleanly. `bash scripts/verify-rls-coverage.sh` reports `25 / 25` strict mode (17 prior + 8 new tenant-scoped models — exactly the spec target).



## Verification

<filled by /build: gate output, test names, manual smoke notes>

## Ship Notes

<filled by /ship: migrations, env vars, Supabase Storage runbook, manual steps, rollback plan>
