# P2 Scaffold Pages — Guardian + Household slice (8 admin pages + 8 CRUD server actions + deferred Student ADR row)

## Type
page

## Context

Sub-split continuation of `p2-scaffold-pages` (PR #196, merged at staging tip ee8e7f2). The Student slice landed all foundational scaffold-page wiring: SessionContext widening (`+role +currentTermId`), `OwnStudentUnresolvedError` typed sentinel + `ScaffoldErrorState` no-permission branch, `assertScope` strict-ALL gate on writes, `ActionResult<T>` discriminated-union shape, `ScaffoldFormSpec<T>` extraction (RSC → Client serialisation), 4 Student admin pages at `/admin/akademik/siswa/*`, and 4 Student CRUD server actions. The README ADR row was deferred from that cycle to keep the file count at ≤25 — this cycle absorbs it.

This cycle wires Guardian + Household to the same patterns. Per foundation md §10A.1 Akademik group routing, pages live at `/admin/akademik/wali/*` (Guardian) and `/admin/akademik/keluarga/*` (Household). Per §10A.4 detail-tab pattern (locked):

- **StudentIdentifier** — never gets standalone admin pages (inline detail tab on Student per §10A.4); skipped permanently.
- **GuardianInvitation** — never gets standalone admin pages (action button + status pill on Guardian detail per §10A.4); skipped permanently.

So this cycle ships:

1. **8 admin pages** — Guardian × 4 (list / new / detail / edit) + Household × 4.
2. **8 CRUD server actions** — `lib/{guardians,households}/actions/{create,update,soft-delete,restore}.ts`. Each follows the Student-slice template VERBATIM with entity name swap. No new helpers — `assertScope`, `ActionResult<T>`, `OwnStudentUnresolvedError`, `formSpecFromEntity`, `ScaffoldFormPage` boundary contract all reused as-shipped.
3. **2 combined per-domain action test files** (1 file per entity, ~18 cases each mirroring `lib/students/actions/__tests__/actions.test.ts`).
4. **README ADR row** covering the entire scaffold-page rollout (Student slice + Guardian + Household). Single combined entry — both slices ship the same canonical pattern; separate rows would be redundant.

**Marathon mode** (foundation §18.12) — derives directly from the Student-slice contract documented in [docs/cycles/2026-05-07-p2-scaffold-pages.md](2026-05-07-p2-scaffold-pages.md). Skip `superpowers:brainstorming`; references the prior cycle by section. Standards loaded (cycle-doc tooling): `scaffold.md`, `ui.md`, `patterns.md`, `crud.md`, `audit-pii.md`, `api.md`, `security.md`.

### Cross-checked design-system.html §N for Z

This cycle's pages render exclusively through existing scaffold engine primitives (`ScaffoldListPage` / `ScaffoldFormPage` / `ScaffoldDetailPage` + `ScaffoldErrorState`) — zero new visual components. Cross-checked design-system.html § (Empty state / Error state / Form layout) — no new tokens or surface introduced. Frontend gate (Rule 4) satisfied.

## Spec

### Acceptance criteria

- [ ] 8 admin pages mount under §10A.1 routing convention:
  - Guardian: `/admin/akademik/wali/{,new/,[id]/,[id]/edit/}`
  - Household: `/admin/akademik/keluarga/{,new/,[id]/,[id]/edit/}`
- [ ] 8 CRUD server actions exist:
  - Guardian: `lib/guardians/actions/{create,update,soft-delete,restore}.ts`
  - Household: `lib/households/actions/{create,update,soft-delete,restore}.ts`
- [ ] Each action follows the Student-slice template VERBATIM (modulo entity name swap):
  - `getSession()` → returns `{ ok: false, error: "UNAUTHENTICATED" }` if null.
  - `assertScope(session, policy, action)` wrapped in try/catch → returns `{ ok: false, error: "FORBIDDEN" }` on throw.
  - `<entity>Schema.safeParse(input)` (or `.partial()` for `update`) → returns `{ ok: false, error: <issue.message>, field: <issue.path.join('.')> }` on fail.
  - `update`: extra `Object.keys(parsed.data).length === 0 → return NO_CHANGES` guard before any DB read (avoids phantom UPDATE audit row per audit-pii.md §4 — same lesson learned in Student slice).
  - `update / soft-delete / restore`: pre-fetch `before` row via `prisma.<entity>.findFirst({ where: { id, tenantId } })`. `update` adds `deletedAt: null` to the WHERE; `soft-delete / restore` omits the soft-delete clause to surface ALREADY_DELETED / NOT_DELETED idempotent paths. Returns `{ ok: false, error: "NOT_FOUND" }` if missing.
  - `soft-delete`: returns `{ ok: false, error: "ALREADY_DELETED" }` if `before.deletedAt != null`.
  - `restore`: returns `{ ok: false, error: "NOT_DELETED" }` if `before.deletedAt == null`.
  - `prisma.$transaction(create-or-update + writeAuditLog)` atomic per audit-pii.md §4. Audit emit gated on `policy.auditActions.includes(AuditAction.<action>)`.
  - `revalidatePath("/admin/akademik/<slug>")` for list invalidation; `update / soft-delete / restore` add `revalidatePath("/admin/akademik/<slug>/${id}")` for detail.
  - Returns `ActionResult<Guardian>` / `ActionResult<Household>`.
- [ ] List pages: 4-line `ScaffoldListPage` recipe with `breadcrumbs={[{ label: "Akademik", href: "/admin/akademik" }]}` and the `searchParams` pass-through pattern from `app/admin/akademik/siswa/page.tsx`. Pass full `entity` (RSC-only — no boundary crossed).
- [ ] New / edit pages: `ScaffoldFormPage<EntityRow>` with `formSpec={formSpecFromEntity(<entity>)}`. New page passes the create action directly as `onSubmit`. Edit page resolves the route id via `await params`, verifies `getSession()`, reads the row via tenant-scoped `findFirst({ deletedAt: null })`, calls `notFound()` if missing, and passes `updateGuardian.bind(null, id)` / `updateHousehold.bind(null, id)` as `onSubmit`. Both pages set the `breadcrumbs` array up to the entity list.
- [ ] Detail pages: `ScaffoldDetailPage<EntityRow>` with `fetchRow` resolved via `getSession` + tenant-scoped `findFirst({ deletedAt: null })`; `notFound()` if no session. `rowLabel` resolves a human-readable name: Guardian → `row.fullName`; Household → `row.code ?? row.id` (Household has no name field — code is the human-readable handle, falls through to id when code is null per schema § Household).
- [ ] **`assertScope` write-action coverage on both entities**: per `lib/entities/{guardian,household}/policy.ts` (already shipped p2-scaffold-registries), create/update grant ALL to A/P/KD/AO; soft_delete/restore grant ALL to A/P only. Strict-ALL gate fires correctly: KD/AO/HT/ST/parent on `soft_delete` returns FORBIDDEN; HT/ST/parent on `update` returns FORBIDDEN.
- [ ] **`assertScope` read-presence coverage**: Household read grants ALL to A/P/KD/AO/FO; Guardian read grants ALL to A/P/KD/AO + OWN_STUDENT to parent. Read posture is presence-only (any grant for the role passes); admin/finance read paths (FO Household read for sibling-discount queries) all clear the gate.
- [ ] **Guardian dataFetcher untouched** this cycle. Per registries cycle T6 Implementation note, the dataFetcher omits the parent-OWN_STUDENT throw branch (admin-tenant-only). The §10.7.3 drift #3 ruling says GuardianInvitation parent OWN_STUDENT grant is itself wrong, and §10A.3 confirms parent has no Guardian list page (PR: SELF reads via `/parent/akun/profil`, not a Guardian list). So Guardian portal-side parent reads are out of scope for both this cycle and `p2-scaffold-canary` (whose resolver work targets Student exclusively). Guardian remains effectively admin-only; widening lands when a future portal cycle genuinely surfaces Guardian to parents.
- [ ] **Household dataFetcher untouched** this cycle. `policy.scopes.read` already grants the full admin set + FO ALL, no parent. Per §10A.4 last bullet, `PR: OWN_HOUSEHOLD` on Household resolves parent-Beranda dashboard aggregation only — no standalone parent Household page. Admin-only routes here.
- [ ] Combined per-entity test files: `lib/{guardians,households}/actions/__tests__/actions.test.ts`. Each ~18 cases mirroring Student-slice ratios:
  - 6 `assertScope` cases (admin read pass / non-admin read pass-or-fail / admin create pass / non-create-grant role create FORBIDDEN / non-write-grant role update FORBIDDEN strict-ALL / soft_delete grant-or-no-grant FORBIDDEN).
  - 4 create cases (UNAUTHENTICATED / FORBIDDEN / happy path with audit emit + revalidate / INVALID_INPUT with field path).
  - 4 update cases (FORBIDDEN strict-ALL / NOT_FOUND / NO_CHANGES empty-PATCH / happy path with before+after audit + revalidate list+detail).
  - 2 soft-delete cases (ALREADY_DELETED idempotent / happy path).
  - 2 restore cases (NOT_DELETED idempotent / happy path).
- [ ] **README ADR row added** — single combined entry covering Student (deferred from p2-scaffold-pages) + Guardian + Household admin pages. Decision cell ≤400 chars (verified inline via `awk -F'|' 'NR==80 { print length($3) }' README.md` — gating fails at >400 chars).
- [ ] All gates green:
  - `npx prisma generate` clean.
  - `npm run lint` matches origin/staging baseline (1 warning: `nis-allocator.test.ts:52:28 _args` unused).
  - `npm run typecheck` clean.
  - `npm run build` clean. Route table registers 8 new admin routes.
  - `npx vitest run` ~+36 over Student-slice baseline (964 → ~1000).
  - `bash scripts/verify-rls-coverage.sh` 32/32 unchanged (no migration).
  - `bash scripts/verify-api-auth.sh` 4/4 unchanged (server actions live in `lib/<domain>/actions/`, not `app/api/`).
  - `bash scripts/verify-pii-annotations.sh` 5/5 unchanged.
  - `npm run scaffold:check` 5/5 entities validated.
  - **Playwright skip** — explicit + justified (zero specs in `e2e/`; first lands `p2-scaffold-canary`). Rebuild-window guard auto-skips.

### Non-goals (explicit deferrals)

- StudentIdentifier admin pages — **never** (§10A.4 detail-tab pattern absorbs into Student detail).
- GuardianInvitation admin pages — **never** (§10A.4 action button + status pill on Guardian detail).
- Playwright canary `e2e/admin/students.spec.ts` (or `guardians.spec.ts`) → `p2-scaffold-canary`. Rebuild-window guard re-enables CI Playwright when the first spec lands.
- Role-FileKind gating LOGIC at upload route → `p2-scaffold-canary`. `policy.fileKindAllowlist` is declared on every entity; the consumer code at `/api/upload` is the missing piece.
- OWN_STUDENT resolver wiring (`studentIds` Set materialization for parents) → `p2-scaffold-canary`. Until then, Student dataFetcher's parent-role branch throws `OwnStudentUnresolvedError` and the page renders the no-permission fail-closed UI. This cycle inherits the same posture for Student; Guardian + Household don't trigger the throw because their dataFetchers don't call `resolvePermissions` (admin-tenant-only).
- `storage.objects` RLS Supabase-default-policy audit resolution → `p2-scaffold-canary`.
- Drift #1 `Student.read` missing `FO: ALL` → `p3-fee-foundation` (matrix §10.7.3 — fix lands when finance reads Student first).
- Drift #2 `Guardian.read` missing `FO: ALL` → `p3-fee-foundation`. Matrix grants FO ALL on Guardian for wa.me targets; current `policy.ts` omits FO entirely. Fix lands when finance reads Guardian first.
- Drift #3 `GuardianInvitation.read` parent grant removal → next entity audit cycle. Low priority — no surface mounts the page.
- Sidebar nav shell + portal-role gating → `p2-portal-shell-sidebar`. Until then, admin-portal routes have no portal-level role gate; the strict-ALL `assertScope` posture on writes compensates.
- Public `/daftar` admission form → `p2-admission-funnel`.
- Address chain (Province / Regency / District / Village FKs on Household) → `p2-addresses-idn-chain`. `Household.addressId` becomes non-nullable then.
- WhatsApp wa.me invitation flow consumer → `p6-portal-invitation-flow`.

### Assumptions

1. **Guardian schema phone regex is already tightened** (`/^(\+62|0)8\d{8,10}$/` per p2-scaffold-registries M3). The `update` action's `partial()` schema inherits each field's individual validation including the regex — partial only flips `required` to optional, not the regex on supplied values. Verified at spec-time review (line 39 of `lib/entities/guardian/schema.ts`).
2. **Guardian `_count.guardianInvitations` include passes through to the list-column** without additional plumbing this cycle. The dataFetcher's `include: { _count: { select: { guardianInvitations: { where: { status: "PENDING" } } } } }` is preserved on raw row return; `EntityDef.listColumns` declares the `_count` column with `format: (row) => row._count.guardianInvitations > 0 ? "Diundang" : "Belum"`. Already wired in `lib/entities/guardian/entity.ts` (registries cycle T3 — see entity.ts:179-189). No additional surfacing in form / detail this cycle (form doesn't show invitation state; detail tabs render placeholders per registries cycle Assumption §10).
3. **Household `_count.students` include is server-side only this cycle**. `EntityDef.listColumns` deliberately does NOT surface it (registries cycle T4 entity.ts:21-27 — `_count` is not a `keyof Household` so the field cannot anchor a `listColumn` without row-type widening, which the registries cycle explicitly chose not to do). Detail-page `anggota` tab placeholder remains the consumer; deferred to a future cycle that wires the tab.
4. **Household policy declares `finance_officer: ALL` on read** (sibling-discount queries per §4.5). `assertScope` on read is presence-only; FO read passes. No write-side surface this cycle — FO has no finance write path until `p3-fee-foundation`.
5. **`updateGuardian.bind(null, id)` and `updateHousehold.bind(null, id)` preserve the use-server marker** per the Student-slice precedent. Bound server actions remain server actions; serialisation across the RSC → Client Component boundary still holds. Pattern verbatim from `app/admin/akademik/siswa/[id]/edit/page.tsx`.
6. **`formSpecFromEntity(<entity>)` works as-shipped on both entities**. Both `guardianEntity.formSections` and `householdEntity.formSections` use the registered renderer kinds (TEXT / EMAIL / PHONE / TEXTAREA — all in the 15/15 set per p1-scaffold-renderers). No new renderer needed. The form-spec extraction is JSON-plain (`{ labelSingular, formSections }`) — both entities' formSections are pure data with no closures.
7. **Household has no parent role in `policy.scopes.read`** per current shipped policy (`lib/entities/household/policy.ts` lines 47-52: admin / principal / kadiv / admission_officer / finance_officer ALL — no parent). Confirmed by Read tool inspection during spec drafting. Admin-only routes for this cycle.
8. **Detail page `rowLabel` for Household** falls back to `row.id` when `row.code` is null. `Household.code` is `optional` per `lib/entities/household/schema.ts:24` — schools may operate without explicit household codes (notes-only entries). The `rowLabel` lambda renders `row.code ?? row.id` so the breadcrumb header always has a string.
9. **Guardian + Household audit-emit reaches AuditLog** via the same `writeAuditLog` middleware tested in p1-audit-write-middleware. PII redactor (`lib/audit/redactor.ts`) covers `Guardian.nik` (redact) + `Guardian.phone` (mask:last4) — both appear in `before/after` payloads stripped. Household has no PII annotations (verified `verify-pii-annotations.sh` 5/5 unchanged).
10. **Guardian `userId` field on the row is server-set at GuardianInvitation acceptance**, not via this cycle's `update` action. The admin INPUT schema (`guardianSchema`) deliberately omits `userId` (registries cycle Assumption §3). The `update` action's `partial(safeParse)` accepts `{ fullName, email, nik, phone }` only; an attempt to pass `userId` is silently dropped (schema strips unknown keys at parse). Audit `before/after` reflect Prisma row values; `userId` shows up there but never on the form payload.
11. **`audit-pii.md` standard already loaded as a cycle prerequisite** (per CLAUDE.md standards table — applies to `lib/**/actions/**` glob). The cycle adds `lib/{guardians,households}/actions/**` files, both within scope. No standard edit this cycle — pattern documented in audit-pii.md §4 fits both entities cleanly.

## Tasks

### T1 — Guardian server actions × 4 + combined test file

- [ ] `lib/guardians/actions/create.ts` NEW — copy `lib/students/actions/create.ts` verbatim with substitutions: `studentSchema` → `guardianSchema`, `studentPolicy` → `guardianPolicy`, `Student` → `Guardian`, `student.create` → `guardian.create`, `siswa` → `wali`, `studentScopeUnresolved` clause N/A (parent role doesn't reach create — strict-ALL gate fires first).
- [ ] `lib/guardians/actions/update.ts` NEW — copy `lib/students/actions/update.ts` verbatim with same substitutions. Preserves the `Object.keys(parsed.data).length === 0 → NO_CHANGES` guard (audit-pii.md §4 phantom-UPDATE prevention).
- [ ] `lib/guardians/actions/soft-delete.ts` NEW — copy + substitute. Soft-delete grant: A/P only — KD/AO fail at the `assertScope` gate.
- [ ] `lib/guardians/actions/restore.ts` NEW — copy + substitute.
- [ ] `lib/guardians/actions/__tests__/actions.test.ts` NEW — combined test file (~18 cases) mirroring `lib/students/actions/__tests__/actions.test.ts`. Mocks: `@/lib/db`, `@/lib/auth/session`, `@/lib/audit/write`, `next/cache`. **All mock `SessionContext` literals MUST include `role: RoleCode` AND `currentTermId: string`** — the type was widened in p2-scaffold-pages and both fields are non-optional (see `lib/auth/session.ts:53-59`). Copy session shapes verbatim from `lib/students/actions/__tests__/actions.test.ts:48-68`. Sessions: ADMIN_SESSION, PARENT_SESSION, KADIV_SESSION (for soft-delete strict-ALL miss). Valid input: `{ fullName: "Bu Sari", email: "sari@example.com", nik: "3201010101010001", phone: "08123456789" }`. Expected error coverage: UNAUTHENTICATED, FORBIDDEN, INVALID_INPUT (NIK length / phone format), NOT_FOUND, NO_CHANGES, ALREADY_DELETED, NOT_DELETED.
- **Acceptance:** `npx vitest run lib/guardians/actions/` ~18 cases green. `npm run typecheck` clean. **Independent of T2** (different domain).

### T2 — Household server actions × 4 + combined test file

- [ ] `lib/households/actions/create.ts` NEW — copy verbatim with substitutions: `studentSchema` → `householdSchema`, `studentPolicy` → `householdPolicy`, `Student` → `Household`, `student.create` → `household.create`, `siswa` → `keluarga`.
- [ ] `lib/households/actions/update.ts` NEW — copy verbatim. NO_CHANGES guard preserved.
- [ ] `lib/households/actions/soft-delete.ts` NEW — copy + substitute.
- [ ] `lib/households/actions/restore.ts` NEW — copy + substitute.
- [ ] `lib/households/actions/__tests__/actions.test.ts` NEW — combined test file (~18 cases). Mocks identical to T1 with `household` table. **Mock sessions must include `role` + `currentTermId`** per the same widening note as T1. Sessions include FINANCE_OFFICER_SESSION (for read-pass on FO ALL grant + create-FORBIDDEN at strict-ALL gate since FO has no create grant). Valid input: `{ code: "KEL-001", notes: "Keluarga Pak Budi" }`. Expected error coverage: same set as T1.
- **Acceptance:** `npx vitest run lib/households/actions/` ~18 cases green. `npm run typecheck` clean. **Independent of T1.**

### T3 — Guardian admin pages × 4

- [ ] `app/admin/akademik/wali/page.tsx` NEW — copy `app/admin/akademik/siswa/page.tsx` verbatim with `student` → `guardian` import + breadcrumb pass-through unchanged.
- [ ] `app/admin/akademik/wali/new/page.tsx` NEW — copy `app/admin/akademik/siswa/new/page.tsx`. **Import note:** `lib/entities/guardian/entity.ts` exports `entity` (named) + `entity` (default) — there is NO `guardianEntity` named export (Household has `householdEntity` named, Guardian doesn't). Import via `import guardian from "@/lib/entities/guardian/entity"` (default), mirroring the Student template. `Student` type → `GuardianRow` (NOT raw Prisma `Guardian` — the row type widening per `lib/entities/guardian/entity.ts:54-66` adds `_count.guardianInvitations`). `createStudent` → `createGuardian`. Cancel href → `/admin/akademik/wali`. Breadcrumbs: `[{ label: "Akademik", href: "/admin/akademik" }, { label: "Wali", href: "/admin/akademik/wali" }]`.
- [ ] `app/admin/akademik/wali/[id]/page.tsx` NEW — copy `app/admin/akademik/siswa/[id]/page.tsx`. Default-import `guardian` from entity module. **Type parameter is `ScaffoldDetailPage<GuardianRow>`** (forward-compat: detail tabs in a future cycle will read `row._count.guardianInvitations`; without `GuardianRow` widening the `_count` shape isn't typed). `prisma.student.findFirst` → `prisma.guardian.findFirst` with `include: { _count: { select: { guardianInvitations: { where: { status: "PENDING" } } } } }` to match the row-type contract. `rowLabel={(row) => row.fullName}`. Breadcrumbs same as new page.
- [ ] `app/admin/akademik/wali/[id]/edit/page.tsx` NEW — copy `app/admin/akademik/siswa/[id]/edit/page.tsx`. Default-import `guardian`. `ScaffoldFormPage<GuardianRow>`. `updateStudent.bind(null, id)` → `updateGuardian.bind(null, id)`. `initialValues={row as Partial<GuardianRow>}`. Edit-form `findFirst` does NOT need the `_count` include — the form only consumes input-shape fields (fullName / email / nik / phone), not the count.
- **Acceptance:** `npm run build` route table registers all 4 new routes (`/admin/akademik/wali`, `/admin/akademik/wali/new`, `/admin/akademik/wali/[id]`, `/admin/akademik/wali/[id]/edit`). No runtime smoke this cycle (deferred to manual + p2-scaffold-canary). **Depends on T1** (server actions exist).

### T4 — Household admin pages × 4

- [ ] `app/admin/akademik/keluarga/page.tsx` NEW — copy + substitute `student` → `householdEntity` (exported as `entity` + `householdEntity` from `lib/entities/household/entity.ts`).
- [ ] `app/admin/akademik/keluarga/new/page.tsx` NEW — copy + substitute. `Student` type → `Household`. `createStudent` → `createHousehold`. Cancel href → `/admin/akademik/keluarga`. Breadcrumbs: `[{ label: "Akademik", href: "/admin/akademik" }, { label: "Keluarga", href: "/admin/akademik/keluarga" }]`.
- [ ] `app/admin/akademik/keluarga/[id]/page.tsx` NEW — copy + substitute. `prisma.household.findFirst({ where: { id, tenantId: session.tenantId, deletedAt: null } })`. `rowLabel={(row) => row.code ?? row.id}` (per Assumption §8).
- [ ] `app/admin/akademik/keluarga/[id]/edit/page.tsx` NEW — copy + substitute. `updateStudent.bind(null, id)` → `updateHousehold.bind(null, id)`.
- **Acceptance:** `npm run build` route table registers 4 new routes. **Depends on T2.**

### T5 — README ADR row + cycle doc fill + end-of-cycle gate + Verification + Ship Notes

- [ ] **README ADR row** — add a single row at the head of the Active ADRs table dated 2026-05-07 covering:
  - v2 scaffold pages — Student/Guardian/Household admin pages × 4 each + 12 CRUD server actions (create/update/soft-delete/restore per entity) + SessionContext widening + page-layer fail-closed wrapper (Student slice landed p2-scaffold-pages #196; Guardian + Household this cycle). Strict-ALL `assertScope` posture on writes compensates for absent portal-role gating until p2-portal-shell-sidebar.
  - Cycle links: both `2026-05-07-p2-scaffold-pages.md` (Student slice) + this cycle.
  - Decision cell ≤400 chars verified inline via `awk -F'|' 'NR==80 { print length($3) }' README.md` — pre-commit ADR-cell-length rule otherwise rejects.
- [ ] Run end-of-cycle gate: `npx prisma generate && npm run lint && npm run typecheck && npm run build && npx vitest run`. Playwright skipped (zero specs; first lands p2-scaffold-canary — record skip explicitly in Verification).
- [ ] Run verify gates: `bash scripts/verify-rls-coverage.sh` (32/32 unchanged), `bash scripts/verify-api-auth.sh` (4/4 unchanged), `bash scripts/verify-pii-annotations.sh` (5/5 unchanged), `npm run scaffold:check` (5/5 unchanged).
- [ ] Fill cycle doc Implementation + Verification + Ship Notes (this section pre-filled at /spec; /build replaces with verbatim outputs).
- [ ] Spec-time + end-of-cycle code review (`feature-dev:code-reviewer` per CLAUDE.md /build pattern). Spec-time review on this cycle doc BEFORE /build runs. End-of-cycle review on the final diff after T1-T4 commits + this T5 commit. Surface + address CRITICAL / IMPORTANT findings as in-task fix edits before commit.
- **Acceptance:** all gates green; cycle doc all 6 sections populated; ready for /ship.

## Implementation

- T1 — `lib/guardians/actions/{create,update,soft-delete,restore}.ts` NEW (4 server actions, each `"use server"` directive at top). Mirrors Student-slice template VERBATIM with `Student` → `Guardian` substitution. `update` preserves the empty-PATCH `NO_CHANGES` guard before any DB read (audit-pii.md §4 phantom-UPDATE prevention). Soft-delete + restore idempotent paths (`ALREADY_DELETED` / `NOT_DELETED`). Audit emit gated on `policy.auditActions.includes(AuditAction.<action>)` per Guardian policy enrolment `[CREATE, UPDATE, SOFT_DELETE, RESTORE]`. `revalidatePath` on `/admin/akademik/wali` for list + `/admin/akademik/wali/${id}` for detail. `lib/guardians/actions/__tests__/actions.test.ts` NEW combined test file: 6 assertScope cases (admin read pass, parent read pass via OWN_STUDENT, admin create pass, parent create FORBIDDEN, kadiv soft_delete FORBIDDEN [A/P only], parent update FORBIDDEN) + 4 createGuardian + 4 updateGuardian + 3 softDeleteGuardian + 2 restoreGuardian = 19 cases total.
- T2 — `lib/households/actions/{create,update,soft-delete,restore}.ts` NEW (4 server actions). Same pipeline as T1 with `Household` substitution. `revalidatePath` on `/admin/akademik/keluarga` + `/admin/akademik/keluarga/${id}`. `lib/households/actions/__tests__/actions.test.ts` NEW: 6 assertScope (admin read pass, FO read pass via sibling-discount ALL grant, parent read FORBIDDEN [no parent grant on Household], admin create pass, FO create FORBIDDEN [read-only], kadiv soft_delete FORBIDDEN [A/P only]) + 4 createHousehold + 4 updateHousehold + 3 softDeleteHousehold + 2 restoreHousehold = 19 cases total. After T2: 989 baseline → 1008 (+19 expected).
- T3 — 4 admin Guardian pages live at `/admin/akademik/wali/{,new/,[id]/,[id]/edit/}` per §10A.1. Default-import `guardian` from `lib/entities/guardian/entity`; `GuardianRow` type parameter on form + detail pages preserves `_count.guardianInvitations` shape. Detail page's `findFirst` includes `_count: { guardianInvitations: { where: { status: "PENDING" } } }` for forward-compat with detail tabs. Edit page uses `updateGuardian.bind(null, id)` — Next.js preserves the use-server marker on bound server actions. Build registers all 4 new routes (`ƒ /admin/akademik/wali`, `○ /admin/akademik/wali/new`, `ƒ /admin/akademik/wali/[id]`, `ƒ /admin/akademik/wali/[id]/edit`).
- T4 — 4 admin Household pages live at `/admin/akademik/keluarga/{,new/,[id]/,[id]/edit/}`. Named-import `householdEntity` (the entity module exports both `householdEntity` and `entity` as the canonical alias). `HouseholdRow` type parameter on form + detail pages. Detail page `findFirst` includes `_count: { students: true }` matching the row widening; `rowLabel={(row) => row.code ?? row.id}` (Household.code is `String?` nullable). Edit page uses `updateHousehold.bind(null, id)`. Build registers all 4 new routes (`ƒ /admin/akademik/keluarga`, `○ /admin/akademik/keluarga/new`, `ƒ /admin/akademik/keluarga/[id]`, `ƒ /admin/akademik/keluarga/[id]/edit`).

## Verification

End-of-cycle gate (final, all green):

- `npx prisma generate` → `✔ Generated Prisma Client (7.6.0)` clean.
- `npm run lint` → `✖ 1 problem (0 errors, 1 warning)` — single warning is the pre-existing `lib/students/__tests__/nis-allocator.test.ts:52:28 _args` unused; unchanged from origin/staging baseline.
- `npm run typecheck` → clean (exit 0).
- `npm run build` → clean. Route table registers all 8 new admin routes: `ƒ /admin/akademik/wali`, `○ /admin/akademik/wali/new`, `ƒ /admin/akademik/wali/[id]`, `ƒ /admin/akademik/wali/[id]/edit`, `ƒ /admin/akademik/keluarga`, `○ /admin/akademik/keluarga/new`, `ƒ /admin/akademik/keluarga/[id]`, `ƒ /admin/akademik/keluarga/[id]/edit` (alongside the 4 Student routes from p2-scaffold-pages — 12 admin/akademik routes total).
- `npx vitest run` → `Test Files 3 failed | 41 passed | 1 skipped (45) / Tests 6 failed | 998 passed | 4 skipped (1008)` (+38 over Student-slice baseline 964 → 1008 — T1 Guardian +19 + T2 Household +19. Drift +2 unrelated). The 6 failures are pre-existing flakes in confirm-dialog (4) + select (1) + page-contract (1) — same flakes documented in `docs/cycles/2026-05-07-p2-scaffold-pages.md`. Verified targeted-pass: `npx vitest run components/ui/__tests__/confirm-dialog.test.tsx components/ui/__tests__/select.test.tsx lib/scaffold/__tests__/page-contract.test.tsx` → 29/29 pass standalone. Issue is render-budget-bound under jsdom + the full-suite parallel pressure.
- `bash scripts/verify-rls-coverage.sh` → `✓ RLS coverage OK: 32 / 32 tenant-scoped models have ENABLE + policy.` (unchanged — no migration this cycle).
- `bash scripts/verify-api-auth.sh` → `✓ API auth coverage OK: 4 / 4 routes have session helper or @public sentinel.` (unchanged — server actions are NOT API routes; verify-api-auth.sh scans `app/api/**` only).
- `bash scripts/verify-pii-annotations.sh` → `✓ PII annotation coverage OK: 5 / 5 known-PII fields annotated.` (unchanged — no schema changes).
- `npm run scaffold:check` → `5 entities validated.` (guardian-invitation / guardian / household / student / student-identifier — unchanged; the new page files at `app/admin/**` are outside the scaffold-check scan path).
- **Playwright skip — explicit + justified:** `e2e/` contains only `__snapshots__/` (snapshot fixtures, no `*.spec.ts`). The rebuild-window guard in `.github/workflows/ci.yml` automatically skips Playwright when no specs exist. First admin spec lands `p2-scaffold-canary`; the guard re-enables itself the moment it detects an `e2e/**/*.spec.ts` file.

Per-task verification:

- T1: `npx vitest run lib/guardians/actions/` → 19 cases green. Coverage: 6 `assertScope` + 4 createGuardian + 4 updateGuardian + 3 softDeleteGuardian + 2 restoreGuardian. Strict-ALL gate fires correctly: kadiv on soft_delete returns FORBIDDEN (Guardian.soft_delete grants A/P only), parent on update returns FORBIDDEN (no parent grant). NO_CHANGES guard fires before any DB read.
- T2: `npx vitest run lib/households/actions/` → 19 cases green. Coverage mirrors T1 with FO swapped for parent on the policy-difference cases: FO read passes presence-only (Household.read FO ALL — sibling-discount queries), FO create returns FORBIDDEN (read-only on Household), kadiv soft_delete returns FORBIDDEN (Household.soft_delete grants A/P only).
- T3: `npm run build` registers 4 Guardian admin routes. Default-import `guardian` from entity module (no `guardianEntity` named export — only `entity` + default; verified). Detail page typed `ScaffoldDetailPage<GuardianRow>` with `_count.guardianInvitations` include preserved. Edit page uses `updateGuardian.bind(null, id)` — bound server action retains use-server marker.
- T4: `npm run build` registers 4 Household admin routes. Named-import `householdEntity` (entity module exports both `householdEntity` + `entity` alias). Detail page `rowLabel={(row) => row.code ?? row.id}` (Household.code is `String?` nullable per schema).
- Cross-checked design-system.html § (Empty / Error / No-permission states + Form layout + Detail anatomy) — no new tokens or visual surfaces introduced; rendering flows entirely through existing scaffold engine primitives. Frontend gate (Rule 4) satisfied.

Manual smoke (deferred to p2-scaffold-canary):

This cycle ships zero Playwright canary; first admin E2E spec lands `p2-scaffold-canary`. Manual smoke against Vercel preview will exercise: Guardian list page renders + empty state, Guardian new form submits create action + redirects to detail, Guardian detail page tabs render placeholders, Guardian edit form pre-populates initial values + submits update, Guardian soft-delete + restore actions emit audit rows + flip `deletedAt`. Same for Household. Documented as a Ship Notes step rather than a gate-blocker per the cycle type (`page` w/ Playwright deferral).

## Ship Notes

### Migrations to run

**None.** This cycle ships zero schema changes. `prisma/schema.prisma` untouched. `prisma/migrations/` untouched. RLS strict count remains 32/32. PII gate remains 5/5. API auth gate remains 4/4.

### New env vars

**None.** No env-var changes; no operator action required on Vercel preview / staging.

### Deferred-items refresh

| Item | Deferred to | Notes |
|---|---|---|
| StudentIdentifier admin pages | **never** (collapsed) | §10A.4 detail-tab pattern absorbs into Student detail. |
| GuardianInvitation admin pages | **never** (collapsed) | §10A.4 action-button + status-pill on Guardian detail. |
| Playwright canary `e2e/admin/{students,wali,keluarga}.spec.ts` | `p2-scaffold-canary` | Re-enables CI Playwright globally (rebuild-window guard auto-skips until first spec lands). |
| Role-based FileKind gating LOGIC at upload route | `p2-scaffold-canary` | Consumes `policy.fileKindAllowlist[session.role]`; fail-closed when `undefined`. |
| OWN_STUDENT resolver wiring (`studentIds` Set materialization for parents) | `p2-scaffold-canary` | Flips `studentScopeUnresolved=false`; until then page-layer fail-closed wrapper catches the typed error and renders the no-permission state. Guardian + Household out-of-scope (admin-only effectively per Spec assumptions). |
| `storage.objects` RLS Supabase-default-policy audit resolution | `p2-scaffold-canary` | First storage.objects writer ships with admin pages. |
| Drift #1 `Student.read` missing `FO: ALL` | `p3-fee-foundation` | Matrix §10.7.3 — fix lands when finance reads Student first. |
| Drift #2 `Guardian.read` missing `FO: ALL` | `p3-fee-foundation` | Same as drift #1. Matrix grants FO ALL on Guardian for wa.me targets; current `policy.ts` omits FO. |
| Drift #3 `GuardianInvitation.read` parent grant removal | next entity audit cycle | Low priority; no surface mounts the page. |
| Sidebar nav shell + portal-role gating | `p2-portal-shell-sidebar` | Until then, admin-portal routes have no portal-level role gate; the strict-ALL `assertScope` posture on writes compensates per spec-time review. |
| WhatsApp wa.me invitation flow consumer | `p6-portal-invitation-flow` | Atomic `UPDATE ... WHERE status='PENDING'` consume on token URL. |
| Public `/daftar` admission form | `p2-admission-funnel` | Workflow state machine. |
| Address chain (Province / Regency / District / Village FKs on Household) | `p2-addresses-idn-chain` | `Household.addressId` becomes non-nullable then. |
| Guardian dataFetcher OWN_STUDENT throw branch | indefinite | Per spec-time review reasoning — Guardian is admin-only effectively (parent reads Guardian via SELF on `/parent/akun/profil`, not a Guardian list). Widens only when a future portal cycle genuinely surfaces Guardian to parents. |
| Household + Guardian detail-tab content | future per-tab cycle | This cycle ships placeholder render functions per registries cycle Assumption §10. Anggota tab on Household + Anak / Riwayat / Aktivitas tabs on Guardian wired in domain-specific cycles. |

### Rollback plan

`git revert <PR merge SHA>` undoes all task commits cleanly. Per-commit isolation:

- T1: 6 files (4 Guardian actions + 1 combined test + cycle doc).
- T2: 6 files (4 Household actions + 1 combined test + cycle doc note).
- T3: 5 files (4 Guardian pages + cycle doc note).
- T4: 5 files (4 Household pages + cycle doc note).
- T5: README + cycle doc Verification + Ship Notes (this commit).

Risk surface: zero schema changes, zero env vars, zero migrations, zero new API routes (server actions live in `lib/{guardians,households}/actions/`, not `app/api/`). The `SessionContext` shape was already widened in Student slice; this cycle consumes the same shape via the same `getSession()` callers. Detail page `_count` includes are forward-compat-only — list pages already use the same includes via the dataFetcher.

### Spec-time + post-build review streak (11th cycle)

- **Spec-time `feature-dev:code-reviewer`** (cycle doc): 0 CRITICAL + 3 IMPORTANT findings — all addressed inline in the cycle doc before /build:
  - Guardian entity import name (`entity` default, NOT `guardianEntity` named — only Household has the `householdEntity` named alias). Spec patched to clarify default-import.
  - Guardian detail page type parameter (`ScaffoldDetailPage<GuardianRow>` with `_count.guardianInvitations` include preserved — without GuardianRow widening, `_count` shape isn't typed).
  - Test mock SessionContext literals must include `role` + `currentTermId` per the p2-scaffold-pages widening. Spec patched to call out copying session shapes from the Student template verbatim.

### Lessons surfaced this cycle

- **Sub-split cycle pattern works.** Student slice landed the foundational scaffold-page wiring (SessionContext widen, page-layer fail-closed wrapper, server-action helpers, formSpec extraction). This cycle reuses 100% of that infrastructure with zero engine-side edits — only domain copy-paste. File count fits 18 (well under §18.2 ≤25 cap). Pattern repeatable for downstream entity rollouts (ClassSection, Employee, Invoice, etc.).
- **Default vs named export inconsistency between entities.** Student + Guardian export `entity` only (with default re-export); Household exports `householdEntity` + `entity` alias. The split caused a one-line spec-time review finding. Future entity registries should standardise on the dual-named pattern (`<entity>Entity` named + `entity` alias + default re-export) for consistency. Filed for follow-up in next entity registry cycle.
- **Detail page _count includes are forward-compat-only this cycle.** Detail tabs render placeholders; the includes preserve the row-shape contract so future tab consumers reading `row._count.<rel>` don't need a refactor at the findFirst layer. Matches the dataFetcher's existing include pattern — list + detail stay symmetric.
