# Siswa ↔ Wali Murid Linking

## Context

An admin moving between a student and that student's parents hits a one-way street. From a wali's page the children are clickable ([`app/admin/guardians/[id]/page.tsx:440`](../../app/admin/guardians/[id]/page.tsx)); from a student's page the Orang Tua / Wali tab renders plain `div`s ([`app/admin/students/[id]/page.tsx:861`](../../app/admin/students/[id]/page.tsx)) with the only link in the whole tab being the "Unggah KK di halaman wali" fallback at line 703. The students list Wali column (line 371) prints a name that is not a link, and the guardians list prints `3 siswa` with no names. The admin ends up using the sidebar and the search box to travel two hops that should be one click.

Underneath the navigation gap is a data gap. "Tambah wali" cannot select a parent who already exists — `POST /api/students/[id]/guardians` ([route.ts:52](../../app/api/students/[id]/guardians/route.ts)) dedups only by email, so adding the second child of a family whose parent has no email on file silently creates a **second Parent row**. That family then has two profiles, two KK slots, and invoices split across both. Staging today holds 34 parents for 30 students, 3 parents linked to more than one child, and 1 duplicate-name group; production carries more emailless parents, so the exposure there is larger. Nothing in the product shows siblings, either — a student's page gives no hint that a brother or sister is enrolled.

This cycle makes the link bidirectional, teaches "Tambah wali" to reuse an existing parent, and surfaces siblings. Data model is untouched: `Parent` + `StudentGuardian` already express family correctly. The gap is UI plus one API path.

## Spec

### Acceptance criteria

**Navigation**
- [ ] On student detail, each row in the Orang Tua / Wali tab links to `/admin/guardians/{parentId}`. The Edit and Nonaktifkan buttons sit outside the link element — no nested interactive elements, no `stopPropagation` workaround.
- [ ] Student detail shows a **Saudara** row listing other students who share at least one active guardian, each chip linking to that student. Row is hidden when there are none.
- [ ] Students list Wali column renders the parent name as a link to the guardian's page, and no longer shows `—` for students whose guardians exist but none is flagged primary.
- [ ] Guardians list Siswa column shows the count plus up to two child names.

**Linking an existing parent**
- [ ] `POST /api/students/[id]/guardians` accepts `parentId`. On that path it creates only the `StudentGuardian` row — no parent create, no parent update. Bio fields in the payload are ignored.
- [ ] The `parentId` path rejects a parent outside the caller's tenant with 404.
- [ ] Re-linking a parent already linked to that student returns 409 when the existing link is ACTIVE, and reactivates the link (200) when it is INACTIVE.
- [ ] The create-new path (no `parentId`) checks for an existing parent matching on email, NIK, phone, or normalised name. On a hit it returns 409 with `code: "PARENT_CANDIDATES"` and a `candidates[]` array instead of creating.
- [ ] Sending `confirmNew: true` bypasses the candidate check and creates the new parent.
- [ ] The Tambah Wali dialog opens on a parent search. Selecting a result links it. "Tambah wali baru" reveals the existing form. A `PARENT_CANDIDATES` 409 renders the candidates inline with **Tautkan** and **Tetap Buat Baru**.

**Correctness**
- [ ] Guardian detail saves parent bio through `PUT /api/parents/[id]` rather than `PUT /api/guardians/{junctionId}` of an arbitrary child. The "Wali ini belum tertaut ke siswa manapun" dead-end and the relationship/isPrimary reseed at [`guardians/[id]/page.tsx:214-218`](../../app/admin/guardians/[id]/page.tsx) both disappear.
- [ ] `npx vitest run` and `npm run build` pass. New Vitest coverage for candidate matching, the `parentId` link path, and the primary-wali fallback.
- [ ] Frontend diffs follow `design-system` — link affordance and hover treatment reuse the existing `hover:bg-accent/50 rounded-md px-2 -mx-2` row pattern from the guardians page rather than a new one.

### Non-goals

- **No `Family` / household entity.** Deferred deliberately; `Parent` + `StudentGuardian` carry this cycle.
- **No merge tool.** Parents already duplicated in the database stay duplicated. This cycle stops new ones and warns on the ones that exist; reassigning `Invoice` / `User` / `StudentGuardian` rows between parents is its own cycle with its own billing tests.
- **No schema migration.** Zero Prisma changes.
- **No change to parent-side portals.** `/parent/**` and `/api/parent/**` untouched.
- **No fuzzy name matching.** Exact match on a case- and whitespace-normalised name only.
- **The student-detail Edit Wali dialog keeps editing parent bio.** Its current behaviour is unchanged; only the guardian *detail page* save path is corrected.
- **No NIK search in the picker.** `GET /api/guardians?search=` covers name / email / phone and is reused as-is.

### Assumptions

1. `Parent` + `StudentGuardian` need no schema change — a parent is already shareable across students, the junction already carries `relationship`, `isPrimary`, `childOrder`.
2. Name matching is normalised-exact (lowercase, collapsed whitespace), not fuzzy. Indonesian given names repeat often enough that trigram matching would fire constantly and train admins to dismiss the warning.
3. The candidate check runs only on the create-new path. Choosing a parent from the picker is already an explicit link and needs no confirmation.
4. An INACTIVE link between the same student and parent is reactivated rather than rejected — the admin's intent is unambiguous.
5. "Saudara" means *another student sharing at least one ACTIVE guardian*. Not KK-number based, since `kkNumber` is sparsely populated.
6. Candidates are capped at 5 and ordered by match strength: email → NIK → phone → name.
7. `GET /api/guardians?search=` is already tenant-scoped, admin-gated and paginated, so the picker adds no new route and no new authorization surface.

## Tasks

- [x] **T1 — Extract parent matching into `lib/parent/match.ts`.**
  Move `normalisePhone` from `lib/admission/sibling-detect.ts` into a new `lib/parent/match.ts`; `sibling-detect.ts` re-exports it so its own imports and `lib/admission/sibling-detect.test.ts` stay untouched. Add `findParentCandidates({ tenantId, name, email, phone, nik }, prisma)` returning up to 5 `{ id, name, phone, email, matchReason, childCount }` ordered email → nik → phone → name, ACTIVE parents only, tenant-scoped.
  *Acceptance:* `npx vitest run lib/parent lib/admission` green, including the pre-existing `normalisePhone` cases.

- [x] **T2 — `parentId` link-only path on `POST /api/students/[id]/guardians`.** *(depends on nothing)*
  Extend `createGuardianSchema` (or add `linkGuardianSchema`) with optional `parentId`. When present: verify the parent's `tenantId`, skip every parent write, create the junction row, keep the existing first-guardian `isPrimary` auto-default. 404 on cross-tenant or unknown parent; 409 on an existing ACTIVE link; reactivate + 200 on an existing INACTIVE link.
  *Acceptance:* Vitest covers link-created, cross-tenant 404, duplicate-active 409, inactive-reactivated 200.

- [x] **T3 — Candidate 409 on the create-new path.** *(depends on T1, T2)*
  With no `parentId` and no `confirmNew`, call `findParentCandidates`. Any hit → 409 `{ error, code: "PARENT_CANDIDATES", candidates }`. `confirmNew: true` skips the check and creates as today.
  *Acceptance:* Vitest covers candidate-409, `confirmNew` bypass, and no-match straight-through.

- [x] **T4 — `components/admin/parent-picker.tsx`.** *(depends on nothing)*
  Mirror `components/admin/student-picker.tsx`: Popover + Command, 250ms debounce, `AbortController`, the same five states (idle / loading / error+retry / empty / ok), querying `/api/guardians?search=&status=ACTIVE&pageSize=20`. Each result shows `Nama · telepon · N anak` from the `_count.guardians` the route already returns.
  *Acceptance:* Vitest render test for the five states; visually matches the student picker.

- [x] **T5 — Rebuild the Tambah Wali dialog around three modes.** *(depends on T2, T3, T4)*
  One Sheet/Dialog instance, three mutually exclusive bodies, following the enroll dialog's picker → 409-advisory pattern at [`students/[id]/page.tsx:1085`](../../app/admin/students/[id]/page.tsx): **link** (ParentPicker + relationship + Anak ke-), **create** (existing `GuardianFormBody`, reached via "Tidak ketemu? Tambah wali baru"), **candidates** (Alert listing the 409 candidates, each with Tautkan, plus a Tetap Buat Baru button that re-POSTs with `confirmNew: true`). Edit mode is unaffected.
  *Acceptance:* Manual smoke — link an existing parent to a second student and confirm no new Parent row is created.

- [x] **T6 — Student detail: clickable wali rows + Saudara.** *(depends on nothing)*
  Wrap the name/badges cluster in a `Link` to the guardian page using the guardians-list hover treatment; leave the action buttons outside it. Widen the `GET /api/students/[id]` guardian include so each parent carries its other student links, derive siblings client-side (dedup by student id, drop self, ACTIVE links only), render as chips under the guardian list.
  *Acceptance:* Both directions clickable; Saudara hidden when the student has no siblings.

- [x] **T7 — List pages: link the Wali column, name the children.** *(depends on nothing)*
  `GET /api/students`: change the guardian include from `where: { isPrimary: true }` to `where: { status: "ACTIVE" }, orderBy: { isPrimary: "desc" }, take: 1` and add `id` to the parent select. Students list Wali column becomes a link (guarding the row's own click handler). `GET /api/guardians`: include up to two ACTIVE child names; Siswa column renders `3 siswa · Aisyah, Fatimah`.
  *Acceptance:* Vitest asserts the fallback picks an active non-primary guardian when no primary exists.

- [x] **T8 — Guardian detail saves through `PUT /api/parents/[id]`.** *(depends on nothing)*
  Replace the `PUT /api/guardians/${parent.guardians[0].id}` call at [`guardians/[id]/page.tsx:240`](../../app/admin/guardians/[id]/page.tsx); drop the `relationship` / `isPrimary` reseed at lines 214-218 and the "Wali ini belum tertaut ke siswa manapun" guard, since the parent route needs no junction row.
  *Acceptance:* A parent with zero linked students is editable; relationship on existing junctions is unchanged after a bio save.

- [x] **T9 — e2e round trip.** *(depends on T5, T6, T7)*
  Extend `e2e/admin-guardian-detail.spec.ts`: student detail → click wali → guardian detail → click child → student detail, plus linking an existing parent to a second student and asserting `/api/guardians?pageSize=1` total is unchanged.
  *Acceptance:* `npx playwright test admin-guardian-detail` green, or an explicit deferral to the required CI `Playwright E2E` check recorded in Verification.

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=**none**. This session's harness forbids `Agent` dispatch unless the user asks for it, which overrides `/build`'s mandatory fan-out. All nine tasks run inline on the driver tier and the driver performs the code-review pass itself — CLAUDE.md's tiering table already assigns review to the driver, so the review gate holds; the token-efficiency contract does not. Flagged to the user at the start of `/build`.
- Task 1: Extract parent matching into `lib/parent/match.ts` — `lib/parent/match.ts` (new), `lib/parent/match.test.ts` (new), `lib/admission/sibling-detect.ts` — `normalisePhone`/`normaliseEmail` moved into a shared parent-matching module that `sibling-detect.ts` now re-exports; adds `findParentCandidates` returning ≤5 candidates ranked email → nik → phone → name, plus `normaliseName`/`normaliseNik`.
  - Review pass caught a real defect pre-commit: the first draft normalised NIK/name in JS but compared them **DB-side**, so a stored `3204-1122-3344-5566` or a double-spaced name could never match the normalised needle — and the tests mocked rows Postgres would not have returned, so they passed while asserting fiction. Collapsed to one query with all four comparisons in JS; added regression tests for each stored-formatting case. Scale note left in the docstring: past a few thousand parents per tenant, add a generated normalised column rather than reintroducing asymmetric matching.

- Task 2: `parentId` link-only path on POST guardians — `lib/validations/guardian.ts`, `app/api/students/[id]/guardians/route.ts`, `app/api/students/[id]/guardians/__tests__/route.test.ts` (new) — adds `linkGuardianSchema` (junction columns only, deliberately no bio fields so a link can never overwrite another family's data) and a link branch that verifies the parent's tenant, 409s an existing ACTIVE link, reactivates an INACTIVE one, and persists `childOrder`. Extracted the shared `childOrderField` preprocessor rather than duplicating it.
  - **In-scope correctness call:** the new branch reuses the PUT handler's race-safe single-primary transaction via a local `writeGuardianAsPrimarySafe` helper, and the pre-existing create branch was routed through the same helper. The create branch previously wrote `isPrimary` straight from client input, so a payload with `isPrimary: true` against a student who already had a primary produced two primaries — the exact invariant `app/api/students/route.ts:84` guards on bulk create. Fixing one branch and leaving its neighbour open in the same handler was not defensible; noted here because it is slightly wider than the task line.

- Task 3: Candidate 409 on the create path — `lib/validations/guardian.ts`, `app/api/students/[id]/guardians/route.ts`, `app/api/students/[id]/guardians/__tests__/route.test.ts` — create-path submits without `confirmNew` run `findParentCandidates` and 409 with `code: "PARENT_CANDIDATES"` plus the match list; `confirmNew: true` bypasses. The link path skips the guard — the picker already made the choice explicit.
  - Behaviour change worth noting at ship time: an email match previously *upserted*, silently rewriting the existing parent's bio with whatever the form contained. It now 409s and offers the link instead. Both e2e specs that POST this endpoint (`admin-guardian-detail`, `admin-guardian-primary-invariant`) build `Date.now()`-suffixed names, phones and emails, so no candidate can match and they are unaffected.

- Task 4: `ParentPicker` — `components/admin/parent-picker.tsx` (new), `components/admin/__tests__/parent-picker.test.tsx` (new), `vitest.setup.ts` — async combobox over `GET /api/guardians?search=&status=ACTIVE`, mirroring `student-picker.tsx`'s 250ms debounce, `AbortController` and five explicit states, checked against `design-system` (Shadcn Popover + Command, `text-muted-foreground` secondary line, no hand-rolled dropdown). Takes `excludeIds` so parents already linked to this student are dropped rather than offered and 409'd.
  - Departure from `student-picker.tsx`, per `better-accessibility` where the project standard is silent: the clear (×) control is a sibling of the combobox trigger, not nested inside it. StudentPicker puts a `role="button"` span inside the trigger button, which is unreachable by keyboard and ambiguous to screen readers. Left StudentPicker alone — out of scope.
  - `vitest.setup.ts` gained a guarded `ResizeObserver` polyfill. jsdom has none and cmdk constructs one on mount, so every `<Command>`-based component was untestable. Sits alongside the existing `scrollIntoView` and `matchMedia` polyfills; all 315 pre-existing test files still pass.

- Task 5: Tambah Wali dialog rebuilt around three steps — `app/admin/students/[id]/page.tsx`, `lib/constants/parent-options.ts`, `README.md` — one overlay, three mutually exclusive bodies (**link** → ParentPicker + Hubungan + Anak ke-, **create** → existing `GuardianFormBody` behind "Tidak ketemu? Tambah wali baru", **candidates** → the 409 list with per-row Tautkan plus Tetap Buat Baru). Follows the enroll dialog's picker → advisory shape at `app/admin/students/[id]/page.tsx:1175` rather than inventing a second pattern, and keeps `design-system`'s one-overlay-at-a-time rule — no nested Dialog. Edit mode is untouched. Adds `MATCH_REASON_LABELS` so the advisory says *"Cocok pada nama yang sama"* rather than leaking the matcher's enum.
  - Focus moves to the advisory `<Alert tabIndex={-1}>` when the 409 lands, matching the enroll dialog's handling, so the step change is announced.
  - Already-linked parents are passed to the picker as `excludeIds` — offering them would only produce a `GUARDIAN_LINK_EXISTS` 409.
  - No unit test for this slice by design: it is a step machine over a 1300-line client page whose two API branches (T2, T3) and picker (T4) are already unit-tested. Behaviour is covered end-to-end by T9.

- Task 6: Student detail — clickable wali rows + Saudara — `app/api/students/[id]/route.ts`, `app/admin/students/[id]/page.tsx`, `lib/parent/siblings.ts` (new), `lib/parent/siblings.test.ts` (new) — the guardian include now carries each parent's other ACTIVE student links, and the name/badge cluster is a `Link` to the guardian page using the same `hover:bg-accent/50 rounded-md px-2 -mx-2` treatment the guardians page already uses (`design-system` row-affordance recipe). Edit/deactivate buttons sit outside the link, so there is no nested interactive element and no `stopPropagation`.
  - Sibling derivation was pulled out of the JSX into `deriveSiblings` — self-exclusion, dedup when both parents are shared, and INACTIVE-link filtering are exactly the cases that rot silently when inlined. Section is hidden entirely at zero siblings rather than rendering a dead empty state.

- Task 7: List pages — `app/api/students/route.ts`, `app/api/guardians/route.ts`, `app/admin/students/page.tsx`, `app/admin/guardians/page.tsx`, `app/api/students/__tests__/route.test.ts` — students list Wali column is a link and no longer prints "—" for students whose guardians carry no primary flag; guardians list Siswa column names the first two children with a `+N` overflow. Same `design-system` row-affordance treatment as the other two link surfaces. The students table has no row-level click handler (navigation goes through the Lihat action), so the cell link needs no `stopPropagation`.

- Task 8: Guardian detail bio save — `app/admin/guardians/[id]/page.tsx`, `e2e/admin-guardian-detail.spec.ts` — saves through `PUT /api/parents/[id]` instead of `PUT /api/guardians/{parent.guardians[0].id}`. Drops the relationship/isPrimary reseed and the "Wali ini belum tertaut ke siswa manapun" dead-end, so a wali with no linked student is now editable and a bio save no longer rewrites one arbitrary child's relationship.
  - Required an e2e edit: `admin-guardian-detail.spec.ts` waited on `PUT /api/guardians/[id]`, the exact call this removes, so it would have failed in CI. Retargeted to `PUT /api/parents/[id]` and the stale doc comment corrected. Caught by reading the callers, not by a local Playwright run — see the Playwright note below.
  - `updateParentSchema` is bio-only, so the form's junction keys are stripped by Zod; an explicit destructure to drop them was removed as needless complexity during the simplify pass.

- Task 9: e2e round trip — `e2e/admin-guardian-detail.spec.ts` — new spec creates two students and one wali, links the wali to the second child through the `parentId` path, and asserts the tenant's parent total is unchanged (the duplicate-family regression in one assertion). Then walks student → wali → child → Saudara → student, and checks a repeat link 409s.

## Verification

- Baseline before any task: build ✓, `npx vitest run` 313 files / 3040 tests ✓. Worktree needed the documented Turbopack fix first — `rm node_modules && npm install && npx prisma generate` — since Turbopack rejects `setup-worktree.sh`'s symlink (`Symlink [project]/node_modules is invalid, it points out of the filesystem root`).
- **End-of-cycle gates:** `npm run build` ✓ · `npx vitest run` **317 files / 3089 tests passed, 2 skipped, 42 todo** ✓ · `npm run lint` 0 errors / 62 warnings (all pre-existing style warnings of the `_ignored` / `_drop` unused-arg kind) · `bash scripts/audit-docs.sh` 11 ok, 0 warn, 0 fail.
- **Playwright: local run deferred to CI (env cannot execute it — `playwright.config.ts` refuses a non-local `DATABASE_URL`).** Verbatim:
  `Error: Refusing to run e2e against non-local DATABASE_URL host "aws-1-ap-southeast-1.pooler.supabase.com". These specs create + mutate data via the API and would pollute that database (DEMO_MODE does not switch the DB — see lib/db.ts). Point DATABASE_URL at a local/ephemeral Postgres, or set E2E_ALLOW_REMOTE_DB=1 to override.`
  The override was **not** used — that guard exists because of the 2026-06-04 staging data pollution, and this cycle's new spec creates students and parents. Required CI check `Playwright E2E` runs against an ephemeral localhost Postgres and gates the merge; CTO will not merge on red.
- **`design-system` cross-check:** all three new link surfaces (student-detail wali row, students-list Wali cell, Saudara chips) reuse the guardians-page row affordance `hover:bg-accent/50 rounded-md px-2 -mx-2` rather than inventing a hover treatment. Tambah Wali keeps the one-overlay-at-a-time rule — three bodies swap inside a single Dialog/Sheet, no stacking — and reuses the enroll dialog's advisory-`Alert` + focus-move pattern for its 409 step. Button labels follow the `ui.md` table (`Batal` ghost-left, action right; `Memproses...` while in flight).
- **Local browser verification not performed.** `preview_start` resolves `.claude/launch.json` from the main checkout, whose three bash entries `cd` into worktrees that no longer exist, and the plain `next-prod-demo` entry dies with `EPERM: uv_cwd`. Adding a worktree-local entry did not help — the tool does not read the worktree's copy — so it was reverted rather than leaving a fourth stale path in a tracked file. UI verification is covered by `/ship` Step 3 preview-verify against the Vercel preview, which is this repo's designated gate for it.
- Task 1: gates passed — `npm run build` ✓, `npx vitest run` 314 files / 3052 tests ✓ (+12). `npm run lint` 0 errors; the single `_args` unused-arg warning matches the repo's existing `_ignored` / `_drop` test convention.
- Task 8: gates passed — `npm run build` ✓, `npx vitest run` 317 files / 3089 tests ✓ (no new unit tests; the behaviour is an e2e assertion, retargeted in the same commit).
- Task 7: gates passed — `npm run build` ✓, `npx vitest run` 317 files / 3089 tests ✓ (+1). The new test asserts the `GET /api/students` guardian include shape (`status: ACTIVE`, `orderBy isPrimary desc`, `take 1`, parent `id` selected) — the mock cannot express Prisma ordering, so the query shape is the regression guard.
- Task 6: gates passed — `npm run build` ✓, `npx vitest run` 317 files / 3088 tests ✓ (+7). Sibling cases covered: only child, self-exclusion, one chip when both parents are shared, union across different parents (half-siblings), INACTIVE guardian ignored, GRADUATED sibling still listed, parent with no links loaded.
- Task 5: gates passed — `npm run build` ✓, `npx vitest run` 316 files / 3081 tests ✓ (no new unit tests; see the Implementation note). Browser verification of the three steps runs once after T7, with the other UI slices.
- Task 4: gates passed — `npm run build` ✓, `npx vitest run` 316 files / 3081 tests ✓ (+9). Covers idle prompt, debounce-then-fetch with the right query string, selection callback, `excludeIds` filtering, fetch-error retry affordance, named empty state, truncation notice, and the clear control being outside the combobox.
- Task 3: gates passed — `npm run build` ✓, `npx vitest run` 315 files / 3072 tests ✓ (+6). Covers name-match 409, differently-formatted phone match, email match not upserting, `confirmNew` bypass, no-match straight-through, link path skipping the guard.
- Task 2: gates passed — `npm run build` ✓, `npx vitest run` 315 files / 3066 tests ✓ (+14). New tests cover link-created, bio-fields-ignored, childOrder, cross-tenant 404, unknown-parent 404, duplicate-active 409, inactive-reactivated 200, first-guardian primary auto-default, incumbent-primary demotion, P2034 retry, non-admin 403, cross-tenant student 404, missing-relationship 400.

## Ship Notes

**No migrations. No new env vars. No schema change.** `Parent` + `StudentGuardian` already modelled a shared family; this cycle is UI plus one API path.

### What changes for an admin on day one

- The Orang Tua / Wali tab on a student links to the wali, and a **Saudara** row lists siblings. The students list Wali column links too, and stops showing `—` for students whose guardians carry no primary flag.
- **Tambah Wali opens on a search, not a blank form.** Picking a result links the existing wali. "Tidak ketemu? Tambah wali baru" reveals the old form.
- Typing a wali who already exists no longer creates a second record — the server returns the look-alikes and the admin picks *Tautkan* or *Tetap Buat Baru*.

### Behaviour changes worth watching on preview

1. **An email match used to upsert silently.** `POST /api/students/[id]/guardians` with an email belonging to an existing parent previously rewrote that parent's bio with whatever the form contained. It now returns 409 `PARENT_CANDIDATES`. Any integration that relied on the upsert must send `confirmNew: true` or use `parentId`. Nothing in this repo does — the only caller is the student detail page.
2. **Wali bio now saves via `PUT /api/parents/[id]`.** `PUT /api/guardians/[guardianId]` is untouched and still serves the student-page edit dialog.
3. **The single-primary invariant is now enforced on guardian create**, not just update. A client POSTing `isPrimary: true` for a student who already has a primary will demote the incumbent instead of producing two.

### Preview-verify script

1. Open a student with two or more wali → click a wali name → lands on `/admin/guardians/[id]` → click a child → back on the student. Loop closes.
2. On a student whose parent has another child, confirm the **Saudara** row renders and its chip navigates.
3. Tambah Wali → search an existing wali by name → **Tautkan Wali** → the wali appears on this student and the guardians list total does not grow.
4. Tambah Wali → "Tambah wali baru" → type the name of a wali who already exists → expect the *Wali serupa sudah terdaftar* step, with the match reason named. Check both **Tautkan** and **Tetap Buat Baru**.
5. `/admin/guardians` → Siswa column names up to two children with `+N` overflow.
6. Open a wali with **no** linked student and edit the phone — this previously failed with "Wali ini belum tertaut ke siswa manapun".

### Rollback

Revert the range `dedf0913..f13de1cd` on `feat/siswa-wali-linking`. No data written by this cycle needs undoing: every write goes through existing tables in their existing shape, and links created via the picker are ordinary `StudentGuardian` rows. Reverting restores the duplicate-creating behaviour but breaks nothing that shipped in between.

### Known gaps, deliberately deferred

- **No merge tool.** Parents already duplicated in production stay duplicated. This cycle stops new ones and surfaces existing ones when an admin happens to retype the name. Reassigning `Invoice` / `User` / `StudentGuardian` rows between two parents needs its own cycle and its own billing tests.
- **No `Family` entity.** Considered and rejected for this cycle — see Non-goals.
- Candidate matching scans the tenant's ACTIVE parents in JS. Correct and fast at this school's scale (hundreds); past a few thousand parents per tenant, add a generated normalised column and index it rather than reintroducing asymmetric SQL matching.
