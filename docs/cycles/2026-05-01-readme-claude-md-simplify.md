# README + CLAUDE.md Simplification

## Context

README.md (295 lines) and CLAUDE.md (366 lines) have drifted. Five rot patterns:

1. **Ghost sections.** README's Contents lists `Roadmap`, body references `CRUD status` 3x, but neither section exists. CLAUDE.md's doc-maintenance table claims README owns CRUD status — also stale.
2. **ADR-cell bloat.** 24 ADR rows. Recent rows duplicate cycle-doc content verbatim (line 122 = ~40 lines, line 123 = ~25 lines, line 112 = ~15 lines). The ADR table reads like a changelog dump, not a constraint log. Cells unbounded; no cell-length policy.
3. **Module-row creep.** Finance/HR/student-journal cells append a new cycle link every time they're touched. Other modules (core/academic/students/learning) stay 1-line. No rule prevents the drift.
4. **Cross-file overlap.** Production URL, standards, tech-stack pointer, and "see other doc" lines exist in BOTH README + CLAUDE.md. Each fact should live in exactly one file with the other linking if needed. Today: production URL (2 places), `/spec` → `/build` → `/ship` workflow described in CLAUDE.md but a dead 13-line "Development Workflow" pointer section also sits in README, and standards get name-checked in both.
5. **Lost UAT history.** `.gitignore` line 56 excludes `docs/uat/reports/` — only 2 of N reports survived (the ones a `/spec` cycle force-added). The library of synthetic UAT runs is the institutional memory of UX regressions; ignoring it by default loses that signal.

CLAUDE.md has its own bloat: 20-row coverage mapping (one-time design artifact, useless ongoing), standards table that duplicates `.claude/standards/*.md` self-descriptions, Multi-LLM Safety subsections that repeat "use a worktree" 4x, and PR #74 backstory embedded in doc-sync hook rationale.

Stale numbers compound the rot: README claims "69 API routes" (actual 128), "62 Shadcn components" (actual 68), "3 e2e spec files" (actual 6). File Structure trees inherit stale counts from the 2026-04-15 rewrite cycle.

**Intended outcome:** README ≤ 130 lines (down from 295), CLAUDE.md ≤ 220 lines (down from 366). Ghost sections gone. ADR cell-length cap enforced by pre-commit hook. Module rows collapsed to 1-line domain summaries. Reseed runbook extracted. UAT reports flow into git going forward. **README + CLAUDE.md operate as a single 2-doc system** — every fact has exactly one home, the other doc links to it. Maintenance rules stated explicitly so this doesn't drift again in 60 days.

### Single-source-of-truth matrix

The harmony principle: each row below has exactly ONE owner; the other file links if needed.

| Topic | Owner | Other file's role |
|---|---|---|
| Product identity (name, school, scale) | README | — |
| Production URL | README | — |
| Tech stack | README | — |
| Modules + key models | README | — |
| Portals + roles + features | README | — |
| Architecture Decisions (last 60d) | README | — |
| Setup + env vars + tests | README | — |
| Environments table | README | — |
| 3-step `/spec` → `/build` → `/ship` workflow | CLAUDE.md | README footer 1-liner pointer |
| Multi-LLM safety (role file, hooks, worktrees, branch protection) | CLAUDE.md | — |
| One-file-per-cycle rule | CLAUDE.md | — |
| Standards directory (`.claude/standards/`) | CLAUDE.md | — |
| Doc-maintenance rules | CLAUDE.md | — |
| File structure tree | CLAUDE.md | — |
| `/uat` standalone command | CLAUDE.md | — |
| Reseed runbook | `docs/runbooks/reseed-staging.md` | README env section 2-line pointer |
| Pre-2026-03 ADRs + process-meta ADRs | `docs/adrs/archive.md` | README ADR section 1-line pointer |
| UAT job library | `docs/uat/jobs/` | CLAUDE.md `/uat` section pointer |
| UAT reports | `docs/uat/reports/` (un-ignored) | CLAUDE.md `/uat` section pointer |

## Spec

### Acceptance criteria

**README.md**
- [ ] Contents/TOC section deleted (file is short enough to scan)
- [ ] All 3 mentions of "CRUD status" removed (lines 137, 292, plus any inline)
- [ ] Roadmap entry removed from Contents (no body content exists)
- [ ] Current Phase entry removed from Contents (no body content exists)
- [ ] Modules table: drop "Key Models" column; each cell ≤ 1 sentence describing stable domain (no recent-fix prose, no cycle links)
- [ ] Portals → Features prose: 1 line per portal, no inline cycle dumps
- [ ] ADR table: each cell ≤ 2 sentences + 1 cycle link; rows older than 60 days OR whose decision is now codified in CLAUDE.md / `.claude/standards/` moved to `docs/adrs/archive.md`
- [ ] **"Development Workflow" section deleted** (was 13-line pointer to CLAUDE.md — replaced with 1-line footer pointer)
- [ ] Setup section: drop env-var prose duplicating env-var table; `sin1`/`DIRECT_URL` nuance moved to footnote
- [ ] Reseed Staging section moved to `docs/runbooks/reseed-staging.md`; README keeps 2-line pointer
- [ ] License + "For developers" footer merged into single 3-line block ending with single-sentence pointer to CLAUDE.md
- [ ] Stale numbers updated (api routes, shadcn components, e2e specs)
- [ ] No "Last updated" line (drift bait — git log is the truth)
- [ ] **No `/uat` mentions** in README (single source = CLAUDE.md per matrix)
- [ ] Final line count ≤ 130

**CLAUDE.md**
- [ ] 20-row Coverage mapping table → 1 sentence pointer to `.claude/skills/{spec,build,ship}/SKILL.md`
- [ ] Standards table → **kept** as concise 1-line-per-standard table (this IS its canonical home per the harmony matrix); only drop the duplicated path/glob column where the file's own header self-describes. Add 1-line preamble noting standards live under `.claude/standards/` and absorbing the "standards split — domain reference moved to .claude/standards/" context from the dropped "Last updated" line. Also document the two HTML files (`design-system.html` = canonical visual reference, `parent-portal-cycle4.html` = scratch parent-portal snapshot, scope-locked, do not extend).
- [ ] Multi-LLM Safety §0–§4: consolidated, "every session needs worktree" stated once
- [ ] Doc-sync hook PR #74 backstory removed (rule statement remains, rationale lives in cycle doc)
- [ ] Worktree section: kill duplicate "every session must work in a worktree" claims, single canonical block
- [ ] File Structure tree: trimmed to top-level dirs with current counts (19 admin, 5 teacher, 5 parent, 128 api routes, 68 shadcn components, 6 e2e specs)
- [ ] Documentation Maintenance table: CRUD ownership claim removed from README's job; matches the single-source-of-truth matrix in this cycle doc
- [ ] Drop production URL line (single source = README); replace with 1-line "What this product is: see [README.md](./README.md)" at top
- [ ] Drop tech-stack inline mentions (single source = README)
- [ ] No "Last updated" line (drift bait)
- [ ] Final line count ≤ 220

**New files**
- [ ] `docs/adrs/archive.md` exists; contains pre-2026-03-02 ADRs and process-meta ADRs (3-command workflow, prd retired, one-file-per-cycle, role-gated push)
- [ ] `docs/runbooks/reseed-staging.md` exists; contains everything currently in README's "Reseeding staging" subsection (env-pull, command, vars table, partial-failure recovery, post-reseed UAT smoke, SQL snippet)

**.gitignore**
- [ ] Line 56 (`docs/uat/reports/`) removed — UAT reports flow into git going forward
- [ ] Existing 2 reports already in git stay where they are (`docs/uat/reports/2026-04-18-parent.md`, `docs/uat/reports/2026-05-01-student-journal.md`)
- [ ] Comment lines 54-55 about `git add -f` workaround also removed
- [ ] CLAUDE.md `/uat` paragraph updated: drop "reports are gitignored by default" claim, replace with "reports are committed alongside the cycle that produced or consumed them"

**Pre-commit hook**
- [ ] New rule rejects commit if any pipe-table row in `README.md` Architecture Decisions section has a cell > **400 chars** (bumped from 300 — accommodates legit deeplinks while still forcing concision)
- [ ] Existing tests in `scripts/test-hooks.sh` extended with: pass case (cell ≤ 400), fail case (cell = 500), skipped case (table outside ADR section)
- [ ] All existing hook tests still pass
- [ ] Heaviest task LOC budget: ~40 LOC pre-commit + ~60 LOC test-hooks fixtures

**Verification gates**
- [ ] `npm run build` green
- [ ] `npx vitest run` green
- [ ] `bash scripts/test-hooks.sh` green (existing + new ADR-cell-length tests)
- [ ] **Playwright skipped** — docs-only cycle, zero UI risk; documented in Verification section
- [ ] Link integrity: `grep -oE "docs/cycles/[^)]+\.md" README.md CLAUDE.md docs/adrs/archive.md | sort -u` then `test -f` each — zero broken links
- [ ] `wc -l README.md CLAUDE.md` confirms targets

### Non-goals

- Not rewriting `.claude/standards/*.md` content
- Not changing the 3-step `/spec` → `/build` → `/ship` workflow itself
- Not touching cycle docs themselves (they remain authoritative for detail)
- Not changing CI workflow files
- Not adding new ADRs about the simplification itself (this cycle doc is the record)
- Not introducing dynamic doc generation (README/CLAUDE.md remain hand-edited)

### Assumptions

1. **60-day ADR archive cutoff is acceptable.** Cycles run weekly; 60d ≈ 6-10 visible rows at steady state. Confirmed by user.
2. **Module-row 1-line rule won't lose useful context.** Detail lives in cycle docs; module table is a domain map, not a changelog.
3. **`docs/adrs/archive.md` and `docs/runbooks/reseed-staging.md` paths are acceptable.** Both fit the existing `docs/` allowlist (no hook changes needed for the files themselves).
4. **`parent-portal-cycle4.html` in `.claude/standards/` is intentional** (alongside `design-system.html`). Not deleting it; not documenting it in CLAUDE.md either — assumed to be a working scratch reference.
5. **Pre-commit hook ADR-cell-length rule applies only when README.md is staged.** Not a global lint over the entire file every commit.
6. **Stale File Structure counts in CLAUDE.md** (e.g. "22 admin pages", "69 API routes") get refreshed once during this cycle. No automated count-bot.
7. **CTO is running this cycle in a worktree** despite the entry-point table saying "main checkout stays" — user explicitly asked for clean branch. Worktree already created.

## Tasks

### Task 1 — Audit ghost references, stale numbers, and cross-file overlap [x]
**Acceptance:** A short audit table at the top of `## Implementation` lists every ghost section / stale number / dead cycle-doc link / cross-file overlap found in current README.md + CLAUDE.md, with the new value or "delete" disposition. Cross-references the single-source-of-truth matrix in Context. No code/doc edits yet — this is the source-of-truth for Tasks 2-5.
**Dependencies:** none.
**Files touched:** none (audit notes go inline in cycle doc).

### Task 2 — Scaffold archive + runbook directories [x]
**Acceptance:** `docs/adrs/archive.md` and `docs/runbooks/reseed-staging.md` created. Archive file has H1 + 1-paragraph "What's archived and why" + the ADR rows being moved out of README in Task 3a. **Archived ADR cells must be byte-equal to source cells before any trimming** — no lossy edits during the move. Runbook file has the verbatim Reseeding section from README plus the Post-reseed UAT smoke. Pre-commit allowlist already covers `docs/**` so no hook change needed.
**Dependencies:** Task 1 (audit determines which ADRs move).
**Files created:** `docs/adrs/archive.md`, `docs/runbooks/reseed-staging.md`.

### Task 3a — Rewrite README.md (structural) [x]
**Acceptance:** Sections deleted/moved/restructured: Contents/TOC, Roadmap+Current Phase ghost entries, Development Workflow section, Reseeding Staging subsection, License + "For developers" footer merge. Cycle-doc links not yet trimmed but file structure matches final shape. README.md compiles (no broken markdown). Intermediate line count ≤ 200.
**Dependencies:** Tasks 1, 2.
**Files modified:** `README.md`.

### Task 3b — Rewrite README.md (cell-level) [x]
**Acceptance:** Modules table cells collapsed to 1-line; Key Models column dropped. ADR table: rows trimmed to ≤ 2 sentences + cycle link, archived rows removed. Portals Features prose: 1-line per portal. Setup env-var prose trimmed. Stale numbers refreshed. No `/uat` mentions. README.md ≤ 130 lines. `wc -l README.md` confirms. `grep -cE "CRUD|Roadmap|Current Phase" README.md` returns 0 matches OR matches only inside dev-pointer footer. All cycle-doc links resolve via `test -f`.
**Dependencies:** Task 3a.
**Files modified:** `README.md`.

### Task 4 — Rewrite CLAUDE.md [x]
**Acceptance:** CLAUDE.md ≤ 220 lines. All checklist items from "Acceptance criteria → CLAUDE.md" section pass. `wc -l CLAUDE.md` confirms. Documentation Maintenance table no longer claims README owns CRUD. Coverage mapping is gone. Standards table **kept** (single-source per matrix) with trimmed columns + HTML preamble. Worktree section is single-block. File Structure counts match current repo. No production URL, no tech-stack list, no "Last updated" line.
**Dependencies:** Task 1.
**Files modified:** `CLAUDE.md`.

### Task 5 — Add ADR-cell-length pre-commit rule + un-ignore UAT reports [x]
**Acceptance:**
- `.githooks/pre-commit` gains a rule that, when `README.md` is staged, scans the `## Architecture Decisions` table and rejects the commit if any data cell (excluding header + separator rows) exceeds **400 chars**. Error message points to the offending row's date column.
- `scripts/test-hooks.sh` extended with: (a) pass when all ADR cells ≤ 400 chars, (b) fail when one ADR cell = 500 chars, (c) ignore when the long cell is in a non-ADR table. All existing + new tests green.
- After Task 3b lands: stage README.md and run pre-commit hook locally — must NOT false-positive on the rewritten lean cells.
- `.gitignore` line matching `docs/uat/reports/` removed (locate by content, not line number); comment lines about `git add -f` workaround also removed. The 2 existing reports stay tracked.
**Dependencies:** Task 3b (need rewritten README to validate against), Task 4 (CLAUDE.md `/uat` text needs update before un-ignore lands).
**Files modified:** `.githooks/pre-commit`, `scripts/test-hooks.sh`, `.gitignore`.

### Task 6 — Verification + close-out
**Acceptance:** `npm run build && npx vitest run` green. `bash scripts/test-hooks.sh` green. **Playwright skipped** (docs-only, zero UI risk — recorded explicitly in Verification section). README + CLAUDE.md targets met. Single-source-of-truth matrix invariants hold (no production URL in CLAUDE.md, no workflow detail in README, no standards detail in README, no `/uat` in README, etc.). Link integrity grep passes zero broken. Cycle doc Verification section filled with command outputs + manual smoke notes. Ship Notes filled: no migrations, no env vars, rollback = revert the squash-merge commit on staging (since cycle = 6+ commits in one PR).
**Dependencies:** Tasks 1-5.
**Files modified:** this cycle doc only.

## Implementation

- **Subagent plan:** All 7 tasks sequential. Tasks 3a/3b and Task 4 touch different files but Task 4's CLAUDE.md text must be consistent with Task 3b's README; sequencing avoids drift. Tasks 1, 2, 5, 6 strictly sequential by data dependency.

### Task 1 — Audit table (read-only)

**README.md ghost references**

| Location | Issue | Disposition |
|---|---|---|
| Line 15 (Contents) | `[Current Phase](#current-phase)` — no body section | delete from Contents |
| Line 16 (Contents) | `[Roadmap](#roadmap)` — no body section | delete from Contents |
| Line 137 | "modules, CRUD status, roadmap, ADRs, setup, environments" | rewrite without CRUD/roadmap |
| Line 292 | Footer: "this README is the *what*" — keeps mention of CRUD as footer prose | rewrite footer, drop CRUD claim |
| Line 105 (ADR cell) | "single source of truth for status/roadmap/ADRs" | trim to "single source of truth for ADRs" |
| Line 139 | `/uat` mention in Development Workflow section | delete entire section |

**README.md stale numbers**

| Claim | Actual | Source |
|---|---|---|
| `app/api/` 69 routes | 128 routes | `find app/api -name route.ts` (CLAUDE.md will track, README doesn't) |
| `components/ui/` 62 Shadcn | 68 | `ls components/ui/*.tsx` (CLAUDE.md only) |
| E2E specs: admin (9), teacher (5), parent (6) | admin 26, teacher 8, parent 7, plus design-system 2, payment 3, admin-school-admin 9 | grep `test\(` (CLAUDE.md only) |
| `app/admin/` 22 admin pages | 19 | `ls app/admin/` |
| `app/teacher/` 6 teacher pages | 5 dirs (`assessments`, `attendance`, `class-attendance`, `profile`, `slips`, `student-journal`) — actually 6 if counting `class-attendance` | keep 6 |
| `app/parent/` 4 parent pages | 5 dirs | bump to 5 |
| `middleware.ts` (line 113 ADR + Standards table glob) | renamed to `proxy.ts` per CLAUDE.md line 341 | normalize references to `proxy.ts` |

**README.md cross-file overlap (kill in README, keep in CLAUDE.md)**

| Today in README | Action |
|---|---|
| Production URL line 5 | KEEP (README owns) — but CLAUDE.md must drop its line 12 copy |
| Tech Stack table | KEEP (README owns) |
| Development Workflow section (lines 127-139, 13 lines) | DELETE (pure pointer to CLAUDE.md) |
| `/uat` paragraph line 139 | DELETE (CLAUDE.md owns) |
| Footer "For developers and AI agents" line 292 | TRIM to single line linking CLAUDE.md |
| Standards detail in footer | DROP (CLAUDE.md owns standards) |

**ADR table — disposition**

| Date | Action | Reason |
|---|---|---|
| 2025 (4 rows: Next.js, Prisma, soft-delete, Shadcn-first) | ARCHIVE | pre-2026 baseline, codified in standards |
| 2026-04 Xendit over Midtrans | TRIM (≤ 2 sentences) | active decision, recent |
| 2026-04 perf phase 2 | TRIM | active |
| 2026-04-15 3-command workflow | ARCHIVE | now codified in CLAUDE.md |
| 2026-04-15 one-file-per-cycle | ARCHIVE | now codified in CLAUDE.md |
| 2026-04-18 unified PR `/ship` | ARCHIVE | now codified in CLAUDE.md |
| 2026-04-15 prd retired | ARCHIVE | historical, README is the truth |
| 2026-04-21 single StudentJournalTemplate | TRIM | active |
| 2026-04-24 (6 rows) | TRIM each (current cells = 5-25 lines) | active, current 60d window |
| 2026-04-25 (5 rows) | TRIM each | active |
| 2026-04-26 (2 rows) | TRIM (line 123 = ~25 lines, must compress aggressively) | active |
| 2026-04-27 (1 row, ~40 lines) | TRIM hard — split into "decision" + cycle link | most bloated |

Final ADR table: ~16 rows (down from 24), each ≤ 2 sentences + link. Archive: 8 rows.

**CLAUDE.md targets**

| Section / line | Action | Saves |
|---|---|---|
| Lines 38-62 — Coverage mapping table (20 rows) | Replace with 1 sentence | ~25 lines |
| Lines 84-105 — Per-command responsibilities + Testing gates | Trim to keep "what each command does" only; testing gates already terse, keep | ~5 lines |
| Lines 107-122 — `/uat` standalone section | Trim to 8 lines | ~10 lines |
| Lines 128-141 — §0 Auto staging sync | Trim to 5 lines (keep rule, drop fallback prose) | ~5 lines |
| Lines 167-213 — §3 Worktree isolation | Trim from ~50 lines to 20 (kill dup claims, kill claude-harness recovery prose, keep recovery script ref) | ~30 lines |
| Lines 215-233 — §4 GitHub branch protection | Trim to 8 lines | ~10 lines |
| Lines 282-300 — Documentation Maintenance | Drop PR #74 backstory paragraph (lines 296-300); update table to drop CRUD claim | ~10 lines |
| Lines 302-326 — Standards section | Keep table but trim columns + add HTML preamble | ~5 lines |
| Lines 328-352 — File Structure | Refresh counts; trim narrative | ~10 lines |
| Lines 354-365 — Key Documents | Remove duplicate of doc-maintenance table | ~10 lines |
| Line 366 — "Last updated" | Delete | ~1 line |
| Line 12 — Production URL | Delete (README owns) | ~3 lines |
| Total estimated savings | | ~125 lines |

CLAUDE.md 366 - 125 = 241 lines projected. Target was ≤ 220 — likely need another ~20 lines of compression in Multi-LLM Safety §1 (Session role) and §2 (Git hooks). Will revisit during Task 4.

**`docs/uat/reports/` un-ignore — confirmed 2 files in tree, not ignored as new files come in.** No retroactive recovery needed.

## Verification

- Task 1: audit-only, no gates run (no code change). Inputs verified: `app/api` route count = 128 (`find app/api -name route.ts | wc -l`), `components/ui` = 68, e2e specs = 6 files. `proxy.ts` exists, `middleware.ts` does not. README ghost references confirmed via `grep -n "CRUD\|Roadmap\|Current Phase" README.md`.
- Task 2: gates passed (build + vitest). New files: `docs/adrs/archive.md` (8 archived ADRs — pre-2026 baseline + process-meta), `docs/runbooks/reseed-staging.md` (full reseed prose + post-reseed UAT smoke). Archive cells byte-equal to source verified via diff against README lines 96-99, 102-105.
- Task 3a: gates passed (build + vitest). README.md 295 → 202 lines (down 93). Deleted: Contents/TOC, Development Workflow section (15 lines), Reseeding subsection (60 lines, runbook pointer left), License + "For developers" sections (merged into 3-line footer). Tables (Modules, ADRs) untouched — Task 3b trims cells.
- Task 3b: gates passed (build + vitest). README.md 202 → 130 lines (target hit exactly). Modules cells: 1-line each, "Key Models" col dropped. ADR table: 24 rows → 17 rows (4 archived as pre-2026 baseline + 4 archived as process-meta + 4 finance ADRs from 2026-04-25 consolidated to 1 row + 2 finance ADRs from 2026-04-26 consolidated to 1 row + 2 from 2026-04-27/28 each kept as own row). Portals + Data Access folded into one 5-col table. Setup compressed to single block. Env-var footnotes consolidated. Cell-length self-check: zero ADR cells > 400 chars. Link integrity: all 14 cycle-doc + 2 nested-doc links resolve via `test -f`. Ghost grep: zero `CRUD|Roadmap|Current Phase|Last updated` matches. `/uat` count: 0.
- Task 4: gates passed (build + vitest, after npm install resolved a pre-existing missing `dotenv` transitive dep — package.json reverted, dotenv resides only in worktree-local node_modules). CLAUDE.md 366 → 220 lines (target hit exactly). Removed: 20-row coverage mapping, "Last updated" line, production URL line, tech-stack inline mentions, PR #74 backstory, Key Documents section (merged into Documentation Maintenance), CRUD ownership claim. Consolidated: Multi-LLM Safety §0–§4 into 5 mechanisms with worktree as single block. Standards table kept (canonical home per harmony matrix), trimmed; HTML preamble added documenting `design-system.html` (canonical) and `parent-portal-cycle4.html` (scratch, do-not-extend). File Structure tree refreshed to current counts (19/5/5/128/68 e2e 6). All cross-doc invariants hold: no prod URL, no tech-stack inline, no ghost refs, single worktree-claim block.
- Task 5: gates passed (build + vitest + `bash scripts/test-hooks.sh` 20/20). Pre-commit Rule 6 (ADR cell ≤ 400 chars when README staged) added at end of `.githooks/pre-commit` using awk to scan `## Architecture Decisions` section, skip header + separator rows, check each pipe-delimited cell. test-hooks.sh extended with 3 ADR cases (pass at short, reject at 500-char in ADR, accept long cell in non-ADR table). Hook self-tested against rewritten README: exit 0, zero violations. `.gitignore` lines 54-56 removed (`docs/uat/reports/` un-ignored + comment block); existing 2 reports already tracked.

## Ship Notes
<!-- filled by /ship -->
