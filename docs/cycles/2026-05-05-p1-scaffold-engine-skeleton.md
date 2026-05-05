# p1-scaffold-engine-skeleton — scaffold core (`lib/scaffold/*`)

## Context

Phase 1 cycle 6 of the v2 rebuild per foundation spec §18.1. Schema/seeds/RLS/audit foundation now live (migrations 00-09 + 16, seeds 00-07, RLS 25/25, redactor generator + CI gate). This cycle ships the **scaffold engine skeleton** (`lib/scaffold/*`) that every subsequent admin/teacher/parent surface will mount: locale formatters (§5.9), field-renderer registry (§5.5), entity-registry types (§5.10), permission resolver with materialized ID Sets + 5-min LRU cache (§4.2 + §6.4 + §6.5), three page-component shells (§5.2 + §5.4 + §5.7 + §5.8), override-hatch helper (§5.3), scaffold-check CLI (§18.7) + reference fixture entity.

**Cycle-decomposition refinement (§18.1).** Spec §18.1 lumps this cycle with three deferrals from cycle 5 (AuditLog write middleware, `/api/upload` + sharp pipeline, timeline event registry). Combined surface ~30+ files / 5+ days, blowing past §18.2 size cap (≤ 2 days, ≤ 25 staged files). Per cycle 5's precedent of overriding §18.2's single-migration-per-cycle cap when justified, we explicitly **split** the §18.1 nominal single cycle. This cycle covers **scaffold core only** (formatters, registry types, permission resolver, page shells, override hatch, scaffold-check CLI, fixture, single placeholder TEXT renderer for contract-test integrity). Deferrals:

- `p1-scaffold-renderers` — 14 remaining renderer impls (`lib/scaffold/renderers/<kind>.tsx`, ≤ 60 lines each per §5.1). Subagent-parallel dispatch friendly. Carved off this cycle after a code-reviewer pass (2026-05-05) showed the 15-renderer fan-out alone would carry the staged-file count past the §18.2 cap of 25. Splitting renderers off keeps both cycles reviewable and preserves the §5.5 fixed-registry contract — this cycle's `field-renderer.ts` declares all 15 `FieldDef` kinds; `scaffold-check` enforces "every kind in registry has a matching renderer file before any entity references it"; until then the placeholder TEXT renderer + skipped-kind guard let downstream code typecheck against the full registry.
- `p1-audit-write-middleware` — audit middleware + live-DB append-only trigger integrity test + `audit-pii.md` standards file.
- `p1-upload-route-sharp` — `/api/upload` + sharp dep + image pipeline.
- `p1-timeline-registry` — timeline event registry + per-kind Zod payloads + SOFT_DELETE/RESTORE hooks.

Each downstream cycle cleanly fits the §18.2 cap and reviews independently. §18.1 nominal single cycle becomes 5 cycles. Decision recorded here per §18.1 cycle-decomposition convention. Code-reviewer report attached in cycle Verification at end of cycle.

**Marathon mode** (spec §18.12). Skip `superpowers:brainstorming` — request derives from spec. Use `superpowers:writing-plans` lightly to derive ordered tasks from spec §5.1-§5.13 + §6.4 + §6.5 + §18.1 + §18.7.

## Spec

### Acceptance criteria

- [ ] `lib/scaffold/format.ts` exports `fmt.{date, dateTime, currency, number, phone, hijri, relativeTime}` per §5.9. `id-ID` locale, `Asia/Jakarta` tz, IDR currency. Hijri via `Intl.DateTimeFormat(..., { calendar: 'islamic' })`. Phone normalizer handles `+62` / leading-`0` / spaces. ~30 unit tests covering each formatter + edge cases (null/undefined input, invalid date, fractional currency, large numbers).
- [ ] `lib/scaffold/entity.ts` defines `EntityDef<T>`, `ListColumnDef`, `FilterDef`, `ViewDef`, `DetailActionDef` per §5.4 + §5.10. No actual entity definitions ship.
- [ ] `lib/scaffold/field-renderer.ts` exports a fixed-key registry + discriminated-union `FieldDef` type covering 15 renderer kinds (TEXT, TEXTAREA, NUMBER, DECIMAL, CURRENCY, DATE, DATETIME, BOOLEAN, SELECT, MULTISELECT, EMAIL, PHONE, RELATION, FILE, ENUM) per §5.5. Note: spec §5.5 prose says "Fixed 14" but enumerates 15 names — going with 15 (ENUM treated as distinct from SELECT per spec §4.5 enum-as-Postgres-native pattern). Spec correction recorded in Ship Notes for next docs cycle.
- [ ] `lib/scaffold/renderers/text.tsx` — single placeholder TEXT renderer this cycle ≤ 60 lines per §5.1, server-component-first, Shadcn-FIRST per `.claude/standards/ui.md`, RHF integration via `field: ControllerRenderProps` prop. Remaining 14 renderers ship in `p1-scaffold-renderers` follow-up. `scaffold-check` enforces "every renderer referenced by an `EntityDef` must exist in the registry" — downstream entity authors gated until renderer cycle lands.
- [ ] `lib/scaffold/permission.ts` exports `resolvePermissions(userId, currentTermId)` returning `{ studentIds, classIds, sessionIds, campusIds, programIds, all }` materialized ID Sets per §4.2 + §6.4. 5-min LRU cache keyed by `(userId, currentTermId)`. 5000-row cap fallback to JOIN-subquery hint. JWT claim read mirrors `current_setting('request.jwt.claims', true)::json->>'tenant_id'` RLS pattern. ~40 unit tests covering each scope + cache hit/miss + cap fallback + JWT-missing edge case.
- [ ] `lib/scaffold/list-page.tsx`, `lib/scaffold/form-page.tsx`, `lib/scaffold/detail-page.tsx` shells with mandatory empty/loading/error states per §5.7 + mobile responsive per §5.8 (DataTable → card-stack `<md`; 1-col form mobile). All accept `entity: EntityDef<E>` prop and delegate to the renderer registry. Page anatomy per §5.4 (List: Breadcrumbs → Header → Filter chips → DataTable → Bulk action bar; Form: Breadcrumbs → Header → Sections → Footer; Detail: Breadcrumbs → Header → Tabs Ringkasan/Wali/Riwayat/Lampiran/Aktivitas).
- [ ] `lib/scaffold/action.ts` exports `defineAction({ ... })` factory returning typed `DetailActionDef` per §5.3 override-hatch contract.
- [ ] `lib/scaffold/index.ts` re-exports the public surface (`ScaffoldListPage`, `ScaffoldFormPage`, `ScaffoldDetailPage`, `defineAction`, `fmt`, `EntityDef`, `FieldDef`, `resolvePermissions`).
- [ ] `lib/entities/__fixtures__/example-entity.ts` reference fixture demonstrates the `EntityDef` contract for downstream cycle authors. Excluded from `scaffold-check`.
- [ ] `scripts/scaffold-check.ts` CLI **statically validates** `lib/entities/<entity>/{schema,entity,policy}.ts` (excluding `__fixtures__`) via regex/source-text scan — NO runtime evaluation of entity files. Matches `verify-pii-annotations.sh` precedent. Validates: required exports present (`schema`, `entity`, `policy` named exports), policy scope literals are valid `PermissionScope` enum members, every `kind` referenced in `entity` source matches a key in `field-renderer.ts` registry constant. Exits 0 when registry empty (greenfield) or fixture-only. Wired as `npm run scaffold:check`.
- [ ] `package.json` adds `react-hook-form` + `@hookform/resolvers` deps + `scaffold:check` npm script.
- [ ] CI gate (`.github/workflows/ci.yml`) runs `npm run scaffold:check` after `verify-pii-annotations.sh`.
- [ ] Verification gates green: `npx prisma generate`, `npm run build`, `npx vitest run` (~80-120 new cases), `bash scripts/verify-rls-coverage.sh` (25/25), `bash scripts/verify-api-auth.sh` (2/2), `bash scripts/verify-pii-annotations.sh` (2/2), `npm run scaffold:check` exits 0. Playwright skipped per CLAUDE.md schema/scaffold-cycle exception (`--pass-with-no-tests`) — no UI route added; scaffold pages library-only until p2 mounts them.
- [ ] Cycle doc all 6 sections filled. README ADR row + minimal CLAUDE.md update for scaffold engine skeleton. Ship Notes record scaffold-extension contract, override-hatch usage example, permission resolver cache invalidation strategy, deferred items with forward-cycle references.

### Non-goals

- **AuditLog write middleware** (`lib/audit/write.ts` consuming `lib/audit/redactor.ts`) → `p1-audit-write-middleware`.
- **`/api/upload` route + sharp compression pipeline + sharp dep install** → `p1-upload-route-sharp`.
- **Timeline event registry** (`lib/timeline/events.ts` + per-kind Zod payloads + AuditLog SOFT_DELETE/RESTORE hooks on TimelineEvent) → `p1-timeline-registry`.
- **Live-DB integrity test for AuditLog append-only trigger** → `p1-audit-write-middleware` (needs write path to populate a partition).
- **pg-boss queue setup** (PDF compose, async export) → `p3-fee-foundation` / `p6-raport-pdf-pipeline`.
- **Resend / Xendit webhook handlers** → `p3-xendit-port-and-regen`.
- **Standards files** `audit-pii.md` → `p1-audit-write-middleware`. `scaffold.md` / `entity-registry.md` / `permission-scope.md` → defer per-cycle as conventions shake out. Locked in code via field-renderer registry + scaffold-check CLI this cycle.
- **Per-domain entity definitions** (Student, Employee, etc.) → Phase 2+. Reference fixture demonstrates contract only.
- **Standalone visual diff via Playwright** per §18.2 scaffold-cycle row — pages library-only until p2 mounts; defer fixture mount + visual diff to `p2-students-guardians-household`.
- **Bulk action helper** (`lib/scaffold/bulk-action.ts`, ~150 LOC per §5.12) — `defineBulkAction()` shape lands in p2 alongside first list page that needs it.
- **Export modal helper** (§5.11) → `p3-fee-foundation` (first list with significant export volume).

### Assumptions

1. **`react-hook-form@7.75` + `@hookform/resolvers@5.2`** are acceptable additions to `package.json`. RHF locked in spec §5.4 ("Sections (RHF-driven)"). Compatibility verified via `npm view`: RHF 7.75 peerDeps include `react ^19`; resolvers v5.x adopts Standard Schema spec, Zod v4 native (no shim needed). Code-reviewer flagged this as a Zod-v4-incompat blocker based on outdated knowledge of resolvers v3.x — refuted by current registry data.
2. **Permission resolver** initial implementation reads from `UserRole` + `RolePermission` + `Permission` joined live; no precomputed materialized view this cycle. JWT-claim read pattern mirrors RLS use of `current_setting('request.jwt.claims', true)::json->>'tenant_id'`. Scope-to-ID-set translation for `OWN_CAMPUS`/`OWN_PROGRAM`/`OWN_CLASS`/`OWN_SESSION`/`OWN_STUDENT`/`SELF` queries `Employee` + `EmployeeCampusAssignment` + `TeachingDefault` + `SessionTeacher` (all live in schema). Zero query for `ALL`. `OWN_STUDENT` returns empty Set until `p2` ships `Student` model — emits a `console.warn` at first encounter per scope (not `debug`) so p2 integration testing surfaces missing-Student wiring loudly. Cap fallback path tested with synthetic seed.
3. **5-min LRU cache** — in-memory `Map`-based with TTL eviction (no Redis / pg-boss this cycle; spec §4.2 says "in-memory 5 min"). Single-process correctness only — multi-instance staleness acceptable for MVP. Cache invalidation on role mutations deferred to per-feature when first role-management UI lands.
4. **5000-row cap** — when resolved ID set exceeds 5000, resolver returns `{ overflow: true, scopeQueryHint: 'JOIN' }` instead of materialized list. Caller (scaffold list page) must fall back to JOIN subquery against the source table. This cycle wires the contract; the JOIN-subquery code path is exercised by a synthetic-overflow test only (no real entity has >5000 rows yet).
5. **Page shells are server-component-first**. Forms are client components (`'use client'`) due to RHF. Detail header workflow buttons can be client islands. List page DataTable is client-bordered (TanStack Table) but page shell itself is server. Data fetching delegated to caller via `entity.dataFetcher` prop + Promise — scaffold page never imports Prisma directly.
6. **scaffold-check CLI** is **static-only** — reads entity source files as text via `fs.readFileSync` + regex/string scan; never `require()` / `import()` them. Mirrors `verify-pii-annotations.sh` precedent (greps schema.prisma source). Avoids the side-effect-during-validation hazard the code-reviewer flagged (an entity file calling `prisma.$connect()` at module scope would hang CI). Tradeoff: cannot resolve type-level guarantees. That's fine — type guarantees are `tsc`'s job; scaffold-check enforces structural conventions only (file presence, named exports, scope-literal whitelist, renderer-kind whitelist). Exits 0 cleanly on greenfield (zero entities) and when only `__fixtures__/` present.
7. **Frontend gate** — `lib/scaffold/*.tsx` paths are NOT in pre-commit Rule 4's frontend-gate path glob (`app/**/*.{tsx,css}`, `components/**/*.tsx`, `tailwind.config.*`). Per user-provided required-reading note #6, include `design-system` literal token in Verification anyway as a precaution + because scaffold consumes the design system. If gate doesn't fire, no harm.
8. **Voice.md gate** — same path-glob analysis: `lib/scaffold/*.tsx` not in voice.md trigger path. Empty-state copy uses Indonesian per spec lock (e.g. "Belum ada data" / "Coba ulangi pencarian" / "Gagal memuat data — Coba lagi"). Cross-checked against existing `components/ui/empty-state.tsx` patterns.
9. **Schema-cycle Playwright exception** — applies. Recorded in Verification.
10. **Disk pressure** (85% / 31Gi avail at cycle start). Merged `p1-audit-timeline-files` worktree freed via `cleanup-merged.sh --yes`. Other inflight worktrees skipped (other sessions). Re-monitor at end-of-cycle.

## Tasks

Ordered. Annotations: **[parallel]** = subagent-friendly (independent input/output files), **[sequential]** = depends on prior task output.

- [x] **T1 — `lib/scaffold/format.ts` + tests** [sequential, foundational]
  - Implement `fmt.{date, dateTime, currency, number, phone, hijri, relativeTime}` with `id-ID` locale + `Asia/Jakarta` tz. Pure functions, no React.
  - Write `lib/scaffold/__tests__/format.test.ts` covering ~30 cases (each formatter golden output, null/undefined input, invalid date, +62/leading-0/spaced phone, IDR currency formatting, large-number grouping, Hijri month name, relative-time within day / weeks / months / years).
  - Acceptance: `npx vitest run lib/scaffold/__tests__/format.test.ts` green.

- [x] **T2 — `lib/scaffold/entity.ts` types** [sequential, foundational]
  - Define `EntityDef<T>`, `ListColumnDef<T>`, `FilterDef<T>`, `ViewDef<T>`, `DetailActionDef<T>`, `DataFetcher<T>` types per §5.4 + §5.10.
  - No runtime code; pure type module.
  - Acceptance: `npx tsc --noEmit` green.

- [ ] **T3 — `lib/scaffold/field-renderer.ts` registry + 1 placeholder TEXT renderer** [sequential]
  - Define discriminated-union `FieldDef` (15 kinds: TEXT, TEXTAREA, NUMBER, DECIMAL, CURRENCY, DATE, DATETIME, BOOLEAN, SELECT, MULTISELECT, EMAIL, PHONE, RELATION, FILE, ENUM) + `FieldRendererRegistry` mapping kind → component (Partial — full population happens in `p1-scaffold-renderers`).
  - Implement `lib/scaffold/renderers/text.tsx` ≤ 60 lines. Server-component-first; Shadcn `Input` from `components/ui/input.tsx`. RHF prop integration: accepts `{ field: ControllerRenderProps, def: FieldDef & { kind: 'TEXT' } }`.
  - Registry getter: `getRenderer(kind)` returns the renderer or throws `MissingRendererError` (caught by page shells + scaffold-check).
  - Other 14 renderers — explicitly deferred to `p1-scaffold-renderers`; subagent-parallel dispatch friendly there.
  - Write `lib/scaffold/__tests__/field-renderer.test.ts` covering: `FieldDef` discriminated-union exhaustiveness (TS-level, ts-expect-error guards); registry integrity (every key in registry is a valid `FieldDef.kind`); `getRenderer('TEXT')` returns component; `getRenderer('NUMBER')` throws `MissingRendererError`; placeholder TEXT renderer smoke (renders without throw).
  - Acceptance: `npm run build` green; vitest registry tests green.

- [ ] **T4 — `lib/scaffold/permission.ts` + tests** [sequential — single file, ordered tests]
  - Implement `resolvePermissions(userId, currentTermId)` returning `{ all: boolean, campusIds: Set<string>, programIds: Set<string>, classIds: Set<string>, sessionIds: Set<string>, studentIds: Set<string>, overflow: boolean }`.
  - Per-scope query: `ALL` → short-circuit; `OWN_CAMPUS` → `EmployeeCampusAssignment` join; `OWN_PROGRAM` → derived from `ClassSection.programId` via assigned campuses; `OWN_CLASS` → `TeachingDefault` + `SentraRotation`; `OWN_SESSION` → `SessionTeacher`; `OWN_STUDENT` → empty until p2 (return empty Set + log debug); `SELF` → `userId` only on `User`-keyed resources.
  - 5-min LRU cache: `Map<cacheKey, { value, expiresAt }>`; cacheKey = `${userId}|${currentTermId}`. Eviction on get-after-expire.
  - 5000-row cap: count before materialization; if > 5000 → return `{ overflow: true, ...empty Sets }` and caller falls back to JOIN-hint.
  - JWT claim read: helper `getJwtTenantId()` mirrors RLS pattern.
  - Write `lib/scaffold/__tests__/permission.test.ts` covering ~40 cases: per-scope happy path (7 scopes), cache hit/miss/expire (3), 5000-cap fallback (synthetic), empty result, JWT-missing error, multi-scope merge, term boundary (current vs other term), tenant isolation.
  - Acceptance: `npx vitest run lib/scaffold/__tests__/permission.test.ts` green.

- [ ] **T5 — Page shells: `list-page.tsx` + `form-page.tsx` + `detail-page.tsx`** [sequential — share types from T2/T3]
  - `ScaffoldListPage<E>`: Breadcrumbs → Header → Filter chips → DataTable (TanStack Table, page size 25, action col) → Bulk action bar (on selection). Empty/loading/error states per §5.7. Card-stack `<md` per §5.8.
  - `ScaffoldFormPage<E>`: Breadcrumbs → Header → RHF sections (auto-rendered from `entity.formSections[]` via field renderer) → Footer (Cancel + Save). 1-col mobile / 2-col `md+`.
  - `ScaffoldDetailPage<E>`: Breadcrumbs → Header (avatar + status badge + workflow actions from `entity.detailActions[]`) → Tabs (Ringkasan / Wali / Riwayat / Lampiran / Aktivitas).
  - Indonesian copy: empty = "Belum ada data" + CTA; filtered-out = "Tidak ada hasil — coba ubah filter"; error = "Gagal memuat data" + Coba lagi button.
  - Write `lib/scaffold/__tests__/page-contract.test.ts` covering: list page renders empty state + skeleton + error state; form page wires RHF resolver; detail page tab structure matches spec.
  - Acceptance: `npm run build` green; vitest contract tests green.

- [ ] **T6 — `lib/scaffold/action.ts` `defineAction()` helper** [sequential — uses T2 types]
  - `defineAction<E, Args>({ key, label, icon, scope, confirm?, onClick })` factory returns typed `DetailActionDef<E>`. Permission/audit/toast wiring is contract-stub this cycle (real wiring in `p1-audit-write-middleware` once write middleware exists).
  - Smoke test in `page-contract.test.ts`: `defineAction({...})` returns expected shape.
  - Acceptance: `tsc --noEmit` green.

- [ ] **T7 — `lib/scaffold/index.ts` public surface** [sequential, depends T1-T6]
  - Re-export `ScaffoldListPage`, `ScaffoldFormPage`, `ScaffoldDetailPage`, `defineAction`, `fmt`, `EntityDef`, `FieldDef`, `resolvePermissions`. No runtime side-effects.

- [ ] **T8 — Reference fixture `lib/entities/__fixtures__/example-entity.ts`** [parallel with T7]
  - Demo `EntityDef` for an imaginary `ExampleResource` covering ~5 fields (1 of each major renderer kind), 2 list columns, 1 chip filter, 1 view, 1 detail action via `defineAction`. Includes Zod schema. Used by downstream cycle authors as copy-target.

- [ ] **T9 — `scripts/scaffold-check.ts` + npm script + CI wire** [parallel with T8 — own input/output paths]
  - Walk `lib/entities/*/` (skip `__fixtures__`). For each entity dir: require `schema.ts` + `entity.ts` + `policy.ts` files exist; **read source as text** (no runtime `import()`); regex-assert: `export const schema =`, `export const entity =`, `export const policy =`; regex-extract `kind: '<KIND>'` literals from entity source and assert each is a known `FieldDef` discriminator; regex-extract scope literals from policy source and assert each is a `PermissionScope` enum member.
  - The known-kind set + known-scope set are derived from `lib/scaffold/field-renderer.ts` source + `prisma/schema.prisma` `enum PermissionScope` block respectively, both read statically.
  - Exit 0 on zero entities (greenfield), zero on fixture-only. Exit 1 with descriptive error on any structural violation.
  - `package.json` script: `"scaffold:check": "tsx scripts/scaffold-check.ts"` (tsx invokes the script itself only — entity files are read as text, never imported).
  - `.github/workflows/ci.yml`: add step `npm run scaffold:check` after `verify-pii-annotations.sh`.
  - Acceptance: `npm run scaffold:check` exits 0; CI green.

- [ ] **T10 — Add deps + README ADR row** [sequential, last before final gate]
  - `npm install --save react-hook-form@^7.75.0 @hookform/resolvers@^5.2.0` (lockfile + `package.json`). Compat verified upfront (Assumption #1 — RHF 7.75 peerDeps allow React 19, resolvers 5.x adopts Standard Schema for Zod v4 native support).
  - README ADR row: "Scaffold engine skeleton — `lib/scaffold/*` package with locale formatters, field-renderer registry, permission resolver, page shells, override hatch, scaffold-check CLI" + link to this cycle doc.
  - CLAUDE.md intentionally NOT updated — workflow / hooks / standards listing unchanged this cycle.
  - Acceptance: pre-commit hooks green; commit-msg narrow doc-sync rule (`feat:` + `lib/**` requires README staged) satisfied.

- [ ] **T11 — End-of-cycle gate + cycle doc Verification + Ship Notes** [sequential, final]
  - Run: `npx prisma generate`, `npm run build`, `npx vitest run`, `bash scripts/verify-rls-coverage.sh`, `bash scripts/verify-api-auth.sh`, `bash scripts/verify-pii-annotations.sh`, `npm run scaffold:check`. Playwright skipped via `--pass-with-no-tests` per CLAUDE.md schema/scaffold-cycle exception — record skip + reason in Verification.
  - Request `feature-dev:code-reviewer` review per CLAUDE.md `/build` end-of-cycle rule.
  - Fill Implementation + Verification + Ship Notes. Cross-check `design-system.html` reference in Verification per assumption #7.

### Dependencies / parallelism plan

```
T1 (format) ──────────┐
T2 (entity types) ────┤
                      ├──> T3 (registry + TEXT placeholder) ──┐
                      │                                        ├──> T5 (page shells)
                      └──> T4 (permission resolver)            │
                                                               ├──> T6 (action helper)
                                                               │
                                                               └──> T7 (index re-exports)
                                                                     │
                       T8 (fixture entity) ──┐                       │
                       T9 (scaffold-check)   ├──> T10 (deps+docs) ──┴──> T11 (final gate)
```

All sequential this cycle. Subagent-parallel dispatch was originally planned for T3 (15 renderers) but moves to the follow-up `p1-scaffold-renderers` cycle where it natively fits (14 independent files, single shared registry input). Per `superpowers:subagent-driven-development`, dispatch only when input/output is truly independent — that condition holds for renderers but not for any task in this cycle.

### File count budget (§18.2 compliance)

| Bucket | Files |
|---|---|
| `lib/scaffold/format.ts` + `entity.ts` + `field-renderer.ts` + `permission.ts` + `action.ts` + `index.ts` | 6 |
| `lib/scaffold/renderers/text.tsx` (placeholder) | 1 |
| `lib/scaffold/list-page.tsx` + `form-page.tsx` + `detail-page.tsx` | 3 |
| `lib/scaffold/__tests__/{format,field-renderer,permission,page-contract}.test.ts` | 4 |
| `lib/entities/__fixtures__/example-entity.ts` | 1 |
| `scripts/scaffold-check.ts` | 1 |
| `docs/cycles/2026-05-05-p1-scaffold-engine-skeleton.md` | 1 |
| `README.md` (ADR row) | 1 |
| `package.json` + `package-lock.json` | 2 |
| `.github/workflows/ci.yml` (scaffold-check step) | 1 |
| **Total** | **21** |

Under §18.2 cap of 25. CLAUDE.md update intentionally **not** staged this cycle — workflow / hooks / standards listing unchanged; CLAUDE.md owns those per its docs-maintenance contract. The scaffold engine ADR row in README.md is the canonical surfacing.

## Implementation

- Subagent plan: all tasks sequential this cycle. Subagent-parallel dispatch deferred to `p1-scaffold-renderers` follow-up where 14 independent renderer files natively fit `superpowers:subagent-driven-development`.
- T1 — locale formatters — `lib/scaffold/format.ts` + `lib/scaffold/__tests__/format.test.ts` — `fmt.{date,dateTime,currency,number,phone,hijri,relativeTime}` per spec §5.9 with `id-ID` locale + `Asia/Jakarta` tz + IDR currency. NBSP normalization (`U+00A0` + `U+202F`) applied to currency output for ICU-72-stable assertions. Reviewer flagged 2 blockers (`U+202F` missing in normSpace, Hijri "H" suffix mismatch); both refuted by empirical evidence — `xxd` dump showed normSpace already covers both code points; Indonesian Umm al-Qura `Intl.DateTimeFormat` emits "H" suffix natively. 41/41 tests green.
- T2 — entity registry types — `lib/scaffold/entity.ts` — `EntityDef<T>` + `ListColumnDef<T>` + `FilterDef<T>` + `ViewDef<T>` + `FormSectionDef<T>` + `DetailTabDef<T>` + `DetailActionDef<T>` + `DataFetcher<T>` + `FieldDef` (15-variant discriminated union) + `ScaffoldScope`. Reviewer fixes applied inline: (1) `DetailTabDef.key` widened from student-specific literal union to `string` so non-student entities define their own tab keys; (2) `ListColumnDef.render` upgraded from `FieldKind` to full `FieldDef` so RELATION/SELECT columns retain per-kind metadata; (3) `EntityDef.schema` typed as `ZodType<T>` (Zod v4 / resolvers v5 Standard-Schema-compatible) instead of legacy `ZodSchema<T>`. Pure-types module — no runtime exports. `tsc --noEmit` green.

## Verification

- T1 — gates passed: `npm run build` green, `npx vitest run` 597/597 (41 new from format.test.ts). Cross-checked `design-system.html` §5.9 token styling note for fallback character ("—" em-dash) consistency with empty-state typography.
- T2 — gates passed: `npx tsc --noEmit` green, `npm run build` green, `npx vitest run` 597/597 (no new tests; pure types). Cross-referenced spec §5.4 page anatomy + §5.5 renderer kinds + §5.10 filtering / smart views.

## Ship Notes
<!-- filled by /ship -->
