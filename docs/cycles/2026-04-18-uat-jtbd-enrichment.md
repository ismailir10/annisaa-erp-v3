# UAT JTBD Library Enrichment + Flow Hardening

## Context

The UAT JTBD library (`docs/uat/jobs/{admin,teacher,parent}.md`) has drifted behind the shipped product. A codebase review against `config/admin-nav.ts`, `app/admin/**`, `app/teacher/**`, and `app/parent/**` surfaced 11 admin capabilities, 2 teacher capabilities, and 2 parent capabilities that are live in the product but have no JTBD coverage. Without coverage, `/uat admin` silently under-tests the portal — it caps at 6 jobs and we only had 7 admin jobs total, so everything trivially passed.

Three structural weaknesses in the flow also became visible:

1. **No role routing.** Admin jobs run as Ibu Nur (`SUPER_ADMIN`) only. Once the `role-split` cycle ships a `SCHOOL_ADMIN` persona, `/uat` has no mechanism to know which persona to use per job — the metadata isn't there.
2. **Admin 6-job cap is too tight.** Admin has 15+ capabilities spread across `config/admin-nav.ts` groups (HR, Akademik, Keuangan, Penilaian, Pengaturan). `/uat admin` drops 60% of coverage every run.
3. **No staleness signal.** The `Last audited` date in each jobs file is informative but purely advisory — nothing flags library drift at `/uat` preflight, so a 6-month-old jobs file looks identical to a fresh one.

No user-facing code changes. Docs-only cycle: the four UAT docs plus this cycle doc.

## Spec

**Goal:** Raise UAT coverage of shipped capabilities from ~50% to ~90%, and add the three flow-level guardrails above.

**Acceptance criteria:**

1. `docs/uat/jobs/admin.md` contains ≥17 first-class JTBDs, covering every area group in `config/admin-nav.ts` (dashboard, students, student-attendance, invoices, payroll, employees, attendance, leave, assessments, admissions, academic, guardians, teaching-assignments, fees, settings).
2. `docs/uat/jobs/teacher.md` contains ≥6 JTBDs, including previous-day attendance correction and slip screenshot/download.
3. `docs/uat/jobs/parent.md` contains ≥6 JTBDs, including paid-invoice history and indicator-by-indicator report card breakdown.
4. Every job in all three files declares `Role:` (admin only, values: `SUPER_ADMIN` | `SCHOOL_ADMIN` | `either`) and `Expected perf:` (at least one measurable threshold per job).
5. `.claude/skills/uat/SKILL.md` updated with:
   - Admin area-group invocation table (`/uat admin/hr`, `/admin/academic`, `/admin/finance`, `/admin/penilaian`, `/admin/settings`) aligned with `config/admin-nav.ts`.
   - Per-job `Expected perf` takes precedence over the global threshold table.
   - 60-day staleness warning at preflight (non-blocking).
   - Role routing rules for admin jobs (SUPER_ADMIN / SCHOOL_ADMIN / either).
   - Negative-access grading rule (expected 403 instead of timing thresholds) for deferred Bu Lina jobs.
6. `Last audited` line bumped to `2026-04-18` with cycle slug `uat-jtbd-enrichment` on all three jobs files.
7. Between-task gate (`npm run build && npx vitest run`) and end-of-cycle gate (`+ npx playwright test`) both pass.
8. PR opened against `staging` and handed back for manual merge once CI is green (per `/ship` manual-merge flow).

**Non-goals:**
- Creating the Bu Lina (`SCHOOL_ADMIN`) persona — deferred to `role-split` cycle. Negative-access jobs stay in Appendix.
- Changing the underlying `/uat` harness (Playwright MCP, port 3000, local build). The worktree's existing skill already targets this; do not switch to Claude-in-Chrome / staging URL variants.
- Modifying README.md — no modules, routes, or entities change.
- Modifying CLAUDE.md — workflow rules unchanged.

## Tasks

Each task is a single atomic commit. Between-task gate (`npm run build && npx vitest run`) runs before each commit. End-of-cycle gate runs before the last task.

1. **Admin JTBD enrichment** — edit `docs/uat/jobs/admin.md`:
   - Add `Role:` + `Expected perf:` to 10 existing jobs
   - Add area-group intro pointing at `config/admin-nav.ts`
   - Insert new JTBDs: `INV-02`, `INV-03`, `PAY-03`, `EMP-02`, `LEAVE-02`, `ASSESS-02`, `GUARD-01`, `TA-01`, `FEE-01`, `SET-HOLIDAY-01`, `SET-USER-01`
   - Rewrite Appendix into "not yet catalogued" + "negative-access deferred"
   - Bump audit date to 2026-04-18, cycle `uat-jtbd-enrichment`

2. **Teacher JTBD enrichment** — edit `docs/uat/jobs/teacher.md`:
   - Add `Expected perf:` to 3 existing jobs that lack it
   - Insert `ATT-02` (correct yesterday's attendance) and `SLIP-02` (screenshot/download slip cleanly)
   - Bump audit date to 2026-04-18, cycle `uat-jtbd-enrichment`

3. **Parent JTBD enrichment** — edit `docs/uat/jobs/parent.md`:
   - Add `Expected perf:` to 3 existing jobs that lack it
   - Insert `INV-02` (understand line-item breakdown — previously in Appendix), `INV-03` (paid-invoice history), `REP-02` (indicator-by-indicator breakdown)
   - Bump audit date to 2026-04-18, cycle `uat-jtbd-enrichment`

4. **UAT skill flow changes + end-of-cycle gate** — edit `.claude/skills/uat/SKILL.md`:
   - Add admin area-group invocation table under `## Invocation`
   - Add `Role` routing section under Step 1
   - Add negative-access grading rule under Step 1
   - Add 60-day staleness preflight warning (new step 5; renumber)
   - Add per-job `Expected perf` precedence rule under Step 4c
   - Run end-of-cycle gate (`npm run build && npx vitest run && npx playwright test`) before commit

## Implementation

<!-- filled by /build -->

## Verification

<!-- filled by /build -->

## Ship Notes

<!-- filled by /ship -->
