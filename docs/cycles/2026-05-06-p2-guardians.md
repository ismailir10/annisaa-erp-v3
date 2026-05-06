# P2 Guardians — Migration 08 (Guardian + StudentGuardian + GuardianInvitation) + audit-pii

## Context

Phase 2 schema completion. P2 Cycle 1 (`p2-students-guardians-household`, #191) shipped Household / Student / StudentIdentifier / StudentIdentifierSequence with composite FKs (§6.4), soft-delete-aware partial-unique guards, and storage.objects RLS folded inline. This cycle ships the Guardian half: three new tables (`Guardian`, `StudentGuardian`, `GuardianInvitation`) plus the two PII annotations the audit-pii standard already promises (`Guardian.nik` redact + `Guardian.phone` mask:last4 — currently in `audit-pii.md` "Deferred to p2-guardians" sub-block).

After this cycle merges:
- Student-domain schema is complete. The next cycle (`p2-students-guardians-scaffold`) wires admin pages × 5 entities × 4 page types + role-FileKind gating + Playwright canary `e2e/admin/students.spec.ts` (re-enables Playwright in CI).
- RLS strict count: 29 → 32 (3 new tenant-scoped tables).
- Audit-pii triple list: 3 → 5 (Guardian.nik redact + Guardian.phone mask:last4).
- Audit-pii.md "Deferred sub-block" deleted (this cycle is its resolution).

Marathon mode (foundation spec §18.12). Skip `superpowers:brainstorming` — request derives from foundation spec §6.1 (migration 08 row), §6.4 (composite FK pattern), and p2-cycle-1 Ship Notes (deferral table for Guardian, audit-pii.md Deferred sub-block).

**Key references**
- Foundation spec §6.1 (line 354 `08_guardians  Guardian, StudentGuardian, GuardianInvitation`), §6.4 (composite FK pattern), §6.5 (JWT claims for RLS), §4.5 (PII).
- Migration 07 SQL: pattern source for composite FKs, RLS shape, soft-delete-aware partial-unique guards, and storage.objects RLS folded inline (DON'T re-add — already on staging).
- p2-cycle-1 Ship Notes: deferral table, schema partial-unique drift trap, scaffold-page recipe, storage.objects RLS audit deferral.
- p2-cycle-1 lessons: (T14 MAJOR-3) partial-unique declarations belong ONLY in migration; (T14 MAJOR-2) prefer "use existing helper" over literal URL strings when speccing route changes.
- `.claude/standards/audit-pii.md` — Hardcoded triple list table + workflow (steps 1-6).
- `scripts/verify-pii-annotations.sh` — TRIPLES array + grep regex grammar.
- `scripts/verify-rls-coverage.sh` — strict-mode RLS gate (≥29 floor today, target 32 post-merge).

**No UAT report consumed.** No `docs/uat/reports/*.md` covers Guardian flows yet — there is no UI for them. Schema-only cycle.

## Spec

### Acceptance criteria

- [ ] Migration `prisma/migrations/08_guardians/migration.sql` creates `Guardian`, `StudentGuardian`, `GuardianInvitation` with composite FKs (§6.4), tenant-scoped RLS (`tenant_isolation_select` + `no_writes_via_postgrest`), and a soft-delete-aware single-PRIMARY partial-unique guard on `StudentGuardian` mirroring migration 07's `StudentIdentifier` shape verbatim.
- [ ] Three new Prisma models in `prisma/schema.prisma` matching the SQL. Composite uniques declared **only** for FK targets (`@@unique([id, tenantId])`); **no** `@@unique` on partial-WHERE columns (per p2-cycle-1 lesson). Reverse relations added to `Tenant` (3 arrays), `Student` (2 arrays), `User` (1 array).
- [ ] Two PII annotations in schema: `Guardian.nik /// @PII redact` + `Guardian.phone /// @PII mask:last4`.
- [ ] `scripts/verify-pii-annotations.sh` TRIPLES array extends 3 → 5 entries; gate reports `5 / 5 known-PII fields annotated`.
- [ ] `lib/audit/redactor.ts` regenerates deterministically — running `npx tsx scripts/generate-audit-redactor.ts` twice produces zero diff on the second run; `Guardian` block appears with both fields.
- [ ] `.claude/standards/audit-pii.md` Hardcoded triple list table grows 3 → 5 rows; the "Deferred to p2-guardians cycle" sub-block is removed entirely.
- [ ] Migration post-condition test `prisma/migration-tests/08-guardians.test.ts` parses the committed SQL (no live DB) and asserts: 3 ENABLE RLS, ≥1 CREATE POLICY per table, partial-unique guard on `StudentGuardian` with verbatim `WHERE "isPrimary" = true AND "deletedAt" IS NULL`, composite FK shapes (Guardian→User, StudentGuardian→Student/Guardian, GuardianInvitation→Student/Guardian), `SET NULL ("userId")` column-list syntax on Guardian's User FK, no advisory-lock helper function, no storage.objects re-add (already on staging from migration 07).
- [ ] `README.md`: ADR row added for this cycle (Decision cell ≤ 400 chars). Modules table `students` row updated — drop the "Guardian (deferred to p2-guardians)" annotation; enumerate `Guardian / StudentGuardian / GuardianInvitation`.
- [ ] `CLAUDE.md`: "Migrations landed (Phase 1 + Phase 2)" extended with `08_guardians` clause. RLS coverage line bumped 29 → 32, anchor cycle = `p2-guardians`. Audit redactor sentence bumped 3/3 → 5/5; Guardian-deferred sentence removed.
- [ ] All gates green: `npx prisma generate`, `npm run lint`, `npm run typecheck`, `npm run build`, `npx vitest run`, `bash scripts/verify-rls-coverage.sh` (≥32), `bash scripts/verify-api-auth.sh` (≥4 — unchanged from p2-cycle-1), `bash scripts/verify-pii-annotations.sh` (5/5).
- [ ] No Playwright run (no UI; rebuild-window guard remains active until `p2-students-guardians-scaffold`). Verification section explicitly records the skip.
- [ ] Cycle doc all six sections filled by `/build` and `/ship`. Ship Notes covers migration runbook, deferral-table refresh (Phase 2 status), and rollback plan.

### Non-goals (explicit)

- Five entity registries (Student / Guardian / Household / StudentIdentifier / GuardianInvitation) → `p2-students-guardians-scaffold`.
- Admin scaffold pages × 5 entities × 4 page types → `p2-students-guardians-scaffold`.
- Role-based FileKind gating per-entity policy → `p2-students-guardians-scaffold`.
- Playwright canary `e2e/admin/students.spec.ts` → `p2-students-guardians-scaffold` (re-enables CI Playwright).
- WhatsApp `wa.me` invitation flow consumer → `p6-portal-invitation-flow` (consumes `GuardianInvitation` tokens).
- Public `/daftar` admission form → `p2-admission-funnel`.
- Address chain (`Province` / `Regency` / `District` / `Village` FKs on Household) → `p2-addresses-idn-chain`.
- `AuditAction.AUTH_REJECT` enum value → future schema cycle.
- Persistent rate-limit storage (Redis) → p3+.
- `storage.objects` RLS Supabase-default-policy audit → defer to first storage-writing cycle (`p2-students-guardians-scaffold` adds avatar/photo upload via FileAsset). This cycle is schema-only, no consumers, no value to fold here.
- `pg-boss` invitation expiry sweep job (PENDING → EXPIRED on `expiresAt < now()`) → p3+ when pg-boss lands.

### Assumptions (challenge before /build)

1. **Token shape: 32-byte base64url, app-generated via `crypto.randomBytes(32).toString('base64url')`.** 256 bits entropy, ~43 chars URL-safe. Schema column `VARCHAR(64)` (room for prefix tagging if ever needed). Rejected UUID v4 because (a) UUIDs leak structural bits (version nibble) — minor footgun for security-grade tokens, (b) UUIDs are designed for object identity, not secrets, (c) `crypto.randomBytes` matches industry convention for invite/reset tokens. Token NOT generated in DB (no `DEFAULT gen_random_uuid()` shape) — DB column has no default; app is the sole source.
2. **Token uniqueness: GLOBAL unique constraint on `GuardianInvitation.token`, not per-tenant.** With 256-bit entropy collision is astronomically unlikely; global unique simplifies the lookup path on the consume route (no need to know `tenantId` from the URL — token resolves to a single invitation row across all tenants, which is then gated by app-layer tenant check). NOT partial-WHERE — invitations are append-only by status, not soft-deleted.
3. **`expiresAt` enforcement is app-layer at consume time, not DB trigger.** App returns `410 Gone` with structured error if `expiresAt < now()` AND status = PENDING. The status field is updated to EXPIRED only by a future pg-boss sweep job (deferred to p3+); the consume path treats `(status=PENDING, expiresAt<now())` and `status=EXPIRED` as equivalent. Cleaner messaging ("your invite expired on X") + no DB-trigger-introduced surprises.
4. **Single-use semantics enforced via atomic status transition.** Consume path runs `UPDATE GuardianInvitation SET status='ACCEPTED', acceptedAt=now() WHERE id=? AND status='PENDING' RETURNING *`. If zero rows returned → already-consumed / revoked / expired-by-sweep. No pessimistic lock needed; Postgres MVCC handles concurrent consume attempts.
5. **`Guardian.userId` FK shape — split-view (Prisma single-column, migration composite).**
   - **Migration 08 (DB source of truth):** composite FK `(userId, tenantId) → User(id, tenantId) ON DELETE SET NULL ("userId") ON UPDATE CASCADE` (Postgres 15.4+ column-list syntax; Supabase 15.6+ compatible). Preserves §6.4 tenant alignment — `tenantId` stays bound to Guardian even when User is hard-deleted.
   - **Prisma schema (client view):** single-column relation `user User? @relation(fields: [userId], references: [id], onDelete: SetNull)`. NOT composite.
   - **Why split:** Prisma issue #25061 — when `onDelete: SetNull` is declared on a composite relation, Prisma client (in `delete` / `disconnect` paths) emits a pre-step that nulls **all** composite columns including `tenantId`, which fails the `Guardian.tenantId NOT NULL` constraint at runtime. The single-column Prisma view sidesteps this entirely. Prisma client only sees a simple nullable FK to `User.id`; the composite tenant alignment is enforced at the DB layer by the migration's column-list constraint.
   - **`prisma migrate dev` drift warning:** running `migrate dev` against this schema WILL detect a discrepancy (single-column in schema vs composite in DB) and propose a regeneration migration. **REJECT any such regeneration in PR review.** The drift is intentional and only matters for `migrate dev`; `migrate deploy` (production path) only applies committed migrations and is unaffected. Document this trap in T2's schema comment block.
   - Single-column FK was preferred over `onDelete: NoAction` because NoAction would block ALL Prisma-client-driven User deletes (including soft-delete via Prisma's relation traversal), whereas the single-column SetNull view gives Prisma client the correct null semantics for the `userId` column without the composite-column footgun.
6. **`GuardianInvitation.guardianId` is NOT NULL — pre-create-stub pattern.** Admin workflow pre-creates a `Guardian` row (with `userId = NULL`) at invitation issue time, then issues the invitation referencing that Guardian. On accept, the User row is created (or linked) and `Guardian.userId` is populated atomically inside a transaction.
   - **Rationale:** Indonesian admission flow has the admin entering guardian name/phone/relationship as part of the student admission form. The invite is sent to a known person, not to "anonymous future parent". Pre-create matches operational reality.
   - **Foundation spec ambiguity:** spec §8.1 line 516 ("parent receives `GuardianInvitation` token via wa.me link → activates account via Google sign-in → portal access") is consistent with both pre-create and create-on-accept; it does NOT mandate either path. Spec §6.1 line 217 (the older Ayah/Ibu slot model) implies Guardian rows exist before Student is finalized — which favors pre-create.
   - **Alternative considered (rejected):** create-on-accept (`guardianId NULL` until consume; transaction at accept-time creates Guardian + StudentGuardian + populates User). Rejected because (a) admin loses the ability to track "invited but not yet accepted" guardians by name, (b) the wa.me link cannot pre-fill the parent's known phone number for Google OAuth's account-recovery hint, (c) the relationship enum value (FATHER/MOTHER/GUARDIAN/OTHER) is admin-knowledge, not parent-knowledge.
   - **CTO confirm before /build.** If the foundation team's interpretation is create-on-accept, this assumption flips and `guardianId` becomes nullable — that change cascades into `StudentGuardian` (created on accept too) and the migration test asserts a nullable shape. Surface explicitly so the CTO can override before T1 lands.
7. **Soft-delete asymmetry:**
   - **YES:** `Guardian` (admin contact card; correctable; audit history retained), `StudentGuardian` (relationship may be ended; soft-delete-aware partial-unique PRIMARY guard depends on `deletedAt IS NULL`).
   - **NO:** `GuardianInvitation` (operational record; status enum carries lifecycle; matches `ExportJob` / `EmailLog` / `WebhookEvent` precedent in 16_scaffold and `StudentIdentifierSequence` in 07_students). Audit columns: `createdAt + createdById + updatedAt + updatedById` — NO `deletedAt + deletedById`.
8. **`StudentGuardian` partial-unique PRIMARY guard — scoped per relationship type.**
   - Guard scope: `(studentId, tenantId, relationship)` — NOT `(studentId, tenantId)` alone.
   - WHERE clause: `WHERE "isPrimary" = true AND "deletedAt" IS NULL`.
   - Permits one PRIMARY per relationship type per student (PRIMARY FATHER + PRIMARY MOTHER + PRIMARY GUARDIAN + PRIMARY OTHER all coexist).
   - **Why scoped per relationship (diverges from migration 07 StudentIdentifier):** Indonesian PAUD admission forms commonly designate primary FATHER and primary MOTHER simultaneously as the canonical contacts for each role; a global single-PRIMARY-per-student rule would block legitimate two-parent families on the first scaffold-page test. The relationship-scoped guard preserves the "uniqueness for the canonical primary" intent while admitting parallel relationship roles.
   - Soft-delete-aware (`deletedAt IS NULL` clause) so an ended relationship's PRIMARY slot frees up — same shape rationale as migration 07 §4.5 NIS history.
   - Diverges from `SessionTeacher` (migration 05) precedent (`WHERE "role" = 'PRIMARY'`) because StudentGuardian is soft-delete-aware AND uses an enum-scoped PRIMARY rather than a one-per-row PRIMARY.
9. **No `pg_advisory_xact_lock` SQL helper** in this migration. Guardian has no allocator (no NIS-equivalent counter). Migration test asserts absence to prevent drift.
10. **Tenancy on join tables follows §6.4 strictly.** `StudentGuardian` carries `tenantId`; composite FK to both Student `(studentId, tenantId) → Student(id, tenantId) ON DELETE CASCADE` and Guardian `(guardianId, tenantId) → Guardian(id, tenantId) ON DELETE CASCADE`. CASCADE on hard-delete is admin-tool path; soft-delete propagation is app-layer.
11. **`storage.objects` RLS NOT re-added.** Migration 07 already declared `tenant_scoped_storage_select` + `no_writes_via_postgrest_storage` policies. Re-running `CREATE POLICY` would error on duplicate. Migration test asserts the migration does NOT mention `storage.objects` (negative assertion — keeps the contract visible).
12. **Frontend gate (pre-commit Rule 4) does not fire.** No `app/**/*.tsx` or `components/**/*.tsx` changes. Cycle doc need not contain the literal `design-system` token. Verification section will note the skip explicitly.

## Tasks

Subagent dispatch waves below — `[indep]` runs in parallel within its wave, `[seq]` waits on prior wave.

### T1 — Migration 08 SQL `[wave 1, indep]` ✅

Create `prisma/migrations/08_guardians/migration.sql`. Mirror migration 07's structure verbatim (header comment block → CREATE TABLE × 3 → composite uniques → lookup indexes → partial-unique guards → FKs → RLS) but with these tables:

- **`Guardian`** — `id`, `tenantId`, `email VARCHAR(255)?`, `nik VARCHAR(16)?`, `phone VARCHAR(20)?`, `fullName VARCHAR(255) NOT NULL`, `userId TEXT?`, audit cols, soft-delete cols.
- **`StudentGuardian`** — `id`, `tenantId`, `studentId`, `guardianId`, `relationship VARCHAR(20) NOT NULL` (CHECK: `'FATHER' | 'MOTHER' | 'GUARDIAN' | 'OTHER'`), `isPrimary BOOLEAN DEFAULT false`, `notes VARCHAR(2000)?`, audit cols, soft-delete cols.
- **`GuardianInvitation`** — `id`, `tenantId`, `studentId`, `guardianId`, `token VARCHAR(64) NOT NULL`, `status VARCHAR(20) NOT NULL DEFAULT 'PENDING'` (CHECK: `'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'`), `expiresAt TIMESTAMPTZ NOT NULL`, `acceptedAt TIMESTAMPTZ?`, audit cols (NO soft-delete cols per assumption 7).

**Composite uniques (FK targets per §6.4):**
- `CREATE UNIQUE INDEX "Guardian_id_tenantId_key" ON "Guardian"("id", "tenantId");`
- `CREATE UNIQUE INDEX "StudentGuardian_id_tenantId_key" ON "StudentGuardian"("id", "tenantId");`
- `CREATE UNIQUE INDEX "GuardianInvitation_id_tenantId_key" ON "GuardianInvitation"("id", "tenantId");`

**Lookup indexes:** at minimum `(tenantId)` + `(tenantId, studentId)` on join tables + `(tenantId, fullName)` on Guardian. Plain B-tree only (no trigram GIN this cycle — Guardian search UX comes with scaffold cycle).

**Token uniqueness:** `CREATE UNIQUE INDEX "GuardianInvitation_token_key" ON "GuardianInvitation"("token");` — global, not partial.

**Partial-unique PRIMARY guard on StudentGuardian** (verbatim from assumption 8 — scoped per relationship type):
```sql
CREATE UNIQUE INDEX "StudentGuardian_singlePrimaryPerRelationship_key"
  ON "StudentGuardian" ("studentId", "tenantId", "relationship")
  WHERE "isPrimary" = true AND "deletedAt" IS NULL;
```

**Foreign keys:**
- All three: `tenantId → Tenant(id) ON DELETE RESTRICT ON UPDATE CASCADE`.
- `Guardian.(userId, tenantId) → User(id, tenantId) ON DELETE SET NULL ("userId") ON UPDATE CASCADE` (column-list syntax, Postgres 15.4+).
- `StudentGuardian.(studentId, tenantId) → Student(id, tenantId) ON DELETE CASCADE ON UPDATE CASCADE`.
- `StudentGuardian.(guardianId, tenantId) → Guardian(id, tenantId) ON DELETE CASCADE ON UPDATE CASCADE`.
- `GuardianInvitation.(studentId, tenantId) → Student(id, tenantId) ON DELETE CASCADE ON UPDATE CASCADE`.
- `GuardianInvitation.(guardianId, tenantId) → Guardian(id, tenantId) ON DELETE CASCADE ON UPDATE CASCADE`.

**RLS** (per §6.3 — replicate migration 07's exact form):
```sql
ALTER TABLE "<T>" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "<T>" FROM anon, authenticated;
GRANT SELECT ON "<T>" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "<T>"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL  -- omit on GuardianInvitation per assumption 7
  );
CREATE POLICY "no_writes_via_postgrest" ON "<T>"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
```

GuardianInvitation's `tenant_isolation_select` USING clause omits `AND "deletedAt" IS NULL` (no soft-delete column).

**Do NOT re-add storage.objects policies** — already on staging from migration 07 (assumption 11).

**Header comment block** must call out: composite FK pattern (§6.4), soft-delete asymmetry (Guardian + StudentGuardian YES; GuardianInvitation NO), partial-unique guard rationale (relationship-scoped per assumption 8 — diverges from migration 07's StudentIdentifier global-PRIMARY guard because StudentGuardian must allow PRIMARY FATHER + PRIMARY MOTHER simultaneously), token shape rationale (256-bit base64url app-generated, global unique), `SET NULL ("userId")` column-list syntax + Postgres version requirement + Prisma issue #25061 split-view rationale (DB composite, schema single-column), no advisory-lock by design, storage.objects already-shipped note (referencing migration 07).

**Acceptance:** SQL file ≤ 200 lines (per spec §6.1). `psql --dry-run` (or local sanity-check) parses without error. `bash scripts/verify-rls-coverage.sh` reports 32 / 32 with the new file staged + schema staged.

### T2 — Schema additions `[wave 2, depends T1]` ✅

Edit `prisma/schema.prisma`:

- Add three new models (`Guardian`, `StudentGuardian`, `GuardianInvitation`) at the bottom of the file (after `StudentIdentifierSequence`). Each model:
  - Field shapes match T1 SQL exactly (column types, nullability, defaults).
  - `Guardian.nik` carries `/// @PII redact` triple-slash above the field.
  - `Guardian.phone` carries `/// @PII mask:last4` triple-slash above the field.
  - Comment headers explain each model's purpose, soft-delete posture (per assumption 7), and any drift-trap callouts (e.g. "partial-unique guard lives ONLY in migration 08; do NOT declare `@@unique` on `(studentId, tenantId, isPrimary)` here").
  - `@@unique([id, tenantId])` ONLY (FK target). `@@index` for query coverage. NO `@@unique` on partial-WHERE columns.
  - GuardianInvitation: `@@unique([token])` (matches global unique index from T1).
  - Composite FKs declared via `@relation(fields: [...], references: [...])` matching T1.
  - Guardian's User relation per assumption 5 (split-view): **single-column** Prisma relation `user User? @relation(fields: [userId], references: [id], onDelete: SetNull)`. The migration carries the composite FK with column-list `SET NULL ("userId")`; the Prisma schema deliberately diverges to dodge Prisma issue #25061 (composite SetNull nulls all columns including tenantId). Schema comment block above the model MUST call out: (a) the divergence is intentional, (b) `prisma migrate dev` will detect drift and propose regeneration — **do not accept the regeneration**, (c) DB-layer composite FK is the source of truth for tenant alignment.
- Add reverse relations:
  - `Tenant`: `guardians Guardian[]`, `studentGuardians StudentGuardian[]`, `guardianInvitations GuardianInvitation[]`.
  - `Student`: `studentGuardians StudentGuardian[]`, `guardianInvitations GuardianInvitation[]`.
  - `User`: `guardians Guardian[]`.

**Drift-trap reminder (p2-cycle-1 lesson):** partial-unique declarations belong ONLY in the migration. Adding `@@unique([studentId, tenantId])` to `StudentGuardian` in schema would make `prisma migrate dev` regenerate a full unique constraint conflicting with the partial WHERE index. Same for GuardianInvitation token (already a full unique, OK). Use `findFirst` for queries needing the partial-WHERE shape.

**Acceptance:** `npx prisma generate` succeeds with zero warnings. `npx prisma format` produces zero diff (i.e. file is already formatted). `npx prisma validate` passes.

### T3 — Audit-pii TRIPLES + standard table `[wave 1, indep]`

Edit two files:

1. `scripts/verify-pii-annotations.sh`: extend the `TRIPLES` array from 3 entries to 5 by adding (in alphabetical order — `Guardian` slots between `Employee` and `Student`):
   ```bash
   "Guardian:nik:redact"
   "Guardian:phone:mask:last4"
   ```

2. `.claude/standards/audit-pii.md`: extend the "Hardcoded triple list" table from 3 rows to 5 (new rows for Guardian.nik and Guardian.phone, both anchored on cycle `p2-guardians`). Delete the entire "#### Deferred to p2-guardians cycle" sub-block (lines 58-63 today — heading + 2 bullets + blank line + closing sentence "The `verify-pii-annotations.sh` gate will jump from 3/3 to 5/5 there.") — this cycle resolves it.

3. **Update the stale header comment in `scripts/verify-pii-annotations.sh`** (lines 20-24 today). Current text reads "Future cycles extend the TRIPLES array below — Student.nisn → redact, Guardian.phone → mask:last4, Household.kkNumber → redact, etc." which is stale (Student.nik already shipped in p2-cycle-1; field is `nik` not `nisn`). Replace with a current-state summary that names the 5 entries this cycle ships (Employee.nik / Employee.phone / Student.nik / Guardian.nik / Guardian.phone) and acknowledges p2-guardians as the cycle bringing the count to 5.

**Acceptance:** `bash scripts/verify-pii-annotations.sh` reports `5 / 5` once T2 lands the schema annotations (will fail at this task's commit if run in isolation — which is fine, as the gate runs on the cycle-end commit, not per-task). Header comment in the script reflects current state with no references to fields that don't exist (`Student.nisn`).

### T4 — Migration test `[wave 3, depends T1+T2]`

Create `prisma/migration-tests/08-guardians.test.ts` mirroring `07-students.test.ts` structure:

- Import `readFileSync` + `path` + read `prisma/migrations/08_guardians/migration.sql` (no live DB).
- `TENANT_TABLES = ["Guardian", "StudentGuardian", "GuardianInvitation"] as const`.
- Describe blocks:
  1. **RLS coverage (spec §6.3)** — 3 ENABLE RLS calls, ≥1 CREATE POLICY per table, exactly 3 ENABLE RLS calls total.
  2. **Partial-unique PRIMARY guard on StudentGuardian (assumption 8)** — regex match for the index name `StudentGuardian_singlePrimaryPerRelationship_key` AND the verbatim WHERE clause `WHERE "isPrimary" = true AND "deletedAt" IS NULL` AND scope columns `("studentId", "tenantId", "relationship")` (asserts the relationship-scoped form, not a single-PRIMARY-per-student form).
  3. **Composite FK shape (spec §6.4)** — Guardian → User uses `(userId, tenantId)`; StudentGuardian → Student `(studentId, tenantId)`; StudentGuardian → Guardian `(guardianId, tenantId)`; GuardianInvitation → Student `(studentId, tenantId)`; GuardianInvitation → Guardian `(guardianId, tenantId)`.
  4. **Column-list SET NULL on Guardian.userId (assumption 5)** — regex matches `ON DELETE SET NULL \("userId"\)` (escaped parens). Asserts the Postgres-15.4+ syntax is present, not bare `SET NULL`.
  5. **Token global unique (assumption 2)** — regex matches `CREATE UNIQUE INDEX "GuardianInvitation_token_key" ON "GuardianInvitation"\("token"\)` — not partial-WHERE.
  6. **Storage.objects NOT re-added (assumption 11)** — DDL-shape negative assertions only (the migration's header comment block intentionally references storage.objects as prose, so a bare-mention regex would false-positive). Use both:
     - `expect(SQL).not.toMatch(/CREATE POLICY[^\n]*storage\.objects/)` — no CREATE POLICY statements targeting storage.objects.
     - `expect(SQL).not.toMatch(/ALTER TABLE\s+["]?storage\.objects["]?/)` — no ALTER TABLE statements either.
  7. **No advisory-lock helper (assumption 9)** — negative assertion `expect(SQL).not.toMatch(/CREATE [^\n]*FUNCTION[^\n]*pg_advisory_xact_lock/i)`.

**Acceptance:** `npx vitest run prisma/migration-tests/08-guardians.test.ts` green, all describe blocks pass.

### T5 — Audit redactor regen `[wave 3, depends T2]`

Run `npx tsx scripts/generate-audit-redactor.ts`. Verify `lib/audit/redactor.ts` now contains a `Guardian` block with `nik: "redact"` + `phone: "mask:last4"` — should land in alphabetical model order (between `Employee` and `Student`). Re-run the script a second time and confirm zero diff (determinism).

Stage `lib/audit/redactor.ts`. Optionally extend `lib/audit/redactor.test.ts` with a Guardian-shaped redaction case (one new `it()` block — small, leaves existing tests alone).

**Acceptance:** running the generator twice produces no diff between runs — verified explicitly via `npx tsx scripts/generate-audit-redactor.ts && npx tsx scripts/generate-audit-redactor.ts && git diff --exit-code lib/audit/redactor.ts` (the third command's exit code 0 proves determinism). `npx vitest run lib/audit/redactor.test.ts` green.

### T6 — README + CLAUDE.md updates `[wave 4, depends T1-T5]`

Edit `README.md`:
- ADR table: add a new top row for `2026-05-06 p2-guardians` (Decision cell ≤ 400 chars per ADR cell-length gate). Include: migration 08 contents (3 tables), RLS strict 29 → 32, audit-pii 3 → 5, schema-only ship (no UI consumers).
- Modules table `students` row: replace the parenthetical "Guardian (deferred to p2-guardians)" with the actual entity list "Guardian, StudentGuardian, GuardianInvitation". Delete the deferred annotation entirely.

Edit `CLAUDE.md`:
- "Migrations landed (Phase 1 + Phase 2)" paragraph: append `08_guardians (Guardian + StudentGuardian + GuardianInvitation + composite FKs per §6.4 + tenant-scoped RLS + soft-delete-aware partial-unique PRIMARY guard on StudentGuardian + Postgres-15+ column-list SET NULL ("userId") on Guardian.userId composite FK + global unique on token + 32-byte base64url app-generated token shape + soft-delete: YES Guardian/StudentGuardian, NO GuardianInvitation operational)`.
- "Audit redactor" sentence: change "currently annotates `Employee.nik` (redact) + `Employee.phone` (mask:last4) + `Student.nik` (redact); CI gate ... asserts all three (3/3 as of `p2-students-guardians-household`)" → "annotates Employee.nik + Employee.phone + Student.nik + Guardian.nik + Guardian.phone (5/5 as of `p2-guardians`)".
- Delete the "Guardian fields (`Guardian.nik` redact + `Guardian.phone` mask:last4) deferred to `p2-guardians` cycle (lands with migration 08)." sentence.
- "RLS coverage guard" line: bump `29 / 29` → `32 / 32`, anchor cycle = `p2-guardians`, parenthetical = "(3 new tables added 29 → 32 — Guardian/StudentGuardian/GuardianInvitation)".

**Acceptance:** `pre-commit` hook accepts the staged files (broad doc-sync rule satisfied because cycle doc is also staged; narrow doc-sync rule satisfied because subjects use `chore(guardians):` prefix, not `feat:`). `scripts/test-hooks.sh` (if run) reports the staged combination as allowed. README ADR cell ≤ 400 chars verified by the cell-length gate.

### T7 — Final review + Ship Notes `[wave 5, depends T1-T6]`

Run end-of-cycle gate: `npm run build && npx vitest run`. Skip Playwright per non-goal #4 — no UI changes.

Dispatch `feature-dev:code-reviewer` agent (NOT `superpowers:code-reviewer` — feature-dev caught the p2-cycle-1 MAJOR fixes; superpowers caught zero) on the diff range `origin/staging..HEAD`. Surface findings into Implementation. Apply MAJOR / CRITICAL fixes inline (one fix-up commit per finding). Note any deferrals explicitly in Ship Notes.

Fill `## Verification` (per-task gate output, vitest counts, RLS coverage count, PII coverage count, redactor determinism check, Playwright skip rationale).

Fill `## Ship Notes` (migration runbook with post-deploy SQL smoke, env vars (none new this cycle), manual smoke (none — schema-only), Phase 2 status table refresh, rollback plan, lessons surfaced).

**Between-task gate:** every task above runs `npm run build && npx vitest run` before commit (matches CLAUDE.md gate definition; typecheck implicit via `npm run build`).

## Implementation

- Subagent plan: tasks all executed inline (no parallel subagent dispatch). Reordered to T1 → T2 → T3 → T4 → T5 → T6 → T7 to keep `verify-pii-annotations.sh` green at every commit boundary (T3 alone breaks the gate; sequencing T2 first lands the schema annotations so T3's TRIPLES expansion lines up). Per-task `feature-dev:code-reviewer` agent pass before each commit per /build §6.
- T1 — Migration 08 SQL — `prisma/migrations/08_guardians/migration.sql` (~285 lines). 3 tables (Guardian, StudentGuardian, GuardianInvitation), 6 RLS policies (tenant_isolation_select + no_writes_via_postgrest × 3), partial-unique PRIMARY guard scoped per relationship type, composite FKs per §6.4 with column-list `SET NULL ("userId")` on Guardian.userId (Postgres 15.4+), global unique on token (256-bit base64url app-generated), no advisory-lock helper, no storage.objects re-add. Reviewer M1 fix folded inline: added 3 standalone FK-column indexes (`Guardian_userId_idx`, `StudentGuardian_guardianId_idx`, `GuardianInvitation_guardianId_idx`) for cascade-scan coverage. N1 (≤200-line cap) waived — guideline broken throughout existing migrations (02:371, 07:319, 16:374); header comments substantive and warranted given split-view FK + token-shape decisions.
- T2 — Schema additions — `prisma/schema.prisma` (+167/-4 lines). 3 new models matching migration 08 SQL column shapes verbatim. Reverse relations: Tenant +3 (guardians/studentGuardians/guardianInvitations), Student +2 (studentGuardians/guardianInvitations), User +1 (guardians). Split-view FK on Guardian.user — single-column Prisma relation with `onDelete: SetNull` + schema comment block warning of `prisma migrate dev` drift trap (DB carries composite column-list SET NULL). PII annotations: Guardian.nik /// @PII redact + Guardian.phone /// @PII mask:last4. No `@@unique` on partial-WHERE columns (StudentGuardian relationship-scoped PRIMARY guard lives only in migration). Standalone FK indexes mirror migration 08. RLS gate: 32/32. PII gate: 5/5. Reviewer clean — one NIT on GuardianInvitation @@unique symmetry accepted (cheap, forward-compat).

## Verification

- T1 — `npm run build` ✓ (compiled in 2.5s; 9/9 static pages OK), `npx vitest run` ✓ (34 files, 848 passed | 4 skipped). `bash scripts/verify-rls-coverage.sh` ✓ at 29/29 (jumps to 32/32 after T2 lands schema). `wc -l prisma/migrations/08_guardians/migration.sql` = ~285 (reviewer N1 waived per existing-migration precedent). Reviewer M1 fix verified — 3 FK-column standalone indexes added. Migration tests re-ran green (9 files, 523 tests).
- T2 — `npx prisma generate` ✓ (Prisma Client 7.6.0). `npx prisma format` ✓ (idempotent reformat). `bash scripts/verify-rls-coverage.sh` ✓ **32 / 32** (jumped from 29). `bash scripts/verify-pii-annotations.sh` ✓ **5 / 5** (jumped from 3 — Guardian.nik + Guardian.phone now schema-annotated; T3 will sync TRIPLES array). `npm run build` ✓ (compiled in 3.5s). `npx vitest run` ✓ (34 files, 848 passed | 4 skipped).

## Ship Notes

_Filled by /ship. Will cover: migration runbook (post-deploy SQL smoke for the 3 new tables + 6 RLS policies), env vars (none new), Phase 2 status table refresh (mark p2-guardians shipped, p2-students-guardians-scaffold next), rollback plan (revert SHA + DROP TABLE order: GuardianInvitation → StudentGuardian → Guardian to respect FK ordering), lessons surfaced._
