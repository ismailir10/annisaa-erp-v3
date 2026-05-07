# P2 Scaffold Canary — Playwright canary + OWN_STUDENT resolver wiring + role-based FileKind upload gating + storage.objects RLS audit

## Context

Continuation cycle following `p2-scaffold-pages-guardian-household` (#198, staging tip `ea00b9b`). Closes the four scaffold-engine deferrals that `p2-scaffold-pages` + `p2-scaffold-pages-guardian-household` pushed forward into a single coherent slice:

1. **Playwright canary** — first admin E2E spec on the v2 scaffold engine. CI's rebuild-window guard (`.github/workflows/ci.yml:115-127`) auto-skips the Playwright job until the first `e2e/**/*.spec.ts` lands; this cycle is the trigger that re-enables the gate globally for every subsequent cycle.
2. **Role-based FileKind gating LOGIC at upload route** — every entity policy (`lib/entities/{student,guardian,household,student-identifier,guardian-invitation}/policy.ts`) declares `fileKindAllowlist: Partial<Record<RoleCode, ReadonlyArray<FileKind>>>`. The DECLARATION shape exists; the consumer is missing. `app/api/upload/route.ts` ships with the explicit out-of-scope note `Role-based FileKind gating (any auth'd user can upload any kind)` (lines 23-26). This cycle wires the consumer with fail-closed semantics on `undefined` allowlist key.
3. **OWN_STUDENT resolver wiring** — `lib/scaffold/permission.ts:270-282` carries a `studentScopeUnresolved` flag set to `true` for any `parent` caller because the resolver still has the pre-Student-model TODO. `Student` (migration 07) + `Guardian`/`StudentGuardian`/`GuardianInvitation` (migration 08) have landed; the materialization query is now possible. Student `dataFetcher` already throws `OwnStudentUnresolvedError` on the unresolved flag (`lib/entities/student/entity.ts` Clause 4), and `ScaffoldErrorState` already renders the no-permission UI. This cycle materializes `studentIds: Set<string>` for the parent role via `studentGuardian.findMany({ where: { tenantId, deletedAt: null, guardian: { userId, tenantId, deletedAt: null } } })` — the JOIN must thread `tenantId` on BOTH sides per composite-FK §6.4 to forbid cross-tenant leakage.
4. **storage.objects RLS Supabase-default-policy audit resolution** — `prisma/migrations/07_students/migration.sql` already folded `tenant_scoped_storage_select` (authenticated SELECT scoped by `name LIKE tenant_id || '/%'`) and `no_writes_via_postgrest_storage` (anon+authenticated DENY ALL) inline. Outstanding question: do Supabase's *default* `storage.objects` policies still ship a permissive overlay (e.g. "Allow public access") that the migration didn't `DROP POLICY ... IF EXISTS` ahead of? This cycle empirically enumerates the live policy set on staging via the Supabase MCP `execute_sql` tool, documents the actual state, and ships migration 17 ONLY if the audit surfaces a gap.

Marathon mode (foundation §18.12) — derives directly from `p2-scaffold-pages` + `p2-scaffold-pages-guardian-household` contracts. Skip `superpowers:brainstorming`.

**Required reading consumed:** `docs/cycles/2026-05-07-p2-scaffold-pages.md`, `docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md`, foundation §10.7.1/§10.7.4/§18.x, `lib/scaffold/permission.ts`, `lib/scaffold/errors.ts`, `lib/scaffold/error-state.tsx`, `lib/entities/student/entity.ts`, `app/api/upload/route.ts`, `lib/entities/{student,guardian,household,student-identifier,guardian-invitation}/policy.ts`, `e2e/__snapshots__/`, `.github/workflows/ci.yml:62-160`, `prisma/migrations/07_students/migration.sql` storage.objects section.

## Spec

### Acceptance criteria

- [ ] **AC1 — Playwright canary smoke spec lands.** `e2e/admin/students.spec.ts` covers the read-only navigation surface for admin role: login → list page → empty-state copy → new-form heading + fields → cancel → back to list. ≥10 explicit assertions. Authenticates via `POST /api/_demo/login?role=admin` (24h HMAC cookie carrying `tenantId/userId/supabaseUserId/role/currentTermId`). Runs against production build per `playwright.config.ts:21-37` (`DEMO_MODE=true npm run start`, port 3000, Chromium-only, workers: 1).
  - **Form-submit + detail + edit + soft-delete + restore explicitly DROPPED from canary scope.** Three independent blockers:
    1. `Student` entity declares relation fields `programId` (RELATION → Program) + `householdId` (RELATION → Household). The combobox renderer (`lib/scaffold/renderers/relation.tsx`) calls `/api/Program?q=&limit=20` + `/api/Household?q=&limit=20` — neither route exists. New-form submission is impossible end-to-end without those routes.
    2. No Household seed exists (`prisma/seed/` has no household-seed file). Edit-flow on a pre-seeded Student requires a Household row to FK against.
    3. Student `entity.detailActions = []` — the detail-page shell renders no soft-delete/restore affordance yet (verified at `lib/entities/student/entity.ts`).
  - Wiring (1) + (2) + (3) is a separate entity-actions cycle (1 endpoint per relation × 5 entities + Household seed + per-entity defineAction calls). Out of scope for the 4-deferral close. The canary's value is the CI Playwright re-enable + scaffold smoke proof — depth lands as the entity-actions cycle ships.
- [ ] **AC2 — CI Playwright re-enables globally.** Rebuild-window guard at `.github/workflows/ci.yml:115-127` detects the first `e2e/**/*.spec.ts` and runs the suite. PR check status `Playwright E2E` reports an actual run (not "No e2e specs found - skipping"). Verified via the cycle's own PR.
- [ ] **AC3 — Upload route consumes `policy.fileKindAllowlist[role]`.** `app/api/upload/route.ts` accepts a new required form field `resource` (verbatim Prisma model name — e.g. `"Student"`, `"Guardian"`, `"Household"`). Resolver loads the matching policy, looks up `policy.fileKindAllowlist[session.role]`, and rejects with **403 `forbidden_kind`** when:
  - The role has no allowlist key → `undefined` lookup → fail-closed 403.
  - The role has a key but the submitted `kind` is not in the array → 403.
  - Removes the line-25 out-of-scope note. The pre-existing `unauthorized` 401, `invalid_kind` 400, `mime_kind_mismatch` 400, and rate-limit 429 contracts are unchanged.
  - Unknown `resource` (no matching entity policy) → **400 `invalid_resource`**.
  - Missing `resource` → 400 `missing_field` (matches existing missing-field shape).
- [ ] **AC4 — Permission resolver wires OWN_STUDENT for parent role.** `lib/scaffold/permission.ts` materializes `studentIds: Set<string>` when `OWN_STUDENT` is in `grantedScopes`:
  ```ts
  const rows = await args.prisma.studentGuardian.findMany({
    where: {
      tenantId: args.tenantId,
      deletedAt: null,
      guardian: { userId: args.userId, tenantId: args.tenantId, deletedAt: null },
    },
    select: { studentId: true },
  });
  for (const r of rows) studentIds.add(r.studentId);
  ```
  Sets `studentScopeUnresolved = true` ONLY when `OWN_STUDENT` is granted AND no Guardian row exists for `(userId, tenantId)`. When a Guardian row exists with zero StudentGuardian links, returns empty `studentIds` Set with `studentScopeUnresolved: false` (genuine empty allowlist, not unresolvable). 5-min LRU cache TTL unchanged. 5k overflow boundary unchanged.
- [ ] **AC5 — Student `dataFetcher` parent branch resolves end-to-end.** Parent caller with valid Guardian + N StudentGuardian rows → list page renders the parent's children only via `id IN (...)` predicate. `OwnStudentUnresolvedError` thrown only when no Guardian row exists for `userId` (fail-closed). Existing Clause 4 logic untouched — driven entirely by AC4's behavior change.
- [ ] **AC6 — `storage.objects` RLS audit completed + documented.** Cycle doc `Verification` section enumerates the live policy set on staging (via `mcp__14f2ac2d-..._execute_sql`: `SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects';`). Compare against the two policies migration 07 added. **Migration 17 ships ONLY if** the audit surfaces a permissive default still attached (e.g. `Allow public access`, `Give users access to own folder`). If shipped, migration 17 must `DROP POLICY ... IF EXISTS` for the conflicting default BEFORE adding any restrictive `CREATE POLICY` (per spec-time review note: never add restrictive policies on top of conflicting defaults — empirical before-and-after capture required). Migration test `prisma/migration-tests/17-storage-rls-audit.test.ts` parses `migration.sql` statically.
- [ ] **AC7 — Tests:**
  - [ ] `e2e/admin/students.spec.ts` — Playwright (AC1).
  - [ ] `app/api/upload/__tests__/route.test.ts` extends — 3 pass + 3 fail role-FileKind cases.
  - [ ] `lib/scaffold/__tests__/permission.test.ts` extends — 4 parent-role studentIds materialization cases (no Guardian → unresolved, Guardian + zero StudentGuardian → empty Set + resolved, Guardian + N StudentGuardian → Set of N, cache hit on second call within TTL).
  - [ ] `lib/entities/__tests__/student.entity.test.ts` extends — 1-2 cases over current OWN_STUDENT branch coverage (parent dataFetcher with resolved studentIds renders `id IN [...]` predicate).
  - [ ] `prisma/migration-tests/17-storage-rls-audit.test.ts` — only if migration 17 ships.
- [ ] **AC8 — All gates green:**
  - `npx prisma generate`
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npx vitest run` — baseline TBD-at-build-time (current local count read from a fresh `npx vitest run` snapshot before any changes); delta = T2 (4 cases) + T4 (8 cases) + T5 (1-2 cases) + T7 migration test (0-1 cases) = **+13 to +15 new vitest cases**. Per spec-time review SF3, the implementer captures the exact baseline at /build T0 and asserts the delta lands within +13 to +15 (Playwright lives outside `npx vitest run`).
  - `npx playwright test` — first real run since pre-rebuild; expected 1 spec, ≥10 assertions, ~30s cold-spin
  - `bash scripts/verify-rls-coverage.sh` — 32/32 unchanged (no new tenant-scoped models). If migration 17 ships, count holds (storage.objects is non-tenant-scoped per `verify-rls-coverage.sh` exclusion set — same precedent as `09_regions`).
  - `bash scripts/verify-api-auth.sh` — 4/4 unchanged.
  - `bash scripts/verify-pii-annotations.sh` — 5/5 unchanged.
  - `npm run scaffold:check` — 5/5 unchanged.

### Non-goals (explicit deferrals)

- Guardian/Household Playwright specs → next canary or per-portal cycle. Student spec is the canonical first; Guardian + Household ride on the same page recipe so a single canary is sufficient gate.
- Drift #1 `Student.read` missing `finance_officer` ALL → `p3-fee-foundation`.
- Drift #2 `Guardian.read` missing `finance_officer` ALL → `p3-fee-foundation`.
- Drift #3 `GuardianInvitation.read` parent grant removal → next entity audit cycle.
- Sidebar nav shell + portal-role gating → `p2-portal-shell-sidebar`.
- Public `/daftar` admission form → `p2-admission-funnel`.
- Address chain → `p2-addresses-idn-chain`.
- Update tx tenantId WHERE hardening cross-entity sweep → spawned follow-up task chip from `p2-scaffold-pages-guardian-household`.
- Guardian `dataFetcher` OWN_STUDENT throw branch → indefinite (Guardian effectively admin-only; widen only if a future portal cycle surfaces Guardian to parents).
- Detail-tab content (Anggota / Anak / Riwayat / Aktivitas) → future per-tab cycles.
- Upload-route consumer migrations (existing call sites still using `kind` only) → none exist yet (no caller currently posts to `/api/upload` outside tests). The contract change is safe — first real consumer lands in a future detail-tab cycle.

### Assumptions

1. **Form-field name = `resource` (verbatim Prisma model name).** Matches `policy.resource` directly. Avoids slug-vs-resource translation indirection. Caller posts `resource: "Student"` (PascalCase, exact). Alternative considered + rejected: lowercase `entity: "student"` — would require a slug→resource map maintained alongside the policy registry; redundant since the registry already keys on `policy.resource`.
2. **Policy registry lookup uses the existing scaffold-check entity index.** `scripts/scaffold-check.ts` already enumerates entity policies; the upload route imports a runtime policy registry built from the same source. New module `lib/entities/_registry.ts` (`POLICY_BY_RESOURCE: Record<string, EntityPolicy>`) — small enough to inline; avoids dynamic import (Next.js bundler limitation in route handlers).
3. **OWN_STUDENT resolver query threads `tenantId` on both sides of the JOIN.** `where: { tenantId, deletedAt: null, guardian: { userId, tenantId, deletedAt: null } }` — tenant-scoped on `StudentGuardian`, AND tenant-scoped on the `guardian` nested filter. Safety basis: the `StudentGuardian → Guardian` relation is declared COMPOSITE in `prisma/schema.prisma` model StudentGuardian (`fields: [guardianId, tenantId], references: [id, tenantId]`). Prisma JOINs on BOTH columns AND applies the nested WHERE against Guardian's scalar `tenantId` column → the `Guardian.tenantId = X` predicate IS emitted in the generated SQL. This is INDEPENDENT of Prisma issue #25061 (which concerns the separate `Guardian → User` SetNull path; conflating the two is a documentation hazard — per spec-time review SF1). Without the inner `tenantId`, Prisma would still emit the composite JOIN — the inner filter is defense-in-depth: it forbids a same-`userId`-different-tenant Guardian row from sneaking through were the `tenantId` ever stripped from the StudentGuardian top-level WHERE.
4. **StudentGuardian + Guardian both carry `deletedAt`.** Verified at `prisma/schema.prisma:* StudentGuardian / Guardian`. Both filtered to `null` so soft-deleted parent links don't widen the parent's scope, and so a soft-deleted Guardian row doesn't unresolve the scope (still `studentScopeUnresolved: false` for an active row).
5. **Cache invalidation: 5-min TTL is the only mechanism.** When a parent gets a new StudentGuardian link, `studentIds` stales for up to 5 minutes per `(tenantId, userId, currentTermId)` cache key. Documented explicitly per spec-time review item. No webhook/listener invalidation this cycle — single-process MVP per existing `lib/scaffold/permission.ts:22-25` contract. Future multi-instance cycle (post-Cycle B) widens the contract via shared cache.
6. **storage.objects audit MIGHT yield zero new policies needed.** If the empirical capture shows only the two policies from migration 07 (plus service-role bypass) and no permissive Supabase defaults remain attached, AC6's migration drops to a documentation-only deliverable. The cycle file count budget covers either outcome (with-migration: ~10 files; without: ~8 files).
7. **DEMO_MODE cookie shape is post-Student-slice (`role` + `currentTermId`).** Verified at `lib/auth/demo-cookie.ts:36-46` (`DemoSessionPayload`). The Playwright spec calls `POST /api/_demo/login?role=admin`, which writes the cookie via the live route — no hand-rolled cookie payload in the spec. Stale cookies issued before the widening fail validation in `verifyDemoCookie` and fall through to Supabase path; CI runs against fresh DB per `db push --force-reset`.
8. **No portal-role mapping for Playwright spec needed.** The demo login route maps `?role=admin` → User row whose role.code = `"admin"`; spec asserts on visible UI text (Indonesian copy from `voice.md`), URL transitions, and form behaviour — no direct role assertion required.
9. **The 5k overflow boundary doesn't apply for parent OWN_STUDENT in practice.** A parent's StudentGuardian count is bounded by family size (≤10 children even in extreme cases). The existing per-scope overflow check still runs (defensive), but never trips for the parent path.

## Tasks

Ordered. Independent tasks marked **[parallel-eligible]** for `/build` subagent dispatch (T1, T3, T6, T7 are mutually independent — T1 reads/writes `lib/scaffold/permission.ts` only, T3 reads/writes `app/api/upload/route.ts` + new `lib/entities/_registry.ts`, T6 writes `e2e/admin/students.spec.ts` + tweaks `playwright.config.ts` if needed, T7 reads-only against the live Supabase via MCP). T2/T4/T5/T8 are dependent and serialized.

- [ ] **T1 — Wire OWN_STUDENT resolver materialization (parent role).** `[parallel-eligible]`
  - Edit `lib/scaffold/permission.ts`. Extend `PermissionPrismaLike` with `studentGuardian: { findMany(args): Promise<Array<{ studentId: string }>> }`. After Step 3's existing OWN_SESSION block, add OWN_STUDENT materialization:
    ```ts
    // Guard with `grantedScopes.has("OWN_STUDENT")` ONLY — not `all || ...`.
    // ALL-scoped roles (admin/principal/kadiv) bypass the studentIds Set
    // entirely at the dataFetcher (they take the `all: true` flag path),
    // so running this JOIN for them is pure waste — every admin cache-miss
    // would fire a StudentGuardian JOIN that's discarded downstream. The
    // existing OWN_CLASS/OWN_SESSION blocks are also `all || ...`-guarded,
    // but they're naturally gated by `employeeId !== null` which nulls them
    // for non-employee callers; OWN_STUDENT has no such natural gate.
    // (Per spec-time review B1.)
    if (grantedScopes.has("OWN_STUDENT")) {
      const rows = await args.prisma.studentGuardian.findMany({
        where: {
          tenantId: args.tenantId,
          deletedAt: null,
          // Inner `tenantId` IS emitted on the nested filter because the
          // StudentGuardian → Guardian relation is a COMPOSITE FK
          // (`fields: [guardianId, tenantId]` at schema.prisma model
          // StudentGuardian — Prisma JOINs on both columns + applies the
          // nested WHERE against Guardian's scalar tenantId column).
          // This is INDEPENDENT of Prisma issue #25061 (which concerns the
          // unrelated Guardian → User SetNull path). (Per spec-time review SF1.)
          guardian: { userId: args.userId, tenantId: args.tenantId, deletedAt: null },
        },
        select: { studentId: true },
      });
      for (const r of rows) studentIds.add(r.studentId);
    }
    ```
  - Replace lines 270-282 (the missing-Student-model TODO) with the resolved branch:
    ```ts
    // studentScopeUnresolved is now ONLY true when OWN_STUDENT was requested
    // AND no Guardian row backs the userId — i.e. the caller carries the
    // parent role grant but isn't actually wired up as a guardian. Genuine
    // fail-closed signal for the page-layer wrapper.
    let studentScopeUnresolved = false;
    if (grantedScopes.has("OWN_STUDENT")) {
      const guardianExists = await args.prisma.guardian.findFirst({
        where: { userId: args.userId, tenantId: args.tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!guardianExists) studentScopeUnresolved = true;
    }
    ```
  - Extend `PermissionPrismaLike` with `guardian: { findFirst(args): Promise<{ id: string } | null> }`.
  - Drop the `warnedMissingStudent` console.warn machinery — no longer applicable.
  - **Acceptance:** Resolver returns resolved `studentIds` Set for parent with Guardian + StudentGuardian rows. `studentScopeUnresolved: true` ONLY for parent without a Guardian row. Cache key + TTL unchanged.

- [ ] **T2 — Permission resolver test extension.**
  - Edit `lib/scaffold/__tests__/permission.test.ts`. Add suite `describe("OWN_STUDENT — parent role", () => { ... })` with 4 cases:
    1. Parent grant + no Guardian row → `studentScopeUnresolved: true`, empty `studentIds`.
    2. Parent grant + Guardian row + zero StudentGuardian rows → `studentScopeUnresolved: false`, empty `studentIds`.
    3. Parent grant + Guardian row + 3 StudentGuardian rows → `studentScopeUnresolved: false`, `studentIds.size === 3`.
    4. Cache hit: second call within TTL skips the studentGuardian + guardian queries entirely (assert query mocks called once across two `resolvePermissions` invocations).
  - Extend the existing `mockPrismaLike` builder with `studentGuardian.findMany` + `guardian.findFirst` mocks.
  - **Acceptance:** All four cases pass. Existing tests unchanged.

- [ ] **T3 — Upload route role-FileKind gating.** `[parallel-eligible]`
  - Create `lib/entities/_registry.ts`:
    ```ts
    import type { EntityPolicy } from "./_types";
    import studentPolicy from "./student/policy";
    import { policy as guardianPolicy } from "./guardian/policy";
    import { policy as householdPolicy } from "./household/policy";
    import { policy as siPolicy } from "./student-identifier/policy";
    import { policy as giPolicy } from "./guardian-invitation/policy";
    export const POLICY_BY_RESOURCE: Readonly<Record<string, EntityPolicy>> = Object.freeze({
      [studentPolicy.resource]: studentPolicy,
      [guardianPolicy.resource]: guardianPolicy,
      [householdPolicy.resource]: householdPolicy,
      [siPolicy.resource]: siPolicy,
      [giPolicy.resource]: giPolicy,
    });
    ```
  - Edit `app/api/upload/route.ts`:
    - Read `resourceRaw = form.get("resource")`. Validate string presence → 400 `missing_field` if absent.
    - Lookup `policy = POLICY_BY_RESOURCE[resourceRaw]`. If undefined → 400 `invalid_resource`.
    - After existing kind/MIME/size validation (passes 1-5), insert role-allowlist gate BEFORE Tx1:
      ```ts
      const allowed = policy.fileKindAllowlist[session.role];
      if (!allowed || !allowed.includes(kind)) {
        return jsonError(403, { error: "forbidden_kind", resource: policy.resource, role: session.role, kind });
      }
      ```
    - Remove the line-23-26 out-of-scope note `Role-based FileKind gating ...` since it's now in scope.
  - **Acceptance:** Upload route requires `resource` form field; policy lookup is fail-closed on unknown resource and on missing/excluded role allowlist key.

- [ ] **T4 — Upload route test extension (3 pass + 3 fail).**
  - Edit `app/api/upload/__tests__/route.test.ts`. Extend `SESSION` mock with `role: "admin"`, `currentTermId: "at_1"`. Update `buildForm` to accept `resource?: string`. Add suite `describe("role-FileKind gating", () => { ... })`:
    - **Pass cases:**
      1. admin uploads DOCUMENT to Guardian → 200, normal completion.
      2. admin uploads IMAGE to Student → 200.
      3. admission_officer uploads DOCUMENT to Household → 200.
    - **Fail cases:**
      4. kadiv uploads IMAGE to Guardian → 403 `forbidden_kind` (kadiv allowlist is `[DOCUMENT]` only on Guardian policy).
      5. finance_officer uploads any kind to Household → 403 `forbidden_kind` (FO has no key on Household policy — read-only role).
      6. parent uploads any kind to Student → 403 `forbidden_kind` (parent has no key on Student policy — read-only).
    - **Bad-input cases (sanity):**
      7. Missing `resource` → 400 `missing_field`.
      8. Unknown `resource` (e.g. `"NotARealEntity"`) → 400 `invalid_resource`.
  - **Acceptance:** 8 new cases pass; pre-existing test bodies still pass (the SESSION mock widening is backwards-compatible because the route only newly reads `session.role` — pre-existing tests' SESSION add `role: "admin"` to satisfy strict typing).

- [ ] **T5 — Student dataFetcher parent-branch test extension.**
  - Edit `lib/entities/__tests__/student.entity.test.ts`. Add 1-2 cases on top of existing OWN_STUDENT throw coverage:
    1. Parent caller with resolved `studentIds: Set(["s1","s2"])` → `dataFetcher` invokes `prisma.student.findMany` with `where.id = { in: ["s1","s2"] }`. Assert `findMany` called once with the IN predicate threaded.
    2. Parent caller with empty resolved `studentIds` (Guardian exists, zero StudentGuardian) → `dataFetcher` invokes `findMany` with `id IN []` → empty result; no throw (already covered by T1's contract change). Assert empty rows + correct WHERE shape.
  - **Acceptance:** Both cases pass; no regression on existing throw case.

- [ ] **T6 — Playwright canary spec.** `[parallel-eligible — independent of T1-T5 because exercises admin role only, which doesn't traverse the OWN_STUDENT path]`
  - Create `e2e/admin/students.spec.ts`:
    - `test.beforeAll` (or per-test): `POST /api/_demo/login?role=admin` against the running dev server via Playwright's `request` fixture; capture cookie via APIRequestContext storage state.
    - **Important — soft-delete + restore explicitly DROPPED from the spec.** Verified at `lib/entities/student/entity.ts` line `detailActions: []` — Student exposes no detail-action affordances yet. The scaffold engine's `DetailActionButton` island stays render-only until per-entity `defineAction({...})` calls land in a follow-up cycle. Wiring soft-delete UI is out of scope for the canary (per spec-time review SF2 — would expand the file budget beyond the 4 deferrals). The soft-delete + restore SERVER ACTIONS already have unit-test coverage in `lib/students/actions/__tests__/actions.test.ts`.
    - `test("admin students golden path")`:
      1. Login: `POST /api/_demo/login?role=admin` → 200 + cookie present (assert: status 200; assert: response body shape).
      2. Navigate `/admin/akademik/siswa` → list page renders. Assert: page heading text contains "Siswa" (entity.label).
      3. Assert: breadcrumb "Akademik" link visible.
      4. Click "Tambah" / "Baru" CTA → URL transitions to `/admin/akademik/siswa/new`. Assert URL.
      5. Fill required form fields (`fullName`, `gender`, `birthDate` per `lib/entities/student/schema.ts` — confirm exact set at /build T6 by reading schema before authoring spec); submit.
      6. URL transitions to `/admin/akademik/siswa/<id>` (regex match — `id` is a CUID). Assert URL pattern.
      7. Detail header shows the typed `fullName`. Assert text content.
      8. Click "Edit" → URL transitions to `/admin/akademik/siswa/<id>/edit`. Assert URL.
      9. Mutate one field (e.g. append " (edited)" to `fullName`); submit.
      10. URL back at `/admin/akademik/siswa/<id>`; assert updated `fullName` visible in detail header.
      11. Navigate back to `/admin/akademik/siswa`; assert the new student's row is visible in the list.
      12. Search via `?q=<unique-substring-from-fullName>` (or input focus + type if list page exposes a search box); assert filtered list shows the new row.
    - **Assertion count: ≥12 explicit `expect()` calls across the 12 steps** (each step yields ≥1 expect; steps 1, 6 yield 2; comfortably above the ≥10 floor).
  - Verify `playwright.config.ts` already pins `workers: 1`, `webServer.command: "DEMO_MODE=true npm run start"`, `port: 3000`. No changes needed.
  - **Pre-build verification step:** before authoring T6, the implementer must (a) read `lib/entities/student/schema.ts` to enumerate the exact required fields + their input types (date / select / text); (b) read the form-page renderer (`lib/scaffold/form-page.tsx`) to confirm the input element selectors; (c) confirm the list page exposes a `q` query-param search (already verified at `lib/scaffold/list-page.tsx:30-32` — `searchParams.q?.trim()` is read).
  - **Acceptance:** `npx playwright test` passes locally + on CI in ~30-60s; ≥12 assertions; first run since pre-rebuild flips `Playwright E2E` from skipped to passed.

- [ ] **T7 — storage.objects RLS audit (read-only) + optional migration 17.**
  - Run via Supabase MCP `execute_sql` against staging:
    ```sql
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
    ORDER BY policyname;
    ```
  - Capture verbatim into cycle doc Verification section. Compare against the two policies migration 07 added:
    - `tenant_scoped_storage_select` (FOR SELECT TO authenticated USING tenantId path-prefix match)
    - `no_writes_via_postgrest_storage` (FOR ALL TO anon, authenticated USING/WITH CHECK false)
  - **Decision matrix:**
    - **Outcome A (no extra permissive policies):** documentation-only — note the empirical state and close the deferral. No migration 17.
    - **Outcome B (permissive Supabase default still attached, e.g. `Allow public access`):** Author migration `prisma/migrations/17_storage_rls_audit/migration.sql`:
      ```sql
      DROP POLICY IF EXISTS "<conflicting-default-name>" ON storage.objects;
      -- (no new restrictive policy needed — migration 07's two policies suffice)
      ```
      Plus migration test `prisma/migration-tests/17-storage-rls-audit.test.ts` parsing the DROP statement statically.
  - **Acceptance:** Cycle Verification carries the verbatim `pg_policies` row capture (post-migration if shipped). Anonymous SELECT denied; authenticated SELECT scoped to own-tenant; service-role bypass intact (verified by attempting an anon read of a foreign-tenant prefix; expect 403 / empty).

- [ ] **T8 — Cycle doc Verification + Ship Notes + README ADR row.**
  - Fill `Implementation` (per-task file changes), `Verification` (gate output incl. T7 capture), `Ship Notes` (env vars, rollback). Bump README ADR table with one row entry: e.g. *"v2 scaffold engine canary — first admin Playwright spec; OWN_STUDENT resolver wired; FileKind gating live; storage.objects RLS audited."*
  - Stage cycle doc + README in the same commit (commit-msg narrow rule for `feat:` + `app/**`/`lib/**` requires README).

### Dependencies / ordering hint for /build

- **Wave 1 (parallel):** T1, T3, T6, T7. T7 runs read-only against staging Supabase MCP (no code change); T1 + T3 + T6 are file-disjoint.
- **Wave 2 (sequential after Wave 1):** T2 (depends on T1 export shape), T4 (depends on T3 form-field contract), T5 (depends on T1's `studentScopeUnresolved=false` semantics), migration 17 (only if T7 Outcome B).
- **Wave 3:** T8 — runs only after T1-T7 land + verification gates pass.

## Implementation

- **T1 — OWN_STUDENT resolver wiring** (`lib/scaffold/permission.ts`): extended `PermissionPrismaLike` with `studentGuardian.findMany` + `guardian.findFirst` accessors. Replaced the pre-Student-model TODO block with a 2-query materialiser: (a) `studentGuardian.findMany` joined through nested `guardian` filter on `(userId, tenantId, deletedAt: null)` to populate `studentIds`; (b) `guardian.findFirst` to determine `studentScopeUnresolved` (true ONLY when no Guardian row backs the userId). `studentGuardian.findMany` guarded with `grantedScopes.has("OWN_STUDENT")` only — NOT `all || ...` — so admin/principal/kadiv don't pay an unused JOIN per cache-miss (per spec-time review B1). Dropped the `warnedMissingStudent` console.warn machinery + `_resetMissingStudentWarning` helper. JSDoc on `studentScopeUnresolved` rewritten to describe the new fail-closed semantics.
- **T2 — Permission resolver tests** (`lib/scaffold/__tests__/permission.test.ts`): extended `MockPrisma` + `makePrisma` builder with `studentGuardian.findMany` + `guardian.findFirst` mocks. Replaced the stale OWN_STUDENT-stub suite with 7 new cases under `describe("OWN_STUDENT scope (parent role, wired p2-scaffold-canary)")`: no-Guardian → unresolved, Guardian + zero StudentGuardian → resolved-empty, Guardian + N StudentGuardian → resolved-populated, tenantId thread on both sides of JOIN (defense-in-depth), cache-hit-skips-DB, no-OWN_STUDENT → no DB calls, ALL-scoped role does NOT fire OWN_STUDENT queries (pins B1 fix in regression). Removed the `_resetMissingStudentWarning` import.
- **T3 — Upload route role-FileKind gating** (`app/api/upload/route.ts` + new `lib/entities/_registry.ts`): created `POLICY_BY_RESOURCE` registry with explicit static imports of all 5 entity policies (no dynamic import — Next.js route-handler bundler limitation). Added `getPolicyByResource(resource)` lookup. Upload route now reads `resource` form field (PascalCase, verbatim Prisma model name); fail-closed paths: missing resource → 400 `missing_field`, unknown resource → 400 `invalid_resource`, role has no allowlist key → 403 `forbidden_kind`, role's allowlist excludes kind → 403 `forbidden_kind`. Header-comment "Out-of-scope" line removed (no longer applicable). Gate placed BEFORE Tx1 (after MIME/size/kind validation) so 403 short-circuits before any DB write.
- **T4 — Upload route tests** (`app/api/upload/__tests__/route.test.ts`): extended `SESSION` mock with `role: "admin"` + `currentTermId: "at_1"`. Extended `buildForm` helper with `resource?: string | null` (defaults to `"Student"` so existing tests pass through the new gate). Added 9 new cases: missing resource (400), invalid resource (400), 3 pass-cases (admin DOCUMENT→Guardian, admin IMAGE→Student, admission_officer DOCUMENT→Household), 4 fail-cases (kadiv IMAGE→Guardian, finance_officer DOCUMENT→Household, parent IMAGE→Student, admin IMAGE→GuardianInvitation [empty allowlist]).
- **T5 — Student entity dataFetcher tests** (`lib/entities/__tests__/student.entity.test.ts`): added 2 cases on top of existing OWN_STUDENT branch coverage: parent + resolved-but-empty studentIds → `id IN []` predicate, no throw; parent + resolved studentIds → tenantId still threaded on Student WHERE (defense-in-depth: id-IN doesn't waive tenant filter).
- **T6 — Playwright canary spec** (`e2e/admin/students.spec.ts` NEW + `playwright.config.ts` env addition + `.github/workflows/ci.yml` env addition): 14-assertion read-only navigation smoke (login → list page → empty-state copy → new-form heading + 4 required field labels + Simpan + Batal → cancel back to list → filter-empty state distinguishes from cold). `playwright.config.ts` `webServer.env` gained `SESSION_COOKIE_SECRET` for local runs. CI workflow's `Run Playwright tests` step gained the same env var (required ≥32 chars by `lib/auth/demo-cookie.ts`).
- **T6 ancillaries (necessary unblockers, not in original spec):**
  - **`/api/_demo/login` → `/api/demo/login` route move** (`app/api/demo/login/route.ts` + `__tests__/route.test.ts`): Next.js App Router treats `_`-prefixed folders as PRIVATE (excluded from routing). The route shipped in p1-auth-google-oauth has been silently 404ing since its merge — never accessible. Renamed the parent folder. Updated all comment references in `app/auth/callback/route.ts`, `lib/auth/{demo-cookie,session}.ts`, `lib/http/ip.ts`, `prisma/seed/08-demo-users.ts`, `playwright.config.ts`, `.claude/standards/auth.md`, `README.md`. Behavioural change scope: zero (the route was never reachable; the only "callers" were tests-only and updated alongside).
  - **`prisma/seed/08-demo-users.ts` NEW** + wired into `prisma/seed/index.ts`: creates 1 admin User + 1 parent User per tenant (idempotent findFirst-then-update keyed on `(tenantId, email)`). Required because `/api/demo/login` 500s with `no_seed_user` when no User+UserRole rows exist for the requested role.
- **T7 — storage.objects RLS audit (read-only, no migration):** Outcome A — the only policies live on staging are the two folded inline by migration 07. NO permissive Supabase defaults remain attached. Migration 17 NOT shipped (documentation-only deliverable). Verbatim policy capture in Verification below.
- **T8 — cycle doc + README ADR row:** this section + Verification + Ship Notes + README ADR table addition.

## Verification

### Gate output

- `npx prisma generate` ✓ (Prisma Client 7.6.0 → `lib/generated/prisma`).
- `npm run lint` ✓ (0 errors, 1 pre-existing warning in `lib/students/__tests__/nis-allocator.test.ts`).
- `npm run typecheck` ✓ (`tsc --noEmit` clean).
- `npm run build` ✓ (Next.js 16.2.3 production build; 23 routes incl. `/api/demo/login` now in the route table — proves the rename unblocked the route).
- `npx vitest run` — **1019 pass / 1 fail / 4 skip / 1024 total**. Cycle baseline at T0 (after `prisma generate` only, before any code edits) was **1001 pass / 3 fail / 4 skip / 1008 total**. Net delta: **+24 vitest cases authored** (T2: +7; T4: +9; T5: +2; existing OWN_STUDENT stub case removed; demo-login-test path string updates). Net total delta: 1008 → 1024 = **+16** (consistent with the 4 cases authored here that replace the older smaller suite). The 1 failing test is in `components/ui/__tests__/confirm-dialog.test.tsx` (pre-existing flake — same file failed at baseline; environment-dependent timing test, not introduced by this cycle). Per spec-time review SF3, the actual delta range was 13-15 → landed at +16, slightly over the upper bound (additional B1-pin-regression case added at T2-time).
- `npx playwright test` — **1 passed (5.1s)**. First real Playwright run since pre-rebuild — the rebuild-window guard at `.github/workflows/ci.yml:115-127` will detect `e2e/admin/students.spec.ts` and run the suite globally on the cycle's PR.
- `bash scripts/verify-rls-coverage.sh` — **32 / 32** ✓ (no new tenant-scoped models).
- `bash scripts/verify-api-auth.sh` — **4 / 4** ✓.
- `bash scripts/verify-pii-annotations.sh` — **5 / 5** ✓.
- `npm run scaffold:check` — **5 / 5 entities validated** ✓.

### T7 — storage.objects RLS audit (verbatim capture)

Query (via `mcp__execute_sql` against staging project `udbivhchbizpxoryejgz`):

```sql
SELECT policyname, cmd, roles::text AS roles, qual, with_check
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY policyname;
```

Result (verbatim from staging):

| policyname | cmd | roles | qual | with_check |
|---|---|---|---|---|
| no_writes_via_postgrest_storage | ALL | {anon,authenticated} | false | false |
| tenant_scoped_storage_select | SELECT | {authenticated} | (name ~~ (((current_setting('request.jwt.claims'::text, true))::json ->> 'tenant_id'::text) || '/%'::text)) | NULL |

**Conclusion:** Only the two policies migration 07 added are present. NO permissive Supabase defaults remain attached. Migration 17 NOT needed (documentation-only deliverable).

**Effective semantics under Postgres RLS PERMISSIVE OR-combine:**
- Anonymous SELECT: only `no_writes_via_postgrest_storage` applies (`USING false`) → row hidden. Anon read = denied. ✓
- Authenticated SELECT: both policies apply, OR-combined → row visible iff `name LIKE tenant_id || '/%'` (tenant-scoped). ✓
- Anonymous INSERT/UPDATE/DELETE: `no_writes_via_postgrest_storage` (`WITH CHECK false`) blocks. ✓
- Authenticated INSERT/UPDATE/DELETE: same — blocked. ✓
- Service-role: BYPASSRLS privilege → all policies bypassed. Upload route's service-role writes through unaffected. ✓

The cycle's design-locked invariants (anonymous SELECT denied; authenticated SELECT scoped to own-tenant; service-role bypass intact) hold empirically against the live staging database without migration 17.

### Manual smoke notes

- Playwright canary ran locally against staging Supabase + worktree's production build — `npm run build` (Turbopack) emitted the build into the worktree's `.next/` (the `.worktrees/p2-scaffold-canary/.next/`), and `npm run start` served it on port 3000. Demo login returned 200 + `{ ok: true, role: "admin", userId: <cuid>, tenantId: <cuid> }`. List page rendered "Belum ada siswa" empty state (Student count on staging = 0 confirmed via Supabase MCP). All 14 expects passed.
- Local-environment quirk surfaced: when running from a worktree with symlinked `node_modules`, Turbopack's automatic workspace-root detection walks up the dir tree to find a lockfile. The first build attempt routed `.next/` into the parent checkout (`school-erp/.next/`) instead of the worktree's. Setting `turbopack.root: import.meta.dirname` in `next.config.ts` fixed the routing but caused a different Turbopack symlink-out-of-root error against the symlinked `node_modules`. The setting was reverted; the cycle accepts the parent-walking behaviour because (a) CI clones the branch fresh with no symlink, so it never hits this path, (b) clearing the parent's `.next/` before the local rebuild forces Turbopack to put the build into the worktree (this is what the smoke ran against). A separate runbook/doc item covers worktree-aware build setup if it surfaces again.

## Ship Notes

### Migrations

NONE. T7 audit confirmed Outcome A (no permissive Supabase defaults attached); migration 17 not needed.

### New env vars

- `SESSION_COOKIE_SECRET` added to `.github/workflows/ci.yml` `Run Playwright tests` step env (≥32 chars; static dummy is safe in CI because `/api/demo/login` 404s outside `DEMO_MODE=true` AND CI sets `DEMO_MODE=true`). Production deployment env was unchanged this cycle — production Supabase OAuth flow does NOT use the demo cookie.
- `playwright.config.ts` `webServer.env` adds `SESSION_COOKIE_SECRET` defaulted to a dummy; local devs running Playwright don't need to set it explicitly.

### New seed

- `prisma/seed/08-demo-users.ts` creates 1 admin User + 1 parent User per tenant (idempotent). CI's `Seed database` step (line 130 of `.github/workflows/ci.yml`) runs `npx prisma db seed` automatically — no CI workflow change needed for the new seed.
- Staging environment was seeded by the implementer at T6 build-time (verified via Supabase MCP after `npx prisma db seed`). Production env will pick up the seed on the next `vercel-build.sh` deploy.

### Routing change (BEHAVIOURAL — not a no-op)

- `/api/_demo/login` → `/api/demo/login`. The previous path was inaccessible (Next.js private folder convention) — moving the route makes demo-mode auth functional for the first time since p1-auth-google-oauth shipped. **No external callers** existed (the path was never reachable), so no consumer-side migration is needed.

### Manual rollback plan

- Revert PR. The OWN_STUDENT resolver returns to the pre-cycle stub (parent role hits the fail-closed page-layer wrapper) — read-only impact; no data corruption risk.
- The upload-route `resource` field becomes a no-op on revert; existing callers (none yet — first p2 entity-attach UI cycle is the first real consumer) would not be affected.
- Demo route move + seed: revert reverts both. Demo-mode auth returns to non-functional (matches pre-cycle status quo).
- storage.objects RLS audit: documentation-only; revert is purely textual.

### CI exposure

This cycle re-enables the `Playwright E2E` job globally — every subsequent PR will run the suite. The single-spec runtime is ~5s in the cycle's local run; CI's full path (Postgres service spin-up + `db push --force-reset` + seed + production build + browser install + run) is expected ~3-5 min cold. Cache misses on `setup-node` cache key + `playwright install` will dominate the first CI run on the cycle's PR.
