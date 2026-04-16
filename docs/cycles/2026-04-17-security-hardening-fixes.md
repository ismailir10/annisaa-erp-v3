# Security Hardening Fixes

## Context

Code review surfaced 3 critical issues and several important gaps across API routes. Left unaddressed:
- Critical #1: Xendit webhook crashes with `RangeError` when token lengths differ — permanently breaks payment delivery until redeploy
- Critical #2: Rate limiting keyed to `X-Forwarded-For[0]`, which is user-controlled — any attacker can rotate IPs to bypass limits
- Critical #3: `student-attendance/[id]` PUT/DELETE block SUPER_ADMIN (`role !== "SCHOOL_ADMIN"`) — wrong direction
- Important #5: `parseInt(undefined)` → `NaN` → `0` silently written to Postgres in org config PUT — corrupts payroll and attendance grace period
- Important #6: `/api/admin/seed` accessible by SCHOOL_ADMIN in production — can inject synthetic students and invoices into live data
- Important #8: Payroll slip PDF — SCHOOL_ADMIN falls through both TEACHER and canViewSalary branches, getting unrestricted access
- Important #9: Guardian create writes unvalidated `relationship` enum directly to DB — `createGuardianSchema` exists but isn't imported
- S2: `revalidateTag("employees-count", {})` passes invalid second arg, silently a no-op but noisy type error

No user-facing UI changes. All fixes are purely server-side.

ASSUMPTIONS:
1. `isSuperAdmin` already exists in `lib/auth.ts` (confirmed: line 15)
2. `createGuardianSchema` exists in `lib/validations/guardian.ts` (review confirmed it exists)
3. The seed route's `NODE_ENV !== "production"` guard should be additive — the route still works in development
4. For rate limit fix (Critical #2): authenticated routes (check-in, check-out, attendance edit) should key by `session.employeeId`; unauthenticated/pre-auth routes (demo-login) key by last entry of `X-Forwarded-For` (Vercel-controlled); `getClientIp` helper refactored to extract the last entry
→ Correct me now or I'll proceed with these.

## Spec

### Acceptance Criteria

- [ ] **C1** — Xendit webhook returns 401 for any `x-callback-token` shorter or longer than `XENDIT_WEBHOOK_TOKEN`; `timingSafeEqual` is never called with mismatched buffer lengths; no unhandled `RangeError` possible
- [ ] **C2** — `getClientIp` returns the _last_ entry of `X-Forwarded-For` (set by Vercel's edge, not client-controlled); rate-limited authenticated routes (check-in, check-out, attendance edit, org config PUT) key by `session.id` or `session.employeeId` instead of IP
- [ ] **C3** — `student-attendance/[id]` PUT and DELETE use `!isAdminRole(session.role)` so both SUPER_ADMIN and SCHOOL_ADMIN are allowed; TEACHER and GUARDIAN are blocked
- [ ] **C5** — `PUT /api/config/org` validates body with Zod before `parseInt`; missing/non-numeric `gracePeriodMinutes`, `payrollPeriodStartDay`, `payrollPeriodEndDay` return 400 instead of writing `0` to DB
- [ ] **C6** — `POST /api/admin/seed` blocked when `NODE_ENV === "production"` AND when `!isSuperAdmin(session.role)`; SCHOOL_ADMIN gets 403
- [ ] **C8** — Payroll slip PDF route explicitly blocks SCHOOL_ADMIN with 403; only TEACHER (own slip) and SUPER_ADMIN (same tenant) can access
- [ ] **C9** — Guardian POST imports and uses `createGuardianSchema` for Zod validation; unrecognised `relationship` values return 400 before touching the DB
- [ ] **S2** — `revalidateTag("employees-count")` called without second argument

## Tasks

### Task 1 — Fix Xendit webhook `timingSafeEqual` RangeError (C1)
**File:** `app/api/xendit/webhook/route.ts`

Add a length check before `timingSafeEqual`:
```ts
if (
  !expectedToken ||
  !callbackToken ||
  callbackToken.length !== expectedToken.length ||
  !timingSafeEqual(Buffer.from(callbackToken), Buffer.from(expectedToken))
) {
  console.error("[XENDIT WEBHOOK] Invalid callback token");
  return NextResponse.json({ error: "Invalid token" }, { status: 401 });
}
```
Short-circuit: if lengths differ, return 401 immediately — never call `timingSafeEqual`.
Also fix `revalidateTag("student-invoices", {})` on line 106 to remove the invalid second arg.

**Gate:** `npm run build && npx vitest run`

---

### Task 2 — Harden rate-limit key: IP spoofing fix + session-keyed routes (C2)
**Files:** `lib/rate-limit.ts`, `app/api/attendance/check-in/route.ts`, `app/api/attendance/check-out/route.ts`, `app/api/student-attendance/[id]/route.ts`, `app/api/config/org/route.ts`

In `lib/rate-limit.ts`, change `getClientIp` to take the **last** entry of `X-Forwarded-For` (Vercel appends the real client IP at the end; the first entry is user-controlled):
```ts
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || request.headers.get("x-real-ip") || "anonymous";
}
```

For authenticated routes that have a session available, key by session identity:
- `check-in`: `rateLimit(\`check-in:${session.employeeId}\`, 5, 60_000)` — move rate limit call after auth check
- `check-out`: add `rateLimit(\`check-out:${session.employeeId}\`, 5, 60_000)` after auth check
- `student-attendance PUT/DELETE`: already uses `getClientIp` — change key to `update-attendance:${session.id}` and `void-attendance:${session.id}`
- `config/org PUT`: change key to `update-org-config:${session.id}`

**Gate:** `npm run build && npx vitest run`

---

### Task 3 — Fix SUPER_ADMIN blocked from student attendance edits (C3)
**File:** `app/api/student-attendance/[id]/route.ts`

Lines 34 and 66: replace `session.role !== "SCHOOL_ADMIN"` with `!isAdminRole(session.role)`.
Import `isAdminRole` from `@/lib/auth` (it's already used in the file — verify the import exists).

**Gate:** `npm run build && npx vitest run`

---

### Task 4 — Add Zod validation to org config PUT; guard seed route (C5 + C6)
**Files:** `app/api/config/org/route.ts`, `app/api/admin/seed/route.ts`

**C5 — org config:**
Add an inline Zod schema before the upsert. Required integer fields must be positive integers:
```ts
import { z } from "zod";

const orgConfigSchema = z.object({
  workingDays: z.array(z.string()),
  workStartTime: z.string(),
  workEndTime: z.string(),
  gracePeriodMinutes: z.coerce.number().int().min(0),
  timezone: z.string(),
  payrollPeriodStartDay: z.coerce.number().int().min(1).max(28),
  payrollPeriodEndDay: z.coerce.number().int().min(1).max(31),
});
```
Validate body before upsert; return 400 on failure. Remove the raw `parseInt()` calls — use the coerced values from the parsed schema.

**C6 — seed route:**
Replace `!isAdminRole(session.role)` with:
```ts
if (process.env.NODE_ENV === "production") {
  return NextResponse.json({ error: "Not available in production" }, { status: 403 });
}
if (!isSuperAdmin(session.role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```
Import `isSuperAdmin` from `@/lib/auth`.

**Gate:** `npm run build && npx vitest run`

---

### Task 5 — Fix payroll slip PDF access gap + guardian Zod + revalidateTag (C8 + C9 + S2)
**Files:** `app/api/slips/[payrollItemId]/pdf/route.ts`, `app/api/students/[id]/guardians/route.ts`, `app/api/employees/route.ts`

**C8 — payroll slip PDF:**
Replace the access control block with explicit, exhaustive role checks:
```ts
if (session.role === "TEACHER") {
  // Teachers can only see their own slip
  if (item.employee.id !== session.employeeId) {
    return NextResponse.json({ error: "Akses ditolak — Anda hanya dapat melihat slip gaji Anda sendiri" }, { status: 403 });
  }
  // No draft slips for teachers
  const fullRun = await prisma.payrollRun.findUnique({ where: { id: item.payrollRunId } });
  if (fullRun?.status === "DRAFT") {
    return NextResponse.json({ error: "Slip gaji belum tersedia" }, { status: 403 });
  }
} else if (isSuperAdmin(session.role)) {
  // SUPER_ADMIN: must belong to same tenant
  if (item.payrollRun.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
} else {
  // SCHOOL_ADMIN and GUARDIAN: no access
  return NextResponse.json({ error: "Akses ditolak" }, { status: 403 });
}
```
Import `isSuperAdmin` from `@/lib/auth`.

**C9 — guardian create:**
Add `import { createGuardianSchema } from "@/lib/validations/guardian"` and validate the body with it after `await req.json()`. Return 400 on validation failure. Keep the manual `name.trim()` check only as a fallback if the schema doesn't cover it (remove if schema does).

**S2 — employees revalidateTag:**
Remove the invalid second arg: `revalidateTag("employees-count")`.

**Gate:** `npm run build && npx vitest run`

---

### Task 6 — End-of-cycle gate
Run `npm run build && npx vitest run && npx playwright test` — all must pass before final commit.

## Implementation

- Task 1: Fix Xendit webhook timingSafeEqual RangeError — `app/api/xendit/webhook/route.ts` — length check before timingSafeEqual prevents RangeError; returns 401 on any length mismatch
- Task 2: Harden rate-limit keys — `lib/rate-limit.ts`, `app/api/attendance/check-in/route.ts`, `app/api/attendance/check-out/route.ts`, `app/api/student-attendance/[id]/route.ts`, `app/api/config/org/route.ts` — getClientIp uses last X-Forwarded-For entry; authenticated routes restructured to session-first and keyed by session.id/employeeId
- Task 3: Fix SUPER_ADMIN attendance access — `app/api/student-attendance/[id]/route.ts` — replaced `role !== "SCHOOL_ADMIN"` with `!isAdminRole()` in PUT and DELETE
- Task 4: Org config Zod + seed guard — `app/api/config/org/route.ts`, `app/api/admin/seed/route.ts` — Zod schema with coerce on integer fields; seed blocked in production and requires isSuperAdmin

## Verification

- Task 1: build + 90 vitest tests passed
- Task 2: build + 90 vitest tests passed
- Task 3: build + 90 vitest tests passed
- Task 4: build + 90 vitest tests passed

## Ship Notes

- No DB migrations required — all changes are server-side auth/validation logic
- No new env vars
- Rollback: revert the PR — no schema or data changes
- After deploy: verify Xendit webhook by sending a test payload with a mismatched token length from Xendit dashboard — should return 401, not 500
