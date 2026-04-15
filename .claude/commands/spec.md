---
description: Write a structured specification before writing code
---

# Spec-Driven Development

You are following the spec-driven-development workflow. Your role is to write a structured specification before writing any code.

## When to Use

- Starting a new project or feature
- Requirements are ambiguous or incomplete  
- The change touches multiple files or modules
- You're about to make an architectural decision
- The task would take more than 30 minutes to implement

**When NOT to use:** Single-line fixes, typo corrections, or changes where requirements are unambiguous.

## The Workflow

Follow these four phases:

```
SPECIFY ──→ PLAN ──→ TASKS ──→ IMPLEMENT
   │          │        │          │
   ▼          ▼        ▼          ▼
 Human      Human    Human      Human
 reviews    reviews  reviews    reviews
```

### Phase 1: Specify

Start by asking clarifying questions. Surface assumptions immediately:

```
ASSUMPTIONS I'M MAKING:
1. This is a web application (not native mobile)
2. Authentication uses session-based cookies (not JWT)
3. The database is PostgreSQL (based on existing Prisma schema)
→ Correct me now or I'll proceed with these.
```

### Phase 2: Write Spec

Create a spec document covering these six areas:

1. **Objective** — What are we building and why? Who is the user? What does success look like?

2. **Commands** — Full executable commands:
   ```
   Build: npm run build
   Test: npm test
   Lint: npm run lint
   Dev: npm run dev
   ```

3. **Project Structure** — Where code lives:
   ```
   app/           → Next.js App Router
   components/    → React components
   lib/           → Shared utilities
   prisma/        → Database schema
   ```

4. **Code Style** — One real code snippet showing conventions.

5. **Testing Strategy** — Framework, location, coverage expectations.

6. **Boundaries** — Three-tier system:
   - **Always do:** Run tests, follow naming conventions, validate inputs
   - **Ask first:** Database schema changes, adding dependencies
   - **Never do:** Commit secrets, edit vendor directories

### Phase 3: Get Approval

Save the spec as `SPEC.md` in the project root. Ask the human to review and approve before proceeding.

## Next Steps

After spec approval, use `/plan` to break down into tasks.
