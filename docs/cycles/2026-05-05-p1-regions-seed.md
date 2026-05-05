# Phase 1 Cycle 3 — Regions (idn-area-data) + Public-Read RLS

**Type:** schema
**Phase:** p1
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §6.1 migration 09 (regions portion only — Address chain split out) + §6.2 seed 01-regions.sql + §4.1 Regions row + §4.2 RegencyType enum + §18.1 phase 1 cycle 3

**Migration-numbering decision:** foundation spec §6.1 originally bundled "Province/Regency/District/Village + Address chain" into a single `09_addresses` slot. This cycle splits that into two slots: `09_regions` here (lands ahead of need so admission/import can reference stable BPS PKs) and `10_addresses` (or next free slot) when `p2-addresses-idn-chain` lands. Subsequent migration numbers in §6.1 (`10_curriculum` → `11_curriculum`, etc.) shift +1. Documented in this cycle's Ship Notes; foundation spec §6.1 will be reconciled in `p1-scaffold-engine-skeleton` doc-sync.

## Context

Implements §6.1 migration `09_regions` (Province/Regency/District/Village only — Address chain deferred to `p2-addresses-idn-chain` per spec §18.1) + §6.2 seed `01-regions.sql`. Lands the Indonesian administrative-region reference data (~91.6k rows total) needed by the admission form and household import flows arriving in Phase 2. PKs are BPS codes (CHAR(2)/(4)/(6)/(10)) so re-seeding never changes ids — Address FKs in p2 stay stable across snapshots. Tables are **non-tenant-scoped global reference data** with **public-read RLS** (anon + authenticated may SELECT, no writes via PostgREST), an intentional deviation from `tenant_isolation_select` documented inline. Builds on `p1-identity-rls` (PR #180, staging tip — RLS guard now in strict 9/9 mode). Marathon mode per spec §18.12 — no full brainstorm. Cross-checked design-system.html: N/A (schema-only cycle, no frontend diff). UAT reports: N/A (pre-launch rebuild).

## Spec

Acceptance criteria:

- [ ] `prisma/schema.prisma` adds 4 region models (`Province`, `Regency`, `District`, `Village`) + 1 enum `RegencyType` (`KABUPATEN`, `KOTA`).
- [ ] BPS-code primary keys (dot-stripped, numeric): `Province.id @db.Char(2)`, `Regency.id @db.Char(4)`, `District.id @db.Char(6)`, `Village.id @db.Char(10)`. Names `@db.VarChar(255)`. **District widened from spec's CHAR(7) to CHAR(6)** — `idn-area-data` v4.0.1 ships district codes in the older `PPRRDD` (6-digit) form, not the Permendagri 137/2017 `PPRRDDD` (7-digit) form. Padding to 7 would break the natural prefix chain `Village(10) ⊃ District ⊃ Regency(4) ⊃ Province(2)`. Schema follows the data; foundation spec §4.1 will be reconciled in `p1-scaffold-engine-skeleton` doc-sync. **No `postalCode` field this cycle** — `idn-area-data` v4.0.1 does not include it; deferred to a follow-up cycle that wires a separate postal-code source (see Non-goals).
- [ ] **Not tenant-scoped** — no `tenantId`, no soft-delete, no audit-by columns. Only `createdAt`/`updatedAt`.
- [ ] FK chain `Restrict` on each parent: `Regency.provinceId → Province.id`, `District.regencyId → Regency.id`, `Village.districtId → District.id`.
- [ ] Indexes per spec: `Regency_provinceId_idx`, `District_regencyId_idx`, `Village_districtId_idx`, plus trigram GIN index `Village_name_trgm_idx` on `Village.name` using `gin_trgm_ops` (relies on `pg_trgm` extension already enabled by `00_extensions`).
- [ ] Migration `09_regions/migration.sql` applies cleanly on top of `00_extensions` + `01_tenancy` + `02_identity`. Section order: 1 `CREATE TYPE`, 4 `CREATE TABLE`, indexes, 3 FKs, RLS block.
- [ ] **Public-read RLS** on all 4 region tables (intentional deviation from `tenant_isolation_select`):
  - `ALTER TABLE "<X>" ENABLE ROW LEVEL SECURITY`
  - `GRANT SELECT ON "<X>" TO authenticated, anon` (anon read intentional — public admission form `/daftar` lands p2)
  - `CREATE POLICY "public_read" ON "<X>" FOR SELECT TO authenticated, anon USING (true)`
  - `CREATE POLICY "no_writes_via_postgrest" ON "<X>" FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)`
- [ ] Seed `prisma/seed/01-regions.sql` (vendored SQL snapshot, **Option B**) generated once from `idn-area-data` v4.0.1 (https://github.com/fityannugroho/idn-area-data, commit `b36d0792e039555eee86bda3d3092cdfcacb16f4`). File header records package version + commit SHA + extraction date. Pattern: 4 multi-row `INSERT … ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW()` blocks wrapped in single `BEGIN`/`COMMIT`. Idempotent. (`updatedAt = NOW()` keeps the column in sync with refresh runs since raw SQL bypasses Prisma's `@updatedAt`.) BPS codes in source data are dot-separated (`11.01.01.2001`); generator strips dots so PKs land as fixed-width CHAR(N) numeric strings. `Regency.type` derived from name prefix — `name LIKE 'Kota %'` → `KOTA`, else `KABUPATEN` (98 + 416 = 514 verified against idn-area-data v4.0.1).
- [ ] `prisma/seed/index.ts` orchestrator runs the SQL via `prisma.$executeRawUnsafe(readFileSync("prisma/seed/01-regions.sql", "utf8"))` between `00-tenant` and `02-campuses` (regions have no tenant link → position before/after tenancy is equivalent; placing first matches the spec §6.2 numbering).
- [ ] Migration post-condition tests at `prisma/migration-tests/09-regions.test.ts` — static parse of `migration.sql` asserts: 4 `CREATE TABLE`, `RegencyType` enum, BPS PK column types (CHAR(2)/(4)/(6)/(10)), FK Restrict on each parent-child pair, lookup indexes, trigram GIN on `Village.name`, RLS ENABLE + `public_read` + `no_writes_via_postgrest` on all 4 tables, `GRANT SELECT … TO authenticated, anon` per table. Also asserts (parsing `prisma/schema.prisma`) that the 4 region models contain **no** `tenantId` field — guards against accidental tenant-scoping that would silently break `verify-rls-coverage.sh` strict mode.
- [ ] All gates green:
  - `npx prisma generate` + `npx prisma validate`
  - `npx prisma migrate deploy` applies cleanly
  - `npx prisma db seed` × 2 idempotent — same row counts on second pass
  - Sanity counts: Province ≈ 38, Regency ≈ 514, District ≈ 7,285, Village ≈ 83,762 (total ~91.6k)
  - `npm run build && npx vitest run` green
  - `bash scripts/verify-rls-coverage.sh` exits 0 in **strict** mode at `9 / 9` (region tables fall outside parser's tenant-scoped set per `tenantId String` field check — count unchanged)
  - `bash scripts/verify-api-auth.sh` still 2/2
  - Seed wall-clock ≤ 10s end-to-end on staging Supabase pooler (target ≤ 5s for the SQL apply alone)
- [ ] README ADR row + minimal CLAUDE.md migration-list update per narrow doc-sync rule. Ship Notes records the regenerate runbook for v1.1+ Kemendagri refresh.

Non-goals (deferred per spec §18.1):

- `Address` / `StudentAddress` / `GuardianAddress` tables → `p2-addresses-idn-chain`.
- Cascading dropdown UI → `p2-addresses-idn-chain`.
- `Village.postalCode` (Kode Pos) — `idn-area-data` v4.0.1 has no postal codes; needs separate source (`kodepos`-style package, BPS PSN, or PT Pos data). Defer to a follow-up cycle once the postal-code source is selected.
- Quarterly `region.refresh` cron (Kemendagri updates) → spec §16.4 v1.1 deferred.
- App-layer region-search API endpoints → land per-feature (admission form, household import) in Phase 2.
- Live-DB integrity tests in CI → defer to whichever cycle first genuinely needs Postgres service.

Assumptions:

- **Option B (vendored SQL snapshot) — variant: zero npm dep.** Generator fetches the 4 CSVs directly from `raw.githubusercontent.com/fityannugroho/idn-area-data/b36d0792e039555eee86bda3d3092cdfcacb16f4/data/{provinces,regencies,districts,villages}.csv` (pinned commit SHA → immutable snapshot). No `idn-area-data` devDependency added. Regenerate runbook (Ship Notes): `npx tsx scripts/generate-regions-sql.ts && git add prisma/seed/01-regions.sql && git commit`. Pinning to commit SHA is stronger than pinning to a version tag (tags can be force-moved).
- **Source data shape verified against `idn-area-data` v4.0.1 CSVs** (sampled 2026-05-05):
  - `provinces.csv` 38 rows, code `11` (2 chars no dot).
  - `regencies.csv` 514 rows, code `11.01` (5 chars with dot → strip → 4 chars). 98 names start with `Kota `, 416 with `Kabupaten ` — perfect partition.
  - `districts.csv` 7,285 rows, code `11.01.01` (8 chars with dots → strip → **6** chars). **Schema uses CHAR(6), not spec's CHAR(7)** — see acceptance bullet above. v4.0.1 ships the older `PPRRDD` form. Padding to 7 would break the prefix chain (Village.id `1101012001` is exactly `District.id || villageSeq` only when District is 6 chars).
  - `villages.csv` 83,762 rows, code `11.01.01.2001` (13 chars with dots → strip → 10 chars). Matches spec CHAR(10). Confirms prefix chain: `1101012001` = `11`(prov) + `01`(reg) + `01`(dist) + `2001`(vil seq).
- Trigram GIN on `Village.name` is forward-looking — autocomplete API lands in p2 (admission form), but the index lives in `09_regions` so the seed populates against an indexed table (faster fulltext later, no extra migration).
- Public-read RLS (`USING (true)` for `authenticated, anon`) is correct because regions are reference data (no PII, no tenant scope, no business secret). The `no_writes_via_postgrest` policy ensures only the migration / seed path mutates them. **anon SELECT via PostgREST is intentionally enabled** — public admission form `/daftar` (lands p2) needs unauthenticated reads; enumerating 91k region rows is the published intent. `verify-rls-coverage.sh` is unaffected — its parser scans for `tenantId String` and these models have none.
- **Future migrations must NOT add `ALTER TABLE … FORCE ROW LEVEL SECURITY`** to region tables. Service-role writes (Prisma seed via `service_role` key, future admin cron) bypass RLS by default; FORCE would block those paths and the seed would fail silently at re-apply. Documented for `p2-addresses-idn-chain` and any future region-touching migration.
- Seed SQL file size ≈ 8–10 MB (91k rows × ~80 bytes/row). Committed to git per "seed-as-data" convention. CI clone overhead negligible.
- Re-running `prisma db seed` after a region-data refresh: existing rows get `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "updatedAt" = NOW()` (Regency also updates `type`) — handles renames; deletions (region merges) require manual investigation flagged in runbook.

## Tasks

1. **[x] Schema additions.**
   Add `RegencyType` enum + 4 models (`Province`, `Regency`, `District`, `Village`) per §4.1 row "Regions" + §4.2 enum. BPS-code PKs (`@db.Char(N)` — 2/4/**6**/10), no `tenantId`, no soft-delete, no audit-by, only `createdAt`/`updatedAt`. No `Village.postalCode`. FK chain with `onDelete: Restrict, onUpdate: Cascade`. Lookup indexes on each child's parent FK column.
   *Acceptance:* `npx prisma format` + `npx prisma validate` clean.

2. **[x] Generator script + run once.**
   `scripts/generate-regions-sql.ts` — one-shot Node script (executed via `npx tsx`) that fetches the 4 CSVs from `raw.githubusercontent.com/fityannugroho/idn-area-data/<sha>/data/{provinces,regencies,districts,villages}.csv` (pinned to commit `b36d0792e039555eee86bda3d3092cdfcacb16f4`), parses CSV inline (no external dep — simple comma-split is sufficient given idn-area-data's well-formed quoted-comma-free output, but handle quoted fields defensively), strips dots from each `code`, derives `Regency.type` from name prefix (`Kota %` → `KOTA`, else `KABUPATEN`), emits `prisma/seed/01-regions.sql` with header (`-- idn-area-data sha b36d0792… extracted YYYY-MM-DD`) + `BEGIN` + 4 multi-row `INSERT … ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name[, type = EXCLUDED.type], "updatedAt" = NOW()` blocks + `COMMIT`. Chunk multi-row VALUES at ≤ 1000 rows per INSERT to stay well below Postgres's `max_stack_depth` recursion limit on giant value lists. **No npm dep added.**
   *Acceptance:* `npx tsx scripts/generate-regions-sql.ts` produces `prisma/seed/01-regions.sql`. Script logs verified counts: Province 38, Regency 514 (98 KOTA + 416 KABUPATEN), District 7,285, Village 83,762; sampled code lengths after dot-strip: 2 / 4 / 6 / 10.

3. **Author migration `09_regions/migration.sql`.**
   Hand-written SQL following the `02_identity` template (preserves Prisma index/constraint naming for non-drift on future `migrate dev --create-only`):
   - `CREATE TYPE "RegencyType" AS ENUM ('KABUPATEN', 'KOTA');`
   - 4 `CREATE TABLE` with BPS-code PKs (`CHAR(2)`, `CHAR(4)`, `CHAR(6)`, `CHAR(10)`).
   - 3 lookup indexes (`Regency_provinceId_idx`, `District_regencyId_idx`, `Village_districtId_idx`).
   - 1 trigram GIN index `Village_name_trgm_idx ON "Village" USING GIN ("name" gin_trgm_ops)`.
   - 3 `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY … REFERENCES … ON DELETE RESTRICT ON UPDATE CASCADE`.
   - RLS block (4 tables): `ENABLE ROW LEVEL SECURITY` + `GRANT SELECT ON … TO authenticated, anon` + `public_read` policy (`FOR SELECT TO authenticated, anon USING (true)`) + `no_writes_via_postgrest` policy (`FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)`).
   *Acceptance:* `npx prisma migrate deploy` applies cleanly to fresh DB.

4. **Wire seed orchestrator.**
   Update `prisma/seed/index.ts` to invoke `01-regions.sql` via `prisma.$executeRawUnsafe(readFileSync(...))` between `00-tenant` and `02-campuses`. Wrap in `try/finally` console-log timing so the wall-clock seconds are visible.
   *Acceptance:* `npx prisma db seed` runs twice, identical row counts on second pass; per-step timing logged.

5. **Migration post-condition tests.**
   `prisma/migration-tests/09-regions.test.ts` — static parse of `09_regions/migration.sql` + `prisma/schema.prisma`. Asserts:
   - `CREATE TYPE "RegencyType" AS ENUM ('KABUPATEN', 'KOTA')`.
   - 4 `CREATE TABLE` (Province / Regency / District / Village) with BPS PK column types `CHAR(2)` / `CHAR(4)` / `CHAR(6)` / `CHAR(10)`.
   - FK Restrict + Cascade-update on each parent-child pair (3 FKs).
   - 3 lookup indexes (`Regency_provinceId_idx`, `District_regencyId_idx`, `Village_districtId_idx`).
   - Trigram GIN: `CREATE INDEX "Village_name_trgm_idx" ON "Village" USING GIN ("name" gin_trgm_ops)`.
   - RLS per table (×4): `ENABLE ROW LEVEL SECURITY`, `GRANT SELECT … TO authenticated, anon`, `public_read` policy, `no_writes_via_postgrest` policy.
   - **Schema guard:** parse `prisma/schema.prisma` and assert each region model contains no `tenantId` field — guards against silent strict-mode failure of `verify-rls-coverage.sh`.
   *Acceptance:* `npx vitest run prisma/migration-tests` green; existing `01-tenancy.test.ts` + `02-identity.test.ts` not regressed.

6. **End-of-cycle gates.**
   Run `npx prisma generate && npx prisma validate && npx prisma migrate deploy && npx prisma db seed && npm run build && npx vitest run && bash scripts/verify-rls-coverage.sh && bash scripts/verify-api-auth.sh`. Playwright skipped per CLAUDE.md schema-cycle exception (no UI). Capture row counts via `npx tsx --env-file=.env -e ...` and seed wall-clock seconds in Verification.
   *Acceptance:* all gates green; `verify-rls-coverage.sh` reports `9 / 9` (strict mode); region row counts within spec ranges; seed ≤ 10s.

7. **Doc sync.**
   - README ADR row "v2 regions reference data + public-read RLS" added at top of active ADR table.
   - CLAUDE.md migration-list note appended for `09_regions` (one-line entry).
   - Ship Notes records the regenerate runbook (`npx tsx scripts/generate-regions-sql.ts && git add prisma/seed/01-regions.sql && commit`).
   *Acceptance:* `pre-commit` accepts staged diff (broad doc-sync rule + narrow rule both satisfied).

8. **Ship.**
   `/ship` opens PR `feat/p1-regions-seed` → `staging`. CI must pass (Lint/Typecheck/Test, Build; Playwright auto-skip — `e2e/` empty). Manual squash-merge on green.

## Implementation

- **Subagent plan:** all 7 build tasks sequential (shared schema/migration/seed files, ordered deps) — executed inline.
- **Pre-build review (cycle doc):** `feature-dev:code-reviewer` flagged 5 issues; spec patched accordingly:
  1. Migration slot collision (`09_regions` here vs `09_addresses` in foundation spec) → split into `09_regions` + `10_addresses`, doc-sync deferred to scaffold cycle.
  2. `idn-area-data` v4.0.1 has no `Village.postalCode` → field dropped from cycle (deferred to a later cycle with separate postal-code source).
  3. BPS codes in source data are dot-separated; `District` ships as 6 chars (not spec's 7) → schema uses `CHAR(6)` for District, generator strips dots.
  4. `Regency.type` derived from name prefix (`Kota %` → KOTA, else KABUPATEN; verified 98 + 416 = 514).
  5. `ON CONFLICT … DO UPDATE` adds `"updatedAt" = NOW()` (raw SQL bypasses Prisma `@updatedAt`).
  Plus: anon-RLS intent made explicit; FORCE-RLS guidance for future migrations; post-condition test now asserts region models contain no `tenantId`.
- **Task 1 — schema additions.** Added `RegencyType` enum (KABUPATEN, KOTA) after `TenantBootstrapStatus`. Appended 4 region models (`Province` / `Regency` / `District` / `Village`) at file tail with BPS-code PKs `@db.Char(2/4/6/10)` (District widened to spec's CHAR(7) → reverted to CHAR(6) to match `idn-area-data` v4.0.1 + preserve `Village(10) ⊃ District ⊃ Regency(4) ⊃ Province(2)` prefix chain). Non-tenant-scoped — only `createdAt`/`updatedAt`, no `tenantId`/audit-by/soft-delete. FK chain `onDelete: Restrict, onUpdate: Cascade` on each child. Lookup indexes via `@@index([provinceId])` / `@@index([regencyId])` / `@@index([districtId])`. Trigram GIN deferred to migration SQL (Prisma DSL doesn't express it). `npx prisma format` + `npx prisma validate` clean.
- **Task 2 — generator + seed snapshot.** Authored `scripts/generate-regions-sql.ts` (211 lines, no external deps — fetches CSVs via Node's built-in `fetch`, inline RFC-4180 CSV parser). Pivoted from "add `idn-area-data` as devDep" to "fetch CSVs directly from `raw.githubusercontent.com/fityannugroho/idn-area-data/<sha>/data/*.csv` at pinned commit SHA `b36d0792`" — zero npm dep, immutable snapshot. Generator strips dots from BPS codes, derives `Regency.type` from name prefix, validates fixed-width PK invariants (2/4/6/10 chars), emits 1000-row chunked `INSERT … ON CONFLICT … DO UPDATE SET name = EXCLUDED.name [, type = EXCLUDED.type], "updatedAt" = NOW()` blocks wrapped in `BEGIN`/`COMMIT`. **Run output:** Province 38, Regency 514 (98 KOTA + 416 KABUPATEN), District 7,285, Village 83,762 — matches spec sanity counts exactly. Committed seed file `prisma/seed/01-regions.sql` (4.22 MB, 91,899 lines — smaller than 8-10 MB estimate due to compact multi-row INSERT format).
- **Task 2 incident — node_modules accidentally written.** First attempt at `npm install --save-dev idn-area-data@4.0.1` ran out of disk space (root volume at 100%), partially wrote into the worktree's `node_modules` symlink target (which is the main checkout's `node_modules`), corrupting `next/` + breaking subsequent gates. Recovery: deleted the worktree's now-real `node_modules` directory, restored the `../../node_modules` symlink to the main checkout (which itself was unaffected — only the target traversal got mangled), re-ran gates clean. Decision: skip the npm devDep entirely and have the generator fetch CSVs from raw GitHub URLs at the pinned SHA. This is a stricter Option B than the spec originally planned (no devDep, immutable commit SHA over version tag) and avoids the "regenerate runbook needs `npm install` first" footgun.

## Verification

- **Task 1:** `npx prisma format` ✓, `npx prisma validate` ✓, `npm run build` ✓ (Next.js 16.2.3, 7 routes), `npx vitest run` ✓ (8 files / 149 tests).
- **Task 2:** `npx tsx scripts/generate-regions-sql.ts` → counts match spec exactly (Province 38, Regency 514 = 98 KOTA + 416 KABUPATEN, District 7,285, Village 83,762); fixed-width PK invariants pass for all rows. `npm run build` ✓, `npx vitest run` ✓ (8/149).

## Ship Notes

(Filled by /ship — PR URL, regenerate runbook, env vars, rollback.)
