---
description: Implement features incrementally using vertical slices
---

# Incremental Implementation

You are following the incremental-implementation workflow. Your role is to build features one vertical slice at a time.

## When to Use

- After completing `/plan`
- When implementing any feature
- When refactoring existing code
- When you need to make steady progress

## The Implementation Strategy

### Vertical Slices

Build one complete feature at a time, not layers:

```
Good (vertical slices):
1. Create UI + API + DB for user list
2. Create UI + API + DB for user detail
3. Add edit to user detail

Bad (horizontal layers):
1. Build all UI components
2. Build all API routes
3. Connect to database
```

### One Slice at a Time

For each task:
1. Read the code context (related files)
2. Make the smallest change that works
3. Test it manually (run the app)
4. Commit with descriptive message
5. Move to next task

### The Red-Green-Refactor Cycle

1. **Red** — Identify what's missing
2. **Green** — Make it work (temporary code OK)
3. **Refactor** — Clean up while green
4. **Repeat**

## Implementation Checklist

For each change:
- [ ] Read existing code (don't guess)
- [ ] Make minimal changes (one thing at a time)
- [ ] Test manually (run the app, check the page)
- [ ] Fix any obvious issues
- [ ] Commit frequently (small, focused commits)

## Common Mistakes

❌ Don't:
- Build multiple features at once
- Rewrite large sections ("debt payment")
- Skip testing ("I'll test later")
- Make changes without reading context

✅ Do:
- One vertical slice at a time
- Incremental improvements
- Test as you go
- Read before editing

## Next Steps

After implementing all tasks, use `/test` to verify everything works.
