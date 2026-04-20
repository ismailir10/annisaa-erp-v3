# Docs Cleanup — Stale Comment + Missing Completed Entries

## Context

Critical review of `README.md` and `CLAUDE.md` in an older worktree (2026-04-20) flagged three drift issues. On re-check against `origin/staging`, most are already fixed by the `2026-04-18` unified-PR ADR and the `2026-04-19` doc reconciliation cycle. Two real drifts remain:

1. **Stale inline comment in CLAUDE.md.** [CLAUDE.md:119](../../CLAUDE.md) still reads:
   ```
   role=cto              # opus sessions — can push staging directly
   ```
   This contradicts every other rule in the same file — the `pre-push` hook description at [CLAUDE.md:139](../../CLAUDE.md) and the `/ship` description at [CLAUDE.md:64](../../CLAUDE.md) both state that **no role** can push directly. The comment is a holdover from the pre-2026-04-18 `/ship` model. It's the single most confusing line in the operating manual because it sits inside the canonical session-role example.

2. **README "Completed" list is missing five merged cycles.** Cycles present in `docs/cycles/` but not linked from the README "Current Phase → Completed" section:
   - `2026-04-16-query-optimization.md` — Perf Phase 6 (unbounded fetches, fat rows, N+1 in invoice generation, missing indexes on LEARNING tables)
   - `2026-04-17-parent-invoice-perf.md` — Parent invoice page cold-nav fix
   - `2026-04-18-perf-deep-fix.md` — Observability-driven perf investigation
   - `2026-04-18-perf-quick-wins.md` — Session cache, FK indexes, student create
   - `2026-04-19-uat-critical-fixes.md` — Parent blockers + perf majors + reusable UAT prep mechanism

   Meta/workflow cycles (`doc-reconciliation`, `workflow-audit-fixes`, `uat-jtbd-enrichment`) are intentionally omitted from Completed — they update CLAUDE.md and tooling, not user-visible behavior.

Both drifts are docs-only. No runtime behavior changes.

## Spec

1. **CLAUDE.md:119 inline comment** no longer asserts that any role can push staging directly. The session-role code block is self-consistent with the rules later in the same file.
2. **README "Current Phase → Completed" list** includes the five user-visible cycles above with short descriptions and links to their cycle docs.
3. Two commits, one per task (per CLAUDE.md "one commit per task" rule).
4. End-of-cycle gate (`npm run build && npx vitest run && npx playwright test`) passes before opening the PR.
5. Landed as a single PR to `staging` via `/ship`, manual merge by CTO after CI goes green.

## Tasks

- **T1 — Fix stale comment in CLAUDE.md:119.** Replace `# opus sessions — can push staging directly` with a comment that matches the current rule (or drop the comment entirely and let the prose rules speak for themselves). The `role=cto` line itself stays — we just can't claim it bypasses PR review.

- **T2 — Add five missing cycles to README Completed.** One bullet per cycle, dated, linked to the cycle doc. Order chronologically inside the list. Use the same bullet style as existing entries (bold lead-in, short description, `see [cycle doc](path)`).

## Implementation

### T1 — Stale cto-push comment in CLAUDE.md session-role example

- **File:** [`CLAUDE.md:119`](../../CLAUDE.md)
- **Before:** `role=cto              # opus sessions — can push staging directly`
- **After:**  `role=cto              # cto or product-builder — both open PRs via /ship; no direct pushes to staging`

Kept the comment (orientation is useful since `role=` is a two-value field) but rewrote it to match the `2026-04-18` unified-PR ADR and the `pre-push` hook behavior. No other changes in the file.

**Between-task gate:** `npm run build` ✅, `npx vitest run` → 130 passed (14 files).

### T2 — Five missing cycles added to README "Current Phase → Completed"

- **File:** [`README.md`](../../README.md) — between the 2026-04-16 CRUD sweep bullet and the 2026-04-19 CRUD Standard completion bullet.

Inserted chronologically:

| Cycle | Date | Anchor |
|---|---|---|
| Perf Phase 6 — query optimization | 2026-04-16 | [`docs/cycles/2026-04-16-query-optimization.md`](2026-04-16-query-optimization.md) |
| Parent invoice cold-nav perf | 2026-04-17 | [`docs/cycles/2026-04-17-parent-invoice-perf.md`](2026-04-17-parent-invoice-perf.md) |
| Perf deep-fix (observability) | 2026-04-18 | [`docs/cycles/2026-04-18-perf-deep-fix.md`](2026-04-18-perf-deep-fix.md) |
| Perf quick wins | 2026-04-18 | [`docs/cycles/2026-04-18-perf-quick-wins.md`](2026-04-18-perf-quick-wins.md) |
| UAT critical fixes 1–5 | 2026-04-19 | [`docs/cycles/2026-04-19-uat-critical-fixes.md`](2026-04-19-uat-critical-fixes.md) |

Intentionally **not** added (meta/tooling cycles that update CLAUDE.md or workflow machinery, not user-visible behavior):
- `2026-04-18-workflow-audit-fixes.md`
- `2026-04-18-uat-jtbd-enrichment.md`
- `2026-04-19-doc-reconciliation.md`

**Between-task gate:** `npm run build` ✅, `npx vitest run` → 130 passed (14 files).


## Verification

### Gates

| Gate | Command | Result |
|---|---|---|
| T1 between-task | `npm run build && npx vitest run` | ✅ build green · 130/130 vitest |
| T2 between-task | `npm run build && npx vitest run` | ✅ build green · 130/130 vitest |
| End-of-cycle | `npx playwright test` | ✅ 25/25 passed (30.7s) — 14 admin, 5 teacher, 6 parent |

### Manual smoke

- **CLAUDE.md:119 self-consistency:** grep-checked that no remaining line in the file asserts any role can push staging directly. The `pre-push` hook description, the `/ship` per-command section, the `Rule` subsection under Worktree isolation, and the ADR table entry in README all now say the same thing: PR-only for every role.
- **README link check:** each of the five new bullet links points to a file that exists in `docs/cycles/`.
- **One-file-per-cycle rule:** only `CLAUDE.md`, `README.md`, and `docs/cycles/2026-04-20-docs-cleanup.md` are staged across the two commits. Pre-commit hook accepted both.
- **Doc-sync rule:** each commit stages either CLAUDE.md (T1) or README.md (T2) alongside the cycle doc, satisfying the hook.


## Ship Notes

- **Migrations:** none.
- **New env vars:** none.
- **Breaking changes:** none. Docs-only PR.
- **Rollback plan:** `git revert <merge-commit>` on staging. No schema, no data, no runtime behavior changed.
- **Branch:** `feat/docs-cleanup` → `staging`.
- **CI expectations:** all four required checks (`build`, `typecheck`, `test`, `e2e`) should pass; no code changed.
- **Follow-ups to consider (not in this cycle):**
  - Audit the `pre-commit` doc-sync hook — the five cycles added here all merged with README un-updated, so either the hook allowed it (by staging the cycle doc only) or the hook was bypassed. If the former, consider tightening the rule so "perf" / "feat" cycles require README staging specifically.
  - CLAUDE.md is ~680 lines and loaded every session. Session-critical rules are buried under ~400 lines of UI/CRUD/Portal/API reference material. Worth considering splitting reference standards into `.claude/standards/*.md` loaded on demand.

