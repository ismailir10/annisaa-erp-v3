# Docs Simplification + an Executable Staleness Gate

## Context

Follow-on to [the workflow hygiene audit](2026-08-20-workflow-hygiene-audit.md). That cycle fixed the drift; this one fixes *why drift was possible*, and cuts the two documents that carry the cost.

`AGENTS.md` is a symlink to `CLAUDE.md`, so there are two files, not three. Together they were **8,161 words** — read at every session start by every harness.

**Three structural causes of staleness:**

1. **The docs asserted facts the code owns.** Seven hardcoded counts (`191 routes`, `41 / 13 / 8 portal pages`, `65 Shadcn components`, `34 specs`, `22 active cycle docs + 230 archived`). Every one is derivable, so every one is a drift generator — two were broken within an hour of being written in the previous cycle.
2. **The only automated gate checked presence, not truth.** `.github/workflows/docs-check.yml` — the required `Docs sync` check — asserts that *a* doc file was touched. Staging the cycle doc satisfies it, so README and CLAUDE.md could rot forever while every PR stayed green. `pre-commit` rule 2 is the same rule locally.
3. **The gate that did check truth was prose a model could skip.** `/audit-docs` was 165 lines of instructions with embedded shell snippets, nominally run as `/ship` preflight #6. Nothing verified it ran, and the evidence says it did not: two ADR rows past their own 60-day cutoff, six unowned `docs/` directories, a roster claiming Opus 4.8.

**Bloat, measured.** CLAUDE.md restated its own skills — `/ship` had a 400-word paragraph *and* a 544-line SKILL.md; `/uat` 10 lines plus 281; `/audit-docs` 8 lines plus 165. README had swallowed engineering history: five lines over 1,000 characters, topping out at a 2,200-char `reportCard` cell. The ADR table is capped at 400 chars per cell by a pre-commit rule; the module table had no cap and grew essays.

**The repo is public.** That reframes README from a length problem to a disclosure one. Three findings:

- Line 18 documented a *known, accepted* auth weakness in operational detail — the Supabase Email provider being enabled, so `/auth/v1/otp` stays reachable with the public anon key.
- Line 132 published the staging preview URL, and staging carries real roster data.
- Lines 113–123 published DOKU Back Office click-paths, the sandbox simulator workflow, a live probe ID, and `CRON_SECRET`-bearer endpoints.

A wider sweep for committed secrets and personal data came back mostly clean: no real credentials in tracked files (every hit was a test fixture, an `.env.example` placeholder, or the CI throwaway Postgres password), and no `.env` file was ever committed. Two real findings: `.claude/verify-accounts.json` was **tracked**, naming the Google accounts that hold admin, teacher and parent access — a targeting aid on a public repo — and seven distinct real addresses appear across seed scripts, runbooks and cycle docs (232 occurrences, but a small set of people).

## Spec

- `/audit-docs` becomes an **executable** that exits non-zero, running inside the required `Docs sync` check so it gates merges.
- Derivable counts live in exactly one generated block; CI fails if the committed block differs from a fresh generation.
- The gate is proven to fail — a check that cannot fail is the problem being fixed.
- CLAUDE.md and README.md shrink by roughly half, losing no enforceable rule.
- README becomes a public front page: ≤ 120 lines, no line over 600 chars, budget enforced by the script.
- Operational detail moves to `docs/runbooks/`; the ADR table moves to `docs/adrs/active.md`.
- The staging URL and the auth-weakness description leave the repo. `verify-accounts.json` becomes local-only.

Non-goals: closing the `/auth/v1/otp` hole itself (owner's decision — remove the description, keep the posture); rewriting git history to scrub the seven addresses.

## Tasks

1. Write `scripts/audit-docs.sh` with a generated counts block and a `--write` mode
2. Wire it into the required `Docs sync` CI check; reduce the skill to a thin wrapper
3. Negative-test every check
4. Cut CLAUDE.md; add the generated block
5. Rewrite README as a public front page; move ops detail to two new runbooks
6. Move the ADR table to `docs/adrs/active.md`; repoint the pre-commit rule and its tests
7. Untrack `verify-accounts.json`, add an example, ignore it

## Implementation

**Task 1-3 — the gate.** [`scripts/audit-docs.sh`](../../scripts/audit-docs.sh) runs eleven checks and exits 1 on any `fail`:

| Check | Fails when |
|---|---|
| Counts block | the generated block differs from a fresh generation |
| Standards files | CLAUDE.md's dispatch table names a `.claude/standards/` file that is absent |
| Interface-craft skills | a `better-*` row has no `SKILL.md`, or is missing from `link-agent-skills.sh` |
| Relative links | any link in README or CLAUDE.md does not resolve on disk |
| `docs/` directories | a stray top-level doc directory exists |
| File Structure paths | a path named in the tree block is gone |
| Tracked paths exist | a committed path is missing on disk (the dangling-symlink class) |
| No env files tracked | anything matching `.env*` other than `.env.example` is committed |
| No account file tracked | `verify-accounts.json` is committed |
| README size budget | over 120 lines or any line over 600 chars |
| ADR 60-day window | **warns** — trimming is judgement, not a merge blocker |

Two portability details worth keeping: the 60-day arithmetic uses a days-from-civil implementation in awk rather than `date -d`/`date -j`, which diverge between GNU and BSD; and `--write` passes the replacement block through a temp *file*, because BSD awk and mawk both reject a newline inside a `-v` assignment. The first `--write` implementation used `-v` and silently wrote nothing — caught only because the block was inspected afterwards.

Every check was negative-tested by introducing the fault and confirming exit 1: a tampered count, a stray `docs/scratch/`, a broken link.

**Task 4 — CLAUDE.md, 4,463 → 3,066 words.** Per-command prose collapsed into a three-row table linking each `SKILL.md`, leaving behind only the rules that bind *outside* the skills (no direct pushes; merge conditions; `--to-main` must be a merge commit; Playwright recorded). Expensive-driver and subagent fan-out merged into one two-column table plus a three-line worked example. The seven safety mechanisms became a numbered list, hooks became a table. Every rule survives; the narration and the duplication do not.

**Task 5 — README, 3,698 → 783 words (91 lines).** Module cells cut to one line each. Removed from public view: the auth-weakness description, the staging preview URL, and the DOKU operational content. New homes: [`docs/runbooks/payments-gateway.md`](../runbooks/payments-gateway.md) (gateway health, VA-enforced-in-dashboard, the notification problem and the reconcile cron, sandbox testing, the v2 probe) and [`docs/runbooks/environments.md`](../runbooks/environments.md) (environments table, env-var matrix).

**Task 6 — ADR relocation.** The seven in-window rows moved verbatim to [`docs/adrs/active.md`](../adrs/active.md). `pre-commit` Rule 6 now scans that file instead of README's `## Architecture Decisions` section, and `audit-docs.sh` reads its dates for the 60-day warning. The four ADR scenarios in `scripts/test-hooks.sh` were rewritten against the new location, and ADR3 was strengthened while it was open: it previously staged a fixture with no long cell at all, so it did not test the file-scoping it claimed to. It now stages a second file carrying its own 500-char cell and asserts the rule ignores it.

**Task 7 — accounts file.** `git rm --cached .claude/verify-accounts.json`, added to `.gitignore`, with `.claude/verify-accounts.example.json` committed in its place. `/ship`'s Step 3 now tells the operator to copy the example and ask for the accounts rather than guess.

## Verification

- `bash scripts/audit-docs.sh` — **11 ok, 0 warn, 0 fail**, exit 0
- Negative tests — tampered count, stray `docs/` dir, broken link: each produced the expected `fail` and exit 1
- `bash scripts/test-hooks.sh` — **24 passed, 0 failed** (4 ADR cases rewritten against `docs/adrs/active.md`)
- `npm run build` — green
- `npx vitest run` — 2963 passed / 42 todo, 0 failed
- Playwright deferred to the required CI `Playwright E2E` check
- Combined doc size: 8,161 → 3,849 words (**−53%**); README 141 → 91 lines, longest line 2,200 → 300 chars
- No frontend diff, so the `design-system` frontend gate does not apply and preview-verify is skipped — docs, scripts, hooks and CI only
- Secret sweep: no credentials in tracked files; no `.env` ever committed; `verify-accounts.json` now untracked and ignored

## Ship Notes

- **No migrations, no env vars, no schema change.**
- **New required-check behaviour:** `Docs sync` now runs `scripts/audit-docs.sh`. A PR that leaves a stale count, a broken doc link, a stray `docs/` directory, or an oversized README **will fail CI**. That is the intent. `bash scripts/audit-docs.sh --write` fixes the counts; the rest name their own fix.
- **`.claude/verify-accounts.json` is now gitignored.** It still exists in every working copy, so nothing breaks locally — but a fresh clone must copy the example and fill it in before `/ship` Step 3 can run.
- **Rollback:** `git revert`. The runbook and ADR extractions are new files plus deletions and revert cleanly.
- **Follow-ups:**
  - The `/auth/v1/otp` surface is unchanged — only its public description was removed, per decision. Closing it means disabling the Supabase Email provider in the dashboard; Google OAuth is the only UI path, so nothing legitimate should break.
  - Seven real email addresses remain in seed scripts, runbooks and cycle docs. Removing them from HEAD would reduce discoverability but **git history still carries them**; full removal needs a history rewrite and force-push, which breaks every clone. `prisma/migrations/…promote_owner_to_super_admin/migration.sql` names the owner account and **must not be edited** — changing an applied migration breaks its checksum.
  - `/ship`'s SKILL.md is still 544 lines, the largest single doc in the workflow. Not touched this cycle.
