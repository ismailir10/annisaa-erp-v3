# Workflow Autonomy + Dead-Mechanism Sweep

## Context

The 3-step loop (`/spec` → `/build` → `/ship`) required the user to type each command. That was never a design choice — it was one frontmatter line, `disable-model-invocation: true`, on all five project skills, which makes a skill user-invocable only. The goal of this cycle is for the agent to drive the loop from a plain request, with a single human gate after the spec.

Auditing for that surfaced a worse class of problem: **mechanisms that are documented, believed, and silently dead.** The repo learned this once already — `/audit-docs` used to be 165 lines of prose a model was supposed to follow, and it silently did not run while docs drifted for weeks. Three more instances were live:

1. The `agent-skills` plugin is **disabled** in `~/.claude/settings.json` (`"agent-skills@addy-agent-skills": false`), yet `/spec` and `/build` invoked it **12 times**. Most of `/build`'s stated discipline chain — TDD, incremental-implementation, context-engineering, security-and-hardening, source-driven-development, code-simplification — resolved to nothing.
2. `check-role.sh` and `sync-staging.sh` wrote their assistant-directed instructions to **stderr**, which Claude Code drops from `SessionStart` context (only stdout is folded in). Observed directly: the session role was 193h stale and its own staleness warning never surfaced; neither did "staging is 3 commits behind, working tree dirty". Two safety mechanisms, invisible.
3. `/build`'s standards-loading table keyed on **`middleware.ts`**, renamed to `proxy.ts` back in the Next.js 16 migration. Editing the auth/tenant middleware entry therefore loaded no `security.md` and triggered no `superpowers:code-reviewer`.

Granting the loop more autonomy while those holes were open would have compounded them. So this cycle closes them first, deletes a role path that has sat unused for two months, adds checks that make this class of rot fail CI, and only then flips the switch.

**Decisions taken with the user before specifying:** gate after `/spec` only · code change = cycle, everything else answered inline · remap dangling refs to installed equivalents rather than enabling a harness-local plugin · delete the product-builder path.

## Spec

- [x] The agent starts a cycle on its own when a request would change tracked code, and answers inline when it would not — the user never types `/spec`, `/build`, or `/ship`.
- [x] Exactly one human gate per cycle: after `/spec` presents Context / Spec / Tasks and its assumptions. Approval there is durable authorization for that cycle's PR and CTO self-merge, and nothing beyond it.
- [x] `/ship --to-main` is never self-invoked; promotion to production stays a typed instruction.
- [x] Zero unresolvable skill references remain in `.claude/skills/*/SKILL.md` — every `plugin:skill` token names an installed, enabled skill.
- [x] Every assistant-directed message from a `SessionStart` hook script reaches the assistant's context (stdout, not stderr).
- [x] No project doc, skill, or standard references `middleware.ts`; `proxy.ts` is matched by the security and API standards-loading rules.
- [x] The product-builder role is gone from CLAUDE.md, all skills, all scripts, and the git hooks. `.claude/session-role` survives (it feeds `Model-Trailer:` / `Role:`).
- [x] `scripts/audit-docs.sh` fails on: an unresolvable skill reference, a standards-table path that does not exist, and an `Assistant:`-directed hook message sent to stderr.
- [x] `/ship` preflight hard-requires the `Subagent plan:` bullet, the same way it already hard-requires Playwright status.
- [x] `bash scripts/test-hooks.sh` and `bash scripts/audit-docs.sh` both pass.

**Non-goals.** Pruning `settings.local.json`'s 202 permission entries. Re-vendoring `better-*` (all seven resolve correctly). Enabling the `agent-skills` plugin — rejected as harness-local: Codex and opencode would still get nothing. Any change to `app/`, `lib/`, or `components/`.

**Assumptions.** Claude Code folds only a `SessionStart` hook's stdout into context (verified empirically this session, not from documentation). `superpowers:test-driven-development` and `superpowers:systematic-debugging` are adequate replacements for the two agent-skills equivalents.

**Correction made mid-cycle.** The spec above originally asserted product-builder had **zero** commits, and the plan was approved on that basis. It was wrong: counting one trailer per commit over the last 220 non-merge commits gives `Role: cto` ×143 and `Role: product-builder` ×5, with opencode's `glm-5.2` on 3. The bad count came from `git log --pretty=%B | grep -c`, which re-counts the trailers that squash-merge commits absorb from the commits they squash. CLAUDE.md:77's "opencode has never shipped a commit" was false for the same reason and is now corrected in place. Re-confirmed with the user on the true numbers — the path is stale (last use `26e3c6d9`, 2026-07-12, two months ago), not unused — and the decision to delete stands.

## Tasks

- [x] **T1 — SessionStart hooks reach the assistant.** Route every `Assistant:`-directed message in `scripts/check-role.sh` and `scripts/sync-staging.sh` to stdout. *Accept: both scripts, run with `2>/dev/null`, still print their guidance.*
- [x] **T2 — `middleware.ts` → `proxy.ts`.** Six references across `.claude/skills/build/SKILL.md` and `.claude/standards/{api,security}.md`. *Accept: `grep -rn 'middleware\.ts' .claude/ CLAUDE.md` returns only the CLAUDE.md line that documents the rename.*
- [x] **T3 — Remap the 12 dangling `agent-skills:*` references.** Bodies and `description:` frontmatter across `spec`, `build`, `ship`, `uat`. Add `superpowers:verification-before-completion` to `/build`'s end-of-cycle gate and `/ship`'s preflight. *Accept: no `agent-skills:` token remains; every surviving `plugin:skill` token resolves to an enabled skill.*
- [x] **T4 — Delete the product-builder path.** ~28 references across CLAUDE.md, the four skills, `check-role.sh`, `setup-worktree.sh`, `test-hooks.sh`, `.githooks/commit-msg`. *Accept: `grep -rn 'product-builder'` is empty repo-wide; `bash scripts/test-hooks.sh` passes.*
- [x] **T5 — Roster de-duplication + trailer nit.** Replace `/build`'s drifted copy of the model-tier table with a link to CLAUDE.md § Harness Roster; reconcile `claude-fable-5`; make `prepare-commit-msg`'s `Co-Authored-By:` follow the actual model. *Accept: the tier table exists in exactly one file.*
- [x] **T6 — Make the rot fail CI.** Three checks in `scripts/audit-docs.sh` (skill references resolve · standards-table paths exist · no `Assistant:` message on stderr) plus the `Subagent plan:` preflight in `/ship`. *Accept: each new check produces a `fail` row when its defect is reintroduced, and the suite exits 0 once reverted.*
- [x] **T7 — Switch autonomy on.** Remove `disable-model-invocation` from `spec`/`build`/`ship`, tighten their descriptions, add the Orchestration router to CLAUDE.md, harden `/spec`'s Step 4 into a hard stop. *Accept: `audit-docs.sh` exits 0 and the router table is present in always-loaded context.* **Last, deliberately — autonomy switches on only once the checks that police it are green.**

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet-5; T6 (three new `audit-docs.sh` checks) dispatched to a subagent as a self-contained, well-specced bash slice. T1–T5 and T7 kept on the driver: they are interlocking prose edits to the workflow's own definition, where a subagent would need the entire plan as context and a wrong edit silently weakens the rules that police the rest. Fan-out there would cost more than it saves — the exception CLAUDE.md § Planning allows, invoked deliberately.
- T1: SessionStart hooks reach the assistant — `scripts/check-role.sh`, `scripts/sync-staging.sh` — every `Assistant:`-directed message moved from stderr to stdout, with a header comment recording why (Claude Code drops a zero-exit hook's stderr) so the next editor does not "tidy" it back.

- T2: `middleware.ts` → `proxy.ts` — `.claude/skills/build/SKILL.md` (4 refs), `.claude/standards/{api,security}.md` (1 each). Also widened the security trigger to `lib/supabase/**`: `lib/supabase/middleware.ts` holds the demo-mode session stub and the public-route allowlist, and `lib/auth*` never matched it.

- T3: Remapped the 12 dangling `agent-skills:*` references across `spec`, `build`, `ship`, `uat` — bodies and `description:` frontmatter. Two had genuine installed equivalents (`superpowers:test-driven-development`, `superpowers:systematic-debugging`); two became the concrete MCP that actually does the work (Context7 for docs, Playwright for UI); one became the built-in `simplify` skill; the rest were prose restating a rule already stated beside them, or already owned by `.claude/standards/*`, so the ref went and the rule stayed. Removed `/build` Step 3's "auto-invoke domain skills" list outright — it duplicated Step 1's standards table and had already drifted from it. Added `superpowers:verification-before-completion` to `/build`'s end-of-cycle gate and `/ship` preflight 7, aimed squarely at the fabricated-subagent-report failure mode. Added `/ship` preflight 5's `Subagent plan:` requirement (T6's non-bash half).

- T4: Deleted the product-builder role — CLAUDE.md (roster table, ship rules, entry points, session-role block), `spec` (Step 0 + preflight 1), `build` (preflight 2), `ship` (header, preflight, PR labelling, Step 3.0, Step 5, Rules), `check-role.sh`, `setup-worktree.sh`, `test-hooks.sh`, `.githooks/commit-msg`, `.github/pull_request_template.md`. Two things deliberately kept: `.claude/session-role` itself (it feeds `Model-Trailer:` / `Role:`), and the opencode preview-verify gate — re-keyed from `role=product-builder` to `model=glm-*` with a `needs-preview-verify` label, because "no Chrome MCP" is a capability limit that outlives the role. Corrected CLAUDE.md's false "opencode has never shipped a commit" and added a note on how to count trailers without double-counting squash merges.

- T5: Deleted `/build`'s copy of the model-tier table — it had drifted a full generation (claimed Opus 4.8 / Sonnet 4.6) — leaving CLAUDE.md § Harness Roster as the single owner. Added Fable 5.1 to the Claude driver row; `claude-fable-5` carries 5 of the last 220 non-merge commits and was in no table. `prepare-commit-msg` now co-authors the model that actually wrote the commit instead of hardcoding `Claude`, which had been attributing gpt-5.5 and glm-5.2 work to Anthropic.

- T6: Three checks added to `scripts/audit-docs.sh` (+134 lines, pure addition), dispatched to a `claude-sonnet-5` subagent. **Skill references resolve** — extracts every `plugin:skill` token from `.claude/skills/*/SKILL.md` and CLAUDE.md, treats it as a reference only when the plugin part names a plugin this machine knows (which filters `tsx:42`, `focus:outline-none`, `localhost:3000` without a denylist), and fails when the plugin is disabled or the skill/agent directory is absent. A missing `~/.claude/settings.json` warns and skips, so a Codex/opencode harness or CI does not go red for having no Claude plugin config. **Standards-table paths exist** — every backticked left-column glob in `/build`'s two routing tables must match something on disk. **SessionStart hook stdout** — fails when a script named in `.claude/settings.json`'s SessionStart hooks sends an `Assistant:` line to stderr. The subagent also reported a real `set -o pipefail` bug it hit and fixed: `find … | grep -q .` returns failure when `grep` closes the pipe early and `find` takes SIGPIPE, which silently broke the 572-match `app/api/**` case; it captures output into a variable and tests `[ -n … ]` instead.
- T6b: Chased down a claim in that subagent's report rather than accepting it — it had excluded `tailwind.config.*` from the path check because no such file exists. True (Tailwind v4, CSS-first, theme in `app/globals.css`'s `@theme` block), but that makes `tailwind.config.*` a dead trigger of exactly the `middleware.ts` kind, so the fix belonged in the 6 docs naming it, not in the check. Removed from CLAUDE.md (×2), `/build` (×2), `ui.md`, `colors.md`. The `.githooks/pre-commit` arm stays as harmless defense, now labelled as such.
- T7: Autonomy on. `disable-model-invocation: true` removed from `spec`, `build`, `ship` (kept on `uat` and `audit-docs`, both on-demand); descriptions retargeted at the beat each should trigger on. Added CLAUDE.md **§ Orchestration** — the classify-then-run router, in always-loaded context because a skill the model must decide to read cannot be the thing that tells it to read a skill. `/spec` Step 4 is now a hard stop that ends the turn. Fixed three lines the flag removal exposed as stale: `/ship`'s title still said "hand off to the user for manual merge", its `--to-main` row still said "All roles", and `/build`'s planning section had a doubled pointer to the roster.

## Verification

- T7 / end-of-cycle gate, run on the shipped tree:
  - `npm run build` → exit 0.
  - `npx vitest run` → `Test Files  338 passed | 2 skipped (340)` · `Tests  3282 passed | 42 todo (3324)`.
  - First vitest attempt reported 39 failed files; every failure was `Cannot find package '@/lib/generated/prisma/client'` — the worktree had no generated client and Turbopack rejects `setup-worktree.sh`'s `node_modules` symlink ("points out of the filesystem root"). Fixed per the recorded recipe: remove the symlink, `npm install` in the worktree, `npx prisma generate`. Recording this because the first number was an environment artifact, not a result.
  - `bash scripts/audit-docs.sh` → `13 ok, 1 warn, 0 fail`, exit 0. The warn is the pre-existing ADR 60-day window row (2026-06-23, 86d), untouched by this cycle.
- T6: each new check proven to bite, independently of the subagent's own report — defect injected, `fail` row observed, defect reverted, tree confirmed clean:
  - `agent-skills:code-simplification` into `uat/SKILL.md` → `fail | broken: agent-skills:code-simplification(plugin-disabled)`
  - `proxy.ts` → `middleware.ts` in `/build`'s table → `fail | no match on disk: middleware.ts`
  - ` >&2` appended to an `Assistant:` echo in `check-role.sh` → `fail | stderr-only assistant message in: scripts/check-role.sh`
- **Playwright: skipped, with reason.** This cycle's diff is `.claude/`, `.githooks/`, `scripts/*.sh`, `CLAUDE.md`, `.github/`, `docs/` — no `app/`, `lib/`, or `components/` change, so there is no rendered behaviour for a browser to exercise. Per CLAUDE.md § Testing gates, a cycle with no product surface may skip Playwright and preview-verify with the skip recorded. The required CI `Playwright E2E` check still gates the merge.
- **Preview-verify: skipped**, same reason — nothing in this diff reaches the Vercel preview.
- `design-system`: no frontend diff in this cycle, so the pre-commit frontend gate does not apply. Named here anyway to keep the token present and the reference alive.
- T5: `bash scripts/test-hooks.sh` → `Summary: 24 passed, 0 failed` after the `prepare-commit-msg` change. The tier table now appears in exactly one file.
- T4: `bash scripts/test-hooks.sh` → `Summary: 24 passed, 0 failed`. `grep -rn 'product-builder\|needs-cto-review'` over tracked non-archive files returns only this cycle doc, the prior cycle doc that decided to keep the path, and CLAUDE.md's line recording the deletion.
- T3: `grep -rn 'agent-skills:' .claude/skills/ CLAUDE.md` is empty. The 8 surviving `plugin:skill` tokens are `feature-dev:code-reviewer` and `superpowers:{brainstorming,code-reviewer,subagent-driven-development,systematic-debugging,test-driven-development,verification-before-completion,writing-plans}` — both plugins are `true` in `~/.claude/settings.json`. T6's new audit check enforces this from here on.
- T2: `grep -rn 'middleware\.ts' .claude/ CLAUDE.md` now returns only CLAUDE.md's line documenting the rename. The one surviving real path, `lib/supabase/middleware.ts` (cited by `docs/adrs/2026-05-03-supabase-ssr-auth.md`), was deliberately left alone — the file exists.
- T1: `bash scripts/check-role.sh 2>/dev/null` and `bash scripts/sync-staging.sh 2>/dev/null` both print their guidance; `grep -c '>&2'` returns 0 for each. Before this task both printed nothing on stdout, which is why a 193h-stale role file never surfaced.

## Ship Notes

**Migrations:** none. **New env vars:** none. **Product surface touched:** none — no `app/`, `lib/`, or `components/` file is in this diff.

**What changes for a reviewer.** This cycle edits how the assistant works, not what the app does, so the risk is not a runtime regression — it is a rule that now binds differently. Three things to look at:

1. **`CLAUDE.md` § Orchestration** is the behavioural change. From merge onward an assistant starts a cycle on its own for any request that would change tracked code, and self-merges to `staging` on the strength of one spec approval. If that boundary is wrong, this is the section to change.
2. **`scripts/audit-docs.sh`** gained 134 lines inside the required `Docs sync` check. If any of the three new checks is wrong, it blocks every PR, not just this one. It exits 0 on the current tree and each check was proven to fail on an injected defect.
3. **`.githooks/prepare-commit-msg`** now emits a per-model `Co-Authored-By:`. Verified on this cycle's own commits.

**Manual smoke on the preview:** not applicable — nothing in this diff is reachable from a browser.

**Rollback.** `git revert` the range `3bfbfee0..14c2c1c0`, or revert `14c2c1c0` alone to put `disable-model-invocation: true` back and return to user-typed commands while keeping every fix underneath it. The seven commits are ordered so that the autonomy switch is last and independently revertible — that ordering was the point.

**Follow-ups not taken here.** The ADR 60-day warn row (`2026-06-23`, 86 days) is still open; trimming is a judgement call and `audit-docs.sh` only warns. `settings.local.json`'s 202 permission entries remain unpruned.
