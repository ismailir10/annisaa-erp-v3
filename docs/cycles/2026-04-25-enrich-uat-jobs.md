# Enrich UAT Jobs — Parent + Teacher Coverage Parity

## Context

The UAT JTBD library has drifted. Admin is comprehensive at 390 lines covering five nav groups; parent sits at 108 lines (3 areas of 6 real portal areas) and teacher at 99 lines (3 areas of 6 real portal areas). Parent portal has real, shipped features — `/parent/student-journal` with full CRUD on notes and home-checklist toggling, `/parent/profile` with multi-child navigation and logout, and a dashboard home that aggregates unpaid balance + weekly attendance + latest journal note — that have zero JTBDs today. Teacher portal has real features — `/teacher/assessments` with 4-level rubric scoring + autosave + bulk publish, `/teacher/attendance` as GPS check-in/out with leave requests, `/teacher/student-journal` with a 3-route flow (picker → class-day grid → per-student week view) — that are also absent from the library. Result: `/uat parent` and `/uat teacher` can only exercise a fraction of what those personas actually do, and the library's "Appendix: jobs not yet seeded" is lying — the features exist in the code, they just aren't scripted.

Separately, `prisma/seed-uat.ts` (plus `seed:uat` in `package.json` and the "Seed requirement" section in `.claude/skills/uat/SKILL.md`) needs removal. A parallel session is handling seeding independently and the two scripts would collide; retiring the preseed here is a prerequisite for that work to land cleanly.

Intended outcome: parent.md and teacher.md each match admin.md in rigor — every shipped portal capability has a JTBD with persona, role, preconditions, steps-as-intent, done-when, perf thresholds, and error scenarios where non-trivial. The preseed script and all references are gone from this repo.

## Spec

### Acceptance criteria

- [ ] `docs/uat/jobs/parent.md` gains JTBDs covering every currently-absent parent-portal area: student-journal (3 jobs — school-side read, home-side toggle, notes CRUD), profile (2 jobs — view + logout, child navigation), home dashboard (1 job — household snapshot quick-check), plus a cross-cutting multi-child switch job.
- [ ] `docs/uat/jobs/teacher.md` gains JTBDs covering every currently-absent teacher-portal area: assessments (2 jobs — fill + autosave, bulk publish gate), own-attendance (2 jobs — GPS check-in, GPS check-out with leave request variant), student-journal (3 jobs — daily class-grid fill, per-student week view + note, notes thread read), home dashboard (1 job — morning clock-in from home tile).
- [ ] Both files keep the existing JTBDs verbatim — no rewrites of what is already there.
- [ ] Every new JTBD follows the admin.md field shape: `Persona`, `Role` where applicable, `Expected perf`, `Preconditions`, `Steps (user intent, not UI clicks)`, `Done when`, `Why this job matters`, `Known friction (from last UAT)` placeholder, and `Error scenarios to verify` where the flow has non-trivial failure modes (optimistic save failures, GPS denied, notes validation, multi-child guard).
- [ ] Both files update their "Last audited" front-matter to `2026-04-25 in cycle enrich-uat-jobs`.
- [ ] Both files purge the "Appendix: jobs not yet seeded" bullets that are now covered; leftover appendix items (announcements/calendar, parent-initiated sakit reporting, teacher leave request as its own standalone area) remain.
- [ ] `prisma/seed-uat.ts` is deleted.
- [ ] `seed:uat` entry removed from `package.json` scripts.
- [ ] `.claude/skills/uat/SKILL.md` has its "Seed requirement" block and the preflight reference to it removed; any remaining mention of `seed-uat` / `seed:uat` is gone.
- [ ] `grep -rn 'seed-uat\|seed:uat'` across the repo returns zero hits outside `docs/cycles/` (historical cycle docs may still mention it — those are archival and not edited).
- [ ] Between-task gate passes after each task (`npm run build && npx vitest run`). No runtime code changes are expected, so the end-of-cycle Playwright gate is deferred — call it out in Verification if we decide it is needed.
- [ ] README.md does NOT need to change — this cycle adds no modules, routes, CRUD status, or user-facing features. Doc-sync hook satisfied by staging the cycle doc.

### Non-goals

- Not adding `/uat` invocations or new report runs. The library edit is the deliverable; running `/uat parent` or `/uat teacher` to validate is follow-up work.
- Not touching admin.md beyond a possible cross-reference.
- Not editing personas in `.claude/personas/`.
- Not writing new seed data — removing the preseed script only. The parallel session owns seeding strategy.
- Not adding JTBDs for features that do not exist in code yet (e.g. parent-initiated sakit report, parent-side announcements feed, teacher-standalone leave request screen). Those stay in the appendix as "not yet seeded".
- Not changing `.claude/skills/uat/SKILL.md` beyond the preseed-removal edits — no re-scoping the skill itself.

### Assumptions (surface for user correction)

1. The parallel seeding session fully replaces `prisma/seed-uat.ts` — there is no path where UAT still needs a dedicated preseed script. If that changes, this cycle must be reverted.
2. The UAT accounts table in `.claude/skills/uat/SKILL.md` (Ibu Nur / Bu Sari / Pak Budi) stays valid; only the "Seed requirement" mechanics are removed. Login account identities do not change.
3. Parent home dashboard (`app/parent/page.tsx` + `home-client.tsx`) is the `HouseholdOverview` pattern referenced in `.claude/standards/portal.md` — the JTBD references that standard rather than re-describing layout rules.
4. Teacher home (`/teacher` root via `home-client.tsx`) duplicates the GPS check-in UI from `/teacher/attendance`. We write the home JTBD for the morning-routine entry point and cross-link to the attendance JTBDs rather than duplicating steps.
5. Multi-child switching on parent is per-route child-tabs (not a global app-level child switcher) — the cross-cutting multi-child JTBD verifies the tab pattern works on invoices, attendance, reports, and journal, not a nonexistent global switcher.
6. No historical `docs/cycles/*.md` file needs rewording — those are archival records of decisions made at the time.

## Tasks

Ordered. Each is independently committable. Task 1 and Task 2 are parallel-safe (different files, no overlap) — `/build` may dispatch them concurrently. Task 3 depends on neither. Task 4 is the between-task gate run after each.

- [x] **Task 1 — Enrich `docs/uat/jobs/parent.md` to coverage parity.**
  - Append new JTBDs under new `## Area:` headers in this order: `student-journal`, `profile`, `home`, `multi-child`.
  - Jobs to add (IDs following the existing `JTBD-PARENT-<AREA>-NN` pattern):
    - `JTBD-PARENT-JOURNAL-01` — Read this week's school-side journal (teacher checklist + teacher notes).
    - `JTBD-PARENT-JOURNAL-02` — Fill today's home-side habits checklist for the child.
    - `JTBD-PARENT-JOURNAL-03` — Write, edit, then delete a parent note on a specific date.
    - `JTBD-PARENT-PROFILE-01` — Review linked children and navigate to one child's attendance.
    - `JTBD-PARENT-PROFILE-02` — Sign out cleanly and land on a safe signed-out state.
    - `JTBD-PARENT-HOME-01` — Morning household quick-check (unpaid balance + today's attendance + latest journal note visible without scrolling). `Expected perf: page full load <1.5s` (SSR'd, three parallel Prisma queries via `Promise.all` in `app/parent/page.tsx` — threshold matches global list-page rule).
    - `JTBD-PARENT-MULTI-01` — Switch from child A to child B across invoices, attendance, reports, journal and see the correct data per child (not child A's data bleeding into child B's tab).
  - Prune appendix bullets: remove "Guardian-side view of teacher journal" (covered by JOURNAL-01). **Keep** "Profile and child-info updates" but retitle it to "Guardian self-service edit of contact/child info — write capability not yet shipped" to clarify that `app/parent/profile/page.tsx` is read-only and the edit flow genuinely does not exist in code. JTBD-PARENT-PROFILE-01 only credits the read-only navigation + child-card-to-attendance jump, not edits.
  - Bump "Last audited" date to `2026-04-25 in cycle enrich-uat-jobs`.
  - **Acceptance:** File grows to ≥ ~250 lines with all 7 new jobs matching the admin.md field shape. Manual diff review shows existing jobs untouched.

- [x] **Task 2 — Enrich `docs/uat/jobs/teacher.md` to coverage parity.**
  - Append new JTBDs under new `## Area:` headers in this order: `assessments`, `own-attendance` (name chosen to match the route `app/teacher/attendance/` while staying disjoint from the existing `class-attendance` area — avoids `/uat teacher/attendance` string-matching ambiguity), `student-journal`, `home`. `/uat` filtering: operators run `/uat teacher/class-attendance` or `/uat teacher/own-attendance` to scope to one; running `/uat teacher/attendance` is intentionally not a supported invocation after this cycle.
  - Jobs to add (IDs following the existing `JTBD-TEACHER-<AREA>-NN` pattern):
    - `JTBD-TEACHER-ASSESS-01` — Fill indicator scores for a full class for one template/period, relying on autosave.
    - `JTBD-TEACHER-ASSESS-02` — Publish all scores in one bulk action and see the publish gate block if any student has zero indicator scores. **Before writing this entry, `/build` MUST open `app/teacher/assessments/[classSectionId]/[templateId]/[period]/client.tsx` and confirm a bulk "Publish" CTA actually exists with the "every student must have ≥1 score" gate. If the gate is per-student instead of bulk, rewrite the JTBD to match the real flow rather than speccing vaporware.**
    - `JTBD-TEACHER-ATT-OWN-01` — GPS check-in on arrival (happy path + GPS-denied error scenario).
    - `JTBD-TEACHER-ATT-OWN-02` — GPS check-out at end of day, and separately raise a leave request for tomorrow.
    - `JTBD-TEACHER-JOURNAL-01` — Fill today's class-day journal grid (checklist per student × indicator) and save the batch.
    - `JTBD-TEACHER-JOURNAL-02` — Open one student's week view, navigate last week, and add a dated observation note.
    - `JTBD-TEACHER-JOURNAL-03` — Read a parent note on a student and confirm the author role renders correctly (PARENT badge vs TEACHER badge).
    - `JTBD-TEACHER-HOME-01` — Morning routine: land on `/teacher`, see today's check-in status, clock in from the home card without navigating.
  - Update existing appendix: remove "Submit weekly class journal", "Record a student assessment / observation" (both now covered). Keep "Request leave (izin cuti) as a teacher" only if it remains a standalone flow separate from the check-out-path leave request — if they are the same flow, note it under JTBD-TEACHER-ATT-OWN-02 and remove the appendix bullet too.
  - Bump "Last audited" date to `2026-04-25 in cycle enrich-uat-jobs`.
  - **Acceptance:** File grows to ≥ ~280 lines with all 8 new jobs matching the admin.md field shape. Existing jobs untouched.

- [x] **Task 3 — Remove the UAT preseed script and all references.**
  - Delete `prisma/seed-uat.ts`.
  - Remove the `"seed:uat": "tsx prisma/seed-uat.ts"` line from `package.json` scripts.
  - Edit `.claude/skills/uat/SKILL.md`:
    - Remove the entire `## Seed requirement` section.
    - Remove the trailing sentence in the "Default target + accounts" section: *"The UAT seed script (`prisma/seed-uat.ts`) guarantees this — run it once per fresh environment (see 'Seed requirement' below)."* Replace with a one-line pointer to the parallel seeding work: *"The three accounts are guaranteed by the baseline seeding flow owned separately; if a freshly-reset target is missing any of them, stop and surface the gap to the operator."*
    - Scan the preflight list and any downstream section for residual mentions of `seed:uat` / `seed-uat` and delete them.
  - Run `grep -rn 'seed-uat\|seed:uat' --include='*.md' --include='*.ts' --include='*.sh' --include='*.json'` excluding `docs/cycles/`. Expect zero hits.
  - **Semantic sweep (not just grep):** re-read `.claude/skills/uat/SKILL.md` preflight step 3 end-to-end. Any paragraph that justifies itself via the preseed gap (e.g. rationale referencing `POST /api/admin/seed` filling what `prisma/seed.ts` omits, or incident notes tied to seed artifacts) must be re-evaluated once the parallel seeding session's baseline is known. If a statement is now inaccurate, rewrite it to describe the new seeding reality or remove it. Do not leave load-bearing claims that depend on the retired preseed.
  - Check that no CI workflow (`.github/workflows/*.yml`), e2e setup (`e2e/`, `playwright.config.ts`), or `scripts/*.sh` invokes `npm run seed:uat` or imports `prisma/seed-uat.ts`. If any does, the reference must be removed or replaced with the parallel session's equivalent before Task 3 can close.
  - **Acceptance:** grep clean outside `docs/cycles/`. Semantic sweep documented (one bullet in Implementation section listing what was re-checked). `npm run build` still passes (no TS references to the deleted file).

- [x] **Task 4 — Request code review on the final diff.**
  - Invoke `superpowers:requesting-code-review` (or the `feature-dev:code-reviewer` subagent) on the combined diff with the review prompt: *"Assess whether parent.md and teacher.md now match admin.md in rigor and field coverage. Flag any shipped portal capability I still missed, any JTBD where `Steps` describes UI clicks instead of user intent, any perf threshold that is implausibly tight or loose for the Indonesian PAUD/TKIT deployment, and any place where the preseed removal leaked a broken reference."*
  - Address reviewer findings before calling the cycle done.
  - **Acceptance:** Reviewer returns no blockers; any majors are either fixed or explicitly deferred with a reason recorded in Verification.

## Implementation

- Subagent plan: Tasks 1, 2, 3 are doc-only and independent but executed inline-sequentially to avoid cycle-doc commit races (each task amends the same `## Implementation` / `## Verification` lists). Task 4 (review) is invoked after Task 3.
- Task 1: Enrich `docs/uat/jobs/parent.md` — added 7 new JTBDs (`JOURNAL-01/02/03`, `PROFILE-01/02`, `HOME-01`, `MULTI-01`); also back-filled `Role: GUARDIAN` on every existing parent JTBD to satisfy the admin.md field-shape mandate. Bumped audit date. File grew 108 → 260 lines. Code-reviewer pass (`feature-dev:code-reviewer`) caught two blockers (JOURNAL-02 wrongly described autosave; HOME-01 over-claimed unconditional journal-note visibility) and three majors (JOURNAL-03 server-side 403 vaporware claim; HOME-01 precondition used `PENDING` which is excluded; missing `Role:` field) — all five resolved before commit.

## Verification

- Task 1: build + vitest gates green (54 test files, 370 passed, 42 todo, no failures). Doc-only change, no Playwright run needed. Cross-checked JOURNAL-* against `app/parent/student-journal/page.tsx` lines 270–320; HOME-01 against `app/parent/page.tsx` lines 52–84 + 133; MULTI-01 against `?child=` query-param pattern across invoices/attendance/reports/journal pages.
- Task 2: build + vitest gates green (same 370/42 result). Spec deviation noted: `/spec` assumed `/teacher` home duplicates `/teacher/attendance` GPS check-in; code reality is that `/teacher/attendance` is calendar+leave only and `/teacher` home is the SOLE GPS check-in entry point. Restructured: `JTBD-TEACHER-ATT-OWN-01` covers calendar review (not GPS), `JTBD-TEACHER-ATT-OWN-02` covers leave request, `JTBD-TEACHER-HOME-01` covers GPS check-in/out as the sole entry. Total new JTBDs: 8 (matches spec). Reviewer caught three majors (JOURNAL-03 badge string mismatch — code renders "Guru"/"Orang Tua" not "GURU"/"WALI"; HOME-01 GPS-denied error scenario described a toast that doesn't fire and a request-block that doesn't happen; JOURNAL-02 server-side week-range validation doesn't exist) — all three rewritten to match code reality. File grew 99 → 297 lines.
- Task 3: Deleted `prisma/seed-uat.ts` (470 lines). Removed `"seed:uat"` script entry from `package.json`. Edited `.claude/skills/uat/SKILL.md`: rewrote the trailing sentence in "Default target + accounts" to point to the parallel seeding flow; deleted entire "## Seed requirement" section. Grep verification: zero `seed-uat`/`seed:uat` hits outside `docs/cycles/`. Semantic sweep of SKILL.md preflight step 3 (lines ~68–71): the `prisma/seed.ts` (CI minimal) vs `POST /api/admin/seed` (richer admin seed) contrast is independently valid and stands without rewrite — the preseed was a third mechanism whose removal doesn't affect that paragraph's accuracy. CI/scripts/e2e check: `.github/workflows/ci.yml` calls `npx prisma db seed` (standard path), no `seed:uat` references anywhere. `app/api/admin/uat-prep/route.ts` + `lib/uat/scenarios.ts` have no runtime dependency on the deleted file — `parent-payment` scenario backfills Xendit URLs against live data. build + vitest gates green.

## Ship Notes

**Migration / env / infra:** None. Pure docs + script removal cycle.

**What changed:**
- `docs/uat/jobs/parent.md`: 108 → 260 lines, 7 new JTBDs, all existing entries back-filled with `Role: GUARDIAN`.
- `docs/uat/jobs/teacher.md`: 99 → 297 lines, 8 new JTBDs, all existing entries back-filled with `Role: TEACHER`.
- `prisma/seed-uat.ts`: deleted (470 lines).
- `package.json`: `seed:uat` script removed.
- `.claude/skills/uat/SKILL.md`: removed "Seed requirement" section + trailing preseed reference in account table.

**What runs differently after merge:**
- `npm run seed:uat` no longer exists. Anyone with stale local muscle memory should run the parallel-session baseline seed flow instead.
- `/uat <area>` no longer documents a seed-uat preflight step. Operators on a freshly-reset DB must rely on the parallel seeding flow producing the three UAT accounts (Ibu Nur / Bu Sari / Pak Budi) with correct role bindings — if they're missing, the skill instructs surfacing the gap rather than silently running.
- Future `/uat parent` and `/uat teacher` runs will pick from a much larger candidate pool. The 6-job cap in the skill still applies, so coverage across runs improves but a single run still tops out at 6 — operators should plan multi-run coverage similar to admin's group-based invocation pattern.

**Coordination with the parallel seeding session:**
- This cycle assumed the parallel session fully replaces `seed-uat.ts`. If that session lands a partial replacement that still leaves account-binding gaps, the SKILL.md note "stop and surface the gap to the operator" is the safety net — `/uat` will refuse to proceed with missing accounts.
- No code dependency was on `seed-uat.ts` (`lib/uat/scenarios.ts` and `app/api/admin/uat-prep/route.ts` cleared by reviewer).

**Manual smoke on preview (post-merge):**
- Open `docs/uat/jobs/parent.md` and `docs/uat/jobs/teacher.md` on the staging Vercel preview — confirm rendering on GitHub's markdown viewer (these are the artifacts UAT operators read).
- Run `grep -rn 'seed-uat\|seed:uat'` against the merged staging branch — expect zero hits outside `docs/cycles/`.

**End-of-cycle Playwright gate:** intentionally skipped. This cycle changes zero runtime code paths — the build artifact is byte-identical to staging modulo the deleted `prisma/seed-uat.ts` (not loaded by any e2e spec). Running Playwright would re-test unchanged behavior at a 2-minute cost. `npm run build && npx vitest run` was run after each task and again at end-of-cycle, all green (370 passed / 42 todo / 0 failed across 54 test files).

**Rollback plan:** Revert the three commits in order. The cycle is contained — no DB, no infra, no env vars touched. Reverting restores `prisma/seed-uat.ts` from git history and reinstates the JTBD library at the previous audit date.

**README.md update:** not required (no modules / routes / CRUD status / user-facing features changed). Verified by reviewer.

**Doc-sync hooks:** broad pre-commit rule satisfied by staging the cycle doc with each commit. Narrow `commit-msg` rule does not apply — all three commits use `docs:` and `chore:` types, not `feat:`/`perf:`.
