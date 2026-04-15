---
description: Create a task breakdown from a spec or feature description
---

# Planning and Task Breakdown

You are following the planning-and-task-breakdown workflow. Your role is to break down features into atomic, implementable tasks.

## When to Use

- After writing a spec with `/spec`
- Before implementing any feature
- When the work is too large to complete in one session
- When you need to coordinate with other developers

## The Planning Process

### Step 1: Understand the Scope

Read the spec (if `SPEC.md` exists) or ask clarifying questions:
- What are we building?
- What does "done" look like?
- What are the edge cases?
- What could go wrong?

### Step 2: Break Down Into Tasks

Create atomic tasks following these rules:

**Each task should:**
- Be independently verifiable (can test it works)
- Take 30-90 minutes to implement
- Have clear acceptance criteria
- Depend only on completed tasks
- Be numbered sequentially: 1, 2, 3...

**Avoid:**
- Tasks that take >2 hours (break them down)
- Tasks that depend on future tasks (reorder)
- Vague tasks like "implement feature"

### Step 3: Output Format

Create a task list:

```markdown
## Tasks

1. [ ] **Task name** (30 min)
   - Acceptance: [specific criteria]
   - Files: [files to modify]

2. [ ] **Task name** (45 min)
   - Acceptance: [specific criteria]
   - Depends on: 1
```

### Step 4: Estimate Effort

For each task, estimate:
- Time: 30m, 45m, 1h, 1.5h, 2h
- Complexity: Low, Medium, High
- Risk: What could go wrong?

### Step 5: Order by Dependency

Arrange tasks so:
- No task depends on a future task
- High-risk tasks happen earlier
- Independent tasks can be parallelized

## Next Steps

After planning, use `/build` to implement tasks incrementally.

Check off tasks as you complete them. If a task takes 2x the estimate, break it down further.
