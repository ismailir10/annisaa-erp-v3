---
name: spec
description: Start a new development cycle. Creates a single cycle doc (docs/cycles/YYYY-MM-DD-<slug>.md) with Context, Spec, and Tasks sections before any code is written. Folds in spec-driven-development, planning-and-task-breakdown, and idea-refine from the upstream agent-skills plugin. Use when beginning any non-trivial feature, bug fix, or change.
disable-model-invocation: true
---

# /spec — define + plan in one step

You are starting a new development cycle. This command produces **one** artifact: `docs/cycles/YYYY-MM-DD-<slug>.md`. No scratch files, no sibling planning docs.

## Step 0: Canonical entry

The user's expected entry for a new cycle is a single sentence:

> `you are product-builder, <what to build>`

When you see this (or an equivalent: "act as product-builder, …", "product-builder mode, …"), immediately:

1. Rewrite `.claude/session-role` with `role=product-builder` and your own model ID.
2. If you are in the main checkout, follow the `SessionStart` hook's instructions: derive a kebab-case slug from the request, run `bash scripts/setup-worktree.sh <slug>`, `EnterWorktree` into `.worktrees/<slug>`, rewrite `.claude/session-role` inside the worktree.
3. Then proceed with Preflight and Step 1 on the user's original request — no extra confirmation needed for the role switch itself.

The user should never have to run `setup-worktree.sh` or `install-hooks.sh` by hand.

## Preflight

Run these checks first. If any fails, stop and surface the error.

1. **Session role set?** Read `.claude/session-role`. If missing, stop and use `AskUserQuestion` to ask the user whether this session is `cto` or `product-builder` — include your own model name in the question. Write the file. Do not proceed until it exists.
2. **Worktree isolation?** If `role=product-builder`, verify you are in a git worktree (not the main checkout). Check: `git rev-parse --git-dir` must differ from `git rev-parse --git-common-dir`. If you are in the main checkout, stop and tell the user to create a worktree:
   ```
   git worktree add .worktrees/<slug> -b feat/<slug>
   cd .worktrees/<slug>
   ./scripts/install-hooks.sh
   ```
   Claude Code sessions can use the `EnterWorktree` tool instead. `cto` sessions work in the main checkout — no worktree needed.
3. **Hooks installed?** Check `.githooks/.installed`. If missing, tell the user to run `scripts/install-hooks.sh` first.
4. **Branch hygiene?** Run `git branch --show-current` and `git status --porcelain`.
   - **On `staging` or `main` with a dirty tree:** stop and print a clear error: *"You're on <branch> with uncommitted changes. Stash or resolve them first: `git stash -m 'description'`."* Do not proceed.
   - **On `staging` or `main` with a clean tree:** auto-create a feature branch from latest remote:
     ```bash
     git fetch origin staging
     git checkout -b feat/<slug> origin/staging
     ```
     Print: *"Created feat/<slug> from origin/staging."* Then proceed.
   - **Already on `feat/*`:** proceed silently — you're already where you should be.
   - **On any other branch:** warn the user and ask whether to continue or switch.
5. **Current cycle already open?** Look at the most recent `docs/cycles/*.md`. If its **Ship Notes** section is empty and its **Tasks** section has unchecked boxes, that cycle is still in progress — ask the user whether to continue it or start a new one.

## Step 1: Understand the request (optionally refine)

If the user's request is vague ("make it faster", "clean up parent portal", or a one-liner like "you are product-builder, fix attendance"), invoke **`superpowers:brainstorming`** to turn it into a concrete goal before writing the cycle doc. Capture the refined problem statement in the cycle doc's `## Context` section. The upstream `agent-skills:idea-refine` stays available as a fallback if `superpowers:brainstorming` is unavailable.

If the request is already concrete, skip brainstorming.

## Step 2: Explore before specifying

Use the `Explore` subagent (or direct `Glob`/`Grep` for small targeted work) to understand the relevant parts of the codebase. Actively look for:
- Existing utilities and patterns you can reuse
- Files that will need to change
- Prior cycles that touched the same area (check `docs/cycles/`)

Also check `docs/uat/reports/` for UAT reports whose area overlaps the spec target. If any exist, read the most recent matching report and apply the **staleness rule**: if the report is older than 60 days OR older than the most recent `docs/cycles/` entry touching the same files, mark its findings as *"possibly stale — verify before acting"* in the Context section rather than treating them as fact. For fresh reports, surface any **blocker** or **major** findings into the cycle doc's `## Context` as explicit inputs. Ignore minors. When staging the cycle doc for commit, also `git add -f` the consumed report so it enters git history alongside the cycle that used it.

Do **not** start writing code. This is the define phase.

## Step 3: Write the cycle doc

1. Pick a kebab-case slug (2–4 words). Create `docs/cycles/$(date +%Y-%m-%d)-<slug>.md` with the six-section template below.
2. Fill `## Context` — one paragraph: the problem + intended outcome. Include why it matters.
3. Apply **`agent-skills:spec-driven-development`** to fill `## Spec`:
   - Acceptance criteria as a checklist
   - Non-goals (what this cycle will *not* touch)
   - Assumptions you are making — surface them for the user to correct
4. Apply **`superpowers:writing-plans`** to fill `## Tasks`:
   - Ordered list of atomic tasks, each committable independently
   - Each task has a one-line acceptance criterion
   - Mark dependencies explicitly so `/build` can classify independent vs. sequential tasks for subagent dispatch
5. Leave `## Implementation`, `## Verification`, `## Ship Notes` empty — they are owned by `/build` and `/ship`.

### Cycle doc template

```markdown
# <Cycle Title>

## Context
<one paragraph: problem + intended outcome>

## Spec
<acceptance criteria as a checklist>

## Tasks
<ordered, atomic, each is a checkbox with acceptance line>

## Implementation
<filled by /build — per-task bullet of files touched + one-line summary>

## Verification
<filled by /build — gate output, test names, manual smoke notes>

## Ship Notes
<filled by /ship — migrations, env vars, manual steps, rollback plan>
```

## Step 4: Present for approval

Show the user the cycle doc's Context + Spec + Tasks sections and ask for confirmation before `/build` runs. Surface assumptions explicitly:

> **Assumptions I'm making:**
> 1. [assumption]
> 2. [assumption]
> → Correct me now or `/build` will proceed with these.

## Rules

- **One file only.** Never create `SPEC.md`, `PLAN.md`, or any other sibling markdown. The pre-commit hook will reject anything outside the allowlist.
- **No implementation.** `/spec` writes the doc and stops. `/build` does the work.
- **Reuse first.** If exploration finds existing utilities that solve part of the problem, note them in the task list (`reuse X from lib/...`) rather than re-implementing.
