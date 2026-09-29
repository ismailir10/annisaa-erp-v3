# Vercel: one staging deployment, no per-PR previews

## Context

The user asked (2026-09-29): *"let's just have one staging vercel deployment so it wont deploy on every pr … i dont want to pay vercel so we need to be efficient"*.

Today Vercel builds every pushed branch. Each `feat/*` / `claude/*` / dependabot push and every PR update produces a preview build, even though the pre-merge gate is the four GitHub CI checks plus local demo-auth verification. On a busy day (the 2026-09-29 fix batch opened nine PRs, most rebuilt 3–5 times after staging merges) that is dozens of throwaway builds on a Hobby project.

The workflow's one real consumer of per-PR previews was the **signed-in preview** verification route in `.claude/skills/ship/SKILL.md`, used for auth-impacting changes (Google login, OAuth, session, cookies, auth guards). That route also required browser access to the user's signed-in profile, which headless cloud harnesses do not have. PRs that needed it sat with `needs-preview-verify`.

## Spec

Acceptance:
- [x] Vercel builds only `staging` and `main`. Every other branch is skipped at the Ignored Build Step, before it spends build minutes. The mechanism is committed in the repo (`vercel.json` `ignoreCommand` → `scripts/vercel-ignore.sh`), not a dashboard toggle, so it is reviewable and reverts with the PR.
- [x] The script follows Vercel's contract (exit 1 = build, exit 0 = skip) and is unit-tested for `staging`, `main`, feature/claude/dependabot branches, look-alike names (`staging-hotfix`, `mainline`) and an unset ref.
- [x] The auth-impacting route moves from "signed-in PR preview before merge" to "local demo-auth verification before merge, then a signed-in check on the staging deployment right after merge". `needs-staging-verify` marks the merged PR until that check passes, and `/ship --to-main` refuses to promote while any merged PR carries it. Production is never reached by an auth change that has not been signed-in-verified somewhere.
- [x] CLAUDE.md, the ship and build skills, and the runbooks no longer point at PR preview URLs. `scripts/wait-preview-ready.sh` (polls a PR for its preview URL) is deleted as dead.

Non-goals:
- Changing Vercel project settings through the API or dashboard. The repo file is enough, and it overrides the dashboard's Ignored Build Step.
- Env-var layout. The staging deployment keeps using Vercel's *Preview* environment variables.
- The `/uat` skill, which already targets the staging URL.

Assumptions:
- Vercel's documented `ignoreCommand` contract: exit 0 skips, exit 1 builds, and `VERCEL_GIT_COMMIT_REF` holds the branch name. The existing `scripts/vercel-build.sh` already relies on the same variable.
- The four required GitHub checks do not include a Vercel status, so a skipped (cancelled) Vercel deployment on a PR cannot block merges.

## Tasks

- [x] 1. Add `scripts/vercel-ignore.sh` plus a Vitest test, wire `ignoreCommand` in `vercel.json`, and correct the `scripts/vercel-build.sh` header comment.
- [x] 2. Rewrite the verification routes in `.claude/skills/ship/SKILL.md`: signed-in staging after merge, the `needs-staging-verify` label, and a `--to-main` refusal. Update CLAUDE.md ship rules and testing gates, the build skill's Ship Notes bullet, `docs/runbooks/environments.md` and `docs/runbooks/pilot-cross-role-test-scenarios.md`. Delete `scripts/wait-preview-ready.sh`.

## Implementation

- Subagent plan: inline, no fan-out. The change is one 20-line script, one config key and targeted doc edits to files the driver had already read for the design decision. A subagent would re-read the same files for no saving.
- Task 1: `scripts/vercel-ignore.sh` (new) switches on `VERCEL_GIT_COMMIT_REF`: exit 1 for `staging` or `main`, exit 0 otherwise. `scripts/__tests__/vercel-ignore.test.ts` (new) spawns it under each ref. `vercel.json` gets `"ignoreCommand": "bash scripts/vercel-ignore.sh"`. `scripts/vercel-build.sh` loses its stale "preview branches use the staging DB" comment; its `*)` arm is now documented as a safety net.
- Task 2:
  - `.claude/skills/ship/SKILL.md`: the merge-gate note, the Preflight route list, Step 3.0 (new *Signed-in staging* post-merge procedure), Step 3a (wait for the staging deployment rather than a PR preview), 3b–3f wording, the 4a/4b/4c fix loop (local route only), Step 5 and the post-ship checklist, and `--to-main` step 3 (refuses while `needs-staging-verify` PRs exist; later steps renumbered).
  - `CLAUDE.md`: the ship rules, including a new "Vercel builds only staging and main" rule; orchestration step 6; the Testing gates row and paragraph.
  - `.claude/skills/build/SKILL.md`: the Ship Notes bullet.
  - Runbooks: `environments.md` and `pilot-cross-role-test-scenarios.md`.
  - `scripts/wait-preview-ready.sh` deleted. Its only reference was ship Step 3a.

## Verification

- Route: build/CI config plus a new script, so not documentation-only. There is no app runtime change: the script runs only inside Vercel's build step. Local verification = the script's unit test across every branch shape, plus the full gates. No browser flow exists to walk, and there is no frontend diff, so the design-system check is not applicable.
- `npx vitest run scripts/__tests__/vercel-ignore.test.ts`: 8/8 pass (staging and main build; feat/claude/dependabot/`staging-hotfix`/`mainline`/unset skip).
- Gates at source SHA base 35602b4 + this diff: `npm run build` exit 0; `npx vitest run` → `Test Files  473 passed | 2 skipped (475)`, `Tests  4349 passed | 42 todo (4391)`. `npx eslint` on the new test is clean; `npx tsc --noEmit` is clean. `bash scripts/audit-docs.sh` → `13 ok, 1 warn, 0 fail` (the warn is the existing ADR-age notice).
- Playwright: the diff touches no app, e2e or runtime code, so local Playwright was skipped. The required CI `Playwright E2E` check gates the merge.
- Post-merge proof: the next feature-branch push should show its Vercel deployment as skipped ("Ignored Build Step"), and the staging deployment of this PR's merge commit should build normally.

## Ship Notes

- Migrations: none. Env vars: none.
- **Takes effect per branch.** Vercel reads `vercel.json` from the commit it is building, so branches cut from staging before this merge still build previews until they merge staging in.
- Workflow change for everyone: auth-impacting PRs now merge after local verification and get their signed-in check on staging right after merge (`needs-staging-verify` until then). `/ship --to-main` refuses while any merged PR carries that label.
- To get a one-off preview for a risky branch anyway: `vercel deploy` from the CLI (the ignore step only applies to git-triggered builds), or temporarily add the branch to the `case` in `scripts/vercel-ignore.sh`.
- Rollback: revert this PR. Vercel then builds every branch again.
