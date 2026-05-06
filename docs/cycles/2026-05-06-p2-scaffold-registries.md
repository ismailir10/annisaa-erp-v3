# P2 Scaffold Registries — 5 Entity Registries + scaffold.md Standard

## Context

Phase 2 student-domain schema landed across `p2-students-guardians-household` (#191, migration 07) and `p2-guardians` (#192, migration 08). The scaffold engine itself shipped earlier in Phase 1 (`p1-scaffold-engine-skeleton` + `p1-scaffold-renderers`) — but ships today with **zero consumers**: no `lib/entities/<name>/{schema,entity,policy}.ts` files exist for any domain entity, and no `.claude/standards/scaffold.md` codifies the per-entity registry conventions future authors will need.

This cycle wires the first five consumers — the `Student / Guardian / Household / StudentIdentifier / GuardianInvitation` entity registries — and authors `scaffold.md` to lock the conventions in place before the next 35+ entities (Phase 3+) follow the same pattern. **No admin pages, no Playwright canary, no role-FileKind gating logic** this cycle (those land in `p2-scaffold-pages` and `p2-scaffold-canary`); the scope is registry-only.

The full `p2-students-guardians-scaffold` umbrella exceeds the spec §18.2 ≤25-files-per-cycle cap (~30+ files when registries + admin pages + Playwright spec are folded together), so it sub-splits into three sequential cycles:

1. **`p2-scaffold-registries` (THIS CYCLE)** — 5 entity registries + `scaffold.md` standard. **25 files** (1 `_types.ts` + 15 entity source + 1 barrel + 5 entity tests + 1 `scaffold.md` + 1 README + 1 CLAUDE.md), 0 migrations. At spec §18.2 cap; `_types.test.ts` folded into Student test per spec-time review N1.
2. **`p2-scaffold-pages`** — admin pages × 5 entities × 4 page types (List / Form / Detail / Edit) + server-action layer. ~20+ files, 0 migrations.
3. **`p2-scaffold-canary`** — Playwright canary `e2e/admin/students.spec.ts` + role-FileKind gating logic + storage.objects RLS audit resolution. Re-enables CI Playwright globally.

**Marathon mode** (foundation spec §18.12) — derives directly from spec §5.1 (per-entity directory pattern), §5.2 (4-line page contract), §4.2 (PermissionScope predicates: `ALL | OWN_CAMPUS | OWN_PROGRAM | OWN_CLASS | OWN_SESSION | OWN_STUDENT | SELF`), §5.10 (chip-filter per-entity registry shape), §5.13 (PII redaction via schema annotations), §6.1 (per-entity model list). Skip `superpowers:brainstorming` — scope locked by the foundation spec + the umbrella decomposition above.

Inputs from prior cycles (consumed verbatim):
- `lib/scaffold/entity.ts` — `EntityDef<T>` consumer contract (read; do not modify).
- `lib/scaffold/permission.ts` — `resolvePermissions(args)` signature; `OWN_STUDENT` scope still resolves with `studentScopeUnresolved: true` (spec §4.5; resolver wiring deferred to `p2-scaffold-pages`/`p2-scaffold-canary`). Policies declared this cycle MUST tolerate that gap.
- `lib/audit/redactor.ts` — `PII_FIELDS` map keyed by Prisma model name. Detail-page redaction at consumer layer reads this map directly.
- `prisma/schema.prisma` — 5 entity models with `/// @PII` annotations + soft-delete posture per entity (Household / Student / StudentIdentifier / Guardian = `softDelete: true`; GuardianInvitation = `softDelete: false`, status enum carries lifecycle).

UAT report scan: `docs/uat/reports/` contains `2026-04-18-admin.md`, `2026-04-24-admin.md`, `2026-05-02-admin.md`, etc. — all v1 admin reports older than the 2026-05-04 v1 hard-delete. **Possibly stale per the §60-day rule + post-hard-delete invalidation**; treat as historical context, not actionable input. No fresh report touches `lib/entities/**` (no admin pages exist yet).

## Spec

### Acceptance criteria

- [ ] `lib/entities/_types.ts` — shared `EntityPolicy` type contract: `CrudAction`, per-action × per-role `ScaffoldScope` mapping, FileKind allowlist hint per role, audit-action enrolment, soft-delete posture.
- [ ] 5 entity directories under `lib/entities/<kebab-name>/` each containing:
  - `schema.ts` — Zod `z.object({...})` mirroring Prisma fields with field-level validation (NIK 16-digit regex; phone E.164/Indonesian regex; email RFC; relationship/status/gender/kind enum mirrors EXACTLY matching DB CHECK lists from migrations 07 + 08; VarChar lengths matching `@db.VarChar(N)`).
  - `entity.ts` — `EntityDef<T>` instance: `key`, `label`, `labelSingular`, `icon` (Lucide), `resource` (Prisma model name verbatim), `searchFields`, `listColumns`, `filters` (3-5 chip filters per spec §5.10), `views`, `formSections`, `detailTabs`, `detailActions: []` (deferred), `dataFetcher` (real Prisma read-only query — tenant-scoped via `getSession()`, composite-FK-aware loads include `tenantId` in WHERE, soft-delete filter `deletedAt: null` per entity posture).
  - `policy.ts` — `EntityPolicy` instance: per-action × per-role `ScaffoldScope` map; FileKind allowlist DECLARATION per role (gating logic deferred to `p2-scaffold-canary` — this cycle ships the source-of-truth allowlist field only); audit-action enrolment per spec §5.13; soft-delete posture matching schema.
- [ ] `lib/entities/index.ts` — barrel export of all 5 `EntityDef` + `EntityPolicy` instances + the `_types` re-exports.
- [ ] 5 entity test files under `lib/entities/__tests__/<name>.entity.test.ts` covering: registry shape conforms to `EntityDef<T>` (compile-time via type assignment + runtime via field presence); Zod schema accepts canonical valid inputs + rejects bad inputs (NIK length wrong, phone format wrong, enum value not in CHECK list); `EntityPolicy` per-action × per-role mapping has expected shape.
- [ ] `.claude/standards/scaffold.md` authored, ≤300 lines, cross-references `audit-pii.md` / `crud.md` / `patterns.md` / `security.md` rather than duplicating them. Codifies: required exports per file; directory + naming conventions; field-definition shape; `PermissionScope` mapping per CRUD action; relation declaration pattern (composite-FK-aware loads include `tenantId` in WHERE); soft-delete posture; PII propagation via `lib/audit/redactor.ts`; split-view FK precedent (Guardian.userId DB-composite + Prisma-single-column per p2-guardians lesson); partial-unique drift trap (entity Zod schemas may mirror DB CHECK constraints for INPUT validation but do NOT recreate DB-level partial-WHERE uniqueness — those live ONLY in migrations per p2-cycle-1 lesson); redirect-target convention (prefer existing helpers over literal URL strings per p2-cycle-1 lesson).
- [ ] `README.md` ADR row added (Decision cell ≤400 chars per ADR-cell-length pre-commit hook).
- [ ] `CLAUDE.md` standards table row added for `scaffold.md` (loaded when staged paths match `lib/entities/**` or `.claude/standards/scaffold.md`).
- [ ] All gates green:
  - `npx prisma generate` — clean.
  - `npm run lint` — clean (no unused vars, no `as any`, prefer `unknown` cast).
  - `npm run typecheck` — clean.
  - `npm run build` — clean.
  - `npx vitest run` — all green; net new test count ≥5 (one per entity).
  - `scripts/verify-rls-coverage.sh` — 32/32 unchanged (no migration this cycle).
  - `scripts/verify-api-auth.sh` — 4/4 unchanged (no new API routes this cycle).
  - `scripts/verify-pii-annotations.sh` — 5/5 unchanged (no schema changes this cycle).
- [ ] No Playwright run this cycle — `e2e/admin/students.spec.ts` lands `p2-scaffold-canary`. Rebuild-window guard remains active and auto-skips Playwright in CI.
- [ ] Cycle doc all 6 sections filled. Ship Notes covers: registry consumer contract documentation, deferred-items refresh, rollback plan.

### Non-goals (out of scope this cycle)

- Admin scaffold pages × 5 entities × 4 page types (List / Form / Detail / Edit) → `p2-scaffold-pages`.
- Server-action layer (`lib/<domain>/actions/*.ts` for CREATE / UPDATE / DELETE / SOFT_DELETE / RESTORE) for any of the 5 entities → `p2-scaffold-pages` (action layer wires to admin pages and lands together with the page recipe). **dataFetcher (READ-only list query) IS in scope this cycle** — it's part of the registry per spec §5.10 and the `EntityDef.dataFetcher` field is required by the engine consumer contract.
- Playwright canary `e2e/admin/students.spec.ts` → `p2-scaffold-canary` (re-enables CI Playwright globally).
- Role-based FileKind gating LOGIC per-entity → `p2-scaffold-canary`. **This cycle DECLARES the allowlist in `policy.ts`**; the gating logic that consumes the allowlist (rejecting uploads of disallowed kinds per role) lands later.
- `storage.objects` RLS Supabase-default-policy audit resolution → `p2-scaffold-canary` (folds in once the first storage.objects writer ships, which the admin pages would be).
- `OWN_STUDENT` resolver wiring (`studentIds` Set materialization for parents via `studentGuardians.guardianId IN (currentSession.guardian.id)`) → `p2-scaffold-pages` or `p2-scaffold-canary`. **This cycle declares `OWN_STUDENT` scope in policies**; `lib/scaffold/permission.ts` already returns `studentScopeUnresolved: true` with empty Set as a fail-closed signal — page-layer callers (next cycle) MUST treat `studentScopeUnresolved === true` as block-render rather than empty-result.
- WhatsApp `wa.me` invitation flow consumer → `p6-portal-invitation-flow` (consumes GuardianInvitation tokens via atomic `UPDATE ... WHERE status='PENDING'`).
- Public `/daftar` admission form → `p2-admission-funnel`.
- Address chain (Province / Regency / District / Village FKs on Household) → `p2-addresses-idn-chain` (Household.addressId becomes non-nullable then).
- `AuditAction.AUTH_REJECT` enum value → future schema cycle.
- StudentGuardian registry — many-to-many edge entity, no standalone CRUD page; managed via Student detail-page tabs (Wali tab) + Guardian detail-page tabs (Anak tab) in `p2-scaffold-pages`. **Excluded from this cycle's 5 registries.**

### Assumptions

1. **Shared `EntityPolicy` type lives at `lib/entities/_types.ts`, NOT in the scaffold engine.** Rationale: the engine surface (`lib/scaffold/entity.ts` `EntityDef<T>`) defines UI metadata only; security/audit/file-allowlist metadata is a parallel concern that lives per-entity. Putting `EntityPolicy` under `lib/entities/` keeps the engine pristine and aligns with spec §5.1 ("`policy.ts` — permissions, audit config, workflow binding"). A future engine cycle MAY promote `EntityPolicy` into the engine surface; this cycle treats it as entity-side scaffolding.
2. **`dataFetcher` per entity calls `getSession()` internally** (no session arg on the engine signature — `lib/scaffold/list-page.tsx` calls `entity.dataFetcher({page, pageSize, filters, search})` with no session injected). Each entity's `dataFetcher` resolves the session, applies `tenantId` filter, applies `deletedAt: null` filter for soft-delete entities, applies search via `lib/scaffold/permission.ts` `resolvePermissions` for non-ALL scopes (admin's `ALL` scope short-circuits the resolver call). Returns `{ rows, total }`.
3. **Zod schemas use `z.string().regex(...)` for NIK / phone / token** rather than freeform strings — per p2-cycle-1 lesson (spec-time scrutiny prefers regex over freeform). NIK regex is `/^\d{16}$/`; phone regex is `/^(\+62|0)8\d{8,10}$/` (Indonesian mobile, BRTI 10-12-digit subscriber range — `08` + 8-10 more digits, OR `+62` + `8` + 8-10 more digits — tightened from `\d{8,11}` per spec-time review M3 to reject 15-char over-accepts that no Indonesian carrier uses); token regex is `/^[A-Za-z0-9_-]{43}$/` (43-char base64url, 32-byte secret, no padding). Email uses `z.string().email().max(255)`.
4. **Enum mirrors EXACTLY match DB CHECK lists** from migrations 07 + 08:
   - `Student.gender` → `z.enum(["MALE", "FEMALE"])` per migration 07 CHECK.
   - `StudentIdentifier.kind` → `z.enum(["NIS", "NISN", "PREVIOUS_SCHOOL"])` per migration 07 CHECK.
   - `GuardianInvitation.status` → `z.enum(["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"])` per migration 08 CHECK.
   - `StudentGuardian.relationship` (NOT in this cycle's registries — referenced for context only) → `["FATHER", "MOTHER", "GUARDIAN", "OTHER"]` per migration 08 CHECK.
5. **Soft-delete posture per entity** matches the schema:
   - Household / Student / StudentIdentifier / Guardian → `softDelete: true` (have `deletedAt` column).
   - GuardianInvitation → `softDelete: false` (operational; status enum carries lifecycle; matches ExportJob/EmailLog/StudentIdentifierSequence precedent).
   `EntityPolicy.softDelete` drives the scaffold List query's `deletedAt: null` WHERE-clause behaviour — `p2-scaffold-pages` will read this field at query construction.
6. **FileKind allowlist DECLARATION shape** per `EntityPolicy.fileKindAllowlist`: `Partial<Record<RoleCode, ReadonlyArray<FileKind>>>`. Role codes match the seed `05-system-roles` → `admin`, `principal`, `kadiv`, `homeroom_teacher`, `sentra_teacher`, `admission_officer`, `finance_officer`, `parent`. Allowlist is keyed only for roles with WRITE permission per the corresponding policy.scopes (a role with READ-only access has no upload right and therefore no allowlist key — preventing future "I have read access AND an allowlist, so can I upload?" ambiguity per spec-time review #9). Per-entity allowlist this cycle:
   - **Student** — admin/principal/kadiv: `[IMAGE, DOCUMENT, ARCHIVE]` (avatar, akta lahir, KK scan, lainnya); homeroom_teacher: `[IMAGE, DOCUMENT]`; admission_officer: `[IMAGE, DOCUMENT]` (avatar + akta on intake). Parent omitted — read-only scope, no upload right.
   - **Guardian** — admin/principal: `[IMAGE, DOCUMENT]` (KTP photo + scan); kadiv: `[DOCUMENT]`; admission_officer: `[IMAGE, DOCUMENT]`. Parent omitted — read-only scope on the Guardian entity itself; parent profile-photo upload (if added later) lives on a separate `User` self-edit path, not Guardian admin pages.
   - **Household** — admin/principal/admission_officer: `[DOCUMENT]` (KK scan); kadiv: `[DOCUMENT]`. Other roles omitted (no write).
   - **StudentIdentifier** — admin/principal/admission_officer: `[DOCUMENT]` (NIS/NISN proof). Other roles omitted.
   - **GuardianInvitation** — empty object `{}` (no roles listed; no attachments expected on operational record).
   These declarations are the source of truth; gating logic in `p2-scaffold-canary` reads `policy.fileKindAllowlist[session.role]` (which returns `undefined` for omitted roles → fail-closed) and rejects uploads of kinds outside the array.
7. **`OWN_STUDENT` scope semantics for parent portal** (Guardian / GuardianInvitation in policy.ts): "own student" resolves to `studentGuardians.guardianId = currentSession.guardianId` joined to the entity's `tenantId`-scoped query. The resolver in `lib/scaffold/permission.ts` currently returns `studentScopeUnresolved: true` with empty `studentIds` Set. **dataFetcher fail-closed contract (per spec-time review C1):** ANY entity dataFetcher whose policy declares `OWN_STUDENT` for the calling role MUST `throw new Error("OWN_STUDENT_UNRESOLVED")` (typed sentinel) when `resolvePermissions` returns `studentScopeUnresolved: true`. NEVER fall through to `prisma.<model>.findMany({ where: { id: { in: [...emptySet] } } })` — that yields silent empty results which a future page-layer caller would render as "no rows" rather than as a permission failure. The page-layer fail-closed branch (`p2-scaffold-pages`) catches this typed error and renders the no-permission UI; `p2-scaffold-canary` then adds the actual resolver wiring (studentGuardians.guardianId → studentIds Set materialization) which flips the flag false. This cycle declares the policy + ships the throw branch in dataFetcher.
8. **Per-entity chip filters: 3-5** per spec §5.10 (count includes SEARCH per `lib/scaffold/entity.ts` `FilterKind` union). Concrete sets per entity:
   - **Student** — `program` (SELECT, options from Program seed), `gender` (SELECT MALE/FEMALE), `enrolled` (BOOLEAN — `enrolledAt IS NOT NULL`), `search` (SEARCH on `fullName, nis, nik` via the trigram GIN index on `fullName`). 4 filters.
   - **Guardian** — `hasUser` (BOOLEAN — `userId IS NOT NULL` proxy for "portal-active"), `hasInvitation` (BOOLEAN — `guardianInvitations: { some: { status: 'PENDING' } }` proxy for "invited but not yet portal-active" — admission_officer workflow signal; added per spec-time review M1 to clear spec §5.10 ≥3 chip-filter floor), `search` (SEARCH on `fullName, email, nik`). 3 filters.
   - **Household** — `search` (SEARCH on `code, notes`). NOTE: spec §5.10 says 3-5; Household has 1 — keep as 1 this cycle (Household is rarely browsed standalone — it's typically navigated from a Student detail page's Wali tab; adding synthetic filters to satisfy the floor would be noise). Document the under-floor as an explicit deviation in scaffold.md §5 cross-reference.
   - **StudentIdentifier** — `kind` (SELECT NIS/NISN/PREVIOUS_SCHOOL), `isPrimary` (BOOLEAN), `search` (SEARCH on `value`). 3 filters.
   - **GuardianInvitation** — `status` (SELECT PENDING/ACCEPTED/EXPIRED/REVOKED), `expired` (BOOLEAN — `status='PENDING' AND expiresAt<now()`; declared as a Smart View `expired` per spec-time review M10 rather than a chip filter — chip BOOLEAN convention is `field=true|false`, NOT a derived predicate), `search` (SEARCH on `student.fullName` via composite-FK include). 2 chip filters + 1 Smart View. Smart View `expired` listed in `entity.views` array.
9. **Smart Views (`entity.views`)** — minimal default-only this cycle. Each entity ships a single `default` view with no filters; per-role default views (`defaultFor[]`) deferred to `p2-scaffold-pages` when the role-routing UX is in scope.
10. **`detailTabs` / `formSections` declared but render-stubs**: `formSections` lists the fields per-section per spec §5.4 anatomy (Identitas / Kontak / Kategorisasi etc.); `detailTabs` lists tab keys + labels per spec §5.4 (Ringkasan / Wali / Riwayat / Lampiran / Aktivitas for Student) but the `render: (row) => ReactNode` callback returns a `<div>(deferred)</div>` placeholder this cycle. Real tab content lands `p2-scaffold-pages`. Detail-page redaction wires PII via `lib/audit/redactor.ts` `PII_FIELDS` lookup at the page layer — no entity-side redaction logic this cycle.
11. **Indonesian labels** per spec §5.4 anatomy + voice.md: entity labels use Indonesian (`Siswa / Wali / Keluarga / Identitas Siswa / Undangan Wali`); column labels use Indonesian (`Nama Lengkap`, `Nomor Induk Siswa`, etc.). English `key` / `field` names mirror Prisma camelCase per spec §4.4. Voice.md cross-referenced from `scaffold.md` rather than duplicated.
12. **Lucide icons per entity:** Student → `Users`, Guardian → `UserCircle`, Household → `Home`, StudentIdentifier → `BadgeCheck`, GuardianInvitation → `MailPlus`. Engine renders these via `entity.icon` field; choices are reversible — admin sidebar order/icons land `p2-scaffold-pages`.

## Tasks

### Shared dataFetcher contract (applies to T2-T6)

Each entity's `dataFetcher: DataFetcher<T>` MUST satisfy these clauses (referenced from per-entity tasks below to avoid duplication):

1. **Session resolve** — `const session = await getSession(); if (!session) throw new Error("UNAUTHENTICATED");`. The List page shell does NOT inject session per `lib/scaffold/list-page.tsx` line 53 (engine signature accepts no session arg).
2. **Tenant filter** — every Prisma WHERE clause includes `tenantId: session.tenantId`. NO exceptions, including for `findFirst` / `count` calls (per spec §6.4 cross-tenant safety + per p2-cycle-1 RLS strict 32/32 contract).
3. **Soft-delete filter** — when `policy.softDelete === true` (Household / Student / StudentIdentifier / Guardian) include `deletedAt: null`. Entities with `softDelete: false` (GuardianInvitation) MUST NOT include `deletedAt: null` (no `deletedAt` column exists; Prisma would emit invalid SQL).
4. **OWN_STUDENT fail-closed branch — DEFERRED to p2-scaffold-pages** (build-time spec adjustment): the cycle's spec-time review C1 fix assumed `SessionContext` carries `role` and `currentTermId` so the dataFetcher could discriminate admin (ALL — no resolver call needed) from parent (OWN_STUDENT — resolver call → throw on `studentScopeUnresolved`). At build time, `lib/auth/session.ts` `SessionContext` was found to carry only `{ tenantId, userId, supabaseUserId }` (no role, no currentTermId). The dataFetcher CANNOT discriminate scopes without that information. **This cycle's dataFetcher is tenant-scoped admin-only**: it filters by `tenantId` (clause 2) + `deletedAt: null` for soft-delete entities (clause 3) but does NOT call `resolvePermissions` and does NOT branch on `OWN_STUDENT`. The throw-on-unresolved contract still binds future consumers — `policy.scopes.read` continues to declare OWN_STUDENT for the parent role on Guardian / GuardianInvitation as the source of truth. `p2-scaffold-pages` (next cycle) ADDS `role` + `currentTermId` to `SessionContext`, then wraps `entity.dataFetcher` in a role-aware shell that performs the OWN_STUDENT resolver call + `throw new Error("OWN_STUDENT_UNRESOLVED")` at the page layer. Until that lands, all consumers are admin paths reading admin-tenant-scoped data — safe.
5. **Sort param handling (per spec-time review M2)** — if `params.sort` is present, use `orderBy: { [params.sort.field]: params.sort.dir }`; otherwise fall back to a per-entity sensible default (Student: `fullName asc`; Guardian: `fullName asc`; Household: `code asc`; StudentIdentifier: `issuedAt desc`; GuardianInvitation: `createdAt desc`). Today the engine's `list-page.tsx` does not pass `sort`, but sortable column-header UI ships in `p2-scaffold-pages` and will pass it — wiring sort handling now prevents silent ignore later.
6. **Pagination** — `take: params.pageSize`; `skip: (params.page - 1) * params.pageSize`; `count` runs in parallel via `Promise.all`.
7. **Search** — when `params.search` is present, apply per-entity search predicate (Student: `OR: [{ fullName: { contains, mode: 'insensitive' } }, { nis: { contains } }, { nik: { contains } }]`; etc.). Trigram GIN indexes exist on `Student.fullName` (migration 07) — Prisma `contains` with `mode: 'insensitive'` does NOT use the trigram index, but is correctness-correct; trigram-aware raw SQL deferred to a future cycle when search latency becomes a measurable issue.
8. **PII column exclusion from listColumns (per spec-time review M4)** — `entity.listColumns` MUST NOT include any field annotated `/// @PII` in the schema. Per `lib/audit/redactor.ts` PII_FIELDS map: Student.nik (excluded — list shows nis instead); Guardian.nik / Guardian.phone (excluded — list shows fullName + email + hasUser indicator only); other entities have no PII fields. The dataFetcher MAY return PII columns in the row payload (Detail-page tabs need them — redacted via consumer-layer lookup of `PII_FIELDS`) but the List render path MUST not surface unredacted PII to admin browsing.

### T1 — `lib/entities/_types.ts` shared policy contract

- [x] Create `lib/entities/_types.ts` exporting:
  - `CrudAction` literal union: `"create" | "read" | "update" | "delete" | "soft_delete" | "restore"`.
  - `RoleCode` literal union mirroring `prisma/seed/05-system-roles.ts` (re-import the source-of-truth array if cleanly possible; otherwise mirror as `as const` array with a comment pointing back to the seed).
  - `EntityPolicy` interface: `resource: string` (Prisma model name verbatim); `softDelete: boolean`; `auditActions: ReadonlyArray<AuditAction>` — per spec-time review C2 the cycle default is `[CREATE, UPDATE, SOFT_DELETE, RESTORE]` (DELETE excluded; soft-delete entities NEVER hard-delete in MVP, so enrolling DELETE in the default would write semantically misleading audit rows). Per-entity policy.ts MAY override with `[CREATE, UPDATE, DELETE]` only when `softDelete: false` AND a hard-delete code path is intentional (no entity in this cycle qualifies); `scopes: Record<CrudAction, ReadonlyArray<{ role: RoleCode; scope: ScaffoldScope }>>`; `fileKindAllowlist: Partial<Record<RoleCode, ReadonlyArray<FileKind>>>` (Partial — keys only for roles with WRITE permission per assumption 6).
  - `defineEntityPolicy<P extends EntityPolicy>(p: P): P` identity helper for type inference (mirrors `defineAction` precedent in `lib/scaffold/action.ts`).
  - **Defer `_types.test.ts` per spec-time review N1** — type-level assertions fold into `lib/entities/__tests__/student.entity.test.ts` (T7) which exercises `defineEntityPolicy` round-trip on the Student policy. Saves one file → cycle hits exactly 25 files (under §18.2 cap).
- [ ] Imports: `ScaffoldScope` from `@/lib/scaffold`, `AuditAction` + `FileKind` from `@/lib/generated/prisma/client`.
- [ ] No runtime logic — types + `defineEntityPolicy` identity function only.
- **Acceptance:** file compiles; `npm run typecheck` clean; type-level coverage lives in T7's Student test file. **Independent of T2-T6.**

### T2 — Student registry

- [x] Create `lib/entities/student/schema.ts` — Zod schema mirroring Prisma `Student` model: required `fullName` (max 255), `gender` enum (MALE/FEMALE), `householdId` + `programId` (CUID strings); optional `nis` (max 50), `nik` (regex `/^\d{16}$/`), `nickname` (max 100), `birthPlace` (max 100), `birthDate` (date), `enrolledAt` (date). NO `deletedAt` / `tenantId` / audit columns (those are server-managed).
- [x] Create `lib/entities/student/entity.ts` — `EntityDef<Student>` instance per assumption 8 + 11 + 12. `dataFetcher` follows the **Shared dataFetcher contract** above (clauses 1-8): `getSession()` → tenant filter → `deletedAt: null` (softDelete=true) → no OWN_STUDENT branch on this entity (parent's read scope IS OWN_STUDENT but the resolver branch fires only when the parent role calls — admin/staff hit the ALL short-circuit). Default sort: `fullName asc`. Search predicate: `OR` over `fullName`/`nis`/`nik` with `contains, mode: 'insensitive'`. **`listColumns` MUST exclude `nik` (PII per `redactor.ts` PII_FIELDS) — list surface columns: `nis`, `fullName`, `nickname`, `gender`, `program.name` (RELATION), `enrolledAt`.** `detailTabs` keys: `ringkasan / wali / riwayat / lampiran / aktivitas` per spec §5.4 (render callbacks return `<div>(deferred)</div>` per assumption 10). `formSections` per spec §5.4 anatomy: `identitas / kontak / kategorisasi`.
- [x] Create `lib/entities/student/policy.ts` — `EntityPolicy` per assumption 6 + 7. `softDelete: true`. CRUD scopes: admin/principal/kadiv = ALL on all actions; homeroom_teacher = OWN_CLASS read + update; sentra_teacher = OWN_CLASS read; admission_officer = ALL create/read/update; parent = OWN_STUDENT read. FileKind allowlist per assumption 6.
- **Acceptance:** schema accepts canonical valid input + rejects NIK length wrong; entity matches `EntityDef<Student>` shape (compile-time via `satisfies`); policy matches `EntityPolicy` shape. **Independent of T3-T6** (parallelizable).

### T3 — Guardian registry

- [x] Create `lib/entities/guardian/schema.ts` — Zod schema for `Guardian`: required `fullName` (max 255); optional `email` (RFC + max 255), `nik` (regex `/^\d{16}$/`), `phone` (regex `/^(\+62|0)8\d{8,10}$/` per Assumption §3 + spec-time review M3 — tightened from `\d{8,11}` to reject 15-char over-accepts no Indonesian carrier uses); optional `userId` (CUID, populated only at GuardianInvitation acceptance — admin form does NOT expose this).
- [x] Create `lib/entities/guardian/entity.ts` — `EntityDef<Guardian>` per assumption 8 + 11 + 12. `dataFetcher` follows the Shared dataFetcher contract above. **OWN_STUDENT fail-closed branch fires for parent role** (clause 4) — throws `OWN_STUDENT_UNRESOLVED` until `p2-scaffold-canary` wires resolver. Default sort: `fullName asc`. **`listColumns` MUST exclude `nik` AND `phone` (both PII per `redactor.ts` PII_FIELDS) — list columns: `fullName`, `email`, `hasUser` (computed BOOLEAN from `userId IS NOT NULL`), `hasInvitation` (computed BOOLEAN from related GuardianInvitation status='PENDING').** `detailTabs` keys: `ringkasan / anak / riwayat / aktivitas`. Chip filters per assumption 8: `hasUser`, `hasInvitation`, `search`.
- [x] Create `lib/entities/guardian/policy.ts` — `softDelete: true`. CRUD scopes: admin/principal/kadiv = ALL; admission_officer = ALL create/read/update; parent = OWN_STUDENT read (resolves via studentGuardians.guardianId — see assumption 7). FileKind allowlist per assumption 6.
- **Acceptance:** schema validation rejects bad phone format + bad NIK length + bad email; entity + policy match contracts. **Independent of T2 + T4-T6.**

### T4 — Household registry

- [x] Create `lib/entities/household/schema.ts` — Zod schema for `Household`: optional `code` (max 50, NO uniqueness in schema per p2-cycle-1 lesson — partial-WHERE unique lives ONLY in migration 07; assumption mirrored in scaffold.md), optional `notes` (max 2000), optional `addressId` (CUID — Address chain ships in `p2-addresses-idn-chain`, FK becomes non-nullable then).
- [x] Create `lib/entities/household/entity.ts` — `EntityDef<Household>`. icon: `Home`. `dataFetcher` follows the Shared dataFetcher contract above. Default sort: `code asc`. listColumns: `code`, `notes`, `students.length` (computed via `_count`). `detailTabs`: `ringkasan / anggota / aktivitas` (anggota = household members from `students` + future Guardian-household link).
- [x] Create `lib/entities/household/policy.ts` — `softDelete: true`. CRUD scopes: admin/principal/kadiv/admission_officer = ALL; finance_officer = read-only ALL (sibling-discount queries — spec §4.5). FileKind allowlist per assumption 6.
- **Acceptance:** schema accepts valid input + rejects code length > 50; entity + policy match contracts. **Independent of T2-T3 + T5-T6.**

### T5 — StudentIdentifier registry

- [x] Create `lib/entities/student-identifier/schema.ts` — Zod schema for `StudentIdentifier`: required `studentId` (CUID), `kind` (enum NIS/NISN/PREVIOUS_SCHOOL per assumption 4), `value` (max 100); optional `isPrimary` (boolean), `issuedAt` (date), `notes` (max 2000).
- [x] Create `lib/entities/student-identifier/entity.ts` — `EntityDef<StudentIdentifier>`. icon: `BadgeCheck`. `dataFetcher` follows the Shared dataFetcher contract above. Default sort: `issuedAt desc`. listColumns: `kind`, `value`, `isPrimary`, `issuedAt` (no PII columns on this model — `value` is the NIS/NISN string itself, NOT marked `/// @PII`; safe for list surface). Detail rarely accessed standalone — mostly viewed via Student detail page Wali/Riwayat tab.
- [x] Create `lib/entities/student-identifier/policy.ts` — `softDelete: true` (NIS history retained per spec §4.5). CRUD scopes: admin/principal/kadiv = ALL; admission_officer = ALL create/read/update (NIS allocation flow — `lib/students/nis-allocator.ts`). FileKind allowlist per assumption 6.
- **Acceptance:** schema rejects unknown kind value; entity + policy match contracts. **Independent of T2-T4 + T6.**

### T6 — GuardianInvitation registry

- [x] Create `lib/entities/guardian-invitation/schema.ts` — Zod schema for `GuardianInvitation`: required `studentId`, `guardianId` (both CUID), `expiresAt` (datetime); `status` (enum PENDING/ACCEPTED/EXPIRED/REVOKED per assumption 4) defaults to `PENDING`; `token` is server-generated (NOT in admin input schema — generator is `crypto.randomBytes(32).toString('base64url')` per p2-guardians Ship Notes), so input schema omits `token`. `acceptedAt` server-set on consume.
- [x] Create `lib/entities/guardian-invitation/entity.ts` — `EntityDef<GuardianInvitation>`. icon: `MailPlus`. `dataFetcher` follows the Shared dataFetcher contract above **EXCEPT clause 3 — softDelete=false → no `deletedAt: null` injection** (no `deletedAt` column; Prisma would emit invalid SQL). **OWN_STUDENT fail-closed branch fires for parent role** (clause 4). Default sort: `createdAt desc`. listColumns: `student.fullName` (RELATION via composite-FK include), `guardian.fullName` (RELATION), `status`, `expiresAt` (no PII columns on this model). Chip filters: `status` (SELECT), `search` (SEARCH on student.fullName); Smart View `expired` (per assumption 8 — derived predicate `status='PENDING' AND expiresAt<now()` belongs in `entity.views[]` not `entity.filters[]` because chip BOOLEAN convention is `field=true|false`, NOT a derived predicate).
- [x] Create `lib/entities/guardian-invitation/policy.ts` — `softDelete: false`. CRUD scopes: admin/principal/kadiv/admission_officer = ALL; parent = OWN_STUDENT read (sees own student's invitation status only). FileKind allowlist `[]` for ALL roles per assumption 6.
- **Acceptance:** schema rejects unknown status value + accepts default-PENDING flow; entity + policy match contracts; dataFetcher does NOT inject `deletedAt: null`. **Independent of T2-T5.**

### T7 — Barrel + per-entity tests

- [x] Create `lib/entities/index.ts` — barrel exporting each entity's `entity` (default) + `policy` (named) + `schema` (named) + the `_types` re-exports (`EntityPolicy`, `defineEntityPolicy`, `CrudAction`, `RoleCode`).
- [x] Create `lib/entities/__tests__/student.entity.test.ts` — covers: (a) `entity` satisfies `EntityDef<Student>` (compile-time `satisfies`); (b) `policy.resource === "Student"`; (c) `policy.softDelete === true`; (d) `policy.auditActions` does NOT include `AuditAction.DELETE` (per spec-time review C2); (e) `schema.parse(canonicalValidInput)` succeeds; (f) `schema.parse({ ...input, nik: "12345" })` throws (NIK length wrong); (g) `schema.parse({ ...input, gender: "OTHER" })` throws (enum value not in CHECK list); (h) `policy.scopes.read` includes `{ role: 'parent', scope: 'OWN_STUDENT' }`; (i) `policy.fileKindAllowlist.admin` includes `IMAGE` + `DOCUMENT`; (j) `policy.fileKindAllowlist.parent` is `undefined` (read-only role has no upload key per assumption 6); (k) `defineEntityPolicy` round-trip type inference (covers former `_types.test.ts` per N1 fold).
- [ ] Mirror test files for Guardian, Household, StudentIdentifier, GuardianInvitation — each covering schema valid/invalid + policy shape per the per-entity assumptions above.
- **Acceptance:** `npx vitest run lib/entities/` reports 5+ test files green; total new test count ≥10 (≥2 cases per entity).

### T8 — `.claude/standards/scaffold.md` standard

- [x] Author `.claude/standards/scaffold.md` (≤300 lines). Sections (in order):
  - **§1 When loaded** — pre-commit dispatcher loads when `lib/entities/**` or `.claude/standards/scaffold.md` staged.
  - **§2 Required exports per file** (schema.ts → `default export schema`; entity.ts → `default export entity`; policy.ts → `named export policy`).
  - **§3 Directory + naming** (kebab-case dir; singular form; resource = Prisma model name verbatim; key = kebab-case singular).
  - **§4 schema.ts patterns** — Zod regex preference (NIK, phone, token); enum mirror EXACTLY matching DB CHECK; VarChar length mirror; cross-reference [audit-pii.md](audit-pii.md) for `/// @PII` annotations.
  - **§5 entity.ts patterns** — `EntityDef<T>` shape recap (link to `lib/scaffold/entity.ts`); 14 field renderers (link to spec §5.5); 3-5 chip filters per spec §5.10 (count includes SEARCH; document Household-style under-floor deviation pattern explicitly); dataFetcher closes over `getSession()`; composite-FK-aware loads MUST include `tenantId` in WHERE per §6.4 cross-tenant safety; soft-delete posture drives `deletedAt: null` WHERE-clause behaviour. **PII column exclusion from listColumns** (per spec-time review M4): any field annotated `/// @PII` in `prisma/schema.prisma` MUST NOT appear in `listColumns`. The Detail-page tabs MAY render PII via consumer-layer redaction lookup of `lib/audit/redactor.ts` `PII_FIELDS`. List = unredacted exposure surface; Detail = redacted exposure surface.
  - **§6 policy.ts patterns** — `EntityPolicy` shape recap; per-action × per-role `ScaffoldScope` mapping; FileKind allowlist DECLARATION shape `Partial<Record<RoleCode, ReadonlyArray<FileKind>>>` — keyed only for roles with WRITE permission per the corresponding `policy.scopes.create|update|delete` entry (a READ-only role has no upload right and therefore no allowlist key — `undefined` lookup → fail-closed; documented per spec-time review #9 to prevent "I have read access AND an allowlist, so can I upload?" ambiguity). Gating logic lives in upload route consumers — link to [storage.md](storage.md). Audit action enrolment per spec §5.13: cycle default is `[CREATE, UPDATE, SOFT_DELETE, RESTORE]` — `DELETE` (hard delete) is OPT-IN only when `softDelete: false` AND a hard-delete code path is intentional (per spec-time review C2 — soft-delete entities NEVER hard-delete in MVP, so enrolling DELETE in default would write semantically misleading audit rows).
  - **§5b dataFetcher contract recap** (cross-references the Cycle's "Shared dataFetcher contract" block + locks for future entity authors): session resolve → tenant filter → soft-delete filter → OWN_STUDENT fail-closed throw on `studentScopeUnresolved` → sort handling via `params.sort` → pagination → search → PII exclusion. The throw-on-unresolved sentinel `OWN_STUDENT_UNRESOLVED` is the typed contract the page-layer fail-closed branch (`p2-scaffold-pages`) catches.
  - **§7 OWN_STUDENT semantics** — for parent-portal entities, `OWN_STUDENT` resolves via `studentGuardians.guardianId = currentSession.guardianId`. Resolver currently returns `studentScopeUnresolved: true` — page-layer callers MUST fail-closed.
  - **§8 Split-view FK precedent** (Guardian.userId DB-composite + Prisma-single-column) — full pattern with the “REJECT regenerated migration” rule from p2-guardians Ship Notes; not just a passing reference.
  - **§9 Partial-unique drift trap** — entity Zod schemas may mirror DB CHECK (the discrete enum / regex constraint) for INPUT validation but do NOT recreate DB-level partial-WHERE uniqueness; those declarations live ONLY in migrations per p2-cycle-1 lesson.
  - **§10 Redirect-target convention** — prefer existing helpers (`errorRedirect()`, route convention `/auth/error?reason=...`) over literal URL strings per p2-cycle-1 lesson.
  - **§11 Cross-references** — `audit-pii.md` (PII propagation), `crud.md` (ERPNext-inspired CRUD recipes), `patterns.md` (Admin List/Detail/Form recipes), `security.md` (route auth checklist), `storage.md` (FileKind upload route + bucket layout). NO duplication of those standards' content.
- **Acceptance:** file ≤300 lines; pre-commit allowlist covers `.claude/**`; cross-references render as relative-path markdown links.

### T9 — README ADR row + CLAUDE.md standards table row

- [x] Add ADR row to `README.md` (under Active ADRs table). Decision cell ≤400 chars per ADR-cell-length pre-commit hook (Rule 5). Decision text covers: 5 entity registries shipped, scaffold.md authored, server-action layer + admin pages + Playwright canary deferred to next two sub-cycles.
- [x] Add `scaffold.md` row to the `CLAUDE.md` standards table — File: `scaffold.md` | Covers: per-entity registry conventions (schema/entity/policy shape, scope mapping, FileKind allowlist, split-view FK precedent) | Loaded when: `lib/entities/**` or `.claude/standards/scaffold.md` staged.
- [x] CLAUDE.md "Migrations landed" paragraph — **untouched** (no migration this cycle).
- **Acceptance:** ADR cell ≤400 chars (run `awk` cell-length check inline); CLAUDE.md table renders cleanly.

### T10 — End-of-cycle gate + Verification + Ship Notes

- [x] Run end-of-cycle gate: `prisma generate && npm run lint && npm run typecheck && npm run build && npx vitest run`. Playwright skipped (justified — no UI changes; rebuild-window guard active).
- [x] Run verify gates: `bash scripts/verify-rls-coverage.sh` (32/32 unchanged), `bash scripts/verify-api-auth.sh` (4/4 unchanged), `bash scripts/verify-pii-annotations.sh` (5/5 unchanged).
- [x] Fill cycle doc Verification section with verbatim gate output per task.
- [x] Fill cycle doc Ship Notes covering: registry consumer contract documentation (importable barrel + how `p2-scaffold-pages` consumes); deferred-items table refresh; rollback plan (`git revert <PR merge SHA>` — pure source/test/docs; no migration; no env vars; near-zero risk).
- [x] Spec-time + end-of-cycle code review (`feature-dev:code-reviewer` on diff) per CLAUDE.md /build pattern; surfaced + addressed CRITICAL/MAJOR findings as in-task fix edits before commit.
- **Acceptance:** all gates green; cycle doc all 6 sections populated; ready for /ship.

## Implementation

- Subagent plan: T1 inline (foundation type module); T2-T6 dispatched in parallel via `feature-dev:code-reviewer`-reviewed subagents (5 independent entity directories — no shared file conflicts); T7-T10 sequential (T7 barrel depends on all 5 entity dirs; T8 scaffold.md consumes lessons from T2-T6 implementation; T9-T10 doc finalisation).
- T1 — `lib/entities/_types.ts` (1 file, 88 lines) — shared `EntityPolicy` contract: `RoleCode` (inlined `as const` mirror of `prisma/seed/05-system-roles.ts` `SYSTEM_ROLES` per T1 reviewer Important — avoids cross-import into the seed subtree which carries Prisma runtime weight at module evaluation), `CrudAction`, `ScopeGrant`, `EntityPolicy` interface (resource / softDelete / auditActions / scopes / fileKindAllowlist), `defineEntityPolicy<P>` identity helper. Type-only module. Post-T2-T6 reviewer follow-up: `ROLE_CODES` exported (was lint-warned as unused-as-value).
- T2 — `lib/entities/student/{schema,entity,policy}.ts` (3 files) — `EntityDef<Student>` (Prisma row type direct), schema mirrors migration 07 CHECK (gender MALE/FEMALE; NIK `/^\d{16}$/`); listColumns excludes `nik` per PII clause 8 + spec-time review M4; `searchFields: ["fullName", "nis"]` (nik dropped per post-build reviewer N7 — listing PII as search hint contradicts minimisation; dataFetcher OR predicate still matches nik for admin lookups). Policy declares OWN_STUDENT for parent read; auditActions excludes DELETE per spec-time review C2.
- T3 — `lib/entities/guardian/{schema,entity,policy}.ts` (3 files) — `EntityDef<GuardianRow>` (hand-rolled row widening with `_count.guardianInvitations` for the M1 hasInvitation indicator); schema phone regex `/^(\+62|0)8\d{8,10}$/` per spec-time review M3 (tightened from \d{8,11}); listColumns excludes `nik` + `phone` per PII clause 8; adds Diundang/Belum indicator column anchored on `_count` field per post-build reviewer M1. dataFetcher includes `_count.guardianInvitations: { where: { status: 'PENDING' } }`. 3 chip filters (hasUser / hasInvitation / search) clears spec §5.10 floor.
- T4 — `lib/entities/household/{schema,entity,policy}.ts` (3 files) — `EntityDef<HouseholdRow>` (Prisma `Household` widened with `_count.students`) per post-build reviewer M4; schema all-optional (code/notes/addressId); listColumns code+notes only (under-floor 1-filter deviation explicitly documented in file header per Assumption §8). Policy: finance_officer read scope ALL for sibling-discount queries (spec §4.5).
- T5 — `lib/entities/student-identifier/{schema,entity,policy}.ts` (3 files) — `EntityDef<StudentIdentifier>` (Prisma row type direct) per post-build reviewer M5; kind enum mirrors migration 07 CHECK (NIS/NISN/PREVIOUS_SCHOOL); 3 chip filters (kind / isPrimary / search). Policy declares softDelete=true (NIS history retained per spec §4.5).
- T6 — `lib/entities/guardian-invitation/{schema,entity,policy}.ts` (3 files) — `EntityDef<GuardianInvitationRow>` (Prisma `GuardianInvitation` widened with `student.fullName` + `guardian.fullName` selects) per post-build reviewer M5; status enum mirrors migration 08 CHECK (PENDING/ACCEPTED/EXPIRED/REVOKED); CUID validation via `z.string().cuid()` per post-build reviewer M3 (replaced hand-rolled regex). dataFetcher SKIPS clause 3 — softDelete=false → no `deletedAt: null` injection. Smart View `expired` declared in `entity.views[]` per Assumption §8 (chip BOOLEAN convention is field=true|false, not a derived predicate). Policy: parent read = OWN_STUDENT (own student's invitation status only). fileKindAllowlist `{}` (operational record, no attachments).
- T7 — `lib/entities/index.ts` barrel + 5 entity test files (`__tests__/{student,guardian,household,student-identifier,guardian-invitation}.entity.test.ts`) (6 files). Barrel re-exports each entity's default-export entity + named-export policy + named-export schema + the `_types` re-exports (`EntityPolicy`, `defineEntityPolicy`, `RoleCode`, `ROLE_CODES`, `CrudAction`, `ScopeGrant`). `ALL_ENTITIES` + `ALL_POLICIES` aggregate constants for downstream introspection (nav rendering, permission seed iteration). Tests cover: schema valid-input acceptance, schema rejection paths (NIK/phone/email/enum/length boundaries), `EntityDef` shape (key/label/icon/resource/searchFields/listColumns), PII exclusion from listColumns + searchFields (Student.nik dropped from both per spec-time M4 + N7; Guardian.nik/phone dropped from listColumns), `EntityPolicy` shape (resource matches model name, softDelete posture matches schema, auditActions excludes DELETE for soft-delete entities, parent role scope = OWN_STUDENT for parent-portal entities, fileKindAllowlist Partial), `defineEntityPolicy` round-trip type inference (folds former `_types.test.ts` per spec-time N1). Net new tests: **+64** (5 test files).
- T7 follow-up: `householdPolicy` + `studentIdentifierPolicy` + `guardian-invitation/policy.ts` `policy` annotated `: EntityPolicy` (was narrow inference; tests asserting `fileKindAllowlist.<missing-role>` is `undefined` need the wide Partial type).
- T8 — `.claude/standards/scaffold.md` (1 file, 139 lines — under 300 cap; cross-references audit-pii / crud / patterns / security / storage / voice / api rather than duplicating content). 10 sections: required exports per file; schema.ts patterns (regex preference, enum mirror, VarChar, PII propagation); entity.ts patterns (EntityDef shape, row type vs input type, listColumns PII exclusion, chip-filter floor + Household-style under-floor deviation); Shared dataFetcher contract recap (clauses 1-8 incl. OWN_STUDENT throw forward-looking); policy.ts patterns (auditActions DELETE opt-in default, fileKindAllowlist Partial fail-closed); OWN_STUDENT semantics; split-view FK precedent (DB-composite + Prisma-single-column for nullable cross-tenant FKs — full pattern with REJECT-regenerated-migration rule); partial-unique drift trap; redirect-target convention; cross-references; lessons surfaced this cycle (SessionContext gap, narrow literal inference on defineEntityPolicy, EntityDef<InputType> wrong narrowing).
- T9 — README ADR row (Decision cell 347 chars, under 400 cap verified via inline `awk -F'|'`); CLAUDE.md standards table row for `scaffold.md` (loaded when `lib/entities/**` or `.claude/standards/scaffold.md` staged). CLAUDE.md "Migrations landed" paragraph untouched (no migration this cycle).

## Verification

- T1 gate: `npx prisma generate` clean (`✔ Generated Prisma Client (7.6.0)`); `npm run typecheck` clean (no errors); `npm run lint` clean (1 pre-existing warning on `lib/students/__tests__/nis-allocator.test.ts:52:28` `_args` unused — unchanged from baseline). `npm run build` clean (route table unchanged). `npx vitest run` passed `Tests 866 passed | 4 skipped (871)` after re-run; **2-4 known flakes** on full-suite parallel run (`components/ui/__tests__/confirm-dialog.test.tsx` "closes on successful onConfirm resolution" / "stays open when onConfirm rejects" / "closes when Cancel is clicked" / "disables both buttons while onConfirm is pending"; `components/ui/__tests__/select.test.tsx` "renders the <SelectItem> label on the trigger when value matches (enum-style value)") — verified pre-existing on origin/staging via `git stash --include-untracked && npx vitest run components/ui/__tests__/{confirm-dialog,select}.test.tsx → 9/9 passed`. Targeted re-run with T1 in tree → 9/9 passed. Flakes are jsdom timing under full-suite parallel load, not T1-induced.
- T2-T6 gates: `npx prisma generate` clean; `npm run typecheck` clean; `npm run lint` clean (lint baseline 1 warning, no new findings). `npm run build` clean (no new routes — registries are `lib/*` only). `npx vitest run` `Tests 865 passed | 4 skipped (871)` (test count unchanged from T1 — registries shipped without tests; T7 adds 5 entity test files with the full coverage matrix). Same 2-4 confirm-dialog/select flakes confirmed pre-existing.
- T7 gate: `npx prisma generate` clean; `npm run typecheck` clean; `npm run lint` clean (1 baseline warning unchanged). `npm run build` clean (no new routes). `npx vitest run` `Test Files 39 passed | 1 skipped (41) / Tests 929 passed | 4 skipped (935)` (+64 cases over T1 baseline 866; targeted `npx vitest run lib/entities/__tests__/` reports `Test Files 5 passed (5) / Tests 64 passed (64)` end-to-end). Same 2 confirm-dialog flakes confirmed pre-existing (verified targeted-pass on baseline + with T7 in tree). Each entity test file uses `vi.mock("@/lib/db")` + `vi.mock("@/lib/auth/session")` to stub the Prisma + session import chain — same pattern as `lib/audit/__tests__/write.test.ts`.
- T8 gate: docs-only authoring; gates inherited from T7 baseline. No code changes.
- T9 gate: docs-only edits (README ADR row + CLAUDE.md table row). README ADR Decision cell length verified 347 chars (under 400 cap) via `awk -F'|'`. Cycle doc Implementation bullet logged.
- **T10 end-of-cycle gate (final):**
  - `npx prisma generate` → `✔ Generated Prisma Client (7.6.0)` clean.
  - `npm run lint` → `✖ 1 problem (0 errors, 1 warning)` — single warning is pre-existing baseline (`lib/students/__tests__/nis-allocator.test.ts:52:28` `_args` unused; unchanged from origin/staging).
  - `npm run typecheck` → clean (no errors).
  - `npm run build` → clean (route table unchanged; registries are `lib/*` only — no new routes).
  - `npx vitest run` → `Test Files 40 passed | 1 skipped (41) / Tests 931 passed | 4 skipped (935)` (final-run flake set was empty — 2 known confirm-dialog/select flakes passed this iteration; +65 cases over T1 baseline 866).
  - `bash scripts/verify-rls-coverage.sh` → `✓ RLS coverage OK: 32 / 32 tenant-scoped models have ENABLE + policy.` (unchanged — no migration this cycle).
  - `bash scripts/verify-api-auth.sh` → `✓ API auth coverage OK: 4 / 4 routes have session helper or @public sentinel.` (unchanged — no new API routes this cycle).
  - `bash scripts/verify-pii-annotations.sh` → `✓ PII annotation coverage OK: 5 / 5 known-PII fields annotated.` (unchanged — no schema changes this cycle).
  - **Playwright skip — explicit + justified**: this cycle ships zero UI (`app/admin/**`, `app/teacher/**`, `app/parent/**` untouched); no `e2e/admin/students.spec.ts` yet (lands `p2-scaffold-canary`). Rebuild-window guard in `.github/workflows/ci.yml` automatically skips Playwright + seed steps when no specs are present. Guard re-enables itself the moment it detects an `e2e/**/*.spec.ts` file.

## Ship Notes

### Migrations to run

**None.** This cycle ships zero schema changes. `prisma/schema.prisma` untouched. `prisma/migrations/` untouched. RLS strict count remains 32/32. PII gate remains 5/5. API auth gate remains 4/4.

### New env vars

**None.** No env-var changes; no operator action required on Vercel preview / staging.

### Registry consumer contract (for `p2-scaffold-pages` next cycle)

Next cycle's admin pages will consume the registries via two import patterns. Both ship in this PR — no follow-up registry work required for the page recipe to land.

Per-entity default-export (matches spec §5.2 4-line page pattern):

```tsx
// app/admin/students/page.tsx
import { ScaffoldListPage } from "@/lib/scaffold";
import student from "@/lib/entities/student/entity";
export default function Page() {
  return <ScaffoldListPage entity={student} />;
}
```

Identical for Form (`new/page.tsx`), Detail (`[id]/page.tsx`), Edit (`[id]/edit/page.tsx`). 5 entities × 4 page types = 20 page files in `p2-scaffold-pages`.

Barrel-import for downstream introspection (nav rendering, permission seed iteration):

```ts
import { ALL_ENTITIES, ALL_POLICIES, studentPolicy, type EntityPolicy } from "@/lib/entities";
```

Resolution paths the next cycle MUST wire:
1. **`SessionContext` widening** — add `role: RoleCode` + `currentTermId: string` to `lib/auth/session.ts` `SessionContext`. Demo-cookie path (`lib/auth/demo-cookie.ts`) and Supabase JWT-claim path (callback in `app/auth/callback/route.ts`) both populate. JWT-claim path reads from the Custom Access Token Hook output (already injects `tenant_id` per p1-identity-rls; extend to inject `role` + `current_term_id`).
2. **Page-layer fail-closed wrapper** — wraps `entity.dataFetcher` in a role-aware shell that performs the OWN_STUDENT resolver call + `throw new Error("OWN_STUDENT_UNRESOLVED")` per Shared dataFetcher contract clause 4 (currently deferred — see Assumption §7 + scaffold.md §3a clause 4). Catches the typed error at the page boundary and renders the no-permission UI.
3. **Server-action layer** — `lib/<domain>/actions/{create,update,soft-delete,restore}.ts` per entity for CRUD mutations (read path lives in `entity.dataFetcher` already). Each action calls `writeAuditLog` with `policy.auditActions` enrolment check + `policy.scopes.<action>` scope check.

### Deferred items refresh

| Item | Deferred to | Notes |
|---|---|---|
| Admin scaffold pages × 5 entities × 4 page types (List/Form/Detail/Edit) | `p2-scaffold-pages` | 4-line page pattern per spec §5.2; consumes `import student from "@/lib/entities/student/entity"` |
| Server-action layer for 5 entities (CREATE / UPDATE / SOFT_DELETE / RESTORE) | `p2-scaffold-pages` | Wires to admin pages; reads `policy.auditActions` + `policy.scopes.<action>` |
| `SessionContext` widening to include `role` + `currentTermId` | `p2-scaffold-pages` | Required for OWN_STUDENT resolver branch + role-aware page-layer wrapper |
| `OWN_STUDENT` resolver wiring (`studentIds` Set materialization for parents via `studentGuardians.guardianId IN (currentSession.guardianId)`) | `p2-scaffold-canary` | Flips `studentScopeUnresolved` flag false; until then page-layer fail-closed throw catches the unresolved state |
| Page-layer `OWN_STUDENT_UNRESOLVED` typed-error catch + no-permission UI | `p2-scaffold-pages` | Per Shared dataFetcher contract clause 4 + scaffold.md §3a |
| Playwright canary `e2e/admin/students.spec.ts` (re-enables CI Playwright globally) | `p2-scaffold-canary` | Rebuild-window guard auto-skips Playwright until first `e2e/**/*.spec.ts` lands |
| Role-based FileKind gating LOGIC per-entity (consumes `policy.fileKindAllowlist[session.role]`) | `p2-scaffold-canary` | Gate at upload route — fail-closed when role lookup yields `undefined` |
| `storage.objects` RLS Supabase-default-policy audit resolution | `p2-scaffold-canary` | First storage.objects writer ships with admin pages |
| WhatsApp `wa.me` invitation flow consumer (consumes GuardianInvitation tokens) | `p6-portal-invitation-flow` | Atomic `UPDATE ... WHERE status='PENDING'` consume populates Guardian.userId |
| Public `/daftar` admission form | `p2-admission-funnel` | Workflow state machine |
| Address chain (Province / Regency / District / Village FKs on Household) | `p2-addresses-idn-chain` | Household.addressId becomes non-nullable then |
| `AuditAction.AUTH_REJECT` enum value | future schema cycle | Not required for v1 launch |

### Rollback plan

- **Revert path:** `git revert <PR merge SHA>` undoes all 9 task commits cleanly. Each commit is fully isolated to its own file set:
  - T1: 1 source file (`lib/entities/_types.ts`) + cycle doc.
  - T2-T6 bundled: 15 source files (5 × 3 entity dirs) + cycle doc + `_types.ts` follow-up.
  - T7: 1 barrel + 5 test files + 3 policy.ts annotations + cycle doc.
  - T8: 1 standard file + cycle doc.
  - T9: README + CLAUDE.md + cycle doc.
- **Schema rollback:** N/A — no migrations.
- **Risk window:** essentially zero. Source/test/docs only — no migration, no env vars, no API routes, no UI, no live consumers (registries ship without admin pages; the engine-consumer surface is type-safe but the dataFetchers are unreachable from `app/**` until `p2-scaffold-pages` lands). Worst case is `prisma generate` failing in CI (already verified clean locally + on the gate scripts) or a stale TypeScript build cache (handled by Vercel's standard rebuild).
- **JWT hook:** unchanged. No re-deploy of Supabase config needed.

### Spec-time + post-build review streak

- **Spec-time `feature-dev:code-reviewer`** (cycle doc): 2 CRITICAL + 4 MAJOR + 2 MINOR findings — all addressed in cycle doc Spec/Tasks before /build. (8th cycle in the streak.)
- **Post-build T1 reviewer**: 1 Important finding (RoleCode inlining vs cross-import to seed) — addressed before T1 commit.
- **Post-build T2-T6 combined reviewer**: 5 MAJOR + 2 MINOR findings — all 7 addressed in the bundled commit before merge:
  - C1 (cycle-spec adjustment): dataFetcher OWN_STUDENT branch deferred to p2-scaffold-pages with throw contract documented for next cycle's wrapper
  - M1: Guardian listColumns gained `hasInvitation` indicator + dataFetcher includes `_count`
  - M3: GuardianInvitation schema swapped hand-rolled CUID regex for `z.string().cuid()`
  - M4-M5: Household / StudentIdentifier / GuardianInvitation entities now type-arg over Prisma row types
  - N1: file count 26 → 25 via `_types.test.ts` fold into Student test
  - N7: Student `searchFields` drops `nik` (PII minimisation)

### Lessons surfaced this cycle

- **`SessionContext` shape gap surfaced at /build time.** Cycle spec assumed `session.role` + `session.currentTermId` so dataFetchers could discriminate admin (ALL) from parent (OWN_STUDENT). Post-p1-auth the session carries only `{ tenantId, userId, supabaseUserId }`. Spec adjusted: dataFetchers admin-only this cycle; OWN_STUDENT throw branch deferred to `p2-scaffold-pages` when SessionContext widens. Lesson folded into scaffold.md §10: future cycles wiring per-role data access must `grep -n "type SessionContext\|interface SessionContext" lib/auth/session.ts` at spec time.
- **Narrow literal inference on `defineEntityPolicy<P>` blocks Partial-keyed absence tests.** Tests asserting `policy.fileKindAllowlist.parent === undefined` need the wide `Partial<Record<RoleCode, ...>>` type, not the narrow inferred-keys-only type. Annotate policy exports `: EntityPolicy` explicitly. T7 follow-up corrected 3 of 5 entity policies (Student + Guardian were already correctly annotated). Lesson folded into scaffold.md §1 + §10.
- **`EntityDef<InputType>` is the wrong narrowing pattern.** Always use the row type (Prisma model + relation includes). Spec-time + post-build review caught all 3 affected entities (Household / StudentIdentifier / GuardianInvitation). Future entities should never start from the input type — type-check the row return shape against `prisma.<model>.findMany(...)` includes early. Lesson folded into scaffold.md §3 + §10.
- **Subagent verbatim test reports critical when full-suite has known flakes.** T1's full-vitest run reported 6 failures; the implementer's targeted re-run + baseline `git stash` confirmed the 4-6 confirm-dialog/select failures were jsdom-parallel timing flakes pre-existing on origin/staging. Without verbatim grep + targeted-pass verification this would have been mis-attributed to the new code. Memory hint validated: "Subagent test reports must be verbatim — verify independently."
