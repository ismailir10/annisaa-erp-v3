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


## Verification

<!-- filled by /build -->

## Ship Notes

<!-- filled by /ship -->
