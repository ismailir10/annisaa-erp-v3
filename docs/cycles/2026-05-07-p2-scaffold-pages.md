# P2 Scaffold Pages — Student Slice (SessionContext widen + Page-layer fail-closed + Student admin pages × 4 + Student CRUD actions × 4)

## Type
page

## Context

Sub-split of the broader admin-scaffold-pages effort (5 entities × 4 page types umbrella) per the new IA contract shipped in foundation md PR #194 (commit f8a289e). PR #194 collapsed the original 5-entity set:

- **StudentIdentifier** → no top-level admin page; lives as inline detail tab on Student per §10A.4.
- **GuardianInvitation** → no top-level admin page; lives as action button + status pill on Guardian detail per §10A.4.

So pages drop 5 → 3 entities (Student / Guardian / Household). At 4 pages × 4 actions × 3 entities + SessionContext widening + page-layer fail-closed wrapper + tests + cycle doc, the file count exceeds the §18.2 ≤25-file cap. Sub-split decision (per cto choice on 2026-05-07): split by entity, **Student first**, Guardian + Household next cycle, Playwright canary in the cycle after.

This cycle ships:

1. **SessionContext widening** — add `role: RoleCode` + `currentTermId: string` to `lib/auth/session.ts` `SessionContext`. Both demo-cookie path (`lib/auth/demo-cookie.ts` + `app/api/_demo/login/route.ts`) and Supabase JWT-claim path (resolved at `getSession()` time) populate. JWT custom-claim hook config from migration 02_identity already injects `role` into the JWT — but `app_metadata` does NOT auto-mirror access-token custom claims, so `getSession()` resolves both `role` + `currentTermId` from the database at session-resolve time (avoids JWT decoding + avoids hook re-deploy). `currentTermId` resolves from `prisma.academicTerm.findFirst({ where: { tenantId, isActive: true } })`.

2. **Page-layer fail-closed wrapper** — typed error class `OwnStudentUnresolvedError` exported from `@/lib/scaffold`. `ScaffoldListPage` + `ScaffoldDetailPage` already wrap `entity.dataFetcher` calls in try/catch; extend `ScaffoldErrorState` to recognise the typed error and render a no-permission UI (per spec §5.7 error state). dataFetchers throw `new OwnStudentUnresolvedError()` when `policy.scopes.read` includes OWN_STUDENT for the calling role AND `resolvePermissions(...).studentScopeUnresolved === true`. Resolver wiring (flips `studentScopeUnresolved` to false) lands in `p2-scaffold-canary` per registries Ship Notes.

3. **Student admin pages × 4** — under the §10A.1 Akademik group routing convention `/admin/akademik/<entity-slug>`:
   - `app/admin/akademik/siswa/page.tsx` (List)
   - `app/admin/akademik/siswa/new/page.tsx` (Form create)
   - `app/admin/akademik/siswa/[id]/page.tsx` (Detail)
   - `app/admin/akademik/siswa/[id]/edit/page.tsx` (Form edit)

   Note: §5.2 example (`app/admin/students/page.tsx`) is now stale vs §10A. Resolution: follow §10A (more recent + canonical IA contract); §5.2 example update lands in a future docs cycle. No legacy `/admin/students` redirect — page didn't exist before, so 404 stays clean.

4. **Student CRUD server actions × 4** — `lib/students/actions/{create,update,soft-delete,restore}.ts`. Each `"use server"` action: `getSession() → assertScope(policy, action) → schema.parse(input) → prisma.student.<op>(...) → writeAuditLog(...) → revalidatePath(...) → return ActionResult<Student>`. Audit emit gated on `policy.auditActions` enrolment per scaffold.md §6.

5. **Server-action helper** — `lib/scaffold/server-action.ts` exports:
   - `type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; field?: string }`
   - `assertScope(session, policy, action: CrudAction): void` — throws `Error("FORBIDDEN")` on scope mismatch.
   
   Helper is generic and reused by Guardian + Household actions in the next cycle.

**Marathon mode** (foundation §18.12) — derives from §5.2 (page recipe), §5.7 (error state), §6.5 (JWT custom claims), §10A.1 (Akademik group routing), §10.7.1 (Student read scopes: A/P/KD/AO ALL · HT/ST OWN_CLASS · PR OWN_STUDENT), §10.7.2 (write deltas: A/P/KD/AO ALL on Student create/update). Skip superpowers:brainstorming.

## Spec

### Acceptance criteria

- [ ] `SessionContext` widened: `{ tenantId, userId, supabaseUserId, role, currentTermId }`. Type `role: RoleCode` (imported from `@/lib/entities/_types`). Type `currentTermId: string`.
- [ ] Demo-cookie path populates both new fields. `DemoSessionPayload` shape extends; `verifyDemoCookie` rejects payloads missing either field (forces re-login on cookies issued before this cycle — acceptable per 24h max-age).
- [ ] `/api/_demo/login` route reads role from `userRoleRow.role.code` (extends select) and currentTermId from `prisma.academicTerm.findFirst({ where: { tenantId, isActive: true } })`. Fail with 500 `{ error: "no_active_term" }` if no active term — operator runs the term seed.
- [ ] Supabase path (`getSession()` non-demo branch): after User-row lookup, runs **two** parallel `findFirst` calls — `userRole.findFirst({ where: { userId, tenantId } })` for role + `academicTerm.findFirst({ where: { tenantId, isActive: true } })` for term. Returns `null` (treated as 401 by callers) when either is missing — preserves existing fail-closed contract.
- [ ] Page-layer fail-closed wrapper: `OwnStudentUnresolvedError` class exported from `@/lib/scaffold`. `ScaffoldErrorState` detects it via `instanceof` and renders Indonesian no-permission copy (title "Akses dibatasi", description "Daftar siswa milikmu belum tersedia. Hubungi admin sekolah."). `ScaffoldListPage` + `ScaffoldDetailPage` re-throw + catch behaviour unchanged — typed error flows through existing catch path.
- [ ] Student dataFetcher (`lib/entities/student/entity.ts`) widens scope: when `session.role === "parent"` AND `policy.scopes.read[parent] === "OWN_STUDENT"`, calls `resolvePermissions({ userId, supabaseUserId, tenantId, currentTermId, prisma })`. If `studentScopeUnresolved === true`, throws `OwnStudentUnresolvedError`. Otherwise filters `where.id = { in: [...studentIds] }` per `OWN_STUDENT` clause. **Roles other than `parent` skip the `resolvePermissions` call in this cycle.** OWN_CLASS predicate injection for HT / ST is a pre-existing dataFetcher gap (admin-only tenant filter today) — its remediation lands in the teacher portal cycle (`p3-teacher-portal-shell` or equivalent), not here. Admin/principal/kadiv/admission_officer all have `ALL` scope per §10.7.1 — tenant filter is correct for them.
- [ ] 4 admin Student pages mount under `/admin/akademik/siswa/{,new/,[id]/,[id]/edit/}`. Each follows the 4-line page recipe per spec §5.2. **Form pages pass the server action directly as the `onSubmit` prop** — server actions (functions exported from `"use server"` modules) are the only function-shaped props Next.js App Router serialises across the RSC → Client Component boundary. Inline async closures wrapping a server action are NOT serialisable and produce build-time errors. To support direct-pass, **`ScaffoldFormPage`'s `onSubmit` prop type widens** from `(values: T) => Promise<void> | void` to `(values: T) => Promise<ActionResult<T>>` (or compatible), and the form's submit handler reads `result.ok` and surfaces `result.error` via `setSubmitError`. Detail page wires `fetchRow` to a single-row Prisma query. Edit page passes `mode="edit"` + `initialValues` from the row fetch + the `updateStudent` action directly.
- [ ] 4 Student CRUD server actions (`lib/students/actions/{create,update,soft-delete,restore}.ts`) each enforce scope via `assertScope` + emit `writeAuditLog` per `policy.auditActions` enrolment. Each returns `ActionResult<Student>` shape. **Write-action scope-gate posture this cycle: `assertScope` on write actions (create/update/soft_delete/restore) requires `scope === "ALL"` for the calling role.** Per §10.7.2, only `A/P/KD/AO` carry `ALL` on people-entity writes. HT's `OWN_CLASS` scope on Student.update / Parent's missing scope all fail-closed at the action gate. Reasoning: this cycle ships admin-portal routes only; HT/ST/parent never reach `/admin/akademik/siswa/[id]/edit` via legitimate UI nav (no admin sidebar entry until `p2-portal-shell-sidebar` lands portal-role gating). The strict-ALL gate compensates for the absence of portal-level role gating in this cycle. Read scope-gate keeps the liberal scope-presence check (dataFetcher owns row-level OWN_* enforcement).
- [ ] `lib/scaffold/server-action.ts` exports `assertScope(session, policy, action)` + `ActionResult<T>` type.
- [ ] Tests:
  - [ ] `lib/auth/__tests__/session.test.ts` — extends existing tests to assert new role + currentTermId fields populate on both demo + supabase paths; null returns when role missing or term missing.
  - [ ] `lib/auth/__tests__/demo-cookie.test.ts` — extends to assert payload validation rejects missing role/currentTermId.
  - [ ] `lib/students/actions/__tests__/actions.test.ts` — single combined file covering all 4 actions: scope-pass + scope-fail + audit-emit + revalidate-call. ≥12 assertions.
  - [ ] `lib/scaffold/__tests__/errors.test.ts` — `OwnStudentUnresolvedError` is `instanceof Error` and carries name `"OwnStudentUnresolvedError"`.
  - [ ] `lib/scaffold/__tests__/server-action.test.ts` — `assertScope` passes for ALL/matching scope, throws for missing scope. (Could fold into actions.test.ts to save file count — decided fold.)
- [ ] Standards loaded (cycle-doc tooling): `scaffold.md` (this cycle is page-side prime consumer), `ui.md` (form components), `patterns.md` (admin List/Detail/Form recipe), `crud.md` (ERPNext-inspired CRUD), `api.md` + `security.md` (server-action layer auth). Frontend gate (pre-commit Rule 4): cycle doc mentions `design-system` token (this paragraph + Verification bullet satisfies).

### Cross-checked design-system.html §N for Z

This cycle's pages render exclusively through existing scaffold engine primitives (`ScaffoldListPage` / `ScaffoldFormPage` / `ScaffoldDetailPage` + `ScaffoldErrorState`); zero new visual components. Cross-checked design-system.html § (Empty state / Error state / Form layout) — no new tokens or surface introduced. Frontend gate satisfied.

### Non-goals (explicit deferrals)

- Guardian + Household admin pages → next cycle (`p2-scaffold-pages-guardian-household`).
- StudentIdentifier admin pages — **never** (collapsed to detail-tab inline per §10A.4).
- GuardianInvitation admin pages — **never** (collapsed to action button per §10A.4).
- Playwright canary `e2e/admin/students.spec.ts` → `p2-scaffold-canary`.
- Role-FileKind gating LOGIC at upload route → `p2-scaffold-canary`.
- OWN_STUDENT resolver wiring (`studentIds` Set materialization) → `p2-scaffold-canary`. Until then, `studentScopeUnresolved=true` triggers the typed error; page renders no-permission UI fail-closed.
- Drift #1 (Student.read missing FO ALL) → `p3-fee-foundation` per §10.7.3.
- Drift #2 (Guardian.read missing FO ALL) → `p3-fee-foundation`.
- Drift #3 (GuardianInvitation.read parent grant) → next entity audit cycle.
- Sidebar nav shell → `p2-portal-shell-sidebar`.
- Public `/daftar` admission form → `p2-admission-funnel`.
- Address chain → `p2-addresses-idn-chain`.
- WhatsApp wa.me invitation flow → `p6-portal-invitation-flow`.

### Assumptions

1. **`AcademicTerm.isActive` exists + has at most one row per tenant.** Partial-WHERE unique constraint lives in raw SQL migration `04_classes` (`WHERE isActive = true`) — Prisma 7 schema DSL doesn't support partial uniques natively, so the schema-level type system does NOT enforce single-active-term. `prisma.academicTerm.findFirst({ where: { tenantId, isActive: true } })` is non-deterministic if the migration constraint is ever bypassed (e.g. service-role direct write, future migration drift). **Mitigation: every active-term lookup in T1 uses `orderBy: { startDate: "asc" }`** so result is at least deterministic across replicas. T7 verifies the partial-WHERE unique is intact via `grep -n "isActive_active_unique\|WHERE \"isActive\" = true" prisma/migrations/`. If ever zero rows, demo-login + supabase-getSession both fail-closed (500 / null per acceptance).
2. **`UserRole.role.code` is single-row resolution.** Multi-role users (future) require either an "active role" picker or first-by-createdAt deterministic per the JWT hook precedent (migration 02). MVP single-role per spec — first match wins.
3. **`OwnStudentUnresolvedError` flows through ScaffoldListPage + ScaffoldDetailPage existing catch path.** No new try/catch. `ScaffoldErrorState` differentiates via `instanceof` + falls back to existing generic copy when not the typed variant. The `instanceof` check happens entirely inside the RSC render boundary (no client-component serialisation), so the error class survives — verified at spec-time review (constructor identity preserved within the same Node.js process). **Separately**, the form-page recipe must pass server actions DIRECTLY as the `onSubmit` prop — inline async closures wrapping a server action are NOT serialisable across the RSC → Client Component boundary that `ScaffoldFormPage` introduces. T3 widens `ScaffoldFormPage.onSubmit` to `(values: T) => Promise<ActionResult<T>>` to support the direct-pass pattern.
4. **Server actions reuse same Prisma client (`@/lib/db`).** Audit writes share the action's transaction context (`prisma.$transaction(async (tx) => { ... ; await writeAuditLog(payload, tx); })`) so audit row commits atomically with the mutation. Pattern documented in `audit-pii.md` §4.
5. **Indonesian copy throughout.** No new microcopy strings beyond the no-permission state ("Akses dibatasi" / "Daftar siswa milikmu belum tersedia. Hubungi admin sekolah."). Voice cross-checked against `voice.md` (§persona-aware error tone).
6. **Demo cookie format change is breaking.** Cookies issued before this cycle won't carry role/currentTermId; verifyDemoCookie returns null → next request falls through to Supabase path → demo users on E2E need re-login via `/api/_demo/login`. Acceptable: 24h max-age natural expiry; CI deletes cookie state per-spec; local dev hits the demo-login route on next click.
7. **No new API routes.** Server actions are NOT `/api/*` routes — Next.js compiles them to runtime-resolved POST endpoints under a hashed path. `verify-api-auth.sh` (which scans `app/api/**`) coverage unchanged at 4/4.
8. **`scaffold-check.ts` does NOT cover page files.** It validates entity registries only (`lib/entities/<name>/{schema,entity,policy}.ts`). New `app/admin/**/page.tsx` files don't trigger the scaffold gate. Verified via grep `scripts/scaffold-check.ts`.
9. **revalidate scope.** Each action calls `revalidatePath("/admin/akademik/siswa")` for list invalidation + `revalidatePath("/admin/akademik/siswa/[id]")` for detail invalidation (when applicable). Layout-level revalidation is not used — keeps cache scope tight.

## Tasks

### T1 — SessionContext widening + demo-cookie + /api/_demo/login + getSession

- [ ] `lib/auth/session.ts` — widen `SessionContext` type. Import `RoleCode` from `@/lib/entities/_types` (cross-layer import: auth → entities; acceptable since `_types.ts` is type-only and carries zero Prisma runtime weight per its module header). After User-row lookup, run two parallel `findFirst` calls via `Promise.all`: `userRole.findFirst({ where: { userId: row.id, tenantId: row.tenantId }, select: { role: { select: { code: true } } }, orderBy: { createdAt: "asc" } })` (deterministic first-role pick mirrors migration 02 JWT hook) + `academicTerm.findFirst({ where: { tenantId: row.tenantId, isActive: true }, select: { id: true }, orderBy: { startDate: "asc" } })` (deterministic per Assumption #1). Return `null` if either missing. Demo path returns the demo cookie payload directly (cookie now carries both new fields).
- [ ] `lib/auth/demo-cookie.ts` — extend `DemoSessionPayload` with `role: string` + `currentTermId: string`. `verifyDemoCookie` validates both fields are non-empty strings. Backward-incompat: old cookies without these fields fail validation → return null → fall through to Supabase path.
- [ ] `app/api/_demo/login/route.ts` — extend `userRoleRow` select with `role: { select: { code: true } }`. Add `prisma.academicTerm.findFirst({ where: { tenantId, isActive: true }, select: { id: true } })` after tenant resolve. Return 500 `{ error: "no_active_term", message: "..." }` if missing. Pass both new fields to `setDemoSessionCookie(...)`.
- [ ] `lib/auth/__tests__/session.test.ts` — extend tests:
  - demo path: valid cookie returns role + currentTermId
  - supabase path: returns role + currentTermId from DB
  - supabase path: returns null when no UserRole rows
  - supabase path: returns null when no active AcademicTerm
- [ ] `lib/auth/__tests__/demo-cookie.test.ts` — extend tests:
  - sign + verify round-trip preserves all 5 fields
  - verify rejects payload missing `role`
  - verify rejects payload missing `currentTermId`
- **Acceptance:** `npm run typecheck` clean (consumers of SessionContext compile against new shape — `lib/scaffold/permission.ts` `ResolveArgs.currentTermId` already aligned; `getSession()` callers `/api/upload` + 5 entity dataFetchers compile; old call sites that ignore the new fields still type-check). All session + demo-cookie tests pass. `verify-api-auth.sh` coverage unchanged. **Independent of T2-T4** (type widening lands first; downstream tasks consume).

### T2 — Page-layer fail-closed wrapper + Student dataFetcher OWN_STUDENT branch

- [ ] `lib/scaffold/errors.ts` NEW — typed error classes module:
  ```ts
  export class OwnStudentUnresolvedError extends Error {
    constructor(message = "OWN_STUDENT_UNRESOLVED") {
      super(message);
      this.name = "OwnStudentUnresolvedError";
    }
  }
  ```
- [ ] `lib/scaffold/index.ts` — re-export `OwnStudentUnresolvedError`.
- [ ] `lib/scaffold/error-state.tsx` — extend `ScaffoldErrorState`: when `error instanceof OwnStudentUnresolvedError`, render no-permission copy (title "Akses dibatasi", description "Daftar siswa milikmu belum tersedia. Hubungi admin sekolah."). Generic-error path unchanged.
- [ ] `lib/entities/student/entity.ts` — widen `dataFetcher` Clause 4 (per Shared dataFetcher contract, scaffold.md §5b): when `session.role === "parent"`, call `resolvePermissions({ userId: session.userId, supabaseUserId: session.supabaseUserId, tenantId: session.tenantId, currentTermId: session.currentTermId, prisma })`. If `result.studentScopeUnresolved === true`, throw `new OwnStudentUnresolvedError()`. Otherwise inject `where.id = { in: [...result.studentIds] }`. Admin/staff roles short-circuit on `all: true` (no resolver call).
- [ ] `lib/scaffold/__tests__/errors.test.ts` NEW — `OwnStudentUnresolvedError` is `instanceof Error`, name === `"OwnStudentUnresolvedError"`, carries default + custom messages.
- [ ] `lib/entities/__tests__/student.entity.test.ts` — extend: dataFetcher call with `session.role === "parent"` mocks `resolvePermissions` returning `studentScopeUnresolved: true` → assert `OwnStudentUnresolvedError` thrown. Mock returning `studentIds` set → assert `where.id = { in: [...] }` passed to prisma.findMany.
- **Acceptance:** typed-error tests pass; ScaffoldErrorState renders the no-permission copy when given the typed error (jsdom test). Student dataFetcher tests cover the parent-role branch end-to-end. **Depends on T1** (session.role accessed by dataFetcher).

### T3 — Server-action helper + ScaffoldFormPage onSubmit widening

- [ ] `lib/scaffold/server-action.ts` NEW — exports:
  ```ts
  export type ActionResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: string };

  export function assertScope(
    session: SessionContext,
    policy: EntityPolicy,
    action: CrudAction,
  ): void { ... }
  ```
  `assertScope` semantics differ by action class:
  - **Read action**: scope-presence check only — if `policy.scopes.read` has any entry for `session.role`, pass; row-level OWN_* enforcement lives in `entity.dataFetcher`.
  - **Write actions** (`create`, `update`, `soft_delete`, `restore`): require the matching entry to be `scope === "ALL"`. Any OWN_* scope on a write fails-closed at the action gate. Per §10.7.2 only `A/P/KD/AO` carry `ALL` on people-entity writes; HT's OWN_CLASS / parent's missing scope are correctly rejected. This compensates for the absence of portal-level role gating until `p2-portal-shell-sidebar` lands.
  - **Throws** `Error("FORBIDDEN")` on scope mismatch. The 4 server actions catch and convert to `{ ok: false, error: "FORBIDDEN" }`.
- [ ] `lib/scaffold/form-page.tsx` — widen `ScaffoldFormPageProps<T>.onSubmit` from `(values: T) => Promise<void> | void` to `(values: T) => Promise<ActionResult<T>>` (or a structurally compatible shape). Update `handleSubmit` body to read `result.ok` and surface `result.error` via `setSubmitError(new Error(result.error))`. Reasoning per Assumption #3 + spec-time review CRITICAL: server actions are the only function-shaped props serialisable across the RSC → Client Component boundary. Page recipes pass `createStudent` / `updateStudent` directly (no closure wrapping) — the type widens to align.
- [ ] `lib/scaffold/index.ts` — re-export `assertScope` + `ActionResult` + already re-exports `ScaffoldFormPage`.
- [ ] Tests for `assertScope` fold into the actions test file (T4 acceptance) + 1-2 cases in `lib/scaffold/__tests__/form-page.test.ts` for the new ActionResult-based onSubmit (extend existing if present, else new file in T4 — counted under T4).
- **Acceptance:** typecheck + module loads. ScaffoldFormPage submits invoke onSubmit and surface errors via the result shape. **Independent of T1-T2** (pure types + simple helper).

### T4 — Student CRUD server actions × 4 + tests

- [ ] `lib/students/actions/create.ts` NEW — `"use server"` directive at top. Imports: `getSession`, `prisma`, `studentSchema`, `studentPolicy`, `assertScope`, `writeAuditLog`, `revalidatePath`, `AuditAction`. Body:
  ```ts
  export async function createStudent(input: unknown): Promise<ActionResult<Student>> {
    const session = await getSession();
    if (!session) return { ok: false, error: "UNAUTHENTICATED" };
    try { assertScope(session, studentPolicy, "create"); }
    catch { return { ok: false, error: "FORBIDDEN" }; }
    const parsed = studentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "INVALID_INPUT", field: parsed.error.issues[0]?.path.join(".") };
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.student.create({ data: { ...parsed.data, tenantId: session.tenantId } });
      if (studentPolicy.auditActions.includes(AuditAction.CREATE)) {
        await writeAuditLog({
          tenantId: session.tenantId, actorUserId: session.userId,
          action: AuditAction.CREATE, resource: studentPolicy.resource, resourceId: row.id,
          before: null, after: row,
        }, tx);
      }
      return row;
    });
    revalidatePath("/admin/akademik/siswa");
    return { ok: true, data: created };
  }
  ```
- [ ] `lib/students/actions/update.ts` NEW — same pattern w/ `tx.student.update` + `before` row read + `AuditAction.UPDATE`. Re-validates via `studentSchema.partial()` for partial updates. Revalidates list + detail.
- [ ] `lib/students/actions/soft-delete.ts` NEW — sets `deletedAt: new Date()` + `AuditAction.SOFT_DELETE`. Refuses if already soft-deleted (returns `{ ok: false, error: "ALREADY_DELETED" }`).
- [ ] `lib/students/actions/restore.ts` NEW — clears `deletedAt: null` + `AuditAction.RESTORE`. Refuses if not soft-deleted.
- [ ] `lib/students/actions/__tests__/actions.test.ts` NEW — combined test file:
  - `vi.mock("@/lib/db")` + `vi.mock("@/lib/auth/session")` + `vi.mock("@/lib/audit/write")` + `vi.mock("next/cache")` (revalidatePath stub).
  - createStudent: scope-pass (admin role) → prisma.create called with tenantId injection; scope-fail (parent role) → returns FORBIDDEN; schema-fail (bad NIK) → returns INVALID_INPUT with field path; audit emitted via tx.
  - updateStudent: scope-pass → before+after captured; scope-fail → FORBIDDEN.
  - softDeleteStudent: ok path; refuse-already-deleted path.
  - restoreStudent: ok path; refuse-not-deleted path.
  - assertScope unit: ALL scope passes; missing role throws.
  - ≥14 assertions total.
- **Acceptance:** all 4 actions exist + typecheck; `npx vitest run lib/students/actions/` reports green; `lib/students/__tests__/nis-allocator.test.ts` baseline unchanged. **Depends on T3** (assertScope helper) + indirectly T1 (session.role).

### T5 — Student admin pages × 4

- [ ] `app/admin/akademik/siswa/page.tsx` NEW — 4-line ScaffoldListPage recipe. Pass through `searchParams` from Next.js page props.
- [ ] `app/admin/akademik/siswa/new/page.tsx` NEW — RSC shell that imports `ScaffoldFormPage` (client) + the `createStudent` server action and **passes the action directly** as the `onSubmit` prop (no closure wrapping — see Assumption #3). 4-line page recipe:
  ```tsx
  // app/admin/akademik/siswa/new/page.tsx
  import { ScaffoldFormPage } from "@/lib/scaffold";
  import student from "@/lib/entities/student/entity";
  import { createStudent } from "@/lib/students/actions/create";
  export default function Page() {
    return <ScaffoldFormPage entity={student} cancelHref="/admin/akademik/siswa" onSubmit={createStudent} />;
  }
  ```
- [ ] `app/admin/akademik/siswa/[id]/page.tsx` NEW — ScaffoldDetailPage with `fetchRow={() => prisma.student.findFirst({ where: { id, tenantId: session.tenantId, deletedAt: null } })}` resolved via getSession.
- [ ] `app/admin/akademik/siswa/[id]/edit/page.tsx` NEW — ScaffoldFormPage mode=edit with initialValues from row fetch + updateStudent action.
- **Acceptance:** `npm run build` route table contains 4 new entries (`/admin/akademik/siswa`, `/admin/akademik/siswa/new`, `/admin/akademik/siswa/[id]`, `/admin/akademik/siswa/[id]/edit`). Rendering smoke: routes return 200 in dev mode w/ admin demo session. **Depends on T1-T4** (session, error wrapper, actions all wired).

### T6 — Cycle doc fill + README ADR row

- [ ] Fill cycle doc Implementation + Verification + Ship Notes per /build pattern.
- [ ] Add README ADR row under Active ADRs table — Decision cell ≤400 chars per Rule 5. Decision text covers: SessionContext widened (role + currentTermId), Student admin pages live at `/admin/akademik/siswa`, page-layer fail-closed wrapper for OWN_STUDENT_UNRESOLVED, Guardian + Household pages deferred to next cycle.
- [ ] CLAUDE.md "Migrations landed" untouched (no migration this cycle).
- **Acceptance:** ADR cell ≤400 chars (verified inline via `awk -F'|'`); cycle doc all 6 sections populated.

### T7 — End-of-cycle gate + Verification + Ship Notes

- [ ] Run end-of-cycle gate: `npx prisma generate && npm run lint && npm run typecheck && npm run build && npx vitest run`. Playwright skipped (rebuild-window guard auto-skip — no e2e specs).
- [ ] Run verify gates: `bash scripts/verify-rls-coverage.sh` (32/32 unchanged), `bash scripts/verify-api-auth.sh` (4/4 unchanged), `bash scripts/verify-pii-annotations.sh` (5/5 unchanged), `npm run scaffold:check` (5 entities still validate).
- [ ] Fill cycle doc Verification with verbatim gate output.
- [ ] Fill cycle doc Ship Notes covering: SessionContext widening rollout (no JWT hook re-deploy; app-layer resolves role + term — operator action: NONE on Supabase dashboard; deploy normally), **demo-cookie format change** (24h natural expiry; CI safe because Playwright login route called per-test; **local-dev developers must re-issue the demo cookie after pulling this cycle: `curl -X POST 'http://localhost:3000/api/_demo/login?role=admin'` (or equivalent role) — old cookies fail HMAC payload validation and surface as a broken page until refreshed; documented here so the 24h transition window is explicit**), deferred-items refresh table (Guardian/Household pages → next cycle; Playwright canary; OWN_STUDENT resolver wiring; drift #1/#2/#3 deferral targets), rollback plan (git revert clean — pure source/test/docs cycle; no migration; no env var; no schema change).
- [ ] Spec-time + end-of-cycle code review (`feature-dev:code-reviewer` on diff per CLAUDE.md /build pattern); surface + address CRITICAL/MAJOR findings as in-task fix edits before commit.
- **Acceptance:** all gates green; cycle doc all 6 sections populated; ready for /ship.

## Implementation

- T1 — `lib/auth/session.ts` widened SessionContext (+role +currentTermId); `Promise.all` resolves `userRole.findFirst({ orderBy: createdAt asc })` + `academicTerm.findFirst({ orderBy: startDate asc })` in parallel after the existing User row lookup; either-missing → null fail-closed. `lib/auth/demo-cookie.ts` `DemoSessionPayload` extends with role + currentTermId; `verifyDemoCookie` rejects payloads missing either (legacy cookies fail validation → 24h natural expiry). `app/api/_demo/login/route.ts` extends `userRoleRow` select with `role.code` + adds `academicTerm.findFirst({ where: { tenantId, isActive: true }, orderBy: { startDate: "asc" } })` after tenant resolve; 500 + `no_active_term` if missing; passes both new fields to `setDemoSessionCookie`. Tests cover happy-path widened payload + null fail-closed (no UserRole / no active term) + 500 paths + payload validation rejecting legacy cookies.
- T2 — `lib/scaffold/errors.ts` NEW typed error module exporting `OwnStudentUnresolvedError extends Error` (name = "OwnStudentUnresolvedError", default message = "OWN_STUDENT_UNRESOLVED"). `lib/scaffold/index.ts` re-exports the class. `lib/scaffold/error-state.tsx` extends `ScaffoldErrorState` with `instanceof OwnStudentUnresolvedError` branch rendering "Akses dibatasi" / "Daftar siswa milikmu belum tersedia. Hubungi admin sekolah." copy + `ShieldOff` lucide icon. `lib/entities/student/entity.ts` dataFetcher widens Clause 4 (per Shared dataFetcher contract): when `session.role === "parent"`, calls `resolvePermissions({ ...session, prisma })` (PermissionPrismaLike cast); throws `OwnStudentUnresolvedError` if `studentScopeUnresolved=true`; otherwise injects `where.id = { in: [...studentIds] }` when `!resolved.all`. Roles other than parent skip the resolver entirely. Tests cover: admin skips resolver + tenant filter only, parent + studentScopeUnresolved → throws typed error, parent + resolved studentIds → id-IN injection, parent + all=true → skips id-IN.
- T3 — `lib/scaffold/server-action.ts` NEW exports `ActionResult<T>` discriminated union + `assertScope(session, policy, action)`. Read posture: scope-presence check (any scope grant for the role passes; row-level OWN_* lives in dataFetcher). Write posture (`create / update / soft_delete / restore / delete`): require `scope === "ALL"` — strict gate per spec-time review compensating for absent portal-level role gating until `p2-portal-shell-sidebar` lands. `lib/scaffold/index.ts` re-exports both. `lib/scaffold/form-page.tsx` widens `ScaffoldFormPageProps.onSubmit` from `(values: T) => Promise<void> | void` to `(values: T) => Promise<ActionResult<unknown>>`; `handleSubmit` reads `result.ok` and surfaces `result.error` via `setSubmitError`. This keeps page recipes single-line (`onSubmit={createStudent}`) — server actions are passed directly across the RSC → Client Component boundary; inline closures wrapping a server action would break Next.js serialisation.
- T4 — `lib/students/actions/{create,update,soft-delete,restore}.ts` NEW (4 server actions, each `"use server"` directive at top). Each follows identical pipeline: `getSession` (UNAUTHENTICATED if null) → `assertScope` (FORBIDDEN on throw) → `safeParse` (INVALID_INPUT with field path on fail) → `prisma.$transaction(create-or-update + writeAuditLog)` → `revalidatePath` → return `ActionResult<Student>`. Update / soft-delete / restore additionally pre-fetch the row for `before` audit context + emit NOT_FOUND when missing; soft-delete returns ALREADY_DELETED on idempotent re-call, restore returns NOT_DELETED when not soft-deleted. Audit emit gated on `policy.auditActions.includes(AuditAction.<action>)` per scaffold.md §6 + audit-pii.md §4 (atomic via shared tx). `lib/students/actions/__tests__/actions.test.ts` NEW combined-test file: 6 assertScope cases (admin read pass, parent read pass via OWN_STUDENT, admin create pass, parent create FORBIDDEN, HT update FORBIDDEN strict-ALL, HT soft_delete FORBIDDEN no-grant) + 4 createStudent + 3 updateStudent + 3 softDeleteStudent + 2 restoreStudent = 18 cases total, all green.

## Verification

<filled by /build — gate output, test names, manual smoke notes>

## Ship Notes

<filled by /ship — migrations, env vars, manual steps, rollback plan>
