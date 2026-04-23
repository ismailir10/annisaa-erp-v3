# Comprehensive Code Review — Per Module

**Date:** 2026-04-24
**Role:** cto
**Cycle type:** Audit / review (no code changes — deliverable is this document)

## Context

The codebase has grown fast across ~15 domains (academic, admissions, admin, assessments, attendance, employees, enrollments, fees, guardians, invoices, leave, payroll, students, student-journal, teaching-assignments) spanning 69 API routes, 22 admin pages, 6 teacher pages, 4 parent pages, shared component library, payroll engine, Xendit integration, Supabase auth.

No wall-to-wall review has happened since the design-system retrofit cycle landed. The roadmap still lists Phase 3/4 work (reports/announcements, polish). Before starting those, the CTO wants a thorough production-readiness review **per module** — correctness bugs, security issues, architecture drift from standards, test gaps, and tech debt — so the next cycles can prioritise real risk instead of gut feel.

Scope: everything under `app/`, `lib/`, `components/`, `prisma/`, `config/`, `middleware*`, plus `.githooks/` and `scripts/`. E2E specs and docs are **not** in scope (they're means, not product).

This cycle is **review-only**: tasks are review dispatches, not code changes. The end-of-cycle deliverable is the **Findings** section of this doc — a prioritised punch-list the CTO can break into follow-up `/spec` cycles.

Cross-references `design-system.html` (brand/UI baseline), `.claude/standards/*.md` (per-domain rules), README Architecture Decisions, and existing cycle docs.

## Spec

Produce a single consolidated review document (this file) covering all code modules in the repository. Each module gets:

1. **Coverage** — what was reviewed (file globs)
2. **Strengths** — what's well done
3. **Critical issues** — bugs, security, data-loss, broken functionality (must fix)
4. **Important issues** — architecture, missing features, error-handling, test gaps (should fix)
5. **Minor issues** — style, docs, optimisation (nice to have)
6. **Standards drift** — deviations from `.claude/standards/*.md`

**Success criteria:**
- All 8 module reviews land findings in this doc ✅
- Critical issues triaged with proposed fix approach ✅
- Consolidated **Triage** section ranks top 10 highest-impact follow-ups ✅
- Pre-commit gates pass (build + vitest); Playwright not required (no code changed)

**Out of scope:** running actual fixes (those are follow-up cycles), UAT execution, design-system visual regressions.

## Tasks

Reviews dispatched in parallel via `feature-dev:code-reviewer` subagents.

- [x] T1 — Auth, Session & Security
- [x] T2 — API Layer — Admin Core
- [x] T3 — API Layer — Fees, Payroll & Integrations
- [x] T4 — API Layer — Academic & Portal Endpoints
- [x] T5 — Admin Portal UI
- [x] T6 — Teacher + Parent Portal UI
- [x] T7 — Business Logic (lib/)
- [x] T8 — Data Layer & Infra

## Implementation

Findings below are verbatim outputs from the 8 parallel reviewer subagents, reorganised per module. Every issue carries `file:line` + rationale. Severity follows Critical / Important / Minor buckets.

---

### T1 — Auth, Session & Security

**Scope:** `lib/auth.ts`, `lib/auth-callback.ts`, `lib/auth-guard.ts`, `lib/permissions.ts`, `lib/rate-limit.ts`, `lib/supabase/*`, `app/api/auth/**`, sampled API routes.

#### Strengths
- Supabase session validated with `supabase.auth.getUser()` (server-validated, not `getSession()`) — cannot be faked with tampered JWT.
- No service-role key in client-reachable code; only `NEXT_PUBLIC_SUPABASE_ANON_KEY` exposed.
- Tenant isolation consistent: every admin/payroll query includes `where: { tenantId }`.
- `requireGuardianForStudent` traverses `User → parentId → StudentGuardian.status=ACTIVE` before granting access — prevents IDOR between parents.
- Xendit webhook uses `timingSafeEqual` constant-time compare.
- Demo mode gated behind explicit `DEMO_MODE=true`; login route also gate-checks before setting cookie.
- Rate limiting on all high-cost writes (payroll generate, send slips, student/employee create, invoice void, demo login).
- `lib/rate-limit.ts` correctly uses last segment of `x-forwarded-for` (Vercel appends real IP).

#### Critical (Must Fix)

1. **`GET /api/students` exposes all tenant student PII to TEACHER and GUARDIAN roles**
   - File: `app/api/students/route.ts:11-12`
   - Issue: GET handler only checks `session?.tenantId` — TEACHER or GUARDIAN can enumerate all students + NIS/NISN/NIK/birth/address/notes.
   - Why: Per data-access table, teachers may only see assigned class students; GUARDIAN has no student-roster access.
   - Fix: Add `if (!isAdminRole(session.role)) return 403` on the collection endpoint. Teacher access should use a scoped `/api/teacher/students?classId=...` with `requireTeacherForClass`.

2. **`GET /api/employees` exposes employee list (email, phone, jabatan) to TEACHER and GUARDIAN**
   - File: `app/api/employees/route.ts:12-13`
   - Issue: Same pattern — salary fields stripped for non-SUPER_ADMIN but the list itself (names, emails, phone, job titles) returned to any authenticated session including GUARDIAN. A parent enumerating all teacher contacts is a PII leak.
   - Fix: Add `if (!isAdminRole(session.role)) return 403`.

#### Important (Should Fix)

3. **No rate limit on `POST /api/invoices/[id]/payments`** (`app/api/invoices/[id]/payments/route.ts:6-9`) — sibling routes have one, this doesn't. Admin could hammer duplicate payments. Fix: `rateLimit(\`record-payment:${getClientIp(req)}\`, 10, 60_000)`.
4. **No rate limit on `PUT /api/invoices/[id]`** (`app/api/invoices/[id]/route.ts:25-27`) — can trigger Xendit API calls via SENT transitions.
5. **`payroll/generate` reads body with no Zod validation** (`app/api/payroll/generate/route.ts:20-25`) — `periodStart`/`periodEnd` accepted as raw strings. Malformed dates bubble as 500.
6. **`invoices/generate` no Zod on `dueDate`/`academicYearId`** (`app/api/invoices/generate/route.ts:19-23`).
7. **In-memory rate limiter resets per cold-start** (`lib/rate-limit.ts:7`) — effective limit = `limit × instance_count`. Demo login 5/min meaningless under load. Move to Vercel KV/Upstash for distributed counter. Documented as "acceptable" in code comment but worth elevating.

#### Minor

8. **`/api/auth/me` returns full `SessionUser` including internal `parentId`/`employeeId`** (`app/api/auth/me/route.ts:5-9`). Project to `{id, email, role, name, tenantId}`.
9. **`getDemoSession` reads cookie value as Prisma User id without format check** (`lib/auth.ts:174-176`) — non-UUID cookie throws uncaught.
10. **`userCache` module-level map grows unbounded** (`lib/auth.ts:13`) — evict only on lookup. Add periodic sweep / max-size.

#### Standards drift
- `security.md` role-gate rule violated at `app/api/students/route.ts:11`, `app/api/employees/route.ts:12`.
- `security.md` rate-limit rule violated at `app/api/invoices/[id]/payments/route.ts`, `app/api/invoices/[id]/route.ts:25`.
- `security.md` Zod-validation rule violated at `app/api/payroll/generate/route.ts:20`, `app/api/invoices/generate/route.ts:19`.

**Assessment:** auth core is sound (Supabase server-side validation, tenant isolation, guardian IDOR protection all correct). The two CRITICAL GET-route exposures are a real PII leak — any logged-in teacher or parent can enumerate all students and staff. Must fix before next production deploy.

---

### T2 — API Layer — Admin Core

**Scope:** `app/api/{admin,students,employees,enrollments,users,roles,academic-years,class-sections,programs,admissions,guardians,guardian,teaching-assignments,promotions,leave,config}/**` (38 route files) + `lib/api/*`.

#### Strengths
- Tenant isolation consistent — every `[id]` route uses `findFirst({ where: { id, tenantId } })` or two-step check. No bare `findUnique(id)`.
- High-stakes mutations (promote, enroll, graduate, withdraw, admit-convert, leave-approve) wrapped in `$transaction`. Enroll uses `SELECT … FOR UPDATE` for capacity race.
- `parsePagination`/`paginatedResponse` used uniformly.
- `canViewSalary` correctly gates salary routes to SUPER_ADMIN only.
- Admission state-machine: `VALID_TRANSITIONS` enforced server-side; terminal states genuinely terminal.
- `advisory_xact_lock` serialises employee-code generation.
- Rate limiting on all mutation routes; seed + UAT-prep routes environment-gated.

#### Critical (Must Fix)

1. **`POST /api/students/[id]/promote` — capacity race** (`app/api/students/[id]/promote/route.ts:42-58`). Capacity check reads `_count.enrollments` *outside* transaction; no re-check inside. Concurrent promotes to a full class both pass. Fix: move check inside transaction with `SELECT … FOR UPDATE` like `enroll`.
2. **`POST /api/promotions` bulk promote — same stale-capacity issue** (`app/api/promotions/route.ts:87-95,115-125`). `targetSection.capacity` fetched outside transaction; inner compare uses stale value.
3. **`PUT /api/employees/[id]` deactivate shortcut skips Zod entirely** (`app/api/employees/[id]/route.ts:53-59`). If schema gains audited fields, silent bypass. Fix: always run Zod; design schema for partial updates.
4. **`POST /api/employees/[id]/salary` — no rate limit** (`app/api/employees/[id]/salary/route.ts:31`). SUPER_ADMIN-gated but standard requires rate limit on all writes; endpoint loops upserts per request.
5. **`POST /api/students` — guardian creation not in transaction** (`app/api/students/route.ts:87-115`). Student `create` at :68 → parallel parent upserts at :91 → `createMany` at :107. Partial failure leaves student with no/partial guardians.

#### Important

6. **Auth-failure response shape wrong** — `academic-years`, `class-sections`, `config/campuses`, `teaching-assignments` GET handlers return `[]` with status 401 instead of `{ error: "Unauthorized" }`. Clients can't distinguish empty result from unauth.
7. **`admissions` + `leave/requests` GET return 200 + empty paginated body on auth fail** (`app/api/admissions/route.ts:13`, `app/api/leave/requests/route.ts:109`) — no status signal.
8. **`POST /api/teaching-assignments` — no tenant check on `employeeId`/`classSectionId`** (`app/api/teaching-assignments/route.ts:43-57`). Admin of tenant A could pass tenant B's IDs.
9. **`POST /api/class-sections` — no Zod, no tenant check on FKs** (`app/api/class-sections/route.ts:40-53`). Can link to cross-tenant program/year/campus.
10. **`POST /api/programs` — no Zod** (`app/api/programs/route.ts:31-42`). Only create endpoint in scope skipping `validateBody`.
11. **`PUT /api/employees/[id]/salary` — no body validation; loop not atomic** (`app/api/employees/[id]/salary/route.ts:44-60`). Per-line upserts without `$transaction`.
12. **`POST /api/leave/requests` — balance + overlap checks outside transaction** (`app/api/leave/requests/route.ts:54-88`). Rapid double-submit passes both checks before commit.

#### Minor

13. **`parseSort` unvalidated field injection** (`lib/api/pagination.ts:32-38`). No allowlist. Unknown field → Prisma 500 with schema leak. Also a SQL-adjacent risk under any future `$queryRaw` usage.
14. **`revalidate` + session auth conflict** — `academic-years/route.ts:6` (24h), `roles/route.ts:8` (1h), `programs/route.ts:7` (1h). CDN caches per-tenant responses; auth check meaningless on cache hit.
15. **`/api/admin/seed` N+1 loops** (`app/api/admin/seed/route.ts:91-117,129-139,154-165`) — 200+ sequential round-trips. Use `createMany` with `skipDuplicates`.

#### Standards drift
- `api.md` mutation shape violated on 6 GET routes (return `[]`/empty-pagination instead of `{ error }`).
- `security.md` Zod-at-boundary violated on `POST /api/programs`, `POST /api/class-sections`, `PUT /api/employees/[id]/salary`.
- `security.md` rate-limit rule violated on `PUT /api/employees/[id]/salary`.
- `api.md` pagination-wrapper key: impl uses `pagination` with `totalPages`; standard says `meta: { page, pageSize, total }` — minor but confusing.

**Assessment:** solid for a single-tenant MVP. Most urgent: promote/bulk-promote capacity race (can cause over-enrollment under concurrent load) and guardian-without-transaction in student POST. `revalidate` + auth conflict is a latent per-tenant data leak.

---

### T3 — API Layer — Fees, Payroll & Integrations

**Scope:** `app/api/{fee-components,fee-structure,invoices,payroll,salary-components,slips,xendit}/**` + `lib/{payroll,xendit,email,pdf}/**`.

#### Strengths
- Webhook timing-safe comparison done correctly (`app/api/xendit/webhook/route.ts:3,16-24`).
- Advisory locking attempted in webhook + invoice generation.
- Idempotency check inside transaction in webhook (`reference`/`payment_session_id` lookup before insert).
- Tenant isolation on all fetched records.
- Salary gated behind `canViewSalary` (SUPER_ADMIN only).
- Duplicate payroll run prevention checks exact + overlapping periods (`payroll/generate/route.ts:28-51`).
- Rate-limiting on write endpoints that do large work.
- Pro-rata formula correctly counts paid leave as present (`engine.ts:63`).
- BSI CSV injection handled — `csvField()` wraps/double-quotes fields with commas/quotes/newlines.

#### Critical (Must Fix)

1. **Webhook `pg_advisory_xact_lock` cast is invalid — lock never taken, transaction throws on EVERY webhook**
   - File: `app/api/xendit/webhook/route.ts:69`
   - Code: ``SELECT pg_advisory_xact_lock(('x' || ${invoice.id}::text)::bit(64)::bigint)``
   - Why: `invoice.id` is a UUID with hyphens; `'x' || uuid` is not a valid hex literal — PostgreSQL throws a syntax error on every webhook. Net effect: **no Xendit payment is ever recorded as PAID in production** (if advisory lock is actually exercised).
   - Fix: use `hashtext(${invoice.id})` or the same integer-hash pattern the invoice-generate route uses.
   - Confidence: 95.

2. **Float rounding in webhook/payments — invoice status flip unreliable**
   - Files: `app/api/xendit/webhook/route.ts:57-59,92-94`; `app/api/invoices/[id]/payments/route.ts:53-58`.
   - Issue: `Number(invoice.totalDue) - currentPaid` uses JS float arithmetic. Fees like Rp 999,999 yield `999999.0000000001`; `totalPaid >= Number(totalDue)` returns false; invoice never reaches PAID.
   - Fix: `Math.round(totalPaid) >= Math.round(Number(totalDue))`.

3. **Variables endpoint non-atomic multi-step write**
   - File: `app/api/payroll/[id]/items/[itemId]/variables/route.ts:82-105`
   - Issue: `PayrollItem` update → line `deleteMany` → per-line `create` loop → second `PayrollItem` update — 4 round-trips, no `$transaction`. Crash midway leaves item with no lines and stale `netAmount`. Per-line INSERT loop also slow.
   - Fix: wrap in `$transaction`; use `createMany`.

4. **SCHOOL_ADMIN gating on salary-line edit is SUPER_ADMIN-only via `canViewSalary`** — policy ambiguity, not a bug. Verify intent against `security.md` data-access table; document explicitly. Files: `app/api/payroll/[id]/items/[itemId]/lines/[lineId]/route.ts:10`, `variables/route.ts:12`.

#### Important

5. **Invoice generation dedup races**
   - File: `app/api/invoices/generate/route.ts:75-88,119`
   - Issue: `existingInvoices` snapshot taken before transaction. Advisory lock uses sum-of-char-codes which has high collision probability; two different tenants can share a lock.
   - Fix: move dedup check inside transaction after acquiring lock; replace hash with `hashtext(tenantId)`.

6. **BSI export unconditionally flips status to EXPORTED even if zero rows written**
   - File: `app/api/payroll/[id]/export/bsi/route.ts:50-54`. Re-download blocked by status-gate @ :33. Fix: flip only if `rows.length > 0`.

7. **Email template injects unsanitised `employeeName`/`period` into HTML** (`lib/email/templates/salary-slip.ts:38-42`). XSS unlikely (admin-entered) but `&` breaks rendering (e.g. "Januari & Februari"). Add minimal `escapeHtml` helper.

8. **`send-slips` has no idempotency** (`app/api/payroll/[id]/send-slips/route.ts`). Double-submit → double email. Rate limit ≠ idempotency. Fix: 409 if `status === "SLIPS_SENT"`.

9. **`payroll/generate` reads attendance + salary values outside transaction** (`app/api/payroll/generate/route.ts:54-77,139`). Race window between `Promise.all` and `$transaction` — real for 40+ teacher school with live attendance corrections.

#### Minor

10. **`adjustmentAmount` validation: `Number(...) || 0` short-circuits before `isNaN` — dead guard** (`app/api/payroll/[id]/items/[itemId]/lines/[lineId]/route.ts:31`). Use Zod.
11. **`revalidateTag(..., {})` — second arg doesn't exist in Next.js 14** (`app/api/xendit/webhook/route.ts:108`). Harmless today but misreads signature.
12. **Advisory lock hash collision** (`app/api/invoices/generate/route.ts:121`) — character-sum, not a hash. `hashtext` or proper hash instead.

#### Standards drift
- `POST /api/salary-components` missing rate limit (`app/api/salary-components/route.ts:20-45`) — sibling `fee-components` has one.
- `POST /api/invoices/[id]/payments` raw `Number(body.amount)` — `recordPaymentSchema` exists in `lib/validations/invoice.ts` but never imported. Direct security.md violation.
- `GET /api/fee-components` + `GET /api/salary-components` have `export const revalidate = 3600` but call `getSession()` — per-request auth incompatible with segment caching.

**Assessment:** the highest-stakes file (`xendit/webhook`) has a showstopper bug — the advisory-lock UUID-to-hex cast throws on every invocation. Payroll engine itself is numerically sound. Priority fix order: (1) webhook lock cast, (2) variables transaction, (3) `Math.round` in payment comparison, (4) manual-payment Zod, (5) rate limit on `POST /api/salary-components`.

---

### T4 — API Layer — Academic & Portal Endpoints

**Scope:** `app/api/{attendance,assessments,student-attendance,student-journal,teacher,parent,auth}/**` + `lib/{attendance,student-journal,parent-activity,parent-helpers,validations}/**`.

#### Strengths
- `requireGuardianForStudent` + `requireTeacherForClass` in `lib/student-journal/guards.ts` correct and reused. Chains full ownership relation with `status: "ACTIVE"` and cross-tenant classSection check.
- `entryBatchSchema` / `homeEntryBatchSchema` cover all fields; batch upsert in single `$transaction`.
- Teacher class-grid + journal batch endpoints validate studentIds active-enrolled and indicatorIds active-template before writing.
- Employee attendance uses `getTodayInTimezone` (Intl, Asia/Jakarta) — correctly avoids UTC midnight shift.
- `getParentWithChildren` applies both `parentId` + `tenantId`. Cached helpers reuse the tenant-scoped `studentId`.
- Rate-limit keys on `session.id`/`session.employeeId` rather than IP in several places — prevents spoofing.
- Soft-delete consistent (`isVoided`, `status: "DELETED"/"INACTIVE"`). No hard deletes.
- Assessment scoring tightens authz from program-level to enrolled class (`assessments/student/[id]/route.ts`).

#### Critical (Must Fix)

1. **`student-attendance/route.ts` teacher mode missing class-assignment check** (`app/api/student-attendance/route.ts:76-108`, confidence 95). Verifies classSection tenant but NOT that teacher is assigned to that class. Any tenant teacher reads full roster + existing attendance for any other class. Also no role gate — GUARDIAN with `tenantId` reaches this branch. Fix: apply `requireTeacherForClass`.

2. **`student-attendance/mark` — no role check, no Zod on `status`, missing tenant on assignment lookup** (`app/api/student-attendance/mark/route.ts:12-17,29-36,43`, confidence 92). Only `session?.employeeId` checked. Role never asserted. `status` accepted as raw string — caller writes arbitrary enum value. `TeachingAssignment` lookup lacks `classSection.tenantId` filter (compare `lib/student-journal/guards.ts:64-68`).

3. **`lib/parent-helpers.ts` `getStudentInvoices` cache-key poisoning** (`lib/parent-helpers.ts:128-157`, confidence 85). `unstable_cache` key is `["student-invoices"]` — constant, not parameterised. First parent's invoices are served to every parent until revalidation. Also lacks `tenantId` in Prisma `where`. Fix: include `studentId` in cache key array; add `tenantId` to where for defense-in-depth.

#### Important

4. **`student-attendance/route.ts:16` returns `[]` status 401** — violates error-shape contract; teacher sees blank grid with no feedback.
5. **`student-attendance/[id]/route.ts:18-27` GET has no role gate** — GUARDIAN who guesses UUID within own tenant reads internal fields for any student.
6. **`student-journal/notes/route.ts:46-64` teacher enrollment lookup missing tenant filter** — cross-tenant student note possible if studentId guessed.
7. **`lib/parent-activity.ts:94-112` assessment sub-query lacks `tenantId` filter** — inconsistency with other sub-queries in same function; silent hazard on refactor.

#### Minor

8. **`attendance/monthly/route.ts:5` — `revalidate = 3600` without tenant-scoped cache key** (Next.js segment-caching + auth check conflict).
9. **`attendance/today/route.ts:12` uses UTC `toISOString().split('T')[0]` fallback** — midnight boundary issue. Use `getTodayInTimezone`.
10. **`entryBatchSchema`/`homeEntryBatchSchema` no `max(1000)` on `entries` array** — degenerate payloads possible.

#### Standards drift
- `api.md` pagination contract: teacher mode of `student-attendance` returns plain array, not `{ data }`.
- `api.md` error shape: `[]` on 401 in `student-attendance`; mixed `{ saved, total }` vs `{ data: { saved } }` across attendance routes.
- `security.md` body-validation-before-auth: `student-attendance/mark` writes without Zod.

**Assessment:** guardian-to-student and teacher-to-class guards architecturally sound where applied. Critical vulnerabilities confined to older `student-attendance` routes that predate the guard pattern. Highest-risk: shared `unstable_cache` key in `getStudentInvoices` = live parent-to-parent data leak. Second: teacher-mode of `student-attendance` + `mark` endpoint hardening.

---

### T5 — Admin Portal UI

**Scope:** `app/admin/**`, `components/admin/**`.

#### Strengths
- Zero arbitrary color classes (`text-[#…]`/`bg-[#…]`) across admin.
- No `window.confirm()`; all destructive confirms through `<ConfirmDialog>` (though see issue 1).
- No `animate-pulse`; `<Skeleton>` used for loading.
- `formatRupiah`/`formatDate`/`formatDateShort` used consistently — no inline `toLocaleString`.
- `useIsMobile()` + Dialog/Sheet responsive switch on every overlay.
- `<DataTableRowActions>` action-column pattern correct (with documented PayrollRun + LeaveRequest exceptions).
- `<Field>` + `<FieldLabel>` consistent — no raw `<Label>` + `<Input>` pairs.
- Admin voice correctly neutral/imperative; no Islamic greetings leaking.

#### Critical (Must Fix)

1. **`<ConfirmDialog>` uses `<Dialog>` for destructive actions — violates AlertDialog rule** (`components/ui/confirm-dialog.tsx:59`, confidence 92). `ui.md`: "Destructive = AlertDialog, always." Callers: `invoices/page.tsx:495`, `students/[id]/page.tsx:781,740`, `enrollments/page.tsx:339`, `settings/campuses/page.tsx:234`. Rebuild on `AlertDialog` OR callers switch directly when `destructive={true}`.

2. **Hard delete on Campuses** (`app/admin/settings/campuses/page.tsx:92`, confidence 90). `DELETE /api/config/campuses/${id}`. `crud.md` Cat A: NEVER hard-delete — use `status: INACTIVE`. Referential integrity risk.

3. **Bare `<button>` + missing `aria-label`** (Shadcn-FIRST violation) (confidence 88):
   - `app/admin/students/[id]/page.tsx:450-451`
   - `app/admin/payroll/[id]/page.tsx:436,456`
   - `app/admin/settings/campuses/page.tsx:172,175`
   - `app/admin/employees/[id]/page.tsx:329,331`
   - `app/admin/attendance/monthly/page.tsx:99,101`
   
   Zero `aria-label` across admin TSX. Use `<Button size="icon" variant="ghost" aria-label="…">`.

#### Important

4. **`handleGenerate` `setGenerating(false)` outside `finally`** (`app/admin/payroll/page.tsx:134-151`). Same pattern in `handleApprove`, `handleSendSlips` (`payroll/[id]/page.tsx`). Wrap body in `try/catch/finally`.
5. **Stats fetched via N separate `pageSize=1` list calls** (`app/admin/invoices/page.tsx:248-260` → 4 calls; `enrollments/page.tsx:162-173` → 3). Use `GROUP BY` stats endpoint.
6. **`ConfirmDialog` auto-closes on success even if `onConfirm` rejected** (`components/ui/confirm-dialog.tsx:46-54`). `onOpenChange(false)` unconditionally in `finally`.
7. **Spacing token drift: `p-4`, `p-6`, `py-4`, `px-4` ad-hoc** across 22 files, 45 hits. Canonical: `p-page-x`, `py-page-y`, `gap-section`, `p-card`. Worst: `employees/[id]/page.tsx` (9), `employees/page.tsx` (5), `student-journal/classes/[id]/page.tsx` (4).

#### Minor

8. **`handleExport` uses `setTimeout(fetchData, 1000)` after `window.open` in payroll detail** (`payroll/[id]/page.tsx:160-163`). Race. Endpoint should return updated status in body.
9. **`fetchData` suppresses `detailItem` exhaustive-deps** (`payroll/[id]/page.tsx:105`) — stale closure if sheet open during another trigger.
10. **`handleSendInvoices` uses page-slice `data.filter()` for `draftCount`** (`invoices/page.tsx:354,418`). Ignores DRAFTs on pages 2+. Use `stats.draft`.

#### Standards drift
- `voice.md` glossary: "Tidak Hadir" used where canonical is "Alpa" (`app/admin/students/[id]/page.tsx:516`).
- `ui.md` overlays rule: `ConfirmDialog` destructive button uses inline `bg-destructive` className instead of `variant="destructive"` (`components/ui/confirm-dialog.tsx:65-74`).

**Assessment:** admin portal structurally sound. Critical: `ConfirmDialog` is a `Dialog` not `AlertDialog` (used everywhere), campus hard-delete violates soft-delete rule, bare `<button>` with zero `aria-label` across admin.

---

### T6 — Teacher + Parent Portal UI

**Scope:** `app/teacher/**`, `app/parent/**`, `components/{teacher,parent,portal}/**`.

#### Strengths
- Cycle-tap attendance (`app/teacher/class-attendance/page.tsx:102,116,119`) optimistic + rollback + toast-on-failure + no submit button — textbook.
- WeekGrid sticky first col, today highlight, 44px tap, category-group headers all correct.
- Parent home Islamic salaam + Hijri line on-spec (`app/parent/page.tsx`). Honorific from `relationship` at :174-176.
- Household Overview `children → items` rename landed clean; no stale callers.
- `EmptyState` consistent across portal lists.
- `ChildSelectorTabs` returns `null` for single-child.
- Invoices server-renders data; `InvoicesClient` receives `null` on failure → error panel (fetch-error contract).
- Parent `error.tsx` = Retry + Home two-button.

#### Critical

1. **Pervasive `text-[11px]` violations — portal.md grep gate broken** (confidence 97). 35+ hits across 7 parent files:
   - `app/parent/page.tsx:233,253,268,284`
   - `app/parent/attendance/page.tsx:232,240,253,269-273,286,298,312`
   - `app/parent/invoices/client.tsx:127,133,180,199,260`
   - `app/parent/invoices/invoice-detail-sheet.tsx:148,159,162,170,175,189,201,218,228,240,254,268,286`
   - `app/parent/assessments-table.tsx:146,164`
   - `app/parent/profile/page.tsx:54,66,86,106,127`
   - `components/parent/kid-card.tsx:93,126`
   
   Fix: `text-[11px]` → `text-xs`.

2. **`text-[10px]` in `components/parent/kid-card.tsx:62`** (DAY_BASE) — double-banned, parent-home hot path (confidence 100). Fix: `text-xs`; adjust containing `h-11` if overflow.

#### Important

3. **Teacher `error.tsx:20` leaks raw `error.message`** — Prisma/Node stack fragments reach parent UI. Parent boundary suppresses correctly; teacher must match.
4. **Parent student-journal full re-fetch on every toggle** (`app/parent/student-journal/page.tsx:270-295`) — POST + GET-week-again on 4G = lag. Mutate `data.homeEntries` locally on success; re-fetch only on failure.
5. **Class-attendance no loading state when switching class/date** (`app/teacher/class-attendance/page.tsx:75-93`). Teacher taps stale row → wrong attendance with silent optimistic success. Add `studentsLoading` skeletons.
6. **Household Overview missing ≥3 kids branch** (`app/parent/page.tsx:236-247`). Standard requires urgency-banner + 3-up signal cells; current impl is vertical KidCard stack for any count.
7. **Student-journal "Di Rumah" toggle has no optimistic update** — WeekGrid onToggle waits for re-fetch. Reference: class-attendance pattern.

#### Minor

8. **`app/teacher/home-client.tsx:113` renders literal "Ustadz/Ustadzah"** — reads like placeholder. Use gender from session/profile, else default "Ustadzah".
9. **`app/parent/attendance/page.tsx:296-321` notes section has no empty-state else branch** — renders nothing when empty.
10. **Parent vs teacher layout padding inconsistency** — parent applies `px-page-x` in layout (`app/parent/layout.tsx:13`); teacher layout has none (`app/teacher/layout.tsx:16`), each page re-applies. Trap for new teacher pages.

#### Standards drift
- `portal.md` grep gate: `text-[10px]/text-[11px]` should return zero in `app/parent/**`, `components/parent/**`, `components/portal/**`. Currently 35+ hits.
- `portal.md` Household Overview ≥3-kid branch unimplemented.
- Teacher `error.tsx` leaks raw messages vs parent correctly suppresses.

**Assessment:** portals largely well-built. Immediate: text-size grep-gate breach in parent portal (bulk replace). Household Overview 3-kid branch + journal optimistic-update are real functional gaps (dedicated cycle).

---

### T7 — Business Logic (lib/)

**Scope:** `lib/{payroll,xendit,email,pdf,attendance,student-journal,validations,api,constants,uat}/**` + `lib/{format,hijri,academic-period,parent-activity,parent-helpers,utils}.ts` + `lib/__tests__/**`.

#### Strengths
- Payroll engine pure (no I/O inside `calculateEmployeePayroll`/`calculateWorkingDays`).
- TZ handling deliberate: `attendance/timezone.ts` uses `Intl.DateTimeFormat`; `parent-helpers.ts` uses local-calendar `toLocalYmd()` with comment explaining UTC-shift risk.
- `lib/api/{pagination,response,validate}.ts` clean contract layer, no `any` leakage.
- Payroll tests cover real fixture (Oct 2024) + zero-salary, negative actual-working-days, pro-rata-with-leave edge cases. Not mock-only.
- `unstable_cache` applied with meaningful tags in `parent-helpers.ts`.
- `generateBsiCsv` handles escaping (including embedded quotes/newlines).

#### Critical

1. **`parseSort` arbitrary field injection** (`lib/api/pagination.ts:35`, confidence 88). No allowlist — unknown field throws P2009 leaking schema. Refactor to `$queryRaw` would be actual SQL injection. Fix: accept `allowedSortFields: string[]` param.

2. **`getTodayStudentAttendance` uses UTC `toISOString().slice(0,10)` — Jakarta bug the file warns against** (`lib/parent-helpers.ts:168`, confidence 95). WIB 00:00–06:59 returns yesterday. Comment at :244 already warns against this pattern; :168 repeats it. Fix: `getTodayInTimezone("Asia/Jakarta")` or the local `toLocalYmd` helper already in file.

3. **`getStudentAttendanceRecent` same UTC pattern on `since` cutoff** (`lib/parent-helpers.ts:307`, confidence 82). "Last 30 days" becomes 31.

#### Important

4. **`fmtRp` in `lib/pdf/salary-slip.tsx:225-227` duplicates `formatRupiah` from `lib/format.ts:6-7`** — standard says format.ts is single source.
5. **`gajiPokokAmount` captured before rounding** (`lib/payroll/engine.ts:88-92`). Numerically correct today because `gaji_pokok` sorts first, but no guard — misconfigured sortOrder silently computes `PCT_OF_BASE` against 0. Add sort-order invariant check or two-pass calculation.
6. **`createXenditSessionForInvoice` mixes external HTTP + DB write with no orphan recovery** (`lib/xendit/helpers.ts:51-57`). Xendit session exists, `invoice.update` throws → orphan session, no retry. Log session ID for manual reconciliation at minimum.
7. **Email template unescaped HTML in `employeeName`/`period`** (`lib/email/templates/salary-slip.ts:38-42`). `&` breaks rendering; `<` would be XSS if admin-entered content trusted.

#### Minor

8. **`lib/student-journal/audit.ts:8-13` `diffJson` returns `{before, after}` verbatim — no value, no tests, dead abstraction.**
9. **Zod schemas no phone-format check** — `noHp`/`phone`/`whatsapp` in `lib/validations/{employee,guardian,student}.ts`. `lib/xendit/client.ts formatPhoneE164` assumes Indonesian (0 / +62) — non-ID number produces malformed E.164 to Xendit. Add `/^(\+62|0)\d{8,13}$/`.
10. **BSI `netAmount` field not wrapped via `csvField`** (`lib/payroll/bsi-export.ts:19`) — safe today (integer), document expectation.

#### Standards drift
- `api.md` GET list pagination vs `parseSort`: no allowlist.
- `portal.md` fetch-error contract: `getTodayStudentAttendance` returns `null` on no-record; uncaught Prisma errors become 500 at page instead of empty-state.

**Test coverage gaps (prioritise):** `lib/attendance/status.ts`, `lib/attendance/timezone.ts`, `lib/student-journal/week.ts`, `lib/xendit/client.ts`, `lib/email/send-slip.ts`, `lib/academic-period.ts` (partial — 3 cases), `lib/format.ts` (zero).

**Assessment:** business-logic layer well-structured. Pure/impure separation good. Top fixes: (1) UTC/Jakarta bug in `getTodayStudentAttendance` produces wrong data pre-07:00 WIB daily; (2) `parseSort` unvalidated passthrough hits production as soon as UI sends `sortBy`; (3) Xendit dual-write orphans sessions silently.

---

### T8 — Data Layer & Infra

**Scope:** `prisma/{schema,seed,migrations}`, `lib/db.ts`, `components/ui/**`, `components/{attendance,student-journal,portal}/**`, `config/**`, `next.config.ts`, `tailwind.config.*`, `tsconfig.json`, `package.json`, `vitest.config.ts`, `playwright.config.ts`, `.githooks/**`, `scripts/**`, `.github/workflows/**`.

#### Strengths
- Index coverage thoughtful: composite indexes on most FKs + `[tenantId, status]`, `[studentId, date]`, `[classSectionId, date]` etc.
- `lib/db.ts` clean — correct singleton pattern, adapter-parity comment current, `DATABASE_URL` early guard.
- Seed imports directly from `lib/generated/prisma/client` (own connection lifecycle) — mirrored in pre-commit seed-drift rule.
- `playwright.config.ts` matches CLAUDE.md: `workers: 1`, chromium only, `reuseExistingServer: !CI`, production build.
- Security headers in `next.config.ts`: `X-Frame-Options: DENY`, `nosniff`, HSTS, `Referrer-Policy`.
- `components/ui/status-badge.tsx` uses only DS tokens — zero arbitrary hex across `components/`.
- Hook layering solid: `pre-commit` (4 rules), `commit-msg` (tight feat/perf README rule), `pre-push` (staging/main block all roles), `prepare-commit-msg` (model trailers).
- `scripts/test-hooks.sh` self-cleaning; covers merge/revert/fixup/breaking-change bypass cases.

#### Critical

1. **`User.email` globally unique — breaks multi-tenant** (`prisma/schema.prisma:42`, confidence 88). Every other natural key uses `@@unique([tenantId, ...])`. Tenant-B `admin@school.com` gets P2002 at creation. Drop `@unique`; add `@@unique([tenantId, email])`.

2. **`Program.type` Zod enum out of sync with schema + seed** (`lib/validations/program.ts:7`, confidence 95). Zod: `["SEMESTER","YEARLY"]`. Schema comment + seed (`prisma/seed.ts:253-257`): `SEMESTER | YEAR_ROUND | SESSION`. Admin UI call to create Day Care or Pop Up Class fails validation. Align enum.

3. **`StudentEnrollment` Zod has "TRANSFERRED" not in schema** (`lib/validations/enrollment.ts:5`, confidence 82). Schema comment (`schema.prisma:489`): `ACTIVE | GRADUATED | WITHDRAWN`. Insert as plain `String` succeeds but breaks enum-filter logic.

4. **No `onDelete` rules anywhere** — Prisma defaults to `Restrict`. Any code that deletes a Student/Employee without pre-clearing children throws P2003. Seed works around via manual ordered deletion. Declare `onDelete: Cascade|Restrict` explicitly on 30+ relation fields, especially leaf audit/log/attendance models.

#### Important

5. **`leave.ts` Zod `leaveType: z.string().min(1)`** (`lib/validations/leave.ts:4`) — loses enum safety. Schema: `ANNUAL | SICK | PERMISSION | OTHER`. Use `z.enum`.
6. **`ClassSection` no unique on `[tenantId, academicYearId, name]`** (`schema.prisma:374-393`). Duplicate class names possible; seed re-run produces garbage.
7. **`PayrollRun` no unique on `[tenantId, periodStart, periodEnd]`** (`schema.prisma:256-273`). Concurrent DRAFT runs for same period possible.
8. **No CSP header in `next.config.ts:26`** — other security headers present, CSP absent. Primary XSS mitigation per `security.md`. School ERP handling student data + payments is meaningful target.
9. **`@libsql/client` + `@prisma/adapter-libsql` listed as prod deps but unused** (`package.json:22-23`) — prototype leftovers, supply-chain surface. `@supabase/*` used via `lib/supabase/`. Remove libsql.
10. **CI duplicate build + stale DATABASE_URL** (`.github/workflows/ci.yml:36-58,60-130`). `e2e` job has `needs: build` but rebuilds from scratch. Build job's `DATABASE_URL` points at localhost Postgres that no service container provides — latent failure. Share build artifact.
11. **`components/attendance/calendar.tsx:168-215` hand-rolled `framer-motion` overlay** — Shadcn-FIRST rule says use `Dialog`/`Sheet`. No focus trap, `aria-modal`, or Escape dismiss.

#### Minor

12. **`WeekGrid` `text-[9px]` below `text-xs` floor** (`components/portal/week-grid.tsx:87`).
13. **`pre-commit` Rule 4 reads working-tree, not staged blob** (`.githooks/pre-commit:145-147`). Partial-stage mismatch. Use `git show :$doc`.
14. **`docs-check.yml` doesn't enforce tight feat/perf README rule** — only replicates broad Rule 2. Bypass with `--no-verify` on `feat:` still lets README history drift.

#### Standards drift
- Token usage clean; no arbitrary hex in `components/ui/` or portal/attendance components. Status colors use `bg-status-*-subtle`, `text-status-*-text`, `bg-status-*`.
- `components/ui/` mixes stock Shadcn + local primitives (data-table, status-badge, empty-state, form-field, field, section-heading, confirm-dialog, button-group, combobox, native-select, spinner, input-group, item, kbd). Consider subdir or comment header to distinguish.

**Assessment:** infra/hooks/CI unusually well-engineered. Most urgent: two enum mismatches (`Program.type`, `leaveType`) cause silent UI validation rejections today; `User.email` unique blocks multi-tenant expansion that schema claims to support; missing cascade-deletes surface as P2003 as delete flows land. Libsql dead-weight removal is hygiene.

---

## Verification

This is a review-only cycle. No code changes were made in this worktree — the deliverable is this Findings document. Gates run:

- [ ] `npm run build && npx vitest run` — run as end-of-cycle gate before the single doc commit.
- [ ] Playwright skipped — no UI changes.
- [x] All 8 module reviews completed and findings integrated.

Cross-checked `design-system.html` §Tokens + §Overlays for overlay-related findings (T5 #1 ConfirmDialog, T6 text-size violations, T8 #11 calendar overlay).

## Triage — Top 10 Ranked Follow-ups

Ordered by production impact × exploitability × ease of fix. Each line: severity · title · one-line fix · owning module · estimated cycle size.

| # | Sev | Title | Fix | Owner | Size |
|---|-----|-------|-----|-------|------|
| 1 | **CRIT** | Xendit webhook `pg_advisory_xact_lock` cast throws on every call — no payment ever marks PAID | Replace UUID-to-hex cast with `hashtext(${invoice.id})` | T3 | XS |
| 2 | **CRIT** | `getStudentInvoices` shared `unstable_cache` key leaks invoices across parents | Add `studentId` to cache key array; add `tenantId` to Prisma where | T4 | XS |
| 3 | **CRIT** | `GET /api/students` + `GET /api/employees` expose PII to TEACHER + GUARDIAN roles | Add `if (!isAdminRole(session.role)) return 403` to collection GETs; build scoped teacher route | T1 | S |
| 4 | **CRIT** | Parent portal 35+ `text-[11px]` + `text-[10px]` violate portal grep gate (WCAG + standard) | Bulk `text-[11px]/text-[10px] → text-xs` across 7 files + adjust KidCard day-strip | T6 | S |
| 5 | **CRIT** | `<ConfirmDialog>` built on `<Dialog>` not `<AlertDialog>` — affects every destructive admin action | Rebuild `ConfirmDialog` on `AlertDialog` primitive | T5 | S |
| 6 | **CRIT** | `student-attendance/mark` + `student-attendance` teacher mode: no role check, no Zod, missing tenant on assignment lookup | Add `requireTeacherForClass`, Zod status enum, tenant filter on `TeachingAssignment.findFirst` | T4 | S |
| 7 | **CRIT** | `getTodayStudentAttendance` uses UTC `toISOString()` — wrong date 00:00–07:00 WIB daily | Use `getTodayInTimezone("Asia/Jakarta")` or local `toLocalYmd` helper | T7 | XS |
| 8 | **CRIT** | Promote + bulk-promote capacity checks outside transaction — over-enrollment race | Move capacity check inside `$transaction` + `SELECT … FOR UPDATE` (mirror enroll route) | T2 | S |
| 9 | **CRIT** | Payroll variables endpoint non-atomic 4-step write | Wrap delete + createMany + item update in single `$transaction` | T3 | XS |
| 10 | **CRIT** | Prisma schema: `Program.type` + `StudentEnrollment` status + `leaveType` Zod/schema mismatch; no `onDelete` rules; `User.email` global unique | Single "schema + Zod alignment" cycle: fix three enums, declare `onDelete` on 30+ relations, change `User.email` to composite | T8 | M |

**Secondary bench** (do after top-10, batch into 2-3 cycles):
- CSP header (T8 #8).
- Stats endpoints replacing N×`pageSize=1` calls (T5 #5, T2 #15).
- `revalidate` + session-auth conflict across admin-core routes (T2 #14).
- Household Overview ≥3-kid branch + student-journal optimistic toggle (T6 #6,#7).
- Rate-limit gaps: `POST /api/invoices/[id]/payments`, `PUT /api/invoices/[id]`, `PUT /api/employees/[id]/salary`, `POST /api/salary-components` (T1 #3-4, T2 #11, T3 drift).
- Zod validation gaps: payroll/generate, invoice/generate, class-sections, programs, employees/salary, leave overlap, student-attendance/mark (T1 #5-6, T2 #9-12, T4 #2).
- Spacing token drift (T5 #7) — sweep cycle or gradual per-page migration.
- Admin accessibility: `aria-label` on every icon button + admin `<button>` → `<Button size="icon">` (T5 #3) — accessibility sweep cycle.

**Deferred** (hygiene / future-proofing):
- `parseSort` allowlist (T2 #13, T7 #1).
- `createXenditSessionForInvoice` dual-write recovery (T7 #6).
- Email template HTML escape (T3 #7, T7 #7).
- `@libsql/client` + `@prisma/adapter-libsql` removal (T8 #9).
- CI build-artifact share (T8 #10).
- `components/attendance/calendar.tsx` migrate to Shadcn overlay (T8 #11).

## Ship Notes

- **Migrations:** none.
- **New env vars:** none.
- **Rollback plan:** none needed — documentation-only change.
- **Follow-up cycles:** the Triage table above is the backlog. Suggested cycle ordering:
  1. `critical-money-and-auth-hotfix` — items 1, 2, 3, 6, 9 (single bundle; all security/data-integrity, small diffs)
  2. `parent-portal-text-size-sweep` — item 4
  3. `confirmdialog-to-alertdialog` — item 5
  4. `jakarta-date-and-race-fixes` — items 7, 8
  5. `prisma-schema-zod-alignment` — item 10

<!-- design-system baseline consulted: §Tokens, §Overlays (Dialog vs AlertDialog rule), §Portal text-size scale. -->
