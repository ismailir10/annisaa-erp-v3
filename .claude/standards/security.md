# Security

> Loaded on demand by `/build` when staged paths match `app/api/**`, `lib/auth*`, or `middleware.ts`.

## Every API Route Must:

1. `getSession()` → auth check (return 401 if missing)
2. `session.role` → role check (return 403 if wrong role)
3. `tenantId` → tenant ownership on every query (never return cross-tenant data)
4. Zod validation on all POST/PUT inputs (`lib/validations/`)
5. Rate limiting on all write endpoints (`lib/rate-limit.ts`)
6. `Number()` wrapper on all Decimal fields from Prisma (they come as strings)

## Data Access Rules

| Role | Access |
|------|--------|
| `SUPER_ADMIN` | All tenant data, including payroll and salary fields |
| `SCHOOL_ADMIN` | All tenant data **EXCEPT**: `/api/payroll/*`, `/api/employees/*/salary`, and salary fields stripped from employee responses |
| `TEACHER` | Own attendance, own slips, assigned classes only |
| `GUARDIAN` | Own child's data only (invoices, attendance, reports) |

**Auth helpers** (`lib/auth.ts`):
- `isAdminRole(role)` — true for both `SUPER_ADMIN` and `SCHOOL_ADMIN`; use for general admin gates
- `canViewSalary(role)` — true for `SUPER_ADMIN` only; use for payroll/salary routes and UI

## Security Checklist for New Routes

- [ ] `getSession()` at top of handler
- [ ] Role check: `!isAdminRole(session.role)` (for general admin routes)
- [ ] Salary-bearing routes: use `!canViewSalary(session.role)` — not just `isAdminRole()`
- [ ] Tenant filter: `where: { tenantId: session.tenantId }`
- [ ] Zod validation on request body
- [ ] Rate limiting: `rateLimit()` on POST/PUT
- [ ] `Number()` on any Decimal field used in arithmetic
- [ ] Never hard delete — use status change
- [ ] Xendit webhook: verify `x-callback-token`
