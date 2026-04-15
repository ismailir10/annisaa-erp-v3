# Cycle Doc Helper (shared snippet)

> Referenced by `/spec`, `/build`, and `/ship`. Not a standalone command.

## Finding the current cycle doc

1. List `docs/cycles/*.md` sorted by filename (ISO date prefix makes this correct).
2. The most recent file is the current cycle.
3. If the most recent file's **Ship Notes** section is filled AND there is no active work in progress, the cycle is closed — a new one must be started.
4. If no file matches, no cycle is active.

## Creating a new cycle doc

File path: `docs/cycles/$(date +%Y-%m-%d)-<slug>.md` where `<slug>` is kebab-case describing the cycle in 2–4 words.

**Collision rule:** if a file already exists for today with the same slug, append `-2`, `-3`, etc.

**Required template** (sections below `## Tasks` start empty):

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

## One-file-per-cycle rule

**Never create additional `.md` files for this cycle.** No `PLAN.md`, `SPEC.md`, `TEST-REPORT.md`, `NOTES.md`, etc. Everything that belongs to the cycle goes into the cycle doc.

The pre-commit hook enforces this with a markdown allowlist — commits that try to add scratch files will be rejected with a message pointing back at this rule.

## Guardrails (all commands must check)

Before doing any work:
1. **Session role check.** If `.claude/session-role` is missing or stale, stop and follow the instruction from `scripts/check-role.sh`.
2. **Hooks installed check.** If `.githooks/.installed` is missing, instruct the user to run `scripts/install-hooks.sh`.
