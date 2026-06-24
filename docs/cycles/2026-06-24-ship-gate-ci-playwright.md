# Ship Gate — defer local Playwright to CI + canonical Codex skills

## Context

Codex's `/ship` is blocked even after the Multi-Harness Harmony cycle merged. Two root causes the prior cycle never touched:

1. **`/ship` Step 1b hard-requires a local `npx playwright test`** before PR creation. Codex's local environment cannot run Playwright (staging-only `DATABASE_URL`, the Turbopack `node_modules` symlink issue, CI-only deps). So PR creation is blocked regardless of doc wording — Codex correctly diagnosed: *"PR creation is still blocked by the local Playwright DB guard."* Meanwhile the required CI check `Playwright E2E` runs on every PR and **already** gates the merge (confirmed green on #366).
2. **Codex reads `.agents/skills/ship/SKILL.md`, not `.claude/skills/ship/SKILL.md`.** `.agents/` is gitignored (harness-local) and its `ship` skill is a stale pre-merge copy. So even a canonical fix never reaches Codex.

## Spec

**Acceptance:**
- `/ship` Step 1b: `npm run build && npx vitest run` stay mandatory locally; `npx playwright test` becomes **best-effort** — if the env cannot execute it, defer to the required CI `Playwright E2E` check (which blocks the merge) and record the deferral in Verification. A real test *failure* still blocks; only env-can't-run defers.
- Step 1a accepts a CI-deferral note as a valid Playwright status.
- `/build` end-of-cycle records Playwright status (local pass or CI-deferral).
- `.agents/skills/{spec,build,ship,audit-docs,uat}` symlink to `.claude/skills/*` via `scripts/link-agent-skills.sh`, run by `install-hooks.sh` — so Codex reads canonical.
- CLAUDE.md wording (testing gates, preflight checklist, `/ship` para, harmony) reflects the CI-defer policy + canonical skill link.

**Non-goals:** weakening the merge guarantee. CI `Playwright E2E` remains a required protected check; a CTO never merges on red. This only moves *where* Playwright runs for constrained harnesses, not whether it gates.

**Why safe:** branch protection requires `Playwright E2E` green before merge. Local Playwright was belt-and-suspenders; for harnesses that can't run it, the suspenders (CI) still hold the merge.

## Tasks

- [x] Task 1 — `/ship` Step 1a/1b: portable gate mandatory, Playwright best-effort with CI-defer.
- [x] Task 2 — `/build` end-of-cycle: record Playwright status (pass or CI-defer).
- [x] Task 3 — `scripts/link-agent-skills.sh` + wire into `install-hooks.sh`; CLAUDE.md docs.
- [x] Task 4 — Operationally relink live checkouts (main + Codex worktree) + verify + ship.

## Implementation

- Task 1: `.claude/skills/ship/SKILL.md` Step 1a (accepts CI-defer note) + Step 1b (split portable gate from best-effort Playwright with three outcomes: pass→proceed, fail→stop, env-can't-run→defer-to-CI + record).
- Task 2: `.claude/skills/build/SKILL.md` "After the last task" step 1b records Playwright status.
- Task 3: new `scripts/link-agent-skills.sh` (idempotent, symlinks the 5 workflow skills `.agents/skills → .claude/skills`); `install-hooks.sh` calls it; CLAUDE.md testing-gates row, `/ship` preflight checklist, `/ship` para, "One canonical skill set" harmony bullet, scripts list updated.
- Task 4: see Verification.

## Verification

- `bash scripts/link-agent-skills.sh` — links the 5 workflow skills (output recorded at ship time).
- `bash scripts/test-hooks.sh` — hooks behave.
- Pure-docs/config cycle: no `app/**`/`components/**`/`lib/**` diff → Playwright + preview-verify skipped per the pure-docs rule. Playwright: N/A (no code surface; this cycle is the gate fix itself).
- This cycle dog-foods nothing new at merge — CTO self-merge on green CI.

## Ship Notes

- **No migrations, no env vars.** Skills + scripts + docs only.
- **Operational follow-up:** run `bash scripts/link-agent-skills.sh` in any existing checkout/worktree where Codex runs (main checkout + `.codex/worktrees/*`) so its `.agents/skills` points at canonical. New worktrees get it via `install-hooks.sh` automatically.
- **Codex unblock:** after this merges + relink, Codex's `/ship` reads the fixed Step 1b → records the CI-deferral for Playwright → opens the PR. CI `Playwright E2E` still gates the merge.
- **Rollback:** `git revert` the cycle commit; re-run the linker is harmless.
