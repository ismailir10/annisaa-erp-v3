# spec-sync-phase-1-actual — reconcile foundation spec with actual Phase 1 cycle decomposition

**Type:** docs
**Phase:** p1 (post-cycle bookkeeping)
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §11 + §18.1 + §18.2 + §6.1

## Context

Phase 1 actual cycle decomposition diverged from the spec's original 7-cycle plan. The `p1-audit-timeline-files` and `p1-scaffold-engine-skeleton` parents both hit the §18.2 per-cycle scope cap (≤25 staged files / ≤2 days) and split mid-execution into 4 follow-on cycles total, landing 9/10 Phase 1 cycles to date with `p1-auth-google-oauth` still pending. The spec was written before any cycle shipped, so §11 W1 deliverables, §18.1 cycle list, and §18.2 retrospective + 5 unrelated drift items now diverge from reality. This cycle reconciles them. **Doc-only, single-task, single commit, no tests, no migrations, no env vars, no rollback risk.**

A pre-drafted patch lives at `docs/research/2026-05-06-spec-sync-phase-1-pending.patch` (drafted in the closing turns of the `p1-upload-route-sharp` cycle by the spec-update agent + reviewed before stash). It contains 3 surgical edits (§11 W1 line, §18.1 Phase 1 list, §18.2 retrospective). The 5 unrelated drift items (per the upload-cycle's spec review report) get fixed inline in the same task.

Cross-checked design-system.html: N/A (doc-only, no frontend diff). UAT reports: N/A.

## Spec

### Acceptance criteria

- [ ] Pre-drafted patch applied to `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` — 3 edits land cleanly:
  - §11 W1 days 2-7 line — adds split note ("Phase 1 ran 10 cycles, not 7")
  - §18.1 Phase 1 — full reality-aligned cycle list with `[x]/[ ]` checkboxes + ship dates + per-split rationale + Status footer
  - §18.2 retrospective paragraph — cap fired twice in Phase 1, working as designed
- [ ] **Drift §1 — line 928 cycle/week count.** `Big task = ~30 cycles over 7 weeks.` → `Big task = ~36 cycles over 8 weeks.` (Phase 1 grew +3 from 7→10; §11 already says "8 weeks honest".)
- [ ] **Drift §2 — line 930 §18.1 header.** `~33 cycles across 8 phases` → `~36 cycles across 8 phases`.
- [ ] **Drift §3 — lines 1072-1077 standards-docs lifecycle table.** Update to match actual splits:
  - `audit-pii.md` row: `Created when` → `p1-audit-write-middleware` (was: `p1-audit-timeline-files`)
  - `scaffold.md` row: keep `p1-scaffold-engine-skeleton` but tighten `Owns` to `scaffold engine + permission resolver + format helpers` (the renderer-side standards landed in the split cycle below)
  - `entity-registry.md` row: keep `p1-scaffold-engine-skeleton` (per-entity directory contract is engine-side)
  - **NEW row** `timeline.md | p1-timeline-registry | TimelineEvent registry, emit middleware, audit→timeline bridge, visibility tiers`
  - **NEW row** `storage.md | p1-upload-route-sharp | /api/upload route, sharp pipeline, signed URL TTL, FAILED-row semantics, lazy upload trigger, bucket layout`
- [ ] **Drift §4 — line 1370 `_PHASES.md` reference.** Delete the line — file never created, §18.1 already serves the role.
- [ ] **Drift §5 — §6.1 migrations table (lines 343-366).** Reconcile with actual:
  - `09_addresses` row → split into two rows:
    - `09_regions             Province/Regency/District/Village (idn-area-data v4.0.1, BPS-code PKs CHAR(2)/(4)/(6)/(10) — note District widened from spec's CHAR(7) to CHAR(6) per p1-regions-seed)`
    - `10_addresses           Address chain (deferred to p2-addresses-idn-chain — first p2 entity cycle that needs it)`
  - All subsequent migration rows shift +1: `10_curriculum → 11_curriculum`, `11_admission_workflow → 12_admission_workflow`, `12_enrollment → 13_enrollment`, `13_raport → 14_raport`, `14_finance → 15_finance`, `15_payroll → 16_payroll`, `16_scaffold → 17_scaffold`, `17_version_triggers → 18_version_triggers`, `18_check_constraints → 19_check_constraints`, `19_jwt_hook → 20_jwt_hook`. Final list bumps from 20 numbered → 21 numbered files. Update the section header `### 6.1 Migration files (20 numbered)` → `### 6.1 Migration files (21 numbered)`.
- [ ] `pre-commit` hook passes (one-file-per-cycle: only spec doc + cycle doc staged; no other markdown sneaks in).
- [ ] `commit-msg` hook: use `docs:` type so README staging not required.
- [ ] All gates green: `npm run lint` ✓, `npm run typecheck` ✓ (CRITICAL — last cycle missed it; fixed in PR #188 commit `5c29361`), `npm run build` ✓, `npx vitest run` ✓ (no test changes; should match staging baseline 750 passed | 4 skipped).
- [ ] `verify-rls-coverage.sh` 25/25, `verify-api-auth.sh` 3/3, `verify-pii-annotations.sh` 2/2, `npm run scaffold:check` ✓ (no schema/route change, just sanity-confirm).
- [ ] Playwright skipped (pure-docs cycle per CLAUDE.md two-tier gate rule); record skip in Verification.

### Non-goals

- Phase 2-8 cycle-list audit. The drift surfaced is Phase-1-specific; Phase 2+ will reconcile organically as those cycles ship.
- `_PHASES.md` resurrection. §18.1 is the single source; no need for a parallel checkbox file.
- Renaming the file `2026-05-06-spec-sync-phase-1-pending.patch` to historical context. **Delete after this cycle merges** — its purpose is fulfilled and a stale patch in `docs/research/` becomes confusing the moment §18.1 is touched again. (Documented as a Ship Notes step.)
- Audit of every `cycle 5` / `cycle 6` numbered reference in the spec body. The retrospective paragraph (§18.2) uses original-plan numbering; cycle docs themselves use shipped-order numbering. Consistent within each context; no contradiction worth fixing here.

### Assumptions

1. **Patch applies cleanly without conflict.** The spec doc has not been touched on staging since the patch was generated (verified: staging tip `a2cb65b` = PR #188 merge, which did NOT touch the spec). If `git apply` rejects, the cycle re-derives the 3 edits manually from the patch source.
2. **Drift §5 migration renumber is paper-only.** No actual migration files on disk get renamed — the spec was just out of date relative to what cycles 3-10 already shipped. `prisma/migrations/` already has the correct `09_regions` directory (verified via `ls prisma/migrations/`); the spec's §6.1 numbered list was the lone outdated artefact.

## Tasks

> Single task, one commit. End-of-cycle gate inline (lint + typecheck + build + vitest + verify scripts). Playwright skipped (pure-docs).

- [x] **T1 — apply patch + 5 drift fixes + cycle doc.** Acceptance: `git apply docs/research/2026-05-06-spec-sync-phase-1-pending.patch` succeeds (or manual re-derive if reject); 5 drift items applied via Edit tool to the same spec file; cycle doc Implementation/Verification/Ship Notes filled; gates green; one commit `docs(spec): reconcile Phase 1 cycle decomposition + 5 drift items`.

## Implementation

- T1: `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` + `docs/cycles/2026-05-06-spec-sync-phase-1-actual.md`. Patch applied cleanly via `git apply` (3 edits — §11 W1 row, §18.1 Phase 1 list w/ checkboxes, §18.2 retrospective). 5 drift fixes applied inline via Edit tool: line 928 `~30 cycles over 7 weeks` → `~36 cycles over 8 weeks` w/ cross-reference note; line 930 §18.1 header `~33 cycles` → `~36 cycles`; lines 1080-1085 standards-docs lifecycle table — `audit-pii.md` ownership reassigned to `p1-audit-write-middleware`, `scaffold.md` Owns clarified, NEW rows for `timeline.md` (p1-timeline-registry) + `storage.md` (p1-upload-route-sharp); line 1186 §18.10 Phase boundaries — replaced `_PHASES.md` reference w/ pointer to §18.1; line 1380 phase-1-cycle-1 checklist — removed `_PHASES.md created` item; §6.1 migrations table — split `09_addresses` into `09_regions` (CHAR(6) note inline) + `10_addresses` (deferral note), shifted subsequent rows +1, header bumped `20 numbered → 21 numbered`, retraction note appended.

## Verification

- T1: `npm run lint` ✓; `npm run typecheck` ✓ (CRITICAL gate — last cycle missed it; fixed in PR #188 commit `5c29361`); `npm run build` ✓; `npx vitest run` ✓ — **750 passed | 4 skipped (754 total)**, baseline unchanged from staging tip (no test changes); `verify-rls-coverage.sh` ✓ 25/25; `verify-api-auth.sh` ✓ 3/3; `verify-pii-annotations.sh` ✓ 2/2; `npm run scaffold:check` ✓ (greenfield). Playwright deliberately skipped — pure-docs cycle per CLAUDE.md two-tier gate rule (record skip per /ship preflight).
- Cross-checked design-system.html: N/A (doc-only, no frontend diff).
- Patch source `docs/research/2026-05-06-spec-sync-phase-1-pending.patch` retained in worktree but NOT staged — gitignored, deleted in Ship Notes step.

## Ship Notes

### Migrations applied

**None.** Doc-only cycle — no schema change, no migration files touched on disk. The §6.1 numbered list reconciliation is paper-only — actual `prisma/migrations/09_regions/` directory already shipped in cycle 3 (`p1-regions-seed`); the spec was the lone outdated artefact.

### New env vars

**None.**

### Manual smoke on Vercel preview

**None required** — no runtime change. Verify the spec doc renders correctly on GitHub when the PR loads (markdown table integrity + checkbox rendering).

### Cleanup of saved patch

The pre-drafted patch at `docs/research/2026-05-06-spec-sync-phase-1-pending.patch` is gitignored and its purpose is now fulfilled. **Delete after this PR merges:**

```bash
# In main checkout, post-merge:
rm /Users/ismailrabbanii/Documents/ai-builder/school-erp/docs/research/2026-05-06-spec-sync-phase-1-pending.patch
```

A stale patch in `docs/research/` becomes confusing the moment §18.1 is touched again.

### Rollback plan

`git revert <PR merge SHA>` undoes the spec sync cleanly. No schema change, no env var, no migration to roll back. Risk window is essentially zero — doc edit only, no runtime impact.

### Phase 1 status (post-merge)

- [x] 9/10 Phase 1 cycles shipped + spec reconciled
- [ ] `p1-auth-google-oauth` — true Phase 1 final cycle (auth surface). Prompt drafted in the closing turns of `p1-upload-route-sharp` cycle. Until it ships, `/api/upload` 401s real callers (acceptable: no real upload UI mounted yet).
- After `p1-auth-google-oauth`: Phase 2 entity cycles begin (`p2-students-guardians-household` first per spec §18.1).

### Lessons surfaced this cycle

- **`npm run typecheck` is a separate gate from `npm run build`** — the PR #188 CI fail (TS2344 in upload-hook test) showed that vitest's SWC transform accepts patterns strict `tsc --noEmit` rejects. Add typecheck to the mental gate list for every cycle going forward. CLAUDE.md two-tier gate description currently mentions `npm run build && npx vitest run` as the between-task gate; consider adding `npx prisma generate && tsc --noEmit` (the `typecheck` script) explicitly. Surfacing for a future CLAUDE.md cycle, not fixing here (one-file-per-cycle).
- The `docs/research/` dir is the right place for durable-artefact-that-survives-worktree-cleanup needs. Used here for the saved patch; pattern reusable for future cross-cycle handoffs.
