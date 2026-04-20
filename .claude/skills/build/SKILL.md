---
name: build
description: Execute the tasks in the current development cycle doc. Loops over tasks one at a time, implementing, testing, reviewing, and committing each separately with gates enforced between tasks. Folds in incremental-implementation, test-driven-development, source-driven-development, frontend-ui-engineering, api-and-interface-design, security-and-hardening, browser-testing-with-devtools, debugging-and-error-recovery, code-review-and-quality, and code-simplification from the upstream agent-skills plugin. Use after /spec has created a cycle doc.
disable-model-invocation: true
---

# /build — build + test + review, looping over tasks

You are executing the tasks from the current cycle doc. This is a **per-task loop**, not a monolithic build. Each task produces its own commit, with per-task gate enforcement and per-task doc updates.

## Preflight

1. **Session role set?** Check `.claude/session-role`. If missing, stop and ask the user.
2. **Worktree isolation?** If `role=product-builder` and `git rev-parse --git-dir` equals `git rev-parse --git-common-dir` (you're in the main checkout, not a worktree), stop and tell the user to create a worktree first. See `/spec` preflight step 2 for the commands.
3. **Hooks installed?** Check `.githooks/.installed`. If missing, tell the user to run `scripts/install-hooks.sh`.
4. **Current cycle doc?** Find the most recent `docs/cycles/*.md`. If its Tasks section is empty or missing, tell the user to run `/spec` first.
5. **Working tree clean?** If not, ask whether to commit existing work, stash it, or abort. Never silently inherit someone else's dirty state.

## Planning — subagent dispatch decision

Before entering the loop, invoke **`superpowers:subagent-driven-development`** to classify the cycle's tasks:

- **Independent tasks** (no shared files, no sequential deps) → dispatch in parallel via subagents.
- **Sequential tasks** (shared state, ordering matters) → execute inline in the loop below.

Record the classification as a bullet in the cycle doc's `## Implementation` section before starting:
`- Subagent plan: tasks [N,M] dispatched in parallel; tasks [X,Y,Z] sequential.`

If all tasks are sequential, note that and proceed.

## The task loop

For each unchecked task in the cycle doc's `## Tasks` section, in order:

### 1. Load context
Apply **`agent-skills:context-engineering`**. Read only the files this task needs. Check prior cycles in `docs/cycles/` if the area was recently touched.

### 2. Verify against official docs (when relevant)
If the task uses a framework, library, or API whose current behavior you're not 100% sure of, apply **`agent-skills:source-driven-development`**:
- Use Context7 or the project's skills (`nextjs`, `supabase`, `shadcn`, etc.) to fetch current docs.
- Never guess API shapes. Ground every non-trivial decision in a source.

### 3. Implement the slice
Apply **`agent-skills:incremental-implementation`**:
- One vertical slice, one test, one concern per task.
- Touch only files the task requires. No orthogonal "cleanup".

Auto-invoke domain skills based on what you're touching:
- `app/components/**`, `app/*/page.tsx` → **`agent-skills:frontend-ui-engineering`** (Shadcn-first, accessibility, empty/loading/error states)
- `app/api/**` → **`agent-skills:api-and-interface-design`** (pagination, Zod validation, standard response shape)
- `app/api/**`, `lib/auth*`, `middleware.ts` → **`agent-skills:security-and-hardening`** (tenant filter, role check, rate limiting, Zod)

### 4. Test the slice
Apply **`agent-skills:test-driven-development`**:
- Write a test that proves the slice works. Prefer failing-first when practical.
- For UI, apply **`agent-skills:browser-testing-with-devtools`** where useful.

### 5. Run gates
```bash
npm run build && npx vitest run
```
If either fails, apply **`agent-skills:debugging-and-error-recovery`**:
- Read the error. Diagnose the root cause. Don't retry blindly.
- Fix and re-run gates until they pass.

Do **not** move to the next task until this task's gates pass.

### 6. Review and simplify (mandatory agent pass)

Before committing, dispatch the **`feature-dev:code-reviewer`** agent on the task's staged diff. Prompt must include: task title, files touched, cycle doc path. Agent returns high-confidence issues only.

- **Blocker / high-confidence bug or security issue** → fix in this task, re-run gates, re-review. Do not commit until clean.
- **Low-confidence or style nits** → note in the cycle doc's Implementation bullet; do not block the commit.

Then apply **`agent-skills:code-simplification`** inline — reduce complexity without changing behavior.

For security-sensitive diffs (`app/api/**`, `lib/auth*`, `middleware.ts`, or tenant/role logic), also dispatch **`superpowers:code-reviewer`** in parallel with `feature-dev:code-reviewer`. Both must clear before commit.

### 7. Update the cycle doc
Edit the cycle doc:
- Mark the task's checkbox complete.
- Append a bullet to `## Implementation`: `- Task N: <title> — <files touched> — <one-line summary>`
- Append a bullet to `## Verification`: `- Task N: gates passed (build + vitest run), <manual smoke notes if any>`

Do not create any other markdown file.

**JTBD library maintenance:** If this task added, removed, or materially changed a user-facing capability in admin/teacher/parent portal, update the relevant `docs/uat/jobs/<portal>.md`. Add, remove, or edit affected JTBD entries. Bump the "Last audited" date. This is manual discipline — no hook enforces it, but stale jobs make `/uat` produce stale reports.

### 8. Commit
Create **one commit for this task**. Subject starts with the task title. Body is brief — the cycle doc has the details. The `prepare-commit-msg` hook auto-appends `Model-Trailer` and `Role`, but include them explicitly when building the HEREDOC as a belt-and-suspenders measure:

```bash
git add <files-touched> docs/cycles/<current-cycle>.md
git commit -m "$(cat <<'EOF'
<type>(<scope>): <task title>

<short body referencing the cycle doc if needed>

Cycle: docs/cycles/<current-cycle>.md
EOF
)"
```

Then move to the next task.

## After the last task

1. Run the full gates one final time: `npm run build && npx vitest run`.
2. Fill `## Ship Notes` in the cycle doc with anything the shipper needs to know:
   - Database migrations to run
   - New env vars
   - Manual smoke-test steps on preview URL
   - Rollback plan if the change is risky
3. Commit the Ship Notes update as the final commit of the cycle.
4. Hand off to `/ship`.

## Rules

- **One commit per task.** Not one per cycle. Commits carry the task title.
- **Gates must pass between tasks.** No "I'll fix it in the next task" — fix it now.
- **Cycle doc is the only markdown you touch.** If you feel the urge to create `NOTES.md`, resist — the pre-commit hook will reject it anyway.
- **Scope discipline.** Touch only what the tasks require. Don't refactor adjacent code.
- **If the spec is wrong, stop.** Don't silently adjust the spec — ask the user or update `/spec`'s output.
- **No commit without a code-reviewer pass.** Every task commit must be preceded by a `feature-dev:code-reviewer` agent pass on the staged diff. Security-sensitive diffs require `superpowers:code-reviewer` too. Unreviewed commits violate the workflow and must be amended.
