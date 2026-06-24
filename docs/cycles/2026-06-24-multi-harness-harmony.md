# Multi-Harness Harmony — shared setup, model tiering, role-scoped preview-verify

## Context

Three AI harnesses now work this repo: **Claude** (cto), **Codex** (cto), **opencode/glm** (product-builder). Problems found:

1. **Config drift.** `AGENTS.md` (read by Codex + opencode) was a stale hand-mangled copy of `CLAUDE.md` with broken paths (`.Codex/skills/…` instead of `.claude/skills/…`) and nonsense trailers (`Codex-opus-4-7`). Two manuals diverging silently.
2. **No model tiering encoded.** The "expensive driver never does cheap work" discipline lived nowhere. Cycles risked running Opus 4.8 / gpt-5 on grep sweeps and per-module audits — burning reasoning tokens on dirty work.
3. **No mandatory subagent fan-out.** Nothing required a feature/audit cycle to decompose across parallel cheap subagents.
4. **Preview-verify accounts unspecified.** `/ship` Step 3 said "the user's signed-in Google session" with no role→account mapping, and no routing for harnesses that lack Chrome MCP.
5. **Duplicate role files.** `.codex/session-role` (untracked, harness-local) duplicated `.claude/session-role`; `check-role.sh` only ever managed the `.claude/` path, so `.codex/session-role` was dead and confusing.

## Spec

**Acceptance:**
- `AGENTS.md` is a symlink to `CLAUDE.md` — one canonical manual, edits propagate to all three harnesses.
- `CLAUDE.md` has a **Harness Roster & Model Tiering** section: per-harness driver/dirty-work tiers, the expensive-driver rule, mandatory subagent fan-out (with the UI-audit worked example), and parallel-harmony rules.
- `/build` enforces model-tiered subagent fan-out.
- `/ship` preview-verify uses the three role-scoped Google accounts from `.claude/verify-accounts.json` and routes by harness Chrome-MCP capability (opencode hands to CTO; Codex hands to Claude if it lacks Chrome MCP).
- `.codex/session-role` deprecated in favor of `.claude/session-role` (the one path `check-role.sh` manages).

**Model tiering (the core decision):**

| Harness | Role | Driver (reasoning) | Dirty-work subagents | Down-tier? |
|---|---|---|---|---|
| Claude | cto | Opus 4.8 | Sonnet 4.6 / Haiku 4.5 | yes (Task `model` override) |
| Codex | cto | gpt-5 high reasoning | gpt-5 low/minimal effort | yes (lower-effort subagents) |
| opencode | product-builder | glm-5.2 | glm-5.2 (no cheaper tier) | no — gated by mandatory CTO review |

**Non-goals:** changing CI checks, branch protection, or the 3-step loop shape. No code (`app/**`/`lib/**`) changes — docs + skills + config only.

**Assumptions (from user):** only Claude + Codex can spawn cheaper-model subagents; opencode always glm-5.2 and product-builder only, every cycle CTO-reviewed; Chrome-MCP capability per non-Claude harness unverified → route accordingly.

## Tasks

- [x] Task 1 — Symlink `AGENTS.md` → `CLAUDE.md`; deprecate `.codex/session-role`.
- [x] Task 2 — Add **Harness Roster & Model Tiering** section to `CLAUDE.md` (+ session-role/doc-maintenance touch-ups).
- [x] Task 3 — Add `.claude/verify-accounts.json` + wire `/ship` Step 3 to role-scoped accounts and harness capability routing.
- [x] Task 4 — Add model-tiered mandatory subagent fan-out to `/build`.
- [x] Task 5 — Verify (hooks pass) + commit.

## Implementation

- Task 1: `AGENTS.md` → symlink to `CLAUDE.md` (was a 19KB stale broken copy). `.codex/` is untracked harness-local state and absent from worktrees; live main-checkout `.codex/session-role` symlinked to `../.claude/session-role` operationally (not committed — `.codex/` is gitignored/untracked).
- Task 2: New `## Harness Roster & Model Tiering` section in `CLAUDE.md`. Updated `### Session role` (single `.claude/session-role` path, model example `claude-opus-4-8`) and the Documentation Maintenance "CLAUDE.md owns" row.
- Task 3: `.claude/verify-accounts.json` (admin/teacher/parent → 3 Google accounts). `/ship` SKILL Step 3 gains a harness-capability gate (3.0) and 3d sign-in now picks the role-scoped account.
- Task 4: `/build` "Planning" step rewritten to mandate model-tiered fan-out with the per-harness tier map.

## Verification

- `bash scripts/test-hooks.sh` — hooks behave (see output recorded at ship time).
- `AGENTS.md` resolves to canonical (`head -1 AGENTS.md` == CLAUDE.md title). Confirmed.
- Pure-docs/config cycle: **no** `app/**`/`components/**`/`lib/**` diff → Playwright + preview-verify skipped per CLAUDE.md pure-docs rule. No `design-system` frontend-gate token needed (no frontend diff).
- `npm run build` not required — zero code surface touched.

## Ship Notes

- **No migrations, no env vars.** Docs + `.claude/` skills/config + symlink only.
- **Rollback:** `git revert` the cycle commit; `AGENTS.md` symlink reverts to the prior tracked file blob.
- **Operational follow-up (not in repo):** each live harness checkout's `.codex/`/opencode local config should be left as-is; the canonical manual (via `AGENTS.md` symlink) now drives all three. Sign the three Google accounts into each shipping harness's Chrome profile before `/ship`.
- **Preview-verify for THIS cycle:** skipped — pure-docs/config, no UI surface.
