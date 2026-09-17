# Workflow Autonomy + Dead-Mechanism Sweep

## Context

The 3-step loop (`/spec` → `/build` → `/ship`) required the user to type each command. That was never a design choice — it was one frontmatter line, `disable-model-invocation: true`, on all five project skills, which makes a skill user-invocable only. The goal of this cycle is for the agent to drive the loop from a plain request, with a single human gate after the spec.

Auditing for that surfaced a worse class of problem: **mechanisms that are documented, believed, and silently dead.** The repo learned this once already — `/audit-docs` used to be 165 lines of prose a model was supposed to follow, and it silently did not run while docs drifted for weeks. Three more instances were live:

1. The `agent-skills` plugin is **disabled** in `~/.claude/settings.json` (`"agent-skills@addy-agent-skills": false`), yet `/spec` and `/build` invoked it **12 times**. Most of `/build`'s stated discipline chain — TDD, incremental-implementation, context-engineering, security-and-hardening, source-driven-development, code-simplification — resolved to nothing.
2. `check-role.sh` and `sync-staging.sh` wrote their assistant-directed instructions to **stderr**, which Claude Code drops from `SessionStart` context (only stdout is folded in). Observed directly: the session role was 193h stale and its own staleness warning never surfaced; neither did "staging is 3 commits behind, working tree dirty". Two safety mechanisms, invisible.
3. `/build`'s standards-loading table keyed on **`middleware.ts`**, renamed to `proxy.ts` back in the Next.js 16 migration. Editing the auth/tenant middleware entry therefore loaded no `security.md` and triggered no `superpowers:code-reviewer`.

Granting the loop more autonomy while those holes were open would have compounded them. So this cycle closes them first, deletes a role path that has never once been exercised, adds checks that make this class of rot fail CI, and only then flips the switch.

**Decisions taken with the user before specifying:** gate after `/spec` only · code change = cycle, everything else answered inline · remap dangling refs to installed equivalents rather than enabling a harness-local plugin · delete the product-builder path.

## Spec

- [ ] The agent starts a cycle on its own when a request would change tracked code, and answers inline when it would not — the user never types `/spec`, `/build`, or `/ship`.
- [ ] Exactly one human gate per cycle: after `/spec` presents Context / Spec / Tasks and its assumptions. Approval there is durable authorization for that cycle's PR and CTO self-merge, and nothing beyond it.
- [ ] `/ship --to-main` is never self-invoked; promotion to production stays a typed instruction.
- [ ] Zero unresolvable skill references remain in `.claude/skills/*/SKILL.md` — every `plugin:skill` token names an installed, enabled skill.
- [ ] Every assistant-directed message from a `SessionStart` hook script reaches the assistant's context (stdout, not stderr).
- [ ] No project doc, skill, or standard references `middleware.ts`; `proxy.ts` is matched by the security and API standards-loading rules.
- [ ] The product-builder role is gone from CLAUDE.md, all skills, all scripts, and the git hooks. `.claude/session-role` survives (it feeds `Model-Trailer:` / `Role:`).
- [ ] `scripts/audit-docs.sh` fails on: an unresolvable skill reference, a standards-table path that does not exist, and an `Assistant:`-directed hook message sent to stderr.
- [ ] `/ship` preflight hard-requires the `Subagent plan:` bullet, the same way it already hard-requires Playwright status.
- [ ] `bash scripts/test-hooks.sh` and `bash scripts/audit-docs.sh` both pass.

**Non-goals.** Pruning `settings.local.json`'s 202 permission entries. Re-vendoring `better-*` (all seven resolve correctly). Enabling the `agent-skills` plugin — rejected as harness-local: Codex and opencode would still get nothing. Any change to `app/`, `lib/`, or `components/`.

**Assumptions.** Claude Code folds only a `SessionStart` hook's stdout into context (verified empirically this session, not from documentation). `superpowers:test-driven-development` and `superpowers:systematic-debugging` are adequate replacements for the two agent-skills equivalents. Deleting the product-builder path is safe because it has zero commits in the repo's history.

## Tasks

- [ ] **T1 — SessionStart hooks reach the assistant.** Route every `Assistant:`-directed message in `scripts/check-role.sh` and `scripts/sync-staging.sh` to stdout. *Accept: both scripts, run with `2>/dev/null`, still print their guidance.*
- [ ] **T2 — `middleware.ts` → `proxy.ts`.** Six references across `.claude/skills/build/SKILL.md` and `.claude/standards/{api,security}.md`. *Accept: `grep -rn 'middleware\.ts' .claude/ CLAUDE.md` returns only the CLAUDE.md line that documents the rename.*
- [ ] **T3 — Remap the 12 dangling `agent-skills:*` references.** Bodies and `description:` frontmatter across `spec`, `build`, `ship`, `uat`. Add `superpowers:verification-before-completion` to `/build`'s end-of-cycle gate and `/ship`'s preflight. *Accept: no `agent-skills:` token remains; every surviving `plugin:skill` token resolves to an enabled skill.*
- [ ] **T4 — Delete the product-builder path.** ~28 references across CLAUDE.md, the four skills, `check-role.sh`, `setup-worktree.sh`, `test-hooks.sh`, `.githooks/commit-msg`. *Accept: `grep -rn 'product-builder'` is empty repo-wide; `bash scripts/test-hooks.sh` passes.*
- [ ] **T5 — Roster de-duplication + trailer nit.** Replace `/build`'s drifted copy of the model-tier table with a link to CLAUDE.md § Harness Roster; reconcile `claude-fable-5`; make `prepare-commit-msg`'s `Co-Authored-By:` follow the actual model. *Accept: the tier table exists in exactly one file.*
- [ ] **T6 — Make the rot fail CI.** Three checks in `scripts/audit-docs.sh` (skill references resolve · standards-table paths exist · no `Assistant:` message on stderr) plus the `Subagent plan:` preflight in `/ship`. *Accept: each new check produces a `fail` row when its defect is reintroduced, and the suite exits 0 once reverted.*
- [ ] **T7 — Switch autonomy on.** Remove `disable-model-invocation` from `spec`/`build`/`ship`, tighten their descriptions, add the Orchestration router to CLAUDE.md, harden `/spec`'s Step 4 into a hard stop. *Accept: `audit-docs.sh` exits 0 and the router table is present in always-loaded context.* **Last, deliberately — autonomy switches on only once the checks that police it are green.**

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet-5; T6 (three new `audit-docs.sh` checks) dispatched to a subagent as a self-contained, well-specced bash slice. T1–T5 and T7 kept on the driver: they are interlocking prose edits to the workflow's own definition, where a subagent would need the entire plan as context and a wrong edit silently weakens the rules that police the rest. Fan-out there would cost more than it saves — the exception CLAUDE.md § Planning allows, invoked deliberately.
- T1: SessionStart hooks reach the assistant — `scripts/check-role.sh`, `scripts/sync-staging.sh` — every `Assistant:`-directed message moved from stderr to stdout, with a header comment recording why (Claude Code drops a zero-exit hook's stderr) so the next editor does not "tidy" it back.

## Verification

- T1: `bash scripts/check-role.sh 2>/dev/null` and `bash scripts/sync-staging.sh 2>/dev/null` both print their guidance; `grep -c '>&2'` returns 0 for each. Before this task both printed nothing on stdout, which is why a 193h-stale role file never surfaced.

## Ship Notes

<!-- filled by /ship -->
