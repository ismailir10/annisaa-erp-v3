# P2 Portal Shell + Sidebar — IA per portal, layout-level role gate, SELF-scope canary write

## Context

Scaffold pages from `p2-scaffold-pages` (#196) + `p2-scaffold-pages-guardian-household` (#198) mount under `/admin/**` today as bare children — no nav rail, no breadcrumbs, no portal-role gate. The 12 server actions they ship are gated `assertScope` strict-ALL on writes (admin/principal/kadiv/admission_officer only) — an explicit stopgap pinned in `lib/scaffold/server-action.ts:14-18` because, until portal-role surfaces routes per role, widening writes to OWN_* would let unintended forms 403 silently mid-submit. Three blockers this cycle wires in one slice:

1. **No portal layouts.** `find app -maxdepth 3 -name "layout.tsx"` returns only `app/layout.tsx`. Admin/teacher/parent each need their own layout with the sidebar shell.
2. **No layout-level portal-role gate.** A `parent` hitting `/admin/akademik/siswa` today reaches the dataFetcher's `OwnStudentUnresolvedError` (foundation §10.7.2 fail-closed via Clause 4) — only because the page-layer wrapper catches it. Should redirect at the layout *before* the page renders.
3. **Strict-ALL write stopgap.** Need a canary path proving SELF / OWN_* writes can land safely once layout gating exists. Bulk widening across all 12 actions deferred to `p2-portal-write-widening`; this cycle ships ONE end-to-end slice (parent updates own `Guardian.phone`).

Three spec-time decisions surface and resolve below (see **Spec-time decisions**) — most consequential: the canary write reuses the existing `SELF` scope from `enum PermissionScope` rather than introducing `OWN_GUARDIAN`. Avoids a Prisma schema migration that would invalidate AC7's "no schema" claim and force an RLS-coverage row update.

Marathon mode (foundation §18.12). Skip `superpowers:brainstorming` — concrete spec from CTO request.

**Required reading consumed:** `docs/cycles/2026-05-07-p2-scaffold-pages.md`, `docs/cycles/2026-05-07-p2-scaffold-pages-guardian-household.md`, `docs/cycles/2026-05-08-p2-entity-actions.md`, foundation §10A.1 (IA per portal) + §6.5 (parent-Guardian link via `User.id`) + §18A (Phase Status), `app/layout.tsx`, `app/page.tsx` (root), `proxy.ts` (idle-timeout redirects to `/`), `lib/auth/session.ts` (SessionContext shape with `role: RoleCode` + `currentTermId`), `lib/scaffold/permission.ts` (resolver), `lib/scaffold/server-action.ts:39-55` (assertScope strict-ALL), `lib/scaffold/entity.ts:153-160` (ScaffoldScope union), `lib/entities/_types.ts:30-41` (ROLE_CODES), `lib/entities/_registry.ts` (POLICY_BY_RESOURCE), `lib/entities/{student,guardian,household,student-identifier,guardian-invitation}/{policy,entity}.ts`, `lib/guardians/actions/update.ts`, `prisma/schema.prisma:18-26` (PermissionScope enum) + `:1168-1199` (Guardian.userId), `components/ui/{sheet,button}.tsx`, `.claude/standards/{ui,portal,patterns,security,voice}.md`. Ground-truth: `git log origin/staging --oneline -5` confirms tip `f17181d` (p2-entity-actions §18A row at `shipped`); §18A has no `p2-portal-shell-sidebar` row yet.

## Spec

### Spec-time decisions (cycle prompt called these out for scrutiny)

**SD1 — Layout-guard mismatch behaviour: redirect("/")**, NOT `notFound()` (404).
- *Trade-off:* `notFound()` is information-disclosure-clean (no signal the route exists). `redirect("/")` matches the existing idle-timeout pattern at `proxy.ts:36-42` (mismatched session → home). Route names are already public knowledge in the JS bundle (Next.js ships the route manifest client-side); 404 buys nothing against an attacker who reads `_buildManifest.js`.
- *Decision:* `redirect("/")` for authenticated mismatched-role; `redirect("/")` for unauthenticated (root page is the public landing/login surface today). Consistent with idle-timeout. UX: a parent who follows a stale `/admin/foo` link doesn't see a 404 — they land on the public home and can navigate from there.
- *Future:* once `/login` becomes a distinct route (post-`p2-auth-google-oauth-followup`), unauthed branch can swap to `redirect("/login?next=<original>")`. Out of scope this cycle.

**SD2 — Canary write scope: SELF (existing enum), NOT new OWN_GUARDIAN.**
- *Trade-off:* `OWN_GUARDIAN` would name the semantics best ("my own Guardian row") but adding it requires:
  (a) adding `OWN_GUARDIAN` to `enum PermissionScope` in `prisma/schema.prisma:18-26` → migration → invalidates AC7 "no schema" + forces a `verify-rls-coverage` policy row,
  (b) adding `OWN_GUARDIAN` to `ScaffoldScope` in `lib/scaffold/entity.ts:153-160` → breaks every consumer's exhaustive switch,
  (c) materialising `ownGuardianIds: Set<string>` in `lib/scaffold/permission.ts` → 5-minute-TTL cache key bloat, plus tests.
- `SELF` already exists in both `enum PermissionScope` (line 25) and `ScaffoldScope` (`lib/scaffold/entity.ts:160`). Semantics fit: parent's Guardian row IS the parent themselves — `Guardian.userId === session.userId` per `prisma/schema.prisma:1171` (`userId String?` with `User?` relation). No materialised allowlist needed for SELF — row-level enforcement at the server action via `where: { id, tenantId, userId: session.userId }`.
- *Decision:* `SELF`. Resolver gains nothing this cycle (no Set materialisation for SELF — see permission.test.ts addition below). `assertScope` writes-gate widens from `scope !== "ALL"` → `scope !== "ALL" && scope !== "SELF"`. `lib/guardians/actions/update.ts` adds the `userId: session.userId` clause to its `findFirst` precheck when grant.scope === "SELF".
- *Naming consistency note:* future per-parent-on-Student widening (`p2-portal-write-widening`) keeps `OWN_STUDENT` (already in enum). New scopes only when no existing literal fits.
- ***Footgun mitigation (per spec-time review SR1, Confidence 95):*** widening `assertScope` is a **global** gate change — every future write grant of `scope: 'SELF'` on **any** entity will pass the gate and rely entirely on its action's row-level `userId` predicate. Forgetting that predicate = wide-open same-role write. Mitigations this cycle:
  1. Inline doc-comment in `lib/scaffold/server-action.ts:39-55` warning that every SELF-write grant MUST pair with a row-level `userId` predicate at the action layer.
  2. Inline doc-comment in `lib/scaffold/entity.ts` near the `ScaffoldScope` union flagging the same contract.
  3. New meta-test `lib/scaffold/__tests__/self-write-contract.test.ts` (T4 acceptance line) — enumerates `POLICY_BY_RESOURCE` and asserts: for every `(resource, action, grant)` triple where `WRITE_ACTIONS.has(action) && grant.scope === "SELF"`, the corresponding action file at `lib/<resource>s/actions/<action>.ts` (lowercase, plural — same convention as existing) must contain a `userId: session.userId` literal. Static text scan, no runtime exec — same posture as `scripts/scaffold-check.ts`. Fails CI if a future cycle adds SELF-write without the predicate.
  4. The current widening shipped this cycle is verified safe: meta-test enumerates all 5 policies → only Guardian.update gets a SELF grant; the test then greps `lib/guardians/actions/update.ts` for `userId: session.userId` and confirms.

**SD3 — Sidebar collapse state: cookie, NOT localStorage.**
- *Trade-off:* localStorage is client-only → SSR renders default-expanded → mismatch flashes if user prefers collapsed. Cookie is SSR-readable via `next/headers cookies()` → server renders correct initial state → no flicker. Cookie cost: ~5 bytes (`portal-sidebar-collapsed=1`) on every request to `/admin/**`, `/teacher/**`, `/parent/**`.
- *Decision:* cookie `portal-sidebar-collapsed`, `SameSite=Lax`, `Path=/`, `Max-Age=31536000`, no `httpOnly` (set/read from client toggle). Hydration-safe.

**SD4 — Per-portal IA registry coupling.**
- *Risk:* `lib/portal/nav-config.ts` imports `lib/entities/_registry.ts` → if entity registry ever imports portal config (shouldn't, but), cyclic-import. Today entity registry imports only its own per-entity policy modules → one-way dep is safe.
- *Decision:* `lib/portal/nav-config.ts` imports `POLICY_BY_RESOURCE` for resource-name validation only and reads `entity.label` from each `lib/entities/<name>/entity.ts` re-export via `lib/entities/index.ts` (already a barrel). One-way dep; ESLint's `import/no-cycle` (already configured per `eslint.config.mjs`) catches a regression in CI if a future cycle inverts the import.

**SD5 — Playwright cross-portal redirect race.**
- *Risk:* Demo-login sets cookie → navigate to mismatched route → server-side redirect fires → Playwright assertion that races with the redirect chain misreads.
- *Decision:* sequential await — `await page.goto(<mismatched-route>); await page.waitForURL("/", { timeout: 5000 });`. Layout-guard `redirect()` is a server-side 307/302 in the response itself; `page.goto` (default `waitUntil: "load"`) follows it server-side and resolves on the final URL. The follow-up `waitForURL("/")` then confirms the final URL contractually. Per spec-time review SR2 (Confidence 90): the `Promise.all([waitForURL, goto])` pattern is for **client-side** post-load redirects (e.g. `useEffect` redirect) and would race wrongly here — `waitForURL` could resolve against a still-pending tab and false-pass. Sequential is correct for synchronous server-side redirects.

### Acceptance criteria

- [ ] **AC1 — Sidebar primitives + per-portal IA registry land.**
  - `components/portal/sidebar.tsx` (NEW) — root component. Props: `{ portal: 'admin' | 'teacher' | 'parent'; collapsed?: boolean }`. Renders `<nav aria-label="Portal navigation">` with `NAV_BY_PORTAL[portal]` groups via `<SidebarGroup>` + `<SidebarItem>`. Active-route highlight via `usePathname` from `next/navigation`. Mobile (`md:hidden`): collapses to a hamburger `Sheet` (Shadcn `components/ui/sheet.tsx`). Desktop (`md:flex`): sticky 240px rail. Collapse-to-icon-only toggle button writes cookie `portal-sidebar-collapsed=1|0` (SD3). a11y: `<a aria-current="page">` on the active item.
  - `components/portal/sidebar-group.tsx` + `components/portal/sidebar-item.tsx` extracted (one file each — keeps `sidebar.tsx` under 200 lines per `.claude/standards/ui.md` Shadcn-FIRST conventions).
  - `lib/portal/nav-config.ts` exports `NAV_BY_PORTAL: Readonly<Record<'admin' | 'teacher' | 'parent', NavGroup[]>>` per foundation §10A.1. Pulls labels from the entity registry (no hard-coded "Siswa" / "Wali" — derefs `studentEntity.label.id`, `guardianEntity.label.id`, etc.).
  - Lucide icons per item (registry already exposes `entity.icon` on the 5 mounted entities; nav-config falls back to a reasonable default for non-entity links like "Beranda" / "Pengumuman").
- [ ] **AC2 — Layout-level portal-role guard.**
  - `app/admin/layout.tsx` (NEW) calls `getSession()` → if null → `redirect("/")`; if `session.role` ∉ {admin, principal, kadiv, admission_officer, finance_officer} → `redirect("/")` (SD1). Wraps `<children>` in the portal shell (sidebar + main).
  - `app/teacher/layout.tsx` (NEW) — same shape; allowed roles {homeroom_teacher, sentra_teacher}.
  - `app/parent/layout.tsx` (NEW) — same shape; allowed roles {parent}.
  - All three import `assertPortalAccess` from new `lib/portal/portal-guard.ts` (helper consolidates the role-set + `redirect("/")` logic so the three layouts stay 4-line minimum recipes).
- [ ] **AC3 — Canary write-widening: parent updates own `Guardian.phone` via SELF scope.**
  - `lib/entities/guardian/policy.ts` — `update` grant array adds `{ role: 'parent', scope: 'SELF' }` (NEW grant; SELF was unused before this cycle on Guardian).
  - `lib/scaffold/server-action.ts:49` — assertScope writes-gate widens: `if (WRITE_ACTIONS.has(action) && grant.scope !== "ALL" && grant.scope !== "SELF") throw new Error("FORBIDDEN")`. SELF on writes now allowed at the gate; row-level enforcement is the action's job.
  - `lib/guardians/actions/update.ts:50-52` — `findFirst` precheck adds `userId: session.userId` clause **conditionally** on `grant.scope === "SELF"`. ALL grants keep the existing tenant-only precheck. Implementation: read `grant` from `policy.scopes.update.find(g => g.role === session.role)` after `assertScope` succeeds; switch on `grant.scope`.
  - Out of scope: extending the same widening to `createGuardian`, `softDeleteGuardian`, `restoreGuardian`, or to the other 11 server actions — `p2-portal-write-widening`.
- [ ] **AC4 — Layout-guard helper + nav-config tests.**
  - `lib/portal/__tests__/portal-guard.test.ts` (NEW, 6 cases) — `assertPortalAccess` matrix: each portal × {valid-role, mismatched-role, unauthed} (3×2=6 — the 3rd column "unauthed" collapses across portals into 1 case + 5 role/portal pairs gives the cleaner 6 = 3 valid + 2 mismatched + 1 unauthed; whichever shape totals 6).
  - `lib/portal/__tests__/nav-config.test.ts` (NEW, 3 cases) — IA shape per portal (admin: 5 groups; teacher: 4 items; parent: 4 items), labels derive from entity registry (no string literals), icon names valid Lucide identifiers.
- [ ] **AC5 — Sidebar component test.**
  - `components/portal/__tests__/sidebar.test.tsx` (NEW, 4 cases) — renders for each portal (admin / teacher / parent header text differs), active-route highlight (mock `usePathname` → `aria-current="page"` on matching item), collapsed-state cookie round-trip (toggle button writes `document.cookie`), mobile drawer keyboard close (Esc on open `Sheet` → closes).
- [ ] **AC6 — SELF-scope server-action coverage.**
  - `lib/guardians/actions/__tests__/actions.test.ts` extension (~3 cases) — parent SELF write hits row-level guard: (a) parent updates OWN Guardian → ok, (b) parent updates other Guardian → NOT_FOUND (the `findFirst` returns null, masking the row's existence — ALL grants surface NOT_FOUND too on tenant-mismatch, so this is consistent), (c) admin ALL grant unaffected (regression).
  - `lib/scaffold/__tests__/server-action.test.ts` (NEW or extend, ~2 cases) — assertScope SELF write passes, OWN_STUDENT write still fails-closed (regression — only SELF widened this cycle).
- [ ] **AC7 — Playwright shell + cross-portal redirect.**
  - `e2e/admin/portal-shell.spec.ts` (NEW) — demo login admin → assert sidebar has 5 group headings (Akademik / Operasi / Keuangan / Identitas / Sistem) → click "Siswa" → URL = `/admin/akademik/siswa` + `aria-current="page"` on link → navigate `/parent/foo` → `waitForURL('/')` (SD5). ≥6 assertions.
  - `e2e/teacher/portal-shell.spec.ts` — demo login as `homeroom_teacher` → assert 4 items (Beranda / Kelas Saya / Sentra Saya / Riwayat) → active-route highlight → cross-portal redirect. ≥6 assertions.
  - `e2e/parent/portal-shell.spec.ts` — demo login as `parent` → assert 4 items (Beranda / Anak Saya / Tagihan / Pengumuman) → active-route highlight → cross-portal redirect. ≥6 assertions.
- [ ] **AC8 — All gates green.**
  - `npx prisma generate` clean (no schema diff).
  - `npm run lint`, `npm run build`, `npx vitest run` (~+13–15 cases).
  - `npx playwright test` (3 new specs; full smoke including pre-existing 6 specs).
  - `bash scripts/verify-rls-coverage.sh` 32/32 (no schema change, SD2 confirmed).
  - `bash scripts/verify-api-auth.sh` 5/5 (no new routes — sidebar is RSC; toggle is client cookie write, no API call).
  - `bash scripts/verify-pii-annotations.sh` 5/5.
  - `npm run scaffold:check` 5/5.
- [ ] **AC9 — README ADR row + foundation §18A row.**
  - README ADR table prepend with one-line note (≤400 chars).
  - Foundation §18A row prepend at status=`next` with PR + Tip Commit columns set to `—` (em-dash satisfies `verify-phase-status.test.ts` regex `/^[0-9a-f]{7}$|^—$/`; `(pending)` would fail).
  - `/ship` Step 3 flips `next` → `shipped` post-merge.

### Non-goals (explicit)

- Bulk write-scope widening across the remaining 11 server actions → `p2-portal-write-widening`.
- Public `/daftar` admission form → `p2-admission-funnel`.
- Address chain → `p2-addresses-idn-chain`.
- Detail-tab content (Anggota / Anak / Riwayat / Aktivitas) → future per-tab cycles.
- Drift #1/#2 finance_officer ALL on `Student.read` / `Guardian.read` → `p3-fee-foundation`.
- Sidebar smart-view chip-filter dropdown → `p2-smart-views`.
- Portal-role JWT custom-claim hook hardening (currently DB-resolved per session) → multi-instance Cycle B.
- `/login` distinct route + `?next=` redirect chain → `p2-auth-google-oauth-followup`.
- Header (logo + brand + avatar) component per `.claude/standards/portal.md:139` — sidebar-only this cycle; header is its own follow-up.
- Breadcrumbs → follow-up cycle.
- Replacing the existing `proxy.ts` idle-timeout `redirect("/")` with a portal-aware variant → orthogonal.

### Assumptions (surface for correction)

1. SD2's choice of SELF over OWN_GUARDIAN holds — no future cycle wants OWN_GUARDIAN to mean "any Guardian row this guardian is linked to via studentGuardians" (that's properly OWN_STUDENT, materialised today).
2. The 4 group names for admin (Akademik / Operasi / Keuangan / Identitas / Sistem — actually 5) are canonical per foundation §10A.1; cycle does not negotiate them.
3. Demo-login accepts 3 buckets (`admin` | `teacher` | `parent`) per `app/api/demo/login/route.ts:33` — verified at /spec time per review SR3. The 3 buckets map via `ROLE_CODE_MAP` to 4 concrete role codes: `admin`, `homeroom_teacher`, `sentra_teacher`, `parent`. The other 4 (`principal`, `kadiv`, `admission_officer`, `finance_officer`) are NOT reachable via Playwright demo-login. Implication: AC4 vitest matrix covers all 8 roles (mocked sessions); AC7 Playwright matrix covers the 4 reachable codes, which is sufficient because each portal's allowed-roles set has at least ONE Playwright-reachable role (admin → `admin` reaches; teacher → `homeroom_teacher`+`sentra_teacher` reach; parent → `parent` reaches). Cross-portal redirect tests use the reachable roles only.
4. The 5 currently-mounted entities (student, guardian, household, student-identifier, guardian-invitation) suffice to populate the admin sidebar Akademik group; other groups will be sparse (1-2 stub items linking to the entity-list page once that entity ships its scaffold registry). Stub items use a `disabled: true` flag in NavItem → render as greyed-out non-clickable. Foundation §10A.1 explicit: portal IA exists before the entities populate it.
5. Guardian.userId is the canonical parent-link column (verified at `prisma/schema.prisma:1171`). Parent demo-login already populates `User.id` → `Guardian.userId` via `prisma/seed/08-demo-users.ts` + `prisma/seed/06-guardians.ts` (verify at /build T0). If not, T0 adds the demo seed wiring.
6. The cookie-set toggle button does not need server-side validation; the cookie is a UI preference, not a security boundary. Setting `portal-sidebar-collapsed=999` does no harm.

## Tasks

> Marathon mode — tasks are sequential where state crosses task boundaries; **T0 + T2 + T3 are independent and dispatchable in parallel**, T1 + T4 + T5 sequential against T0 / each other.

- [x] **T0 — §18A row prepend + entity-registry barrel-export check.** *(Pre-completed at /spec time — spec-time review SR4 confirmed both halves.)*
  - §18A row prepended at `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md:1245` (the `p2-portal-shell-sidebar` row above `p2-entity-actions`, status=`next`, PR + Tip Commit = `—`). `/build` MUST NOT prepend a duplicate; `/ship` Step 3 flips `next` → `shipped`.
  - `lib/entities/index.ts` already re-exports `studentEntity`, `guardianEntity`, etc. + `ALL_ENTITIES` aggregate (verified at /spec time). T0's second half is a no-op.
  - **Acceptance:** `verify-phase-status.test.ts` passes (already in /spec verification); `npx tsc --noEmit` clean.

- [x] **T1 — Sidebar primitives + IA registry + portal-guard helper (component shell).**
  - `lib/portal/portal-guard.ts` (NEW) — `assertPortalAccess(portal: 'admin' | 'teacher' | 'parent'): Promise<SessionContext>`. Reads `getSession()`; null → `redirect("/")`; role mismatch → `redirect("/")`; valid → return session. Per-portal `ALLOWED_ROLES` map module-private, frozen.
  - `lib/portal/nav-config.ts` (NEW) — `NAV_BY_PORTAL` per SD4. Imports `studentEntity`, `guardianEntity`, etc. from `lib/entities/index.ts` (one-way dep). Per-item shape: `{ key: string; label: string; href: string; icon: string; disabled?: boolean }`. Per-group: `{ key: string; label: string; items: NavItem[] }`. Admin = 5 groups; teacher / parent = single ungrouped list.
  - `components/portal/sidebar.tsx` (NEW) — `'use client'`. Reads `usePathname`. Renders desktop rail + mobile `Sheet` drawer. Toggle button writes cookie via `document.cookie = "portal-sidebar-collapsed=...; path=/; max-age=31536000; samesite=lax"`. Initial collapsed prop derived server-side and passed in (no flicker per SD3).
  - `components/portal/sidebar-group.tsx` + `components/portal/sidebar-item.tsx` (NEW) — keep `sidebar.tsx` under 200 lines.
  - **Acceptance:** `npx tsc --noEmit` + `npm run lint` clean; sidebar renders for one mocked portal in a transient `npx vitest --run` test before T2 mounts it.

- [ ] **T2 — Mount layouts.**
  - `app/admin/layout.tsx` (NEW) — `export default async function AdminLayout({ children })`. Calls `assertPortalAccess('admin')`. Reads `cookies().get('portal-sidebar-collapsed')` for SSR initial state. Returns `<div className="flex"><Sidebar portal="admin" collapsed={...} /><main className="flex-1">{children}</main></div>`.
  - `app/teacher/layout.tsx` (NEW) — `assertPortalAccess('teacher')`; same shell.
  - `app/parent/layout.tsx` (NEW) — `assertPortalAccess('parent')`; same shell.
  - **Acceptance:** `npm run build` succeeds; manual smoke via `DEMO_MODE=true npm run dev` confirms admin login → /admin/akademik/siswa renders sidebar.

- [x] **T3 — Vitest: portal-guard + nav-config + sidebar component.** *(Folded into T1 commit — tests live with their source; cycle doc Implementation captures both.)*
  - `lib/portal/__tests__/portal-guard.test.ts` (NEW, 6 cases per AC4).
  - `lib/portal/__tests__/nav-config.test.ts` (NEW, 3 cases per AC4).
  - `components/portal/__tests__/sidebar.test.tsx` (NEW, 4 cases per AC5). Uses `@testing-library/react` (already in devDeps per existing component tests).
  - **Acceptance:** `npx vitest run lib/portal components/portal` 13/13 green.

- [ ] **T4 — SELF-scope canary widening (Guardian.update) + footgun-mitigation meta-test.**
  - `lib/entities/guardian/policy.ts` — add `{ role: 'parent', scope: 'SELF' }` to `scopes.update`. Update inline policy doc-comment near scopes.update referencing this cycle for the SELF justification.
  - `lib/scaffold/server-action.ts:49` — widen writes-gate per AC3. Add inline doc-comment per SD2 footgun mitigation #1 — flag that every SELF-write grant MUST pair with row-level `userId` predicate at the action layer.
  - `lib/scaffold/entity.ts` — add a TSDoc warning above the `ScaffoldScope` union per SD2 footgun mitigation #2.
  - `lib/guardians/actions/update.ts:50-52` — add conditional `userId` clause when grant.scope === "SELF". Read grant via `policy.scopes.update.find(g => g.role === session.role)` after `assertScope` succeeds. Add inline comment pointing at this cycle's SD2.
  - `lib/guardians/actions/__tests__/actions.test.ts` extension (~3 cases per AC6 — parent SELF ok, parent SELF wrong-row → NOT_FOUND, admin ALL regression).
  - `lib/scaffold/__tests__/server-action.test.ts` — assertScope SELF allowed on write, OWN_STUDENT still denied (~2 cases per AC6).
  - **NEW — `lib/scaffold/__tests__/self-write-contract.test.ts`** per SD2 footgun mitigation #3. Static text-scan posture (no runtime exec). Enumerates `POLICY_BY_RESOURCE`; for every `(resource, action, grant)` triple where `WRITE_ACTIONS.has(action) && grant.scope === "SELF"`, asserts the corresponding action file (`lib/<lower-plural-resource>/actions/<action-kebab>.ts`) text contains `userId: session.userId`. ~2 cases (current state: only Guardian.update has SELF on a write — the test verifies the `userId` predicate is present; one negative case: handcrafted policy with SELF-write but missing predicate text → test fails). Resource-to-folder map is hand-coded (Student → `students`, Guardian → `guardians`, Household → `households`, StudentIdentifier → `student-identifiers`, GuardianInvitation → `guardian-invitations` — pluralisation rule lives in the test file itself; same pattern as `scripts/scaffold-check.ts`).
  - **Acceptance:** `npx vitest run lib/guardians lib/scaffold` green; `npm run scaffold:check` 5/5 (SELF already in PermissionScope enum so static guard passes); meta-test passes against current policies.

- [ ] **T5 — Playwright shell + cross-portal redirect (3 specs).**
  - `e2e/admin/portal-shell.spec.ts` (NEW) — per AC7. Cross-portal redirect: `await page.goto('/parent/foo'); await page.waitForURL('/', { timeout: 5000 });` (SD5 sequential pattern — corrected per spec-time review SR2).
  - `e2e/teacher/portal-shell.spec.ts` (NEW) — per AC7.
  - `e2e/parent/portal-shell.spec.ts` (NEW) — per AC7.
  - Each spec ≥6 `expect` assertions = ≥18 new total.
  - **Acceptance:** `npx playwright test --list` shows 9 specs (was 6); local Playwright skipped if no live test DB (CI gates per p2-entity-actions PR #202 precedent).

- [ ] **T6 — Cycle doc Implementation + Verification + Ship Notes; README ADR row.**
  - Fill `## Implementation` (per-task bullet, files touched, one-line summary).
  - Fill `## Verification` per AC8 with vitest baseline + delta + cross-check sentence (`design-system.html §10A` for portal IA — frontend gate Rule 4).
  - Fill `## Ship Notes` — **Migration:** none. **Env vars:** none. **Reseed required on staging:** NO. **Manual smoke on preview URL** + **Rollback:** revert PR (sidebar disappears; layouts reduce to bare children; SELF grant on Guardian.update reverts; admin ALL grants unaffected).
  - Edit `README.md` ADR table: prepend a row for `p2-portal-shell-sidebar` with one-line note ≤400 chars (per pre-commit ADR-cell-length rule).
  - Confirm T0's §18A row stays at `next` until `/ship` flips it.
  - **Acceptance:** all pre-commit hooks pass on the final commit (frontend-gate token `design-system` present in cycle doc; markdown allowlist; `(feat|perf)` commit subject + staged `app/**`/`lib/**` requires staged README — covered by ADR row).

## Implementation

- Subagent plan: tasks T1+T3 commit together (tests live with their source); T2 sequential after T1; T4 independent of UI but commits after T3 to keep diff scopes small; T5 after T2 (Playwright needs layouts mounted); T6 final.
- T0: §18A row prepended at /spec time (line 1245 of foundation md). Entity barrel `lib/entities/index.ts` already re-exports per-entity `entity` defaults — no edits needed.
- T1+T3: `lib/portal/portal-guard.ts` (NEW, 71 lines) — `assertPortalAccess(portal)` per SD1 with frozen `ALLOWED_ROLES` map (admin: 5 / teacher: 2 / parent: 1; total 8 covers ROLE_CODES). `lib/portal/nav-config.ts` (NEW, 240 lines) — `NAV_BY_PORTAL` per foundation §10A.1; admin labels derive from `studentEntity.label` / `guardianEntity.label` / `householdEntity.label` via the entity-barrel (one-way dep, ESLint `import/no-cycle` covers regression). `components/portal/sidebar.tsx` (NEW, 147 lines) + `sidebar-group.tsx` (NEW, 62 lines, includes `isItemActive` portal-root-exact-match guard per spec-time review SR-T1-#1) + `sidebar-item.tsx` (NEW, 71 lines, Lucide icon-by-name lookup w/ Circle fallback). Tests: `lib/portal/__tests__/portal-guard.test.ts` (7 cases — 6 matrix + frozen-coverage), `lib/portal/__tests__/nav-config.test.ts` (3 IA-shape cases), `components/portal/__tests__/sidebar.test.tsx` (6 cases — 4 originally-spec'd + Beranda-prefix-guard regression + Esc-close mobile drawer added per spec-time review SR-T1-#2). Spec-time review fixes applied before commit: (#1) `isItemActive` invariant — single-segment hrefs use exact-match only, blocks "/teacher/kelas" false-active on Beranda; (#2) AC5 Esc-close test added.

## Verification

- Cross-checked design-system §10A (portal IA contract) for the per-portal group/item layout — admin 5 groups, teacher / parent single-list — and `.claude/standards/portal.md:139` (sticky shell convention).
- T1+T3 gates: `npx prisma generate` clean. `npm run build` succeeds (no new routes; sidebar is RSC + a Client island). `npx vitest run lib/portal components/portal` 16/16 green. Full vitest baseline at T1: 1058 passed | 4 skipped (was 1044 from p2-entity-actions tip — delta +14 = 7 portal-guard + 3 nav-config + 6 sidebar; AC8 budgeted +13–15 → on target).

## Ship Notes

<!-- /ship fills migrations / env vars / manual smoke / rollback -->
