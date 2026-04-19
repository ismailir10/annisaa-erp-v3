# Doc Reconciliation — README ↔ CLAUDE.md

## Context

On 2026-04-19 the CTO audited README.md against CLAUDE.md and found several stale statements in README that contradict the current operating manual. Most contradictions live in README's **Development Workflow** and **Multi-LLM session safety** sections, which duplicate content that already lives (more accurately) in CLAUDE.md.

Two prior cycles moved the source-of-truth forward without dragging README along:
- [`2026-04-17`](2026-04-17-worktree-every-role.md) — worktree required for **every** role, not just `product-builder`.
- [`2026-04-18`](2026-04-18-ship-manual-merge.md) — `/ship` dropped auto-merge (GitHub free plan); all roles now use the same manual-merge-on-green PR flow. No role pushes directly to `staging`.

README still says the opposite on both.

The CRUD completion cycle ([`2026-04-19-crud-standard-completion.md`](2026-04-19-crud-standard-completion.md)) already reconciled the CRUD status table and ADR entries. That part of the docs is current.

**Goal of this cycle:** eliminate the remaining README ↔ CLAUDE.md contradictions, and remove the duplicated workflow content from README so there is exactly one source of truth per topic ("CLAUDE is the *how*; README is the *what*").

## Spec

**Acceptance criteria (all must hold after this cycle):**

1. README contains **no statement that contradicts CLAUDE.md** about `/ship`, worktree scope, pre-push behavior, or required CI checks.
2. README's "Development Workflow" section is slimmed to a one-paragraph pointer to CLAUDE.md + a list of what README uniquely owns (phases, roadmap, ADRs, setup, environments). No duplicated content.
3. README's "Architecture Decisions" table reflects the current reality of the role/push model (single row per decision, latest state only — or a new row superseding the 2026-04-15 one).
4. Stale session-role model examples (`claude-opus-4-6`) are updated or made generic in both docs.
5. No code changes. Vitest + build still green (sanity check only — nothing touched).

**Out of scope:**
- CRUD sweep phase 2 (separate cycle, per CTO decision).
- Any portal/UI/schema edits.
- Editing `docs/cycles/*` (history stays as written).

## Tasks

Ordered, atomic, one commit each.

### T1. Reconcile README workflow bullets (`/ship`, worktree, pre-push)

**Files:** `README.md` (Development Workflow + Multi-LLM safety subsections, ~lines 181–227).

**Changes:**
- Line 193 `/ship` bullet → unified manual-merge-on-green PR flow for all roles. Match CLAUDE.md wording.
- Line 209 worktree paragraph → "every session, regardless of role" (not `product-builder` only).
- Line 218 "cto sessions work in the main checkout" → remove; replaced by "every session works inside its own worktree; the `SessionStart` hook creates it automatically."
- Line 223 pre-push bullet → "blocks direct pushes to `staging` or `main` for **all roles**."
- Lines 225–227 branch-protection paragraph → align required checks with CLAUDE.md (`build`, `typecheck`, `test`, `e2e`), and note that branch protection is aspirational on the GitHub free plan (matches CLAUDE.md's 2026-04-18 note).

**Gate:** `npm run build && npx vitest run` (sanity — no code change).

### T2. Slim duplicated workflow content in README

**Files:** `README.md`.

**Changes:**
- Replace the detailed "3-step loop", "Multi-LLM session safety", "One-file-per-cycle rule", and "Documentation maintenance" subsections with a single **Development Workflow** section containing:
  1. 1-line description of the 3-step loop (`/spec` → `/build` → `/ship`).
  2. Pointer: "Operating manual for these commands, the multi-LLM safety model, the one-file-per-cycle rule, and doc-maintenance rules lives in [CLAUDE.md](./CLAUDE.md). This section intentionally stays thin — CLAUDE.md is the source of truth."
  3. Standalone UAT paragraph kept (it is user-facing, not operator-facing).

**Gate:** `npm run build && npx vitest run`.

### T3. Update ADR row for role-gated push

**Files:** `README.md` (Architecture Decisions table, ~line 176).

**Changes:**
- Replace the 2026-04-15 row *"Role-gated push: cto pushes to staging, product-builder opens PR"* with a 2026-04-18 row *"Unified PR-based `/ship`: all roles open a PR to `staging` and merge manually when CI is green. No direct pushes to `staging` or `main`."*
- Keep the rationale short: *"GitHub free plan doesn't support branch protection / auto-merge; manual merge + pre-push hook + CTO discipline is the enforcement layer."*

**Gate:** `npm run build && npx vitest run`.

### T4. Bump stale session-role model examples

**Files:** `README.md`, `CLAUDE.md`.

**Changes:**
- Replace `model=claude-opus-4-6` with `model=claude-opus-4-7` (current default opus) in both docs' examples.
- Where the example is illustrative only, keep the line but make clear the model ID should match the current assistant (a one-liner note).

**Gate:** `npm run build && npx vitest run`.

### T5. Final consistency pass + bump CLAUDE.md "Last updated"

**Files:** `README.md`, `CLAUDE.md`.

**Changes:**
- Read both docs end-to-end one more time, fix any surviving contradiction.
- Update CLAUDE.md's "Last updated" footer to `2026-04-19 (README ↔ CLAUDE doc reconciliation — removed workflow duplication)`.

**Gate (end-of-cycle):** `npm run build && npx vitest run` — skip Playwright because no user-facing surface changed. Record this explicit skip + reason in Verification.

## Implementation

### T1 — Reconcile README workflow bullets ✅

**Commit:** (this commit)

Edits to `README.md`:
- `/ship` bullet rewritten to match CLAUDE.md: unified manual-merge-on-green PR flow for all roles; explicit note that no role (including `cto`) pushes directly to `staging`/`main`; `/ship --to-main` mentioned.
- Worktree paragraph collapsed to one sentence covering every role, with a note that the `SessionStart` hook creates the worktree automatically (user never runs `git worktree add`).
- Removed the "cto sessions work in the main checkout" carve-out and the explicit `git worktree add` code block (both contradicted CLAUDE.md).
- `pre-push` bullet: "blocks direct pushes to `staging` or `main` for **all roles** (including `cto`)" with an explicit "feature branches always allowed" clause.
- Branch-protection paragraph: required-checks list now matches CLAUDE.md (`build`, `typecheck`, `test`, `e2e`), and the GitHub free-plan caveat is spelled out so readers understand why client hooks + CTO discipline are the current enforcement layer.

Model-trailer example on line 208 still reads `claude-opus-4-6` — intentionally left for T4.

## Verification

### T1 — README workflow reconciliation

Gate: `npm run build && npx vitest run`
- Build: ✅ compiled successfully, all routes generated.
- Vitest: ✅ 13 files / 116 tests passed (6.51s).

Manual re-read of lines ~190–230 in README.md vs CLAUDE.md sections "Per-command responsibilities", "Worktree isolation", "Git hooks (.githooks/)", and "GitHub branch protection (the real boundary)": no remaining contradictions on these four topics.

Playwright intentionally skipped at the end-of-cycle (doc-only changes — no UI, API, or auth surface touched).

### T2 — Slim duplicated workflow content ✅

**Commit:** (this commit)

Collapsed four README subsections ("The 3-step loop", "Multi-LLM session safety", "One-file-per-cycle rule", "Documentation maintenance") — roughly 55 lines of content that duplicated CLAUDE.md — into a single ~10-line `## Development Workflow` section that:
- States the 3-step loop in one line.
- Points to CLAUDE.md as the source of truth for per-command responsibilities, the `agent-skills` coverage map, multi-LLM safety, the one-file-per-cycle rule, and doc-maintenance rules.
- Names the split explicitly: README = *what* (modules, CRUD, roadmap, ADRs, setup), CLAUDE = *how*.
- Retains the standalone heuristic UAT paragraph (user-facing, not operator-facing).

Net: -48 lines in README. No information lost — everything removed is already covered in CLAUDE.md sections "Per-command responsibilities", "Multi-LLM Safety" (§1–§4), "One-File-Per-Cycle Rule", and "Documentation Maintenance".

Gate: `npm run build && npx vitest run`
- Build: ✅ compiled successfully.
- Vitest: ✅ 13 files / 116 tests passed (7.38s).


## Ship Notes

<!-- filled by /ship: PR URL, migrations (none), env vars (none), rollback (revert the single PR) -->
