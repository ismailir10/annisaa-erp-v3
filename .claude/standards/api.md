# API Standards

> Loaded on demand by `/build` when staged paths match `app/api/**`, `lib/validations/**`, or `middleware.ts`.

## GET Lists

Support: `?page=1&pageSize=20&search=X&sortBy=field&sortOrder=asc&status=Y`

Use: `lib/api/pagination.ts`, `lib/api/response.ts`

Response: `{ data: [...], pagination: { page, pageSize, total, totalPages } }`

## Mutations (POST/PUT/DELETE)

1. `getSession()` → auth check
2. `session.role` → role check
3. `tenantId` → tenant ownership
4. Zod validation → reject bad input
5. Structured errors: `{ error: "message" }`
