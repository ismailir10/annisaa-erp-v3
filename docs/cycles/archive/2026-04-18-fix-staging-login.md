# Fix Staging Login for ismailir10@gmail.com

## Context

User `ismailir10@gmail.com` cannot log in to staging. Root cause: `getSession()` in `lib/auth.ts:48-84` requires a matching `User` record in Prisma. On first login, it auto-creates a User only if a matching `Employee` or `Parent` exists. Neither exists for this email, so login is denied (returns `null`).

The seed file (`prisma/seed.ts:117-138`) creates only two admin users: `admin@annisaa.sch.id` (SUPER_ADMIN) and `schooladmin@annisaa.sch.id` (SCHOOL_ADMIN). The owner's actual email is not seeded.

## Spec

**Acceptance criteria:**
1. `ismailir10@gmail.com` can log in to staging as SUPER_ADMIN
2. Future reseeds include this email as a durable SUPER_ADMIN user
3. No existing staging data is wiped

## Tasks

- [x] Task 1: Add `ismailir10@gmail.com` as SUPER_ADMIN in `prisma/seed.ts`
- [x] Task 2: Insert User record directly into staging DB via Supabase MCP

## Implementation

### Task 1 — `prisma/seed.ts`
Added third admin user after line 138 (the `schooladmin` block):
```ts
await prisma.user.create({
  data: {
    id: "u_owner",
    tenantId: tenant.id,
    email: "ismailir10@gmail.com",
    role: "SUPER_ADMIN",
    name: "Ismail Rabbani",
  },
});
```

### Task 2 — Staging DB
Executed SQL via Supabase MCP to `upsert` the User row directly, scoped to the existing tenant, without touching any other data.

## Verification

- [x] `npm run build && npx vitest run` green — 104/104 tests passed
- [x] Staging DB: upserted `ismailir10@gmail.com` as SUPER_ADMIN via Supabase MCP (confirmed by RETURNING clause)

## Ship Notes

- No migrations required (no schema changes)
- No new env vars
- Rollback: delete the User row from staging DB; revert seed.ts commit
