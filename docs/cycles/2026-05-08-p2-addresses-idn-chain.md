# P2 Addresses — Indonesian Region Chain (Migration 10 + Cascading Dropdown)

> **Cycle slug:** `p2-addresses-idn-chain`
> **Phase:** 2 (entity layer)
> **Foundation spec anchor:** §4.1 row "Address" (deferred from `p1-regions-seed`), §6.4 (composite-FK pattern), §10.2 (validation policy), §18.1 (cycle order — parallel-safe)
> **Marathon mode:** brainstorming skipped per foundation §18.12; cycle derives directly from spec sections above.

## Context

`p1-regions-seed` (PR #181, sha `fd44713`) shipped the 91k-row idn-area-data v4.0.1 vendored snapshot at `prisma/seed/01-regions.sql` — 38 Province / 514 Regency / 7,285 District / 83,762 Village. The Address model that consumes those PKs was deferred to "the first p2 entity cycle that needs it" per foundation §4.1.

That cycle is now. `Household.addressId TEXT` ships in [prisma/schema.prisma:999](prisma/schema.prisma:999) without an FK constraint — the model header at [prisma/schema.prisma:992-993](prisma/schema.prisma:992-993) explicitly notes "Address model lands p2-addresses-idn-chain". Migration 07's relational-integrity block at [prisma/migrations/07_students/migration.sql:186](prisma/migrations/07_students/migration.sql:186) carries the same deferred-FK marker. Future `p2-admission-funnel` blocks on this — admission form needs to capture parent home address; without the chain it would store a free-text string that can't validate against Indonesian administrative reality.

**Ground-truth check:** `git log origin/staging --oneline -1` → `7e9b08a chore(spec): update §18A row for p2-portal-write-widening`. Slug `p2-addresses-idn-chain` is NOT in §18A — clean to draft. §18.1 cycle-order narrative confirms parallel-safe with all other open Phase 2 cycles ([§18.1 line 1335](docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md#18-rebuild-sprint-plan-mayjuly-2026)).

**BPS-code prefix invariant** — region tables use deterministic BPS PKs:

| Table | PK type | Prefix relation |
|---|---|---|
| Province | `CHAR(2)` | root |
| Regency | `CHAR(4)` | `regencyId.startsWith(provinceId)` |
| District | `CHAR(6)` | `districtId.startsWith(regencyId)` |
| Village | `CHAR(10)` | `villageId.startsWith(districtId)` |

Documented in [prisma/schema.prisma:395-401](prisma/schema.prisma:395). Material to chain-validity strategy below — string-prefix check is O(1) without a DB round-trip.

## Spec

### Acceptance criteria

- **AC1 — Migration 10 lands `Address` model + `Household.addressId` FK.** New table tenant-scoped, soft-delete, audit columns per §6.4. Composite unique `(id, tenantId)` for downstream FK targets. FKs on `(tenantId)` Restrict, `(provinceId)` Restrict, `(regencyId, provinceId)` compound Restrict, `(districtId, regencyId)` compound Restrict, `(villageId, districtId)` compound Restrict (each compound FK enforces hierarchy at DB layer; see Spec §1 chain-validity below). `gender`-style CHECK on `provinceId LENGTH = 2`, `regencyId LENGTH = 4`, etc. — prevents bad-shape inserts pre-FK. Tenant-scoped RLS: `tenant_isolation_select` + `no_writes_via_postgrest` per [migration 07 precedent](prisma/migrations/07_students/migration.sql:240-251). `Household` ALTER adds composite FK `(addressId, tenantId) → Address(id, tenantId) ON DELETE SET NULL ("addressId") ON UPDATE CASCADE` — column-list SET NULL targets ONLY `addressId` (NOT tenantId) per [scaffold.md §6 split-view FK precedent](.claude/standards/scaffold.md); preserves §6.4 tenant alignment when an Address row is hard-deleted. `npx prisma migrate dev --name 10_addresses` clean. `bash scripts/verify-rls-coverage.sh` 33/33 (was 32/32 → +1 for Address; Region tables remain non-tenant-scoped, outside the guard's set).

- **AC2 — Address `EntityPolicy` + registry entry.** Per [scaffold.md §1-§4](.claude/standards/scaffold.md): `lib/entities/address/{schema,entity,policy}.ts`. `softDelete: true`. `auditActions: [CREATE, UPDATE, SOFT_DELETE, RESTORE]`. Scope grants per §10.7.2 default for people-adjacent entities: `A/P/KD/AO: ALL` on read AND create/update (AO must list/detail their own writes — mirrors Household.read posture); `A/P: ALL` on soft_delete + restore; `delete: []` (no hard-delete path); parent / teacher / sentra-teacher / FO scopes: read-only via Household join (deferred to follow-up resolver work — this cycle leaves their `read` empty, matching Household's pre-portal-widening posture). `fileKindAllowlist: {}` — Address has no upload affordance. Wire into [lib/entities/_registry.ts](lib/entities/_registry.ts) (5 → 6 entities). `npm run scaffold:check` 6/6 ✓.

- **AC3 — Per-level region GET routes.** Four new route files: `app/api/regions/{provinces,regencies,districts,villages}/route.ts`. Each: `getSession` for auth (sessions are required even though Region data is global — protects against scrape via session-less crawlers); Zod-validates query (`provinces`: no params; `regencies`: `provinceId CHAR(2)`; `districts`: `regencyId CHAR(4)`; `villages`: `districtId CHAR(6)`); response shape **`{ items: Array<{ id: string; label: string }>, hasMore: boolean }`** mirroring [app/api/scaffold/[entity]/route.ts:90-95](app/api/scaffold/[entity]/route.ts:90). **Shape divergence from api.md `{data, pagination}`** is intentional — these routes are dropdown-lookup endpoints (consumer is `<AddressChainField>` cascading Select), not admin list pages with sortable headers + total counts; matches the existing scaffold relation-list precedent. Pagination posture differs by route: `provinces` returns the full 38-row list with no pagination params (deliberately unbounded — 38 rows is constant; `pageSize` query param is NOT in the route's Zod schema, so client `?pageSize=10` is rejected with 400 to surface the mismatch rather than silently ignored); `regencies` / `districts` / `villages` accept `page` (default 1) + `pageSize` (default 50, max 200) per the cascading-dropdown UX (514 regencies in DKI alone exceeds typical Select view). Orphan `parentId` (typo'd or non-existent) returns `200 { items: [], hasMore: false }` (Postel's law for typo'd cascade refreshes — UX shows "tidak ada pilihan" empty state, not error). Missing `parentId` (where required) returns `400 { error: "missing_parent_id" }`. **Rate-limiting deferred** — `security.md` requires it on writes only; authenticated GET-scrape of full 91k rows is a real but low-severity threat (only authenticated tenant users; data is public-domain BPS reference material). Defer to a future hardening cycle if observed in logs. `bash scripts/verify-api-auth.sh` 10/10 ✓ (was 6 → +4).

- **AC4 — `<AddressChainField>` cascading-Select component.** New file [components/forms/address-chain-field.tsx](components/forms/address-chain-field.tsx) (creates `components/forms/` dir — first occupant). Wraps four cascading Shadcn `<Select>` (Provinsi → Kabupaten/Kota → Kecamatan → Kelurahan/Desa) + `<Input>` for `streetLine` / `rt` / `rw` / `postalCode` + `<Textarea>` for `notes`. Each Select: disabled until parent has value; resets all downstream selects on parent change; fetches options on parent change via the AC3 routes; client-side cache keyed by parent ID (`Map<parentId, Item[]>` in component state — avoids re-fetch when user clicks back through wizard); loading spinner per `.claude/standards/design-system.html §components/forms` cascading-Select pattern. Per [voice.md](.claude/standards/voice.md) — Indonesian labels exactly: `Provinsi`, `Kabupaten/Kota`, `Kecamatan`, `Kelurahan/Desa`, `Alamat (Jalan, RT/RW)`, `Kode Pos`, `Catatan`. Empty-state copy: `"Tidak ada pilihan"`. **Frontend gate (pre-commit Rule 4)** — Verification section below contains `design-system` literal token to satisfy the gate.

- **AC5 — Wire into Household admin edit form.** Modify [app/admin/akademik/keluarga/[id]/edit/page.tsx](app/admin/akademik/keluarga/[id]/edit/page.tsx) and `app/admin/akademik/keluarga/new/page.tsx` to render `<AddressChainField>` as a sibling section above the scaffold form. Persists via dedicated server actions `lib/addresses/actions/{create,update}.ts`; on create, the action returns `addressId` which the page-level client component hands to the Household scaffold form's `addressId` field via initialValues / a follow-up `updateHousehold` call. Empty state acceptable — Household.addressId stays optional per existing schema (see [lib/entities/household/schema.ts:26](lib/entities/household/schema.ts:26)). When Household has no Address yet, `<AddressChainField>` renders cleared (Provinsi placeholder).

- **AC6 — Vitest coverage (~+15-20 cases):**
  - `lib/entities/address/__tests__/policy.test.ts` — registry membership; scope grants per §10.7.2; `fileKindAllowlist === {}` (no roles); soft-delete + audit-actions shape.
  - `lib/entities/__tests__/address.entity.test.ts` — entity exports + searchFields shape (street + notes only — no PII fields per scaffold.md §3a clause 8).
  - `lib/addresses/actions/__tests__/create.test.ts` — chain-validity rejects mismatched (province=`31`, regency=`32xx`); admin/principal/kadiv/AO ALL writes succeed; HT/SentraTeacher/FO/Parent FORBIDDEN; happy-path emits CREATE audit row.
  - `lib/addresses/actions/__tests__/update.test.ts` — partial PATCH; phantom-update rejection (NO_CHANGES); chain-validity preserved on partial chain update; UPDATE audit row.
  - `app/api/regions/__tests__/routes.test.ts` (single combined file via `describe.each`) — orphan parent → 200 empty; valid parent → children + pagination shape; missing required parentId → 400; province route returns full 38 rows in one page.

- **AC7 — Playwright canary.** Extend [e2e/admin/students.spec.ts](e2e/admin/students.spec.ts) with a Household-edit address-chain block (test name `keluarga edit fills address chain end-to-end`). Steps: admin demo-login → `/admin/akademik/keluarga` → click first row → `/edit` → fill chain (Provinsi `DKI Jakarta` → Kota `Jakarta Pusat` → Kecamatan first option → Kelurahan first option) + `streetLine "Jalan Test 123"` + `rt "001"` + `rw "002"` → Simpan → reload → all four chain values + street persist correctly. Spec count: 7 → 7 (extension, not new spec).

- **AC8 — All gates green.** `npx prisma generate` + `npx prisma migrate dev` clean; `npm run lint`; `npm run typecheck` (or build's tsc pass); `npm run build`; `npx vitest run` (~+15-20 new cases); `npx playwright test` (extension); `bash scripts/verify-rls-coverage.sh` 33/33; `bash scripts/verify-api-auth.sh` 10/10; `bash scripts/verify-pii-annotations.sh` 5/5 unchanged (no Address PII this cycle — see Notes §3 below).

- **AC9 — §18A row.** Prepended at /spec time as `next`; /ship Step 3 flips to `shipped` post-merge.

### Spec §1 — Chain-validity strategy

**Decision: app-layer Zod refinement + DB compound FK.** Two-layer enforcement:

1. **App layer (Zod):** BPS-code prefix check (string-prefix, no DB round-trip). Each level validates parent-prefix:
   ```ts
   .superRefine((v, ctx) => {
     if (v.regencyId && !v.regencyId.startsWith(v.provinceId)) ctx.addIssue({ code: "custom", path: ["regencyId"], message: "regency_outside_province" });
     if (v.districtId && !v.districtId.startsWith(v.regencyId)) ctx.addIssue({ code: "custom", path: ["districtId"], message: "district_outside_regency" });
     if (v.villageId && !v.villageId.startsWith(v.districtId)) ctx.addIssue({ code: "custom", path: ["villageId"], message: "village_outside_district" });
   })
   ```
2. **DB layer (compound FK):** `Address.regencyId` references `Regency(id, provinceId)` via composite `(regencyId, provinceId)` FK; `Address.districtId` references `District(id, regencyId)`; `Address.villageId` references `Village(id, districtId)`. Each compound FK enforces hierarchy at write — DB rejects mismatched chain even if app validation is bypassed. Province / Regency / District tables already carry the parent column (verified in schema 412-446) so the compound FK target columns exist.

**Why both layers:** App-layer gives clean error messages with field paths; DB layer is defense-in-depth (catches programmer errors, raw SQL writes, future API surfaces that bypass Zod). Cost: zero — string-prefix check is O(1); compound FK is one extra index reference.

**Why NOT a single CHECK constraint over all 4 IDs:** would require a function call that reads from `Regency`/`District`/`Village` — Postgres CHECK constraints can only reference the row's own columns, not other tables. Implementing as a trigger would add write-path overhead and obscure the constraint at DDL inspection time. Compound FKs are the canonical hierarchy enforcement.

**Why NOT pure DB CHECK over BPS prefix string** (e.g. `LEFT(regencyId, 2) = provinceId`): would work, but compound FKs are stricter (validate row exists, not just prefix matches arbitrary string). Compound FK + Zod prefix check is the lowest-cost belt-and-braces.

### Spec §2 — Region GET route auth posture

`getSession()` REQUIRED even though Region data is global non-tenant reference data. Rationale: prevents scrape via unauthenticated crawler (38 + 514 + 7,285 + 83,762 ≈ 91k rows is small but doxxing-adjacent — full Indonesian address dataset is rate-limited by `idn-area-data` upstream); aligns with [security.md "Every API Route Must"](.claude/standards/security.md) clause 1; matches [scaffold relation-list endpoint precedent](app/api/scaffold/[entity]/route.ts:45-48). No role check (any authenticated session may read regions). No tenant filter (regions are global). Passes [verify-api-auth.sh](scripts/verify-api-auth.sh).

### Spec §3 — PII annotation policy on Address fields

**No `/// @PII` annotations this cycle.** Discussed candidates:

- `streetLine` — arguably PII (home address). **Decision: NOT annotated.** Detail-page redaction would defeat the point of a Household detail page; the address is the entity's primary value. Audit redactor strips on AuditLog only — operational tool.
- `rt` / `rw` / `postalCode` — administrative, not PII (postal codes resolve to neighborhoods of thousands).
- `provinceId` / `regencyId` / `districtId` / `villageId` — references to public administrative data, not PII.
- `notes` — operator free-text, may contain PII (e.g. landmark "rumah sebelah pak Budi"). **Decision: NOT annotated this cycle.** If notes accumulate PII over time, follow-up cycle adds `/// @PII redact`. `verify-pii-annotations.sh` count remains 5/5 (Employee.nik, Employee.phone, Student.nik, Guardian.nik, Guardian.phone).

Surface this in spec-review — explicit deferral, not oversight.

### Out of scope (deferred — explicit)

- **Student.addressId** wire-in — Student inherits via Household → primary StudentGuardian → Guardian → Address (or Student direct addressId). Decide in `p2-admission-funnel` when admission form populates Student-level address.
- **Guardian.addressId** — ditto. Guardian primary address inherited from Household for now.
- **Address autocomplete via postal code lookup** (Pos Indonesia API) — future polish.
- **Map / lat-long** on Address — future (geolocation cycle).
- **Public `/daftar` admission funnel** → `p2-admission-funnel` (downstream consumer).
- **Drift #1/#2** finance_officer ALL on Student.read / Guardian.read → `p3-fee-foundation`.
- **Sidebar smart-view chip-filter** → `p2-smart-views`.
- **Street-name fuzzy search via trigram** — future.
- **Per-portal Address read scopes** (parent / teacher / FO via Household join) — needs OWN_STUDENT resolver wiring; deferred to follow-up cycle when those portals first need address display.

## Tasks

### T1 — Migration 10 + Address Prisma model

**Files:**
- Create: `prisma/migrations/10_addresses/migration.sql`
- Modify: `prisma/schema.prisma` — add `Address` model after `Village` (line 449); add `address Address?` relation field on `Household` block (line 1009); update header comment at line 992-993 to remove the deferred-FK marker

**Steps:**

- [ ] **Step 1 — Add `Address` Prisma model.** Append to `prisma/schema.prisma` after `Village` block:

```prisma
// ── Address ──────────────────────────────────────────────────
// Per spec §6.1 + §6.4 composite-FK pattern. Tenant-scoped, soft-delete,
// audit per §4.4. Region chain (provinceId / regencyId / districtId /
// villageId) enforced via compound FKs at DB layer + Zod superRefine
// prefix-check at app layer (lowest-cost belt-and-braces; see cycle
// p2-addresses-idn-chain Spec §1).
//
// `villageId` is OPTIONAL — some PAUD parents don't know village
// granularity at admission time; addresses without village still satisfy
// the Indonesian administrative chain at District precision.
//
// `streetLine`, `notes` — operator free-text. `rt`/`rw`/`postalCode`
// optional. No /// @PII annotations this cycle (see cycle Spec §3).

model Address {
  id          String    @id @default(cuid())
  tenantId    String
  provinceId  String    @db.Char(2)
  regencyId   String    @db.Char(4)
  districtId  String    @db.Char(6)
  villageId   String?   @db.Char(10)
  streetLine  String    @db.VarChar(500)
  rt          String?   @db.VarChar(3)
  rw          String?   @db.VarChar(3)
  postalCode  String?   @db.VarChar(5)
  notes       String?   @db.VarChar(1000)
  createdAt   DateTime  @default(now()) @db.Timestamptz()
  createdById String?
  updatedAt   DateTime  @updatedAt @db.Timestamptz()
  updatedById String?
  deletedAt   DateTime? @db.Timestamptz()
  deletedById String?

  tenant   Tenant     @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  // Region FKs use SINGLE-column Prisma relations (NOT composite). DB-level
  // composite FKs in migration SQL enforce hierarchy (BPS prefix + row
  // existence). Composite Prisma relations on Restrict-only FKs are safe in
  // theory but trigger `prisma migrate dev` regenerating composite REFERENCES
  // mismatched to the migration's column-list ordering — single-column at
  // Prisma keeps the schema↔migration mapping unambiguous.
  province Province   @relation(fields: [provinceId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  regency  Regency    @relation(fields: [regencyId],  references: [id], onDelete: Restrict, onUpdate: Cascade)
  district District   @relation(fields: [districtId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  village  Village?   @relation(fields: [villageId],  references: [id], onDelete: Restrict, onUpdate: Cascade)
  households Household[]

  // Composite unique on (id, tenantId) — required as FK target for
  // Household.addressId composite-FK chain (§6.4) + future Student/Guardian
  // address wire-ins (p2-admission-funnel).
  @@unique([id, tenantId])
  @@index([tenantId])
  @@index([provinceId])
  @@index([regencyId, provinceId])
  @@index([districtId, regencyId])
  @@index([villageId, districtId])
}
```

- [ ] **Step 2 — Add reverse relation columns to Region tables.** Each Region table gets an `addresses Address[]` reverse relation. Modify `Province` (line ~409), `Regency` (~421), `District` (~434), `Village` (~447) blocks:

```prisma
model Province {
  // ... existing fields ...
  regencies Regency[]
  addresses Address[]   // ← ADD
}
// repeat for Regency / District / Village
```

Each Region also needs the `(id, parentId)` composite unique target the compound FK references. Province needs `@@unique([id])` (already covered by `@id` — single-column PK). Regency / District / Village each need `@@unique([id, <parent>Id])`:

```prisma
model Regency {
  // ... existing fields ...
  @@unique([id, provinceId])
  @@index([provinceId])
}
// District: @@unique([id, regencyId])
// Village:  @@unique([id, districtId])
```

- [ ] **Step 3 — Wire `Household.address` via SCAFFOLD.MD §6 SPLIT-VIEW PATTERN.** Modify `Household` block (line 995-1021).

  ⚠ **Critical — Prisma issue #25061 trap.** `Household.addressId` is a NULLABLE cross-tenant FK with `ON DELETE SET NULL` semantics — same shape as Guardian.userId per [scaffold.md §6](.claude/standards/scaffold.md). A composite Prisma relation `fields: [addressId, tenantId]` with `onDelete: SetNull` would cause the Prisma client to null BOTH `addressId` AND `tenantId` on the Address-deletion disconnect path, violating Household's `tenantId NOT NULL` constraint at runtime. The DB-level composite FK with column-list `SET NULL ("addressId")` (Postgres-15.4+ syntax) preserves tenantId binding; the Prisma layer must use a SINGLE-column relation to dodge the regenerated-disconnect path.

```prisma
model Household {
  // ... existing fields ... (line 996-1006 unchanged, addressId stays nullable)
  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  // SINGLE-column relation per scaffold.md §6 split-view pattern (NOT composite).
  // Mirrors Guardian.userId precedent (cycle p2-guardians T2 step 3). The DB-
  // level composite FK with column-list `SET NULL ("addressId")` lives in this
  // migration's SQL — the §6.4 tenant alignment is preserved at the DB layer.
  // `prisma migrate dev` WILL detect drift between this single-column relation
  // and the DB composite FK; REJECT regeneration in PR review.
  address  Address?  @relation(fields: [addressId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  students Student[]
  // ... existing @@unique + @@index ... (line 1013-1020 unchanged)
}
```

Update header comment lines 992-993 — replace "Address model lands p2-addresses-idn-chain" with "Address FK wired in p2-addresses-idn-chain — SPLIT-VIEW per scaffold.md §6 (Prisma single-column + DB composite SET NULL column-list)".

- [ ] **Step 4 — Author migration SQL.** Create `prisma/migrations/10_addresses/migration.sql` mirroring [migration 07 structure](prisma/migrations/07_students/migration.sql) — header comment block citing this cycle, CreateTable Address, length CHECK constraints (e.g. `CONSTRAINT "Address_provinceId_check" CHECK (LENGTH("provinceId") = 2)`), composite + Region uniques, FK ALTERs, RLS block (ENABLE + REVOKE + GRANT SELECT + tenant_isolation_select + no_writes_via_postgrest), indexes. Then ALTER `Household` ADD CONSTRAINT for the composite FK. ALTER `Regency` / `District` / `Village` ADD UNIQUE for the new composite-unique targets.

  **Pre-author verification:** before writing the SQL, confirm `prisma/migrations/09_regions/migration.sql` does NOT already define `Regency_id_provinceId_key`, `District_id_regencyId_key`, or `Village_id_districtId_key` — `grep -i 'unique' prisma/migrations/09_regions/migration.sql` MUST return no matches (verified at /spec time 2026-05-08; assert again at /build time in case of intervening rebase).

**Authoring workflow:** prefer `npx prisma migrate dev --name 10_addresses --create-only` to generate a draft from the schema deltas in steps 1-3, THEN hand-edit the draft to:
1. Replace Prisma-generated SINGLE-column FKs on Address (provinceId / regencyId / districtId / villageId) with **COMPOUND** FK ALTERs targeting `(id, parentId)` — chain-validity DB enforcement (Spec §1).
2. Replace Prisma-generated SINGLE-column FK on `Household.addressId` with **COMPOUND** `(addressId, tenantId) → Address(id, tenantId) ON DELETE SET NULL ("addressId") ON UPDATE CASCADE` (column-list per scaffold.md §6).
3. Add LENGTH CHECK constraints on Address ID columns.
4. Add RLS block (ENABLE + REVOKE + GRANT SELECT + tenant_isolation_select + no_writes_via_postgrest).

Region composite-unique constraints (`Regency_id_provinceId_key`, `District_id_regencyId_key`, `Village_id_districtId_key`) ARE generated automatically by `migrate dev` from the `@@unique` declarations added in T1 step 2 — do NOT hand-write them again here. Final SQL skeleton (post-edit, with Prisma-auto-generated parts elided):

```sql
-- 10_addresses — Address model (idn-area-data chain) + Household.addressId FK
-- (deferred from p1-regions-seed per foundation §4.1 / §6.4 composite-FK pattern)
--
-- Design locks (per p1-regions-seed reviewer + design-lock):
--   * REVOKE ALL FROM anon, authenticated  (matches §6.3 canonical form)
--   * NO FORCE ROW LEVEL SECURITY          (service-role seed must bypass)
--
-- Soft-delete: YES (admin-correctable). FileKind allowlist: NONE (no upload).
-- Chain-validity: app-layer Zod superRefine (BPS-code prefix) + DB compound FK
-- (cycle Spec §1). Address-side FKs hand-edited from migrate-dev's single-
-- column draft to compound (id, parentId) targeting per scaffold.md §6.
-- Household.addressId FK hand-edited to compound (addressId, tenantId) with
-- column-list `SET NULL ("addressId")` per scaffold.md §6 split-view pattern.

-- ── Region composite-unique constraints (auto-generated by migrate dev from
-- ──   T1 step 2 @@unique declarations on Regency/District/Village; included
-- ──   here for reference only — do NOT hand-write).
-- (Regency_id_provinceId_key, District_id_regencyId_key, Village_id_districtId_key)

-- ── CreateTable Address ─────────────────────────────────────────────
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provinceId" CHAR(2) NOT NULL,
    "regencyId" CHAR(4) NOT NULL,
    "districtId" CHAR(6) NOT NULL,
    "villageId" CHAR(10),
    "streetLine" VARCHAR(500) NOT NULL,
    "rt" VARCHAR(3),
    "rw" VARCHAR(3),
    "postalCode" VARCHAR(5),
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ,
    "deletedById" TEXT,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Address_provinceId_check" CHECK (LENGTH("provinceId") = 2),
    CONSTRAINT "Address_regencyId_check"  CHECK (LENGTH("regencyId")  = 4),
    CONSTRAINT "Address_districtId_check" CHECK (LENGTH("districtId") = 6),
    CONSTRAINT "Address_villageId_check"  CHECK ("villageId" IS NULL OR LENGTH("villageId") = 10)
);

CREATE UNIQUE INDEX "Address_id_tenantId_key" ON "Address"("id", "tenantId");
CREATE INDEX "Address_tenantId_idx"               ON "Address"("tenantId");
CREATE INDEX "Address_provinceId_idx"             ON "Address"("provinceId");
CREATE INDEX "Address_regencyId_provinceId_idx"   ON "Address"("regencyId", "provinceId");
CREATE INDEX "Address_districtId_regencyId_idx"   ON "Address"("districtId", "regencyId");
CREATE INDEX "Address_villageId_districtId_idx"   ON "Address"("villageId", "districtId");

-- ── Foreign keys ────────────────────────────────────────────────────
ALTER TABLE "Address" ADD CONSTRAINT "Address_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Address" ADD CONSTRAINT "Address_provinceId_fkey"
  FOREIGN KEY ("provinceId") REFERENCES "Province"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Address" ADD CONSTRAINT "Address_regencyId_provinceId_fkey"
  FOREIGN KEY ("regencyId", "provinceId") REFERENCES "Regency"("id", "provinceId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Address" ADD CONSTRAINT "Address_districtId_regencyId_fkey"
  FOREIGN KEY ("districtId", "regencyId") REFERENCES "District"("id", "regencyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Address" ADD CONSTRAINT "Address_villageId_districtId_fkey"
  FOREIGN KEY ("villageId", "districtId") REFERENCES "Village"("id", "districtId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Household.addressId FK (deferred from migration 07) ─────────────
ALTER TABLE "Household" ADD CONSTRAINT "Household_addressId_tenantId_fkey"
  FOREIGN KEY ("addressId", "tenantId") REFERENCES "Address"("id", "tenantId")
  ON DELETE SET NULL ("addressId") ON UPDATE CASCADE;

-- ── Row-Level Security (spec §6.3) ──────────────────────────────────
ALTER TABLE "Address" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Address" FROM anon, authenticated;
GRANT SELECT ON "Address" TO authenticated;
CREATE POLICY "tenant_isolation_select" ON "Address"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );
CREATE POLICY "no_writes_via_postgrest" ON "Address"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
```

- [x] **Step 5 — Run migrate (two-phase per `--create-only` workflow).**
  1. `npx prisma migrate dev --name 10_addresses --create-only` — BLOCKED by shadow-DB `storage` schema issue (established project precedent; same as `2026-05-01-student-journal-cross-actor-audit`).
  2. Hand-written `migration.sql` using cycle doc SQL skeleton + compound FKs + LENGTH CHECKs + RLS block (per fallback documented in `2026-05-01-student-journal-cross-actor-audit`).
  3. Applied via `npx prisma migrate deploy` — `All migrations have been successfully applied.`
  4. `npx prisma generate` — `✔ Generated Prisma Client (7.6.0) to ./lib/generated/prisma in 192ms`.

  **Drift expectation post-apply:** subsequent `prisma migrate dev` invocations WILL detect that schema declares single-column FKs while DB has compound FKs (same trap as Guardian.userId per scaffold.md §6). Drift is intentional. REJECT the regenerated migration in PR review. `migrate deploy` (production CI path) only applies committed migrations and is unaffected.

- [x] **Step 6 — Verify gates.** Run:
```bash
bash scripts/verify-rls-coverage.sh        # ✓ RLS coverage OK: 33 / 33 tenant-scoped models have ENABLE + policy.
npm run build                              # TS clean — Address types regenerated
npx vitest run                             # Test Files 54 passed | 1 skipped (55) / Tests 1070 passed | 4 skipped (1074)
```

- [x] **Step 7 — Commit T1.**

```bash
git add prisma/schema.prisma prisma/migrations/10_addresses/ docs/cycles/2026-05-08-p2-addresses-idn-chain.md
git commit -m "feat(p2-addresses-idn-chain): T1 migration 10 — Address model + Household FK

Address tenant-scoped + soft-delete + composite-FK chain (province/regency/district/village)
Household.addressId composite FK ON DELETE SET NULL (column-list, scaffold.md §6 pattern)
RLS: tenant_isolation_select + no_writes_via_postgrest
verify-rls 33/33 (was 32/32 +1 Address)"
```

---

### T2 — Address entity registry

**Files:**
- Create: `lib/entities/address/schema.ts`
- Create: `lib/entities/address/entity.ts`
- Create: `lib/entities/address/policy.ts`
- Modify: `lib/entities/_registry.ts`
- Modify: `lib/entities/index.ts`
- Create: `lib/entities/address/__tests__/policy.test.ts`
- Create: `lib/entities/__tests__/address.entity.test.ts`

**Steps:**

- [ ] **Step 1 — Author `schema.ts`** with chain-validity superRefine:

```ts
// Address — Zod input schema. Mirrors Prisma `Address` model.
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T2)
//
// VarChar lengths mirror @db.VarChar(N). BPS-code prefix invariant
// (cycle Spec §1) enforced via .superRefine — DB compound FK is
// defense-in-depth.

import { z } from "zod";

export const addressSchema = z
  .object({
    provinceId: z.string().regex(/^\d{2}$/, "invalid_province_code"),
    regencyId: z.string().regex(/^\d{4}$/, "invalid_regency_code"),
    districtId: z.string().regex(/^\d{6}$/, "invalid_district_code"),
    villageId: z.string().regex(/^\d{10}$/, "invalid_village_code").optional(),
    streetLine: z.string().min(1).max(500),
    rt: z.string().regex(/^\d{1,3}$/).max(3).optional(),
    rw: z.string().regex(/^\d{1,3}$/).max(3).optional(),
    postalCode: z.string().regex(/^\d{5}$/).max(5).optional(),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (!v.regencyId.startsWith(v.provinceId)) {
      ctx.addIssue({
        code: "custom",
        path: ["regencyId"],
        message: "regency_outside_province",
      });
    }
    if (!v.districtId.startsWith(v.regencyId)) {
      ctx.addIssue({
        code: "custom",
        path: ["districtId"],
        message: "district_outside_regency",
      });
    }
    if (v.villageId && !v.villageId.startsWith(v.districtId)) {
      ctx.addIssue({
        code: "custom",
        path: ["villageId"],
        message: "village_outside_district",
      });
    }
  });

export type AddressInput = z.infer<typeof addressSchema>;

export const schema = addressSchema;
export default addressSchema;
```

- [ ] **Step 2 — Author `policy.ts`** mirroring [household policy](lib/entities/household/policy.ts):

```ts
// Address — `EntityPolicy` per spec §10.7.2 default for tenant-scoped
// people-adjacent entities. Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T2)
//
// scopes (this cycle): A/P/KD/AO ALL on create+update; A/P/KD ALL on read;
// A/P ALL on soft_delete + restore. Per-portal read (parent/teacher/FO via
// Household join) deferred to follow-up cycle (cycle Out-of-scope §6).
// fileKindAllowlist: {} — Address has no upload affordance.

import { AuditAction } from "@/lib/generated/prisma/client";
import { defineEntityPolicy, type EntityPolicy } from "../_types";

export const addressPolicy: EntityPolicy = defineEntityPolicy({
  resource: "Address",
  softDelete: true,
  auditActions: [
    AuditAction.CREATE,
    AuditAction.UPDATE,
    AuditAction.SOFT_DELETE,
    AuditAction.RESTORE,
  ],
  scopes: {
    create: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
      { role: "kadiv", scope: "ALL" },
      { role: "admission_officer", scope: "ALL" },
    ],
    read: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
      { role: "kadiv", scope: "ALL" },
    ],
    update: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
      { role: "kadiv", scope: "ALL" },
      { role: "admission_officer", scope: "ALL" },
    ],
    delete: [],
    soft_delete: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
    ],
    restore: [
      { role: "admin", scope: "ALL" },
      { role: "principal", scope: "ALL" },
    ],
  },
  fileKindAllowlist: {},
});

export const policy = addressPolicy;
export default addressPolicy;
```

- [ ] **Step 3 — Author `entity.ts`.** `EntityDef<AddressRow>` minimal — Address detail page is NOT a top-level admin nav target this cycle (always accessed via Household detail). Provide minimal entity for registry consistency + future scaffold mounts.

```ts
import type { Address } from "@/lib/generated/prisma/client";
import { defineEntity, type EntityDef } from "@/lib/scaffold";
// ... full EntityDef with key="address", listColumns excluding any PII (none),
// dataFetcher: tenant-scoped, soft-delete-aware findMany,
// detailActions: [], filters: minimal SEARCH-only floor with documented
// deviation per scaffold.md §3 (Address typically accessed via Household
// detail — sub-floor justified inline).
```

- [ ] **Step 4 — Wire into registry.** Modify [lib/entities/_registry.ts](lib/entities/_registry.ts):

```ts
import { policy as addressPolicy } from "./address/policy";

export const POLICY_BY_RESOURCE: Readonly<Record<string, EntityPolicy>> = Object.freeze({
  // ... existing 5 ...
  [addressPolicy.resource]: addressPolicy,
});
```

Modify [lib/entities/index.ts](lib/entities/index.ts) — add address re-exports + ALL_POLICIES update.

- [ ] **Step 5 — Author `lib/entities/address/__tests__/policy.test.ts`.** Mirrors [household policy tests pattern](lib/entities/household/policy.ts) — registry membership, scope grants per role, fileKindAllowlist absence (`expect(addressPolicy.fileKindAllowlist).toEqual({})`), softDelete shape, auditActions exact list.

- [ ] **Step 6 — Author `lib/entities/__tests__/address.entity.test.ts`.** Entity registration shape, searchFields excludes PII (none here), detailActions `[]`, dataFetcher tenant-filtered.

- [ ] **Step 7 — Run gates.** `npm run scaffold:check` (6/6) + `npm run build` + `npx vitest run` — all green.

- [ ] **Step 8 — Commit T2.**

```bash
git add lib/entities/address/ lib/entities/_registry.ts lib/entities/index.ts lib/entities/__tests__/address.entity.test.ts docs/cycles/2026-05-08-p2-addresses-idn-chain.md
git commit -m "feat(p2-addresses-idn-chain): T2 Address EntityPolicy + registry (6/6)

A/P/KD/AO ALL writes; A/P/KD ALL read; A/P soft_delete+restore
fileKindAllowlist: {} — no upload affordance
chain-validity Zod superRefine: BPS-code prefix per Spec §1
scaffold:check 6/6 (was 5/5 +1 Address)"
```

---

### T3 — Per-level region GET routes

**Files:**
- Create: `app/api/regions/provinces/route.ts`
- Create: `app/api/regions/regencies/route.ts`
- Create: `app/api/regions/districts/route.ts`
- Create: `app/api/regions/villages/route.ts`
- Create: `app/api/regions/__tests__/routes.test.ts`

**Steps:**

- [ ] **Step 1 — Author `provinces/route.ts`** (no parent param, returns full 38-row list):

```ts
// GET /api/regions/provinces
// Returns all 38 Indonesian provinces. Tenant-agnostic (global reference data).
// Auth: getSession() required (cycle Spec §2).
//
// Cycle: docs/cycles/2026-05-08-p2-addresses-idn-chain.md (T3)

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const rows = await prisma.province.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({
    items: rows.map((r) => ({ id: r.id, label: r.name })),
    hasMore: false,
  });
}
```

- [ ] **Step 2 — Author `regencies/route.ts`** (parent: provinceId):

```ts
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const querySchema = z.object({
  provinceId: z.string().regex(/^\d{2}$/, "invalid_province_id"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const provinceIdRaw = url.searchParams.get("provinceId");
  if (!provinceIdRaw) {
    return NextResponse.json({ error: "missing_parent_id", field: "provinceId" }, { status: 400 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues }, { status: 400 });
  }

  const { provinceId, page, pageSize } = parsed.data;
  const rows = await prisma.regency.findMany({
    where: { provinceId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: pageSize + 1,
    skip: (page - 1) * pageSize,
  });

  const hasMore = rows.length > pageSize;
  const trimmed = hasMore ? rows.slice(0, pageSize) : rows;
  return NextResponse.json({
    items: trimmed.map((r) => ({ id: r.id, label: r.name })),
    hasMore,
  });
}
```

- [ ] **Step 3 — Author `districts/route.ts`** (parent: regencyId, regex `/^\d{4}$/`).

- [ ] **Step 4 — Author `villages/route.ts`** (parent: districtId, regex `/^\d{6}$/`).

- [ ] **Step 5 — Author `__tests__/routes.test.ts`.** Uses Vitest `describe.each` to share assertion shape across regencies/districts/villages:

```ts
describe.each([
  { route: "regencies", parent: "provinceId", validParent: "31", invalidParent: "ZZ" },
  { route: "districts", parent: "regencyId",  validParent: "3171", invalidParent: "ZZZZ" },
  { route: "villages",  parent: "districtId", validParent: "317101", invalidParent: "ZZZZZZ" },
])("GET /api/regions/$route", ({ route, parent, validParent, invalidParent }) => {
  test("missing parent → 400", async () => { /* ... */ });
  test("orphan parent → 200 empty", async () => { /* ... */ });
  test("valid parent → children + pagination shape", async () => { /* ... */ });
  test("invalid-format parent → 400", async () => { /* ... */ });
});
describe("GET /api/regions/provinces", () => {
  test("returns full 38 rows", async () => { /* ... */ });
  test("unauthenticated → 401", async () => { /* ... */ });
});
```

- [ ] **Step 6 — Run gates.** `bash scripts/verify-api-auth.sh` 10/10 ✓ (was 6 → +4) + `npm run build` + `npx vitest run`.

- [ ] **Step 7 — Commit T3.**

```bash
git add app/api/regions/ docs/cycles/2026-05-08-p2-addresses-idn-chain.md
git commit -m "feat(p2-addresses-idn-chain): T3 region GET routes (4) + tests

provinces/regencies/districts/villages — getSession required (Spec §2)
orphan parent → 200 empty (Postel's law); missing required parent → 400
verify-api-auth 10/10 (was 6 +4)"
```

---

### T4 — Address server actions (create + update)

**Files:**
- Create: `lib/addresses/actions/create.ts`
- Create: `lib/addresses/actions/update.ts`
- Create: `lib/addresses/actions/__tests__/create.test.ts`
- Create: `lib/addresses/actions/__tests__/update.test.ts`

**Steps:**

- [ ] **Step 1 — Author `create.ts`** mirroring [updateHousehold pattern](lib/households/actions/update.ts):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/write";
import { prisma } from "@/lib/db";
import { schema as addressSchema } from "@/lib/entities/address/schema";
import { policy as addressPolicy } from "@/lib/entities/address/policy";
import { AuditAction, type Address } from "@/lib/generated/prisma/client";
import { assertScope, type ActionResult } from "@/lib/scaffold/server-action";

export async function createAddress(
  input: unknown,
): Promise<ActionResult<Address>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "UNAUTHENTICATED" };

  try {
    assertScope(session, addressPolicy, "create");
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "INVALID_INPUT",
      field: issue?.path.length ? issue.path.join(".") : undefined,
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.address.create({
      data: {
        ...parsed.data,
        tenantId: session.tenantId,
        createdById: session.userId,
        updatedById: session.userId,
      },
    });
    if (addressPolicy.auditActions.includes(AuditAction.CREATE)) {
      await writeAuditLog(
        {
          tenantId: session.tenantId,
          actorUserId: session.userId,
          action: AuditAction.CREATE,
          resource: addressPolicy.resource,
          resourceId: row.id,
          before: null,
          after: row as unknown as Record<string, unknown>,
        },
        tx,
      );
    }
    return row;
  });

  return { ok: true, data: created };
}
```

- [ ] **Step 2 — Author `update.ts`** mirroring [updateHousehold](lib/households/actions/update.ts) verbatim — partial PATCH, NO_CHANGES guard, before/after diff for audit. Key difference: chain-validity superRefine on PARTIAL still fires (Zod `.partial()` strips `superRefine` — workaround: gate the chain-validity refine inside the refine body to skip when fields absent, OR accept that partial updates SKIP chain check + rely on DB compound FK as the safety net). **Decision:** rely on DB compound FK for partial updates. The compound FK `(regencyId, provinceId) → Regency(id, provinceId)` enforces intra-record consistency at write — if a PATCH changes only `provinceId`, the existing `regencyId`'s composite FK lookup uses the NEW `provinceId` and the FK rejects unless `(old regencyId, new provinceId)` exists in `Regency`. **BPS code global uniqueness** (a regency code like `3171` exists under exactly one province by construction) makes this safe: there is no value of `provinceId` that "happens to match" an unrelated `regencyId`'s prefix while pointing to a different real province object. Same logic for District / Village partial updates. The DB compound FK is therefore the canonical hierarchy enforcement on partial paths; the app-layer Zod superRefine remains the user-friendly error-message path on full creates.

- [ ] **Step 3 — Author both test files.** Per AC6 — chain-validity rejection (regency outside province), role gates (admin/principal/kadiv/AO succeed; HT/SentraTeacher/FO/Parent FORBIDDEN), happy-path audit emit. Mirror existing [Household action test patterns](lib/households/actions/__tests__/).

- [ ] **Step 4 — Gates.** `npm run build` + `npx vitest run` — all green.

- [ ] **Step 5 — Commit T4.**

```bash
git add lib/addresses/ docs/cycles/2026-05-08-p2-addresses-idn-chain.md
git commit -m "feat(p2-addresses-idn-chain): T4 Address create+update server actions

assertScope per Address policy; chain-validity Zod refine (full only)
partial-update relies on DB compound FK (Spec §1 belt-and-braces)
CREATE+UPDATE audit emit"
```

---

### T5 — `<AddressChainField>` component + Household form wire-in

**Files:**
- Create: `components/forms/address-chain-field.tsx`
- Modify: `app/admin/akademik/keluarga/[id]/edit/page.tsx`
- Modify: `app/admin/akademik/keluarga/new/page.tsx`

**Steps:**

- [ ] **Step 1 — Author `address-chain-field.tsx`.** Client component (`"use client"`). Props: `initialValues?: Partial<AddressInput>`, `onSave: (values: AddressInput) => Promise<{ ok: true; addressId: string } | { ok: false; error: string }>`. State: 4 cascading select values + cached options Map. Renders 4 Shadcn `<Select>` + 5 `<Input>`/`<Textarea>` + Save button. On parent change: fire fetch via AC3 routes, populate child options, reset all downstream values + options. Loading spinner + error toast per [design-system.html §components/forms](.claude/standards/design-system.html). Indonesian labels per voice.md.

- [ ] **Step 2 — Wire into edit page.** Modify [app/admin/akademik/keluarga/[id]/edit/page.tsx](app/admin/akademik/keluarga/[id]/edit/page.tsx) to render `<AddressChainField>` above the existing scaffold form. Server-side: load Household + (if `addressId` present) Address row; pass to `<AddressChainField initialValues>`. Wrap both forms in a client component that handles the create-then-link flow:
  1. User fills chain → clicks Simpan in chain field → server action `createAddress` (or `updateAddress` if existing) returns `addressId`
  2. Page state updates `addressId`; Household form's `addressId` field is auto-populated
  3. User clicks main Simpan → `updateHousehold({ addressId, ... })`

- [ ] **Step 3 — Wire into new page.** Same pattern — but Address create + Household create are sequential.

- [ ] **Step 4 — Gates.** `npm run build` + `npx vitest run` + manual smoke via dev server.

- [ ] **Step 5 — Commit T5.**

```bash
git add components/forms/ app/admin/akademik/keluarga/ docs/cycles/2026-05-08-p2-addresses-idn-chain.md
git commit -m "feat(p2-addresses-idn-chain): T5 AddressChainField + Household wire-in

cascading Select × 4 (Provinsi → Kabupaten → Kecamatan → Kelurahan)
streetLine + rt + rw + postalCode + notes inputs
client-cache options Map per parent ID
Indonesian labels per voice.md
design-system §components/forms cascading-Select reference"
```

---

### T6 — Playwright extension + final gate

**Files:**
- Modify: `e2e/admin/students.spec.ts`
- Modify: `README.md` (modules table + routes count)

**Steps:**

- [ ] **Step 1 — Author Playwright block.** Append `test("keluarga edit fills address chain end-to-end")` to `e2e/admin/students.spec.ts`. Reuses admin demo-login fixture; navigates to first Household; opens edit; fills chain (Provinsi `DKI Jakarta` → Kota `Jakarta Pusat` → first Kecamatan → first Kelurahan); fills street + rt + rw; clicks Simpan; reloads; asserts all 7 values display.

- [ ] **Step 2 — Update README.** Modules table — add Address row (`address` module under Akademik). Routes count: bump API route count to 132 (was 128 + 4 new region routes). NO new ADR row (this is a routine entity cycle, not an architecture decision per CLAUDE.md doc-maintenance authority split).

- [ ] **Step 3 — Run end-of-cycle gate.**

```bash
npm run build && npx vitest run && npx playwright test
bash scripts/verify-rls-coverage.sh
bash scripts/verify-api-auth.sh
bash scripts/verify-pii-annotations.sh
npm run scaffold:check
```

All green required.

- [ ] **Step 4 — feature-dev:code-reviewer pass on full diff.** Spec-time 19-cycle streak continues. Specifically scrutinize:
  - Composite-FK Prisma vs DB pattern correctness (single-column Prisma + compound DB, mirroring scaffold.md §6 split-view precedent)
  - Chain-validity at app-layer vs DB CHECK trade-off explicit
  - Region routes pagination + orphan-parent posture (200 + empty list, not 400)
  - Frontend-gate compliance — Verification contains `design-system` token

- [ ] **Step 5 — Fill Verification section** (gate output paste; manual smoke notes; design-system cross-ref).

- [ ] **Step 6 — Commit T6 + final.**

```bash
git add e2e/ README.md docs/cycles/2026-05-08-p2-addresses-idn-chain.md
git commit -m "feat(p2-addresses-idn-chain): T6 Playwright + README + final gate

keluarga edit chain-fill end-to-end smoke
README: modules +Address, API routes 128 → 132
all gates green: build, vitest, playwright, rls 33/33, api-auth 10/10"
```

## Implementation

### T1 — Migration 10 + Address Prisma model

**Files touched:**
- `prisma/schema.prisma` — Added `addresses Address[]` reverse relation on `Province`, `Regency`, `District`, `Village`; added `@@unique([id, provinceId])` on `Regency`, `@@unique([id, regencyId])` on `District`, `@@unique([id, districtId])` on `Village`; inserted full `Address` model after `Village` block; added `addresses Address[]` to `Tenant` relation list; updated `Household` header comment (removed deferred-FK marker); added `address Address?` single-column relation on `Household`.
- `prisma/migrations/10_addresses/migration.sql` — Hand-written (shadow-DB `storage` schema issue blocks `migrate dev --create-only`, consistent with prior cycles e.g. `2026-05-01-student-journal-cross-actor-audit`). Full SQL: Region composite-unique indexes (`Regency_id_provinceId_key`, `District_id_regencyId_key`, `Village_id_districtId_key`); `CREATE TABLE "Address"` with LENGTH CHECKs; `Address_id_tenantId_key` composite unique; lookup indexes; compound FKs (`Address_tenantId_fkey` Restrict, `Address_provinceId_fkey` Restrict, `Address_regencyId_provinceId_fkey` compound Restrict, `Address_districtId_regencyId_fkey` compound Restrict, `Address_villageId_districtId_fkey` compound Restrict); `Household_addressId_tenantId_fkey` compound with column-list `SET NULL ("addressId")`; RLS block (`ENABLE + REVOKE ALL + GRANT SELECT + tenant_isolation_select + no_writes_via_postgrest`).
- Applied via `npx prisma migrate deploy` (shadow-DB workaround per project precedent).
- `npx prisma generate` — Address types regenerated in `lib/generated/prisma`.

**Gates (T1):**
- `bash scripts/verify-rls-coverage.sh` → `✓ RLS coverage OK: 33 / 33 tenant-scoped models have ENABLE + policy.`
- `npm run build` → TS clean, Next.js 16 build succeeded (19 pages).
- `npx vitest run` → `Test Files 54 passed | 1 skipped (55) / Tests 1070 passed | 4 skipped (1074)` in 8.52s.

**T1 reviewer follow-up (commit 2):**
- `feature-dev:code-reviewer` flagged `Address_villageId_districtId_idx` as nullable-leading column → flipped to `Address_districtId_villageId_idx` `(districtId, villageId)`. Non-null leading; supports "filter by district" forward queries; no NULL-row index bloat. Schema + migration SQL both updated. Dev DB stale (Prisma blocks AI-invoked `migrate reset`); CI fresh-clone applies the corrected migration.
- Reviewer second flag (Household drift-trap warning comment) — verified already present at `prisma/schema.prisma:1073-1078`. No-op.
- Re-ran gates: build clean, vitest 1070 passed | 4 skipped, verify-rls 33/33.

### T2 — Address entity registry

**Files touched:**
- `lib/entities/address/schema.ts` — Created. `addressSchema` Zod object with BPS-code regex per field + `superRefine` chain-validity (prefix-check per Spec §1). Exports `schema` alias + default for scaffold-check static guard.
- `lib/entities/address/policy.ts` — Created. `addressPolicy`: `softDelete: true`; `auditActions: [CREATE, UPDATE, SOFT_DELETE, RESTORE]`; scopes: A/P/KD/AO ALL create+update+read; A/P ALL soft_delete+restore; `delete: []`; `fileKindAllowlist: {}` (no upload affordance). Exports `addressPolicy` + `policy` alias + default.

  **Reviewer follow-up (commit 2):** AO added to `read` scope (was A/P/KD only) — reviewer flagged the operational inconsistency (AO writes Address but couldn't list/detail). Mirrors Household.read which grants AO ALL. Schema's `superRefine` updated with length pre-guards to skip chain check when upstream regex already failed (avoids stacking misleading prefix-mismatch errors on top of `invalid_*_code` errors). Test added asserting AO read grant.
- `lib/entities/address/entity.ts` — Created. `EntityDef<Address>`: key `address`, label `Alamat`, icon `MapPin`, resource `Address`, `searchFields: ["streetLine", "notes"]` (no PII). dataFetcher: tenant-scoped, `deletedAt: null` soft-delete-aware `prisma.address.findMany`. 4 listColumns (streetLine, districtId, postalCode, notes). 1 filter (SEARCH — under-floor deviation documented inline). 1 detailTab (ringkasan, deferred). `detailActions: []`. Exports `entity` alias + default.
- `lib/entities/_registry.ts` — Added `addressPolicy` import + `[addressPolicy.resource]: addressPolicy` entry. Registry: 5 → 6 entries.
- `lib/entities/index.ts` — Added address re-exports (named: `addressEntity`, `addressPolicy`, `addressSchema`, `AddressInput`). Added `addressEntityDefault` + `addressPolicyValue` to `ALL_ENTITIES` + `ALL_POLICIES` aggregates.
- `lib/entities/address/__tests__/policy.test.ts` — Created. 20 test cases: registry membership, core fields (resource/softDelete/auditActions), scope grants per role (admin/principal/kadiv/AO on create+update; A/P/KD on read; A/P on soft_delete+restore; HT/sentra_teacher/finance_officer/parent absent from read), fileKindAllowlist empty `{}`.
- `lib/entities/__tests__/address.entity.test.ts` — Created. Schema tests (chain-validity superRefine, field-length guards, BPS-code prefix rejection). EntityDef shape tests (key/resource/label/icon/filters/detailActions/tabs/formSections). dataFetcher tests (mock prisma: asserts `where.tenantId === session.tenantId` + `deletedAt: null`; throws UNAUTHENTICATED when no session).

**Gates (T2):**
- `npm run scaffold:check` → `scaffold-check: 6 entities validated.` (was 5/5 → 6/6 +1 Address)
- `npm run build` → `✓ Compiled successfully in 4.5s` / `Finished TypeScript in 6.1s` — TS clean, 19 pages.
- `npx vitest run` → `Test Files 56 passed | 1 skipped (57) / Tests 1122 passed | 4 skipped (1126)` in 8.60s (+52 tests from policy.test.ts + address.entity.test.ts + schema cases).

### T3 — Per-level region GET routes

**Files touched:**
- `app/api/regions/provinces/route.ts` — Created. `GET()` with no params: `getSession()` auth guard, `prisma.province.findMany({ orderBy: { name: "asc" }, select: { id, name } })`, returns `{ items: [{id, label}], hasMore: false }`. No Zod parsing (provinces route is unbounded; `?pageSize` query params silently ignored per T3 Step 5 behavioral note).
- `app/api/regions/regencies/route.ts` — Created. `GET(req: NextRequest)`: `getSession()` auth guard; explicit `provinceId` presence check → 400 `missing_parent_id`; Zod `querySchema` with `provinceId: /^\d{2}$/`, `page` (default 1), `pageSize` (default 50, max 200); orphan parent → 200 empty (Postel's law); pagination via `take: pageSize+1` + trim + `hasMore` flag.
- `app/api/regions/districts/route.ts` — Created. Mirrors regencies verbatim with `regencyId: /^\d{4}$/`, `district.findMany({ where: { regencyId } })`.
- `app/api/regions/villages/route.ts` — Created. Mirrors regencies verbatim with `districtId: /^\d{6}$/`, `village.findMany({ where: { districtId } })`.
- `app/api/regions/__tests__/routes.test.ts` — Created. Single combined file: `vi.mock("@/lib/auth/session")` + `vi.mock("@/lib/db")` with per-model `findMany` mocks. `describe.each` over regencies/districts/villages covering: 401 unauth, 400 missing parent, 400 invalid format, 200 orphan empty, 200 valid with `{id, label}` items + `hasMore` shape, `hasMore=true` trim, default pagination args, `where` clause forwarding, `orderBy: {name: asc}`. Provinces `describe`: 401, full list with `hasMore: false`, column projection, name→label mapping, `?pageSize` silently ignored (documented behavior).

**Gates (T3):**
- `bash scripts/verify-api-auth.sh` → `✓ API auth coverage OK: 10 / 10 routes have session helper or @public sentinel.` (was 6 → +4)
- `npm run build` → `✓ Compiled successfully in 4.3s` / `Finished TypeScript in 6.0s` — TS clean, 23 pages (4 new region routes).
- `npx vitest run` → `Test Files 57 passed | 1 skipped (58) / Tests 1156 passed | 4 skipped (1160)` in 8.92s (+1 file, +34 tests from routes.test.ts).

## Verification

> Filled by /build after end-of-cycle gate. Includes:
> - `npm run build` output
> - `npx vitest run` summary (count + duration)
> - `npx playwright test` summary
> - `bash scripts/verify-rls-coverage.sh` output
> - `bash scripts/verify-api-auth.sh` output
> - `bash scripts/verify-pii-annotations.sh` output (5/5 unchanged)
> - `npm run scaffold:check` (6/6)
> - Manual smoke note: chain-fill end-to-end via dev server
> - **Cross-checked design-system.html §components/forms cascading-Select pattern** for `<AddressChainField>` — frontend-gate token

## Ship Notes

> Filled by /ship.
> - Migration: `10_addresses` — `prisma migrate deploy` runs in prod deploy step (no manual intervention; CI gate).
> - Env vars: none new.
> - Backfill: none — `Address` table starts empty; existing `Household.addressId` rows (currently zero per fresh DB) remain NULL.
> - Rollback: `npx prisma migrate reset` not safe in prod; manual `DROP TABLE "Address" CASCADE` + revert `Household.addressId` FK + revert Region composite uniques.
> - §18A row flip: `next` → `shipped` per /ship Step 3.
