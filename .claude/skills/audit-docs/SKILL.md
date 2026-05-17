---
name: audit-docs
description: Full-repo doc-staleness sweep. Compares README.md + CLAUDE.md against actual code state — route counts, portal-page counts, file-structure block, standards-table references, ADR archive cutoff. Run on demand to catch long-tail drift the per-cycle pre-commit doc-sync gate cannot see. Outputs a report into the active cycle doc's `## Verification` section if one is open, otherwise to stdout.
disable-model-invocation: true
---

# /audit-docs — full-repo doc-staleness sweep

You are running a standalone audit of README.md and CLAUDE.md against the actual repo state. This is **not** part of the 3-step cycle loop — invoke on demand (manual `/audit-docs`, or as part of `/build`'s end-of-cycle gate when explicitly requested by the cycle's tasks).

## Preflight

1. **Worktree?** Run `git rev-parse --git-dir` vs `git rev-parse --git-common-dir`. If equal (main checkout), warn but proceed — `/audit-docs` is read-only.
2. **Clean tree not required.** This skill only reads + writes to the active cycle doc's Verification section (if present).
3. **Active cycle?** Find the most recent `docs/cycles/*.md`. If its `## Ship Notes` is empty AND `## Tasks` has unchecked boxes, it's the active cycle — append the audit report there. Otherwise print to stdout.

## Checks

Run all checks. Collect findings into a single report. Each finding is one of: `ok`, `warn`, `fail`.

### Check 1: README.md route count

```bash
README_ROUTES=$(grep -oE '[0-9]+ routes' README.md CLAUDE.md 2>/dev/null | head -1 | grep -oE '[0-9]+')
ACTUAL_ROUTES=$(find app/api -name route.ts -type f | wc -l | tr -d ' ')
```

- `ok` if `README_ROUTES == ACTUAL_ROUTES`
- `warn` if delta ≤ 3 (small drift from in-flight changes)
- `fail` if delta > 3 OR README has no route-count claim at all

### Check 2: Portal page counts

```bash
ADMIN_PAGES=$(find app/admin -name 'page.tsx' -type f | wc -l | tr -d ' ')
TEACHER_PAGES=$(find app/teacher -name 'page.tsx' -type f | wc -l | tr -d ' ')
PARENT_PAGES=$(find app/parent -name 'page.tsx' -type f | wc -l | tr -d ' ')
# Look for the claim in CLAUDE.md File Structure block
CLAUDE_CLAIM=$(grep -E 'admin,teacher,parent.*portal pages' CLAUDE.md | grep -oE '[0-9]+ / [0-9]+ / [0-9]+')
```

- Parse `CLAUDE_CLAIM` (format `N / M / K`).
- `ok` if all three match.
- `fail` if any differ by more than 1 (don't accidentally fail on a page added mid-cycle that's already documented in the active cycle's Implementation).

### Check 3: Component count

```bash
COMPONENT_COUNT=$(find components/ui -name '*.tsx' -type f | wc -l | tr -d ' ')
CLAUDE_COMPONENT_CLAIM=$(grep -E 'components/ui' CLAUDE.md | grep -oE '[0-9]+' | head -1)
```

- `ok` if equal.
- `fail` if delta > 2.

### Check 4: E2E spec count

```bash
SPEC_COUNT=$(find e2e -name '*.spec.ts' -type f | wc -l | tr -d ' ')
CLAUDE_SPEC_CLAIM=$(grep -E 'e2e/' CLAUDE.md | grep -oE '[0-9]+ specs' | grep -oE '[0-9]+')
```

- `ok` if equal.
- `fail` if delta > 0.

### Check 5: Standards-table file existence

For every row in CLAUDE.md's Standards table (the block starting `| File | Covers | Loaded when |`), extract the filename and check `.claude/standards/<filename>` exists.

```bash
awk '/^\| File \| Covers/{flag=1; next} /^---/{flag=0} flag && /^\|/' CLAUDE.md \
  | grep -oE '`[a-z0-9-]+\.(md|html)`' | tr -d '`' | sort -u
```

- `ok` for every file that exists under `.claude/standards/`.
- `fail` for any missing file.

### Check 6: ADR archive cutoff (60 days)

```bash
# README has an active ADR table (last 60d). Anything in there older than 60d should be in docs/adrs/archive.md instead.
# Find the active ADR table in README — first column is a date column.
TODAY_EPOCH=$(date +%s)
CUTOFF=$((TODAY_EPOCH - 60*86400))
```

Parse dates from README's ADR table (first column). For each date older than 60 days, emit a `warn` finding listing the row. (`warn`, not `fail`, since trimming is judgement.)

### Check 7: File Structure block sanity

The CLAUDE.md `## File Structure` block names directories. For each path mentioned (`app/{admin,teacher,parent}/`, `app/api/`, `components/ui/`, `lib/`, `prisma/`, `proxy.ts`, `e2e/`, `docs/`, `.claude/`, `.githooks/`, `scripts/`), verify it exists on disk.

```bash
for path in 'app/admin' 'app/teacher' 'app/parent' 'app/api' 'components/ui' 'lib' 'prisma' 'proxy.ts' 'e2e' 'docs' '.claude' '.githooks' 'scripts'; do
  test -e "$path" || echo "missing: $path"
done
```

- `ok` if all present.
- `fail` for each missing.

### Check 8: Workflow command references intact

CLAUDE.md and `/spec`, `/build`, `/ship` should mutually reference each other consistently. Cheap heuristic:

```bash
grep -c '/spec' .claude/skills/ship/SKILL.md
grep -c '/build' .claude/skills/ship/SKILL.md
grep -c '/audit-docs' CLAUDE.md
```

- `warn` if `/audit-docs` is mentioned in README/CLAUDE but the skill file is missing, or vice versa.

## Output

Build a report in this shape:

```markdown
### /audit-docs report — <YYYY-MM-DD>

| Check | Status | Detail |
|---|---|---|
| Route count (README) | ok / warn / fail | claimed=N actual=M |
| Portal page counts (CLAUDE) | ok / warn / fail | claimed=A/T/P actual=A'/T'/P' |
| Component count | ok / warn / fail | claimed=N actual=M |
| E2E spec count | ok / warn / fail | claimed=N actual=M |
| Standards-table files | ok / fail | missing: [...] |
| ADR archive cutoff (60d) | ok / warn | stale rows: [...] |
| File Structure paths | ok / fail | missing: [...] |
| Workflow refs | ok / warn | notes: [...] |

**Summary:** <N ok, M warn, K fail>

**Actions:**
- <one bullet per fail / warn with what to update>
```

## Write the report

1. If an **active cycle doc** is present (Ship Notes empty + Tasks unchecked), append the report to its `## Verification` section.
2. Otherwise print the report to stdout and stop.

Never create a new markdown file. The one-file-per-cycle rule applies — the report lives in the active cycle doc or stdout, nowhere else.

## Rules

- **Read-only against git.** This skill never commits, never pushes, never moves files. It produces a report; humans (or a later `/build` task) decide what to fix.
- **Single source of truth.** Findings name the doc that's wrong — they do not propose edits to source code to match a doc that's stale (the source is canonical).
- **Heuristic, not exhaustive.** Delta thresholds tolerate in-flight cycles. Tune via review, not via raising thresholds to silence noise.
- **Never bypass hooks.** N/A — this skill writes only to the cycle doc, which the pre-commit allowlist permits.
