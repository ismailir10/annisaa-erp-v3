# P2 Portal Write Widening — parent demo Guardian seed + canary smoke-test enablement

## Context

`p2-portal-shell-sidebar` (#204, 805588f) shipped the SELF-write canary: `Guardian.update` carries `{ role: 'parent', scope: 'SELF' }` with a row-level `userId: session.userId` predicate at the action, plus a static-scan meta-test (`lib/scaffold/__tests__/self-write-contract.test.ts`) that enforces every SELF-write grant pairs with the predicate. The deferred follow-up listed in #204's SD2 was: seed a demo Guardian row whose `userId` matches `parent@demo.local` so the canary can be smoke-tested via demo login on staging — without it, the SELF action's precheck `findFirst({ id, tenantId, deletedAt: null, userId: session.userId })` returns null because no demo Guardian carries the `userId` link.

The CTO-prompted cycle scope (per session brief) was bulk write-widening across the 11 remaining people-entity server actions. **Foundation §10.7.2 verification at /spec time contradicts that scope.** The foundation rule for people-entity writes (Student / Guardian / Household / StudentGuardian / StudentIdentifier / GuardianInvitation) reads verbatim:

> `A/P/KD/AO: ALL`. `HT: OWN_CLASS update` (limited fields per existing policy). **PR: SELF on Guardian profile only; no other writes.**

Foundation §10.7.2 is unambiguous: parent (PR) has **zero** write capability beyond `Guardian.update` SELF, which is already canary-shipped. There is no §10.7.2 grant for parent on `Student.update`, `Student.softDelete`, `Student.restore`, `Guardian.create`, `Guardian.softDelete`, `Guardian.restore`, or any `Household` write. HT's `OWN_CLASS update` exists in §10.7.2 but is explicitly out-of-scope per the session brief (no class-attendance entities mounted). AO/FO write deltas live in admission/finance cycles.

**Net consequence:** AC1's proposed `+ { role: 'parent', scope: 'OWN_STUDENT' }` on `Student.update` would widen beyond what foundation §10.7.2 mandates. Adding it without a prior foundation amendment would be drift in the opposite direction of the §10.7.3 audit. Therefore this cycle narrows to the foundation-aligned subset:

1. **AC2 — Parent demo Guardian seed** — the only blocker that prevents the canary from being smoke-tested today. Closes #204 SD2.
2. **AC5 — Playwright canary extension** — exercises the existing SELF widening end-to-end via demo login, audit-row visibility, and NOT_FOUND behaviour for non-owned rows. Locks the canary contract before further widening.
3. **Meta-test contract reinforcement** — keep the existing static scan SELF-only; tighten doc comments to record the §10.7.2 ceiling explicitly so future cycles don't add OWN_STUDENT-write grants without amending foundation first.

`AC1` (Student.update OWN_STUDENT widening), `AC3`/`AC4`/`AC6` OWN_STUDENT-write coverage, and the gate widening to allow `OWN_STUDENT` on writes are **deferred** to a foundation-amendment cycle (proposed slug: `spec-sync-portal-writes` or similar). That cycle would land the §10.7.2 amendment first (with portal use-case justifications + audit posture review), THEN widen action-layer scopes accordingly. Splitting concerns avoids gate-widening speculation against an unamended foundation.

Marathon mode (foundation §18.12). Foundation §18A row prepended as `next` at /spec time; /ship Step 3 flips to shipped.

## Spec

### Acceptance criteria

- [ ] **AC1 — Parent demo Guardian seed lands.** `prisma/seed/10-demo-parent-guardian.ts` creates TWO Guardian rows (per spec-time review P0b): (a) ONE owned by the demo parent (`userId === parent@demo.local.id`, `fullName: 'Demo Parent Guardian'`), and (b) ONE unowned fixture (`userId: null`, `fullName: 'Demo Other Guardian'`) so the Playwright canary's Path-B can point at a real row that returns NOT_FOUND for the parent caller. Idempotent: `findFirst({ tenantId, userId: parentUserId, deletedAt: null })` then create on miss / update on hit (resurrect via `deletedAt: null` per seed 08/09 precedent). For the unowned fixture, idempotency keys on `(tenantId, fullName: 'Demo Other Guardian', userId: null, deletedAt: null)`. Wired into `prisma/seed/index.ts` orchestrator after `09-households`. Guardian model fields used: `tenantId`, `userId`, `fullName` only — `Guardian` has no `kindKaitan` / `relationship` column (those live on `StudentGuardian`); per-parent role-of-relation is established via the join table when a Student is linked, which is deferred to a future cycle. The new seed depends on seed 08 (resolves `parent@demo.local` User) — throws `seed_dependency_missing` if absent. No dependency on seed 09 (KK-001 not used; Guardian carries no household FK in the current schema — `Household` ↔ `Guardian` linkage flows via `StudentGuardian.studentId → Student.householdId`).

- [ ] **AC2 — Playwright SELF-write canary extension.** Per spec-time review P1a: server actions are NOT directly POST-able from Playwright. New thin route `app/api/demo/guardian/route.ts` (DEMO_MODE-gated, mirrors `app/api/demo/login/route.ts` posture — refuses if `process.env.DEMO_MODE !== 'true'`) wraps `updateGuardian(id, payload)` and returns its `ActionResult` JSON unchanged. The route accepts `POST` with `{ id, payload, readback?: boolean }` body; `readback: true` returns the post-update row (or NOT_FOUND) so the Playwright spec can assert state without a separate readback endpoint. Auth posture: standard demo-cookie session (no special bypass) — the route is harness-only, not an auth shortcut. New spec `e2e/parent/self-update.spec.ts` (or extension of `e2e/parent/portal-shell.spec.ts` — pick at /build) exercises:
  - **Path A (positive):** demo-login parent → POST `/api/demo/guardian` with `{ id: parentOwnGuardianId, payload: { fullName: 'Demo Parent Guardian Updated' } }` → assert response `{ ok: true }` + confirm `fullName` updated via readback + confirm exactly one new audit row in `AuditLog` with `actorUserId === parent.userId, action: UPDATE, resource: 'Guardian'`.
  - **Path B (negative — non-owned row):** demo-login parent → POST `/api/demo/guardian` with `{ id: demoOtherGuardianId, payload: { fullName: 'Should Not Apply' } }` → assert response `{ ok: false, error: 'NOT_FOUND' }`. Critically: the unowned fixture row from seed 10 (per AC1) IS present in the DB, so a regression that drops the SELF predicate would return `{ ok: true }` — making this canary meaningful, not vacuous.
  - **ID resolution:** spec resolves `parentOwnGuardianId` + `demoOtherGuardianId` either via a deterministic readback through the same `/api/demo/guardian` route (`{ list: true }` mode returning own + other Guardian IDs for the current demo session — DEMO_MODE-gated) OR via a Playwright `page.evaluate` against a server component on a stub demo-only page. Decide at /build — prefer the route extension to keep the plumbing in one place.

- [ ] **AC3 — Meta-test doc-comment reinforcement.** `lib/scaffold/__tests__/self-write-contract.test.ts` keeps its current SELF-only enumeration but adds a header comment recording the §10.7.2 ceiling:

  > Foundation §10.7.2 currently caps parent write-scope at `Guardian.update SELF` only. No `OWN_STUDENT` write grants exist today. If a future cycle adds OWN_STUDENT (or any other non-ALL non-SELF) write grant, it MUST land alongside (a) a foundation §10.7.2 amendment + (b) the corresponding row-level allowlist predicate at the action + (c) extension of this meta-test to enforce that predicate. Not negotiable — the gate at `lib/scaffold/server-action.ts:69` deliberately fails OWN_* writes closed.

  No file rename, no enumeration change. Doc-only edit.

- [ ] **AC4 — Tests:**
  - `prisma/seed/__tests__/10-demo-parent-guardian.test.ts` — first-run creates one Guardian with `userId === parent@demo.local.id`; re-run is idempotent (no duplicate row, no error); seeded Guardian's `tenantId` matches the seeded tenant; seed throws cleanly if `parent@demo.local` User row is missing.
  - `lib/guardians/actions/__tests__/update.test.ts` (extension or new) — parent SELF caller with matching `userId` updates own row → `ok: true`; parent SELF caller against a Guardian row owned by another userId → `ok: false, error: 'NOT_FOUND'`; admin ALL caller against any row → `ok: true` (existing regression).
  - Net delta: ~+4–6 vitest cases.
  - Playwright: 1 new spec OR 1 extension (per AC2).

- [ ] **AC5 — All gates green:**
  - `npm run build && npx vitest run && npx playwright test` all pass.
  - `npx prisma generate` clean (no schema delta).
  - `bash scripts/verify-rls-coverage.sh` — 32/32 (no schema delta — ensure unchanged).
  - `bash scripts/verify-api-auth.sh` — unchanged (no new routes).
  - `bash scripts/verify-pii.sh` — 5/5 (no entity-policy delta).
  - `npm run scaffold:check` — 5/5.
  - `npm run lint` — clean.
  - `npx tsc --noEmit` — clean.

- [ ] **AC6 — Foundation §18A row.** Prepend `| 2 | portal-write-widening | p2-portal-write-widening | 2026-05-08 | — | — | next |` at /spec time. /ship Step 3 fills PR + Tip Commit + flips to `shipped`.

### Non-goals (deferred — explicit)

- **AC1 from session brief — Student.update OWN_STUDENT widening for parent.** Blocked by foundation §10.7.2 (which grants parent zero non-Guardian writes). Defer to a foundation-amendment cycle that lands §10.7.2 amendment + supporting OWN_STUDENT-write infrastructure together. Proposed slug: `spec-sync-portal-writes` or `p2-portal-write-widening-v2`.
- **`assertScope` writes-gate widening to OWN_STUDENT** (session brief AC6). Premature without (a) a §10.7.2-mandated OWN_STUDENT-write grant and (b) the corresponding row-level predicate contract. The gate stays at `ALL || SELF`.
- **Meta-test rename** to `scope-write-contract.test.ts` (session brief AC3 fork). No OWN_STUDENT-writes exist today → renaming + adding empty-set OWN_STUDENT enumeration would be premature abstraction. Doc-comment update only this cycle.
- **`studentGuardian` linkage** in the new seed (session brief AC2 nice-to-have). Not required for the SELF canary smoke. If a future cycle needs end-to-end OWN_STUDENT resolution from demo login, that cycle adds the linkage.
- **admission_officer scope widening** on StudentIdentifier / GuardianInvitation create-paths → `p2-admission-funnel`.
- **OWN_CLASS write-widening** for homeroom_teacher → blocked by `p2-classes-management`.
- **Drift #1/#2** finance_officer ALL on Student.read / Guardian.read → `p3-fee-foundation`.
- **Public `/daftar` admission form** → `p2-admission-funnel`.
- **Address chain** → `p2-addresses-idn-chain`.
- **Detail-tab content**, **smart-views chip filter** → future per-tab / smart-view cycles.

### Assumptions

1. **§10.7.2 is the canonical ceiling.** Foundation §10.7.2's "PR: SELF on Guardian profile only; no other writes" is the binding rule for this cycle. If the CTO believes the portal needs broader parent writes (e.g. parent fixes child's preferred name), the right move is amend §10.7.2 first in a separate cycle, not widen action-layer scopes against an unamended foundation.
2. **Two demo Guardian rows.** Per spec-time review P0b: one parent-owned (`userId !== null`) + one unowned fixture (`userId: null`) so the Playwright canary's Path-B has a concrete row to assert NOT_FOUND against. Without the fixture, Path-B's "regression that drops the SELF predicate" detection is vacuous (the row literally doesn't exist).
3. **No `Guardian.householdId` linkage.** The Guardian model has no `householdId` FK in the current schema (per schema.prisma:1168-1197). Household ↔ Guardian linkage flows through `StudentGuardian.studentId → Student.householdId` only, which requires a Student row — deferred. Seed 10 therefore creates Guardian rows unattached to any Household; admin Guardian list pages render them with empty household column.
4. **Playwright SELF spec uses a new DEMO_MODE-gated harness route, not a parent-portal form.** Per spec-time review P1a: server actions are not POST-able from Playwright. The new `app/api/demo/guardian/route.ts` (T4a) wraps `updateGuardian` for the spec to invoke; refuses if `DEMO_MODE !== 'true'`, so production builds carry the route file but it returns 404 on call. The parent portal has no admin-style edit form yet; that lands in a future cycle when the portal surface widens beyond the stub.
5. **Net file delta ≈ 8–10 files.** `10-demo-parent-guardian.ts` (new) + `prisma/seed/index.ts` orchestrator wire + `app/api/demo/guardian/route.ts` (new harness route) + 1 vitest seed test + 1 vitest action test (new or extension) + 1 Playwright spec (new or extension) + meta-test doc comment + foundation §18A row (already prepended) + cycle doc = ~8–10 files. Well within the §18.2 25-file cap.

→ **Correct me now or `/build` will proceed with these.**

## Tasks

Tasks are sequential — the seed must land before the test that asserts it, and the Playwright spec depends on the seed running cleanly under reseed.

- [x] **T1 — Parent demo Guardian seed.** Create `prisma/seed/10-demo-parent-guardian.ts` exporting `seedDemoParentGuardian(prisma, tenantId)`. Logic:
  1. Resolve `parent@demo.local` User via `findFirst({ tenantId, email: 'parent@demo.local', deletedAt: null })` — throw `Error('seedDemoParentGuardian: parent User missing — run 08-demo-users first')` if absent.
  2. **Owned row** — `findFirst({ tenantId, userId: parentUserId, deletedAt: null })`. On miss: `prisma.guardian.create({ data: { tenantId, userId: parentUserId, fullName: 'Demo Parent Guardian' } })`. On hit: `prisma.guardian.update({ where: { id }, data: { fullName: 'Demo Parent Guardian', deletedAt: null } })` (resurrect-on-soft-delete per seed 08 pattern).
  3. **Unowned fixture row** — `findFirst({ tenantId, fullName: 'Demo Other Guardian', userId: null, deletedAt: null })`. On miss: `prisma.guardian.create({ data: { tenantId, userId: null, fullName: 'Demo Other Guardian' } })`. On hit: skip (no field to update).
  4. Console-log create / update / present consistently with seed 08/09 style.
  Wire into `prisma/seed/index.ts` orchestrator AFTER `09-households`. Schema fields used: `tenantId`, `userId`, `fullName` only — no `kindKaitan` (per spec-time review P0a, that field doesn't exist on Guardian). **Acceptance:** `npx prisma db seed` clean on first run + idempotent on second + idempotent post-soft-delete (resurrects); both Guardian rows present afterward; the parent-owned row has `userId === DEMO_USERS[parent].id` and the fixture row has `userId === null`.

- [x] **T2 — Seed test.** Add `prisma/seed/__tests__/10-demo-parent-guardian.test.ts`. Mock Prisma client (no live DB at unit-test layer) covering:
  - first-run on empty state → 2 `guardian.create` calls (one with `userId === parentUserId`, one with `userId === null`);
  - second-run on populated state → 0 `guardian.create` calls + 1 `guardian.update` call on the parent-owned row + 0 updates on the fixture (no field to refresh);
  - third-run after soft-delete (mock `findFirst` to return a row with `deletedAt !== null`) — currently returns null because the precheck filters `deletedAt: null`, so a new row would attempt to create; verify the create is permitted because there is no `@@unique([tenantId, userId])` partial constraint that would throw P2002 (Guardian schema lines 1192-1196 only declare `@@unique([id, tenantId])` + non-unique indexes — confirm). Document the resurrect-or-create branching choice;
  - missing parent User → throws with the exact message specified in T1.
  Mocking posture mirrors `lib/scaffold/__tests__/self-write-contract.test.ts` (`vi.mock('@/lib/db', () => ({ prisma: { ... } }))`). **Acceptance:** `npx vitest run prisma/seed/__tests__/10-demo-parent-guardian.test.ts` green; all four scenarios assert correct call counts on the mocked Prisma client.

- [x] **T3 — Guardian.update SELF action coverage extension.** Extend `lib/guardians/actions/__tests__/update.test.ts` (create if it doesn't exist; otherwise add cases). Three cases:
  - `parent + matching userId` → `ok: true` + audit row written with `actorUserId === session.userId`.
  - `parent + non-matching userId` (row owned by a household-seeded Guardian) → `ok: false, error: 'NOT_FOUND'` (information-leak posture).
  - `admin + ALL grant` → `ok: true` regardless of row's `userId` (regression).
  **Acceptance:** the three cases pass against the action's actual code path (mock `getSession` + `prisma.guardian.findFirst` + `prisma.$transaction` per `lib/students/actions/__tests__/actions.test.ts` precedent).

- [x] **T4a — Demo harness route.** Create `app/api/demo/guardian/route.ts` (DEMO_MODE-gated). On `POST` with body `{ id: string, payload: object, readback?: boolean }` → invoke `updateGuardian(id, payload)` and return its `ActionResult` JSON; if `readback === true`, additionally include the post-update row (or null on NOT_FOUND). Also accept `POST` with body `{ list: true }` → return `{ ownGuardianId, otherGuardianId }` resolved via `prisma.guardian.findFirst` against the current demo session's `userId` (own) and `findFirst({ tenantId, userId: null, fullName: 'Demo Other Guardian' })` (fixture). Refuse with HTTP 404 if `process.env.DEMO_MODE !== 'true'`. Auth via existing `getSession()` (requires the demo cookie). **Acceptance:** route mounts cleanly under `npm run build`; verify-api-auth still passes (`scripts/verify-api-auth.sh` recognises the new route as DEMO_MODE-gated, mirroring `app/api/demo/login` registration).

- [ ] **T4b — Playwright SELF canary spec.** Extend `e2e/parent/portal-shell.spec.ts` (or new `e2e/parent/self-update.spec.ts` — pick at impl time, prefer extension if the existing spec already mounts the parent portal). Steps:
  1. POST `/api/demo/login?role=parent` → 200 + cookie.
  2. POST `/api/demo/guardian` with `{ list: true }` → grab `ownGuardianId` + `otherGuardianId`.
  3. **Path A:** POST `/api/demo/guardian` with `{ id: ownGuardianId, payload: { fullName: 'Demo Parent Guardian Updated' }, readback: true }` → assert `{ ok: true, data: { fullName: 'Demo Parent Guardian Updated' } }`.
  4. **Path B:** POST `/api/demo/guardian` with `{ id: otherGuardianId, payload: { fullName: 'Should Not Apply' } }` → assert `{ ok: false, error: 'NOT_FOUND' }`.
  Reuses the existing `POST /api/demo/login?role=parent` cookie. **Acceptance:** `npx playwright test` full suite green (6 or 7 specs depending on extension vs. new file).

- [ ] **T5 — Meta-test doc-comment + cycle doc fill.** Edit `lib/scaffold/__tests__/self-write-contract.test.ts` header — add the §10.7.2 ceiling paragraph (per AC3). Edit cycle doc `## Implementation` per task. Edit cycle doc `## Verification` with gate output (`design-system` literal token mentioned for frontend-gate compliance only if frontend touched — this cycle touches no frontend, so the gate doesn't fire; verify via `git diff` is server / test / seed only). Prepend §18A row to foundation file. **Acceptance:** all gates green; cycle doc all six sections filled (Ship Notes by /ship); §18A row prepended.

## Implementation

- Subagent plan: tasks fully sequential (T1 → T2 → T3 → T4a → T4b → T5). T2 tests T1's seed; T4b calls T4a's route; T5 lands cycle-doc finalization. No parallel-safe split. No subagent dispatch.
- Task 1+2 (combined commit) — `prisma/seed/10-demo-parent-guardian.ts` (new) + `prisma/seed/index.ts` (orchestrator wire) + `prisma/seed/__tests__/10-demo-parent-guardian.test.ts` (new) — seeds two Guardian rows (one parent-owned via `userId === parent@demo.local.id`, one unowned fixture via `userId: null`), idempotent on re-run with resurrect-on-soft-delete via `deletedAt: null` reset; 4 vitest cases cover first-run / re-run / missing-User-throws / post-soft-delete create-path. Schema fields used: `tenantId`, `userId`, `fullName` only — `Guardian` carries no `kindKaitan` column (per spec-time review P0a).
- Task 3 — `lib/guardians/actions/__tests__/actions.test.ts` extension. Existing test file (added in `p2-portal-shell-sidebar` T4) already covered the three originally-planned cases at lines 185, 206, 226 (parent SELF own-row → ok + where-clause shape; parent SELF wrong-row → NOT_FOUND; admin ALL regression). T3 narrows to the missing assertion: parent SELF write emits an audit row with `actorUserId === parent.userId` + `action: UPDATE` + `resource: 'Guardian'` + `resourceId: id`. +1 vitest case (22 → 23 in this file).
- Task 4a — `app/api/demo/guardian/route.ts` (new). DEMO_MODE-gated POST handler: 404 unless `DEMO_MODE === 'true'`; 401 if no demo session cookie. Two body shapes via Zod parse: `{ list: true }` returns `{ ownGuardianId, otherGuardianId }` resolved by tenant-scoped findFirst against `userId === session.userId` (own) and `userId IS NULL && fullName === UNOWNED_FIXTURE_GUARDIAN_NAME` (fixture); `{ id, payload, readback? }` invokes `updateGuardian(id, payload)` and returns its `ActionResult` JSON unchanged (with optional readback row when `readback === true && result.ok`). Reuses the seed 10 fixture-name constant for symbol consistency. `verify-api-auth.sh` 6/6 ✓ (route uses `getSession`, not `// @public`).

## Verification

- Task 1+2 — `npx prisma generate` ✓; `npm run build` ✓; `npx vitest run prisma/seed/__tests__/10-demo-parent-guardian.test.ts` 4/4 ✓; full `npx vitest run` 1069 passed | 4 skipped (1073 total) — net +4 cases vs. prior run (was 1065).
- Task 3 — `npx vitest run lib/guardians/actions/__tests__/actions.test.ts` 22/22 ✓ (was 21 → 22 with the new audit-actorUserId case).
- Task 4a — `npm run build` ✓; `bash scripts/verify-api-auth.sh` 6/6 ✓ (was 5/5; the new route resolves via `getSession`); full `npx vitest run` 1070 passed | 4 skipped (1074 total) — net +1 vs. prior task.

## Ship Notes

<!-- filled by /ship -->
