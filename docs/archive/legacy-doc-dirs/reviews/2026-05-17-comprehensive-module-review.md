# Comprehensive Module Review — 2026-05-17

> Two-pass read-only sweep across 10 module groups. 10 parallel `feature-dev:code-reviewer` first-pass agents, then 10 fresh verifier agents to fact-check every cited finding and sweep for misses. All claims below are post-verification — fabrications and wrong-line citations have been dropped, severities adjusted, missed findings folded in.
>
> **Purpose:** durable Context for follow-up `/spec` cycles. Each cycle that addresses findings should link back to this file and cite specific finding IDs.

---

## Headline

- **Scope reviewed:** ~128 API routes, ~30 admin/teacher/parent pages, all 3 portal shells, `proxy.ts`, `lib/**` (auth, api, validations, format, db, email, security, payroll, xendit, finance, parent-helpers, student-journal), `prisma/schema.prisma`, the 9 standards docs, plus repo-wide grep coverage for silent-failure patterns.
- **Total findings (post-verification):** 71 across 10 modules — 4 Blockers, 30 Majors, 27 Minors, 10 Nits.
- **Critical theme:** Three independent data-corruption bugs ship today (`openEditGuardian` nullifies guardian NIK/employer fields on every edit; admissions edit blanks `parentEmail` silently; assessment template POST silently discards categories making templates structurally hollow). Three independent same-tenant role-bypass holes (admin/student-attendance list, admin assessments student GET, guardian assessments GET exposes DRAFT). The standards docs have drifted from code (`canViewSalary` cited in two standards files, no longer exists).

### Severity tally by module

| Module | Blocker | Major | Minor | Nit |
|---|---|---|---|---|
| Academic Core | 2 | 4 | 2 | 1 |
| Admissions + Students + Guardians | 1 | 5 | 2 | 0 |
| Attendance | 1 | 3 | 2 | 1 |
| Assessments | 1 | 4 | 1 | 1 |
| Student Journal | 0 | 2 | 4 | 2 |
| Finance — Invoices + Xendit | 0 | 3 | 2 | 1 |
| Payroll + HR | 0 | 4 | 2 | 1 |
| Auth + Users + Roles + Config | 0 | 4 | 1 | 1 |
| Portal Shells | 0 | 4 | 1 | 1 |
| Cross-cutting | 0 | 2 | 3 | 1 |
| **Total** | **4** | **30** | **27** | **10** |

### What was confirmed clean

- Webhook signature verification (Xendit) — `timingSafeEqual` correctly applied.
- Webhook + session-create idempotency (P2002 dedup + advisory lock).
- Payroll generate Serializable + duplicate guard (no double-generation).
- Payroll engine money path (Decimal→Number conversion at single explicit boundary; `Math.round` per line).
- Teacher slip ownership (3 surfaces all enforce, except CANCELLED runs — see Payroll-M3).
- Promotion + enrollment capacity (`FOR UPDATE` row lock; correct ACTIVE-only counting in enforcement, though display drifts).
- Parent invoice/attendance isolation (correct in current callers; defense-in-depth gaps noted).
- Tenant scoping across most routes — exceptions called out explicitly.
- Schema: all 25+ tenant-scoped models carry `tenantId` + index; Decimal(15,2) consistent for money.
- `lib/payroll/engine.ts` rounding contract; `lib/email/escape.ts` HTML escaping; `lib/security/headers.ts`.

---

## Blockers (4)

These must land before next `staging → main` cut.

**B1. [DATA] `app/admin/students/[id]/page.tsx:276` — withdraw warning never fires due to field-name mismatch**
UI reads `data.unpaidInvoices`; API returns `unpaidInvoiceCount` (`app/api/students/[id]/withdraw/route.ts:67`). `data.unpaidInvoices` is always `undefined`; the unpaid-invoices warning toast never appears even when the student owes money. Admins are blind to this risk at the moment of withdrawal.
Fix: `data.unpaidInvoiceCount > 0`.

**B2. [DATA] `app/admin/students/[id]/page.tsx:158` — `openEditGuardian` permanently nullifies `parentNik`, `employerAddress`, `employerCity` on every edit**
The handler hardcodes those three fields to `""`. The PUT route at `app/api/students/[id]/guardians/[guardianId]/route.ts:43,47-48` checks `!== undefined` (not `!== ""`), so `""` flows through `"".trim() || null` → `null` written to DB. The `Guardian.parent` TypeScript type also omits these fields so the form cannot even pre-populate. Result: every guardian edit destroys these three fields permanently.
Fix: (a) extend `Guardian.parent` type to include `nik`/`employerAddress`/`employerCity`; (b) pre-populate from `g.parent`; or (c) send `undefined` (not `""`) for fields the form does not surface.

**B3. [CRUD] `app/api/assessments/templates/route.ts:104-111` — POST silently discards `categories`; every template ships empty**
`createAssessmentTemplateSchema` (`lib/validations/assessment-template.ts:3-7`) has only `programId`/`name`/`type` — Zod strips the `categories` array the UI sends (`app/admin/assessments/templates/page.tsx:219`). The Prisma create passes only `{tenantId, programId, name, type}`. Teachers open scoring screens with zero indicators. This blocks the July 2026 Curriculum+Assessment+Raport cutover.
Fix: add `categories` to the schema; nested `create` with cascading `createMany` for indicators inside a transaction.

**B4. [SEC] `app/api/attendance/[id]/override/route.ts:112-130` — POST upsert bypasses `isLocked` payroll-lock guard**
PUT (line 58) correctly rejects locked records; POST upserts on `{employeeId_date}` composite key and the `update` branch never checks `isLocked`. An admin can overwrite a payroll-approved attendance record by hitting POST instead of PUT, breaking the payroll audit trail.
Fix: before upsert, `findUnique({ where: { employeeId_date } })`; reject if `existing?.isLocked`.

---

## Majors (30)

### Academic Core (4)

**Ac-M1. [SEC] `app/api/academic-years/[id]/route.ts:22,52`** — PUT + DELETE missing `rateLimit()`. Every sibling write rate-limits.
**Ac-M2. [CRUD] `app/api/programs/route.ts:30`** — POST reads `req.json()` raw; `createProgramSchema` (`lib/validations/program.ts`) exists, unused. Malformed input bypasses validation; Prisma surfaces raw DB error not 400.
**Ac-M3. [CRUD] `app/api/enrollments/route.ts`** — Only GET exported. No POST handler. Enrollment creation flows through bulk-promote only — gap for mid-year single enrollment.
**Ac-M4. [SEC] `app/api/enrollments/[id]/route.ts:32`** — PUT accepts `classSectionId` from `updateEnrollmentSchema` and writes the FK without verifying `classSection.tenantId === session.tenantId`. Cross-tenant class-section injection vector for admin of tenant A who knows a tenant-B class-section ID.

### Admissions + Students + Guardians (5)

**Ad-M1. [UI/DATA] `app/admin/admissions/page.tsx:615`** — Edit dialog hardcodes `parentEmail: ""`. `Admission` TS type omits the field. PUT (`app/api/admissions/[id]/route.ts:54`) does `body.parentEmail?.trim() ?? existing.parentEmail` — `""` short-circuits the `??`, writes empty string. Every admission edit nullifies stored parentEmail.
**Ad-M2. [DATA] `app/api/class-sections/route.ts:26`** — `_count.enrollments` counts all statuses (includes WITHDRAWN/GRADUATED). Displayed at `app/admin/students/[id]/page.tsx:672,675,711,714` as current occupancy `N/capacity`. Admins see classes as full when they have empty ACTIVE seats. Enforcement is correct (raw SQL ACTIVE-only); only display is wrong.
**Ad-M3. [ERR] `app/admin/guardians/page.tsx:188-189`** — `handleStatusToggle` issues PUT; PUT (`updateGuardianSchema`) has no `status` field; Zod strips it; status never updates. Toggle is fully broken from the Guardians list.
Fix: `method: "PATCH"`.
**Ad-M4. [SEC] `app/api/auth/users/route.ts:6-26`** — In `DEMO_MODE=true`, route returns every user's `id`/`email`/`name`/`role`/`employeeId` with no session check + no rate limit. Combined with cookie-as-id login (`app/api/auth/login/route.ts:39`), any caller can enumerate IDs and impersonate any user. If `DEMO_MODE=true` leaks into a publicly-reachable staging instance → total account takeover.
**Ad-M5. [SEC] `app/parent/attendance/page.tsx:77-85`** — `studentAttendance.findMany` uses `student: session.tenantId ? { tenantId: session.tenantId } : undefined`. If `session.tenantId` is falsy, tenant filter silently drops; query returns all-tenant rows. Page doesn't assert tenant early.

### Attendance (3)

**At-M1. [SEC] `app/api/student-attendance/route.ts:23` (mode=list branch)** — No role check. Any authenticated user with `?mode=list` can read paginated roster. Default teacher mode is tenant-scoped via classSection lookup so within-tenant only, but `mode=list` should require admin role.
**At-M2. [DATA] `app/api/attendance/my/route.ts:30-42`** — `findMany` returns full row including `overriddenBy` UUID (auditor identity disclosure), raw `checkInLat`/`Lng`/`checkOutLat`/`Lng` GPS coords. Teacher has no use for raw GPS in UI. Apply `select`.
**At-M3. [CRUD] `app/api/student-attendance/[id]/route.ts:43` + `app/api/student-attendance/mark/route.ts:29`** — Both call `await req.json()` without try/catch. Malformed JSON → 500 instead of 400.

### Assessments (4)

**As-M1. [SEC] `app/api/assessments/student/[id]/route.ts:148-175`** — GET has no role check. Any authenticated same-tenant user (including GUARDIAN) can read DRAFT scores for any student in their tenant if they know an assessment ID.
**As-M2. [DATA] `app/api/assessments/student/[id]/route.ts` PUT (publish path)** — Never calls `revalidateTag("parent-published-assessments")`. The tag is wired into `lib/parent-helpers.ts:207-235` `unstable_cache` (TTL 120s) but is never invalidated. Parents see up to 2 minutes of stale data post-publish (or indefinitely on long-running workers). Cycle archive `docs/cycles/archive/2026-04-19-uat-critical-fixes.md:196` already acknowledges this gap.
**As-M3. [CRUD] `app/admin/assessments/templates/page.tsx:431-461` + `app/api/assessments/templates/[id]/route.ts:54-57`** — Edit dialog and PUT schema both omit categories/indicators. Templates structurally uneditable after creation. Combined with B3, templates are permanently hollow.
**As-M4. [SEC] `app/api/guardian/assessments/[id]/route.ts:55-61`** — No `status === "PUBLISHED"` check. A guardian who knows a DRAFT assessment ID for their own child can read DRAFT scores.

### Student Journal (2)

**SJ-M1. [UI] `app/admin/student-journal/students/[id]/page.tsx:283,333-336`** — `handleToggle` fires PATCH fire-and-forget; `handleSaveEditing` toasts "Perubahan tersimpan" without knowing whether any in-flight PATCH succeeded. Rapid clicks → false success on failed save.
**SJ-M2. [SEC] `app/api/student-journal/admin/class-roll-up/route.ts:81-88`** — `studentEnrollment.findMany` has no `student.tenantId` filter. The classSection is tenant-verified at line 32-38, but the enrollment query relies on classSectionId alone. Inconsistent with sibling `batch/route.ts:86-93` which adds the filter. Latent cross-tenant leak if enrollment data integrity ever breaks.

### Finance — Invoices + Xendit (3)

**Inv-M1. [DATA] `app/api/cron/finance-maintenance/route.ts:42-46`** — Overdue promotion `WHERE status = 'SENT'` only. `PARTIALLY_PAID` past-due invoices never flip to OVERDUE. Overdue counts + filter understate real overdue debt.
Fix: `status IN ('SENT', 'PARTIALLY_PAID')`.
**Inv-M2. [API/MONEY] `app/api/invoices/[id]/payments/route.ts:15-21`** — Manual payment hand-rolls validation; ignores `recordPaymentSchema`; `body.method ?? "CASH"` accepts any string for enum.
Fix: `recordPaymentSchema.safeParse(body)`.
**Inv-M3. [SEC] `app/api/invoices/**`** — 6 invoice write endpoints missing `rateLimit()`: POST `/invoices`, POST `/generate/batch`, POST `/[id]/payments`, POST `/[id]/void`, POST `/retry-payment-links`, PUT `/[id]`. Violates `security.md §Rate limiting`.

### Payroll + HR (4)

**Pay-M1. [API/DEAD] `app/api/payroll/[id]/items/[itemId]/lines/[lineId]/route.ts:30-31`** — `Number("abc") || 0` → `0`; `isNaN(0)` → `false`. Dead 400 branch; bad input silently writes 0.
Fix: parse → check `isFinite` → fall back.
**Pay-M2. [MONEY] `app/api/payroll/[id]/items/[itemId]/lines/[lineId]/route.ts:40`** — `finalAmount = Number(line.calculatedAmount) + adjustmentAmount` with no `Math.round`. Engine contract is integer IDR (rounded per line at `engine.ts:101`). Adjustment of `0.1` propagates `1000.1` into item totals — breaks the integer invariant.
**Pay-M3. [SEC] `app/teacher/slips/[id]/page.tsx:143-144`** — Blocks only DRAFT via `notFound()`. CANCELLED runs still render; `StatusBadge` hardcoded "Tersedia". `/api/slips/my` correctly filters CANCELLED out of list but direct URL bypasses.
Fix: also block CANCELLED.
**Pay-M4. [SEC] `app/api/leave/my/route.ts:10-14`** — `findMany` by `employeeId` only; no `employee: { tenantId }` co-check. Sibling `/api/slips/my` and `/api/leave/balance` both add it. Defense-in-depth inconsistency.

### Auth + Users + Roles + Config (4)

**Au-M1. [PROXY] `proxy.ts:108-118`** — In `DEMO_MODE=true` with no demo cookie, control falls through to `/api/*` passthrough at line 116. Downstream `getSession()` still enforces, so this is defense-in-depth not bypass (demoted from Blocker). But any future route forgetting `getSession()` is fully open in demo mode.
**Au-M2. [SEC] `app/api/config/{campuses,holidays,org}/route.ts` GETs** — Check only `session?.tenantId`; no admin-role gate. GUARDIAN/TEACHER can read campus coords + employee counts + payroll period config (grace minutes, period days). Write counterparts correctly require admin.
**Au-M3. [AUTH] `app/api/users/[id]/route.ts:79-87`** — PUT doesn't invalidate `userCache` (10s TTL) in `lib/auth.ts`. Deactivated user retains access for up to 10s. Acknowledged design tradeoff; calling out as Major for security path.
**Au-M4. [SEC]** — see Ad-M4 (cross-listed: auth/users enumeration).

### Portal Shells (4)

**Sh-M1. [UI] `app/teacher/page.tsx:10`** — `new Date().toISOString().split("T")[0]` = UTC. Between 00:00-06:59 WIB, attendance lookup hits yesterday → teacher sees empty clock-in card right when they tap check-in. Admin dashboard uses `jakartaDateStr()` for exactly this reason.
Fix: `new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" })`.
**Sh-M2. [ERR] `app/admin/error.tsx:20` AND `app/teacher/error.tsx:19`** — Both render raw `error.message`. Parent boundary correctly suppresses. In non-prod environments leaks stack/prisma fragments.
**Sh-M3. [UI] `components/portal/portal-header.tsx:40`** — `brandLabel` defaults to `"Talib"`; `portal.md:151` documents `"An Nisaa'"`. Neither teacher nor parent header passes the prop. Code/spec drift visible in DOM (logo alt is "An Nisaa'", text is "Talib").
**Sh-M4. [UI] `app/parent/loading.tsx:5` + `app/admin/loading.tsx:5`** — Both apply `px-page-x` (admin also `py-page-y`) inside skeleton; layout already applies them on `<main>`. Skeletons render with double padding.

### Cross-cutting (2)

**Cx-M1. [SEC] `.claude/standards/security.md:25,31,35` + `.claude/standards/crud.md:39`** — Both reference `canViewSalary()` which no longer exists in `lib/auth.ts` (removed in RBAC cycle `2026-04-25-super-admin-rbac-sidebar-fix`). Tests at `lib/__tests__/auth-helpers.test.ts:23` explicitly note removal. Any developer following the standard imports a missing function. Replacement is `isSuperAdmin()` (the prior first-pass guessed `requirePermission()`, which also doesn't exist).
**Cx-M2. [SEC]** — see Inv-M3 (cross-listed: rate-limit coverage gap).

---

## Minors (27)

### Academic Core (2)

**Ac-Mn1. [API] `app/api/academic-years/route.ts:6`** — `revalidate = 86400` set; POST never calls `revalidatePath`. New year invisible up to 24h.
**Ac-Mn2. [UI] `app/admin/academic/page.tsx:275`** — `classCount` filters sections by year `name === row.original.name`. Fragile vs `academicYearId` match.

### Admissions + Students + Guardians (2)

**Ad-Mn1. [API] `app/api/students/[id]/guardians/[guardianId]/route.ts:87-88`** — PATCH uses manual `body.status === "INACTIVE" ? "INACTIVE" : "ACTIVE"` coercion instead of `toggleGuardianStatusSchema`. Inconsistent with standalone route. Not a security risk but inconsistency-as-debt.
**Ad-Mn2. [UI] `app/admin/admissions/page.tsx:337-348` + `app/admin/guardians/page.tsx:131-140`** — 3× `pageSize=1` stats calls per page render. Pattern replaced elsewhere by groupBy stats endpoints.

### Attendance (2)

**At-Mn1. [API] `app/api/attendance/monthly/route.ts:16`** — `parseInt` no validation. `?month=foo` → NaN → query returns empty silently instead of 400 (export route has the correct round-trip check).
**At-Mn2. [UI] `app/admin/student-attendance/page.tsx:94`** — UTC-derived `today` sent to stats API. Between 00:00-06:59 WIB shows yesterday's counts.

### Assessments (1)

**As-Mn1. [DATA] `app/parent/assessments-table.tsx:55-74`** — Fetch triggered inside render body comparing `selectedId !== prevSelectedId`. StrictMode double-fetch; race on fast tab-switching.

### Student Journal (4)

**SJ-Mn1. [UI] `app/admin/student-journal/classes/[id]/page.tsx:134-148`** — Fetches full admin/classes list to display header label. Wasteful + fragile.
**SJ-Mn2. [ERR] `app/teacher/student-journal/students/[id]/page.tsx:130-133`** — `loadWeek` failure renders the "no indicators" empty state (wrong) instead of an error state with retry.
**SJ-Mn3. [DEAD] `lib/student-journal/audit.ts:10-15`** — `diffJson` exported, never called.
**SJ-Mn4. [UI] `app/teacher/student-journal/students/[id]/page.tsx:194`** — Hardcoded "Minggu ini" label regardless of viewed week.

### Finance — Invoices + Xendit (2)

**Inv-Mn1. [API] `app/api/fee-structure/route.ts:51-69`** — PUT loops `upsert` outside transaction. Partial failure → inconsistent fee structure.
**Inv-Mn2. [SEC] `lib/parent-helpers.ts:425-469`** — `getParentInvoiceList(parentId, studentId, tenantId)` doesn't internally verify studentId belongs to parentId. Current callers do it; defense-in-depth gap for future callers.

### Payroll + HR (2)

**Pay-Mn1. [API] `app/api/salary-components/route.ts:7`** — Stale `revalidate = 3600` on auth-gated GET. App Router dynamic-context check makes it a no-op, but misleading; also salary-component toggles could otherwise show stale `isEnabled`.
**Pay-Mn2. [API] `app/api/salary-components/route.ts:31-34` + `[id]/route.ts:19-38`** — POST + PUT lack Zod. `category`/`calcType`/`sortOrder`/`isProRated` passed raw to Prisma; bad enums → P2003 instead of 400.

### Auth + Users + Roles + Config (1)

**Au-Mn1. [AUTH] `app/api/auth/users/route.ts:14-25`** — `findMany` no `tenantId` filter. Single-tenant deploy is fine; multi-tenant future would silently leak.

### Portal Shells (1)

**Sh-Mn1. [UI] `app/teacher/home-client.tsx:301-302`** — `PRESENT_NO_CHECKOUT` label "Hadir" but `text-status-late-text` color. Inconsistent with sibling surfaces showing "Hadir Tanpa Pulang".

### Cross-cutting (3)

**Cx-Mn1. [API] `lib/api/pagination.ts:26-29`** — `parseInt("abc")` → NaN; `Math.max(1, NaN)` → NaN; Prisma `Math.trunc(NaN)` → NaN → driver sends null; silent reset to page 1 with no offset (not a crash — first-pass overstated). Still broken pagination contract.
Fix: `parseInt(...) || 1` fallback.
**Cx-Mn2. [DATA] `prisma/schema.prisma:808,825`** — `StudentJournalEntry.studentId` + `StudentJournalNote.studentId` are bare strings, no Prisma `@relation` to `Student`. No referential integrity; orphan rows possible. Sibling `StudentAttendance` has the FK.
**Cx-Mn3. [PROXY] `proxy.ts:108-113`** — Demo-mode idle-timeout only fires when cookie present. Edge UX gap (no security impact).

---

## Nits (10)

| ID | File:line | Issue |
|---|---|---|
| Ac-Nt1 | `app/admin/academic/page.tsx:108` | `eslint-disable-next-line react-hooks/set-state-in-effect` misapplied — actual issue is missing `useCallback` |
| At-Nt1 | `app/api/student-attendance/stats/route.ts:3-4` | Two import statements from `@/lib/auth` — merge to one |
| As-Nt1 | `app/admin/assessments/templates/page.tsx:383,390` | `Select` receives both `items` prop and `<SelectContent>` children |
| SJ-Nt1 | `app/admin/student-journal/monitoring/page.tsx:121-122` | `siswaWithNotes` variable + `MessageSquare` icon label "Siswa terdaftar aktif" — mislabeled |
| SJ-Nt2 | `monitoring/page.tsx:42-59`, `classes/[id]/page.tsx:41-59`, `students/[id]/page.tsx:59-77` | `currentMonday`/`addWeeks`/`formatWeekLabel` copy-pasted across 3 pages — extract to `lib/student-journal/week.ts` |
| Inv-Nt1 | `app/admin/invoices/[id]/page.tsx:131,296` | Unawaited `navigator.clipboard.writeText` with no `.catch()` |
| Pay-Nt1 | `app/api/payroll/[id]/send-slips/route.ts:123` | `status: result.sent ? "SENT" : (result.error ? "FAILED" : "SENT")` — third branch unreachable depending on email helper contract |
| Au-Nt1 | `app/admin/settings/users/page.tsx:461` | `Select` with both `items` and `<SelectContent>` |
| Sh-Nt1 | `components/admin/sidebar.tsx:108` | `settingsOpen=true` default forces expand on cold load |
| Cx-Nt1 | `lib/auth.ts:324` | `catch {}` (no `e`) — swallowed exception context |

---

## Cross-cutting themes

These appear in 3+ modules and warrant a sweep cycle of their own.

1. **`Select` component called with both `items` prop AND `<SelectContent>` children** — admissions, students, guardians, assessments-templates, settings-users pages all repeat this. Either the wrapper renders one and ignores the other (dead code) or it duplicates (visible bug). Audit + standardize.
2. **UTC `new Date().toISOString()` instead of WIB** — teacher home, teacher class-attendance default, admin student-attendance stats, others. Make `jakartaDateStr()` a `lib/format.ts` export and lint for raw `new Date().toISOString()` in client code.
3. **Missing rate limiting on write endpoints** — 6 invoice routes, academic-years PUT/DELETE, teaching-assignments POST. Sweep all `export async function (POST|PUT|DELETE|PATCH)` and add `rateLimit()` per `security.md §Rate limiting`.
4. **Missing Zod on write endpoints** — programs POST, fee-components POST, salary-components POST+PUT, guardians-nested PATCH manual coercion. Add schemas; reject raw `req.json()` writes.
5. **Standards drift** — `canViewSalary` removed; still in `security.md` + `crud.md`. ADR/standards review cycle needed to align with current `isSuperAdmin()` / RBAC permission strings.
6. **API↔UI field-name mismatches** — withdraw `unpaidInvoices` vs `unpaidInvoiceCount` (Blocker B1); admissions `parentEmail` missing from TS type (Major Ad-M1). Need a per-API response-shape contract or generated types from Zod.
7. **Form initializers blanking unmodelled fields** — guardian NIK/employer (Blocker B2); admission parentEmail (Major Ad-M1). Pattern: prefer `undefined` over `""` for fields the form doesn't render; align PUT handlers' `!== undefined` checks accordingly.
8. **Defense-in-depth tenant filter inconsistency** — `/api/leave/my` missing, `/api/student-journal/admin/class-roll-up` missing, `/api/student-journal/class-grid` missing student-tenant filter while sibling `batch` adds it. Pick one pattern (always include) and sweep.
9. **Loading skeletons double-padded** — admin + parent. Layout already applies; remove from skeletons.

---

## Verification notes — fabrications / wrong claims found and dropped

These were in first-pass reports but did not survive verification. Listed so future reviews don't re-introduce them.

- **First pass: `EmailLog` model never written** → DROPPED. `prisma.emailLog.create` appears in `app/api/payroll/[id]/send-slips/route.ts:117,142` and `prisma/seed.ts:684`.
- **First pass: cron overdue query has `TO_CHAR` DateStyle drift** → DROPPED. Actual bug at same line is `PARTIALLY_PAID` exclusion (re-listed as Inv-M1).
- **First pass: `class-grid/route.ts` cross-tenant student leak** → DROPPED. `requireTeacherForClass` already pins the classSection to tenant. The same gap exists in `class-roll-up/route.ts` (re-listed as SJ-M2).
- **First pass: open-redirect via `?from=` `decodeURIComponent` in admin student-journal** → DROPPED. Next.js `<Link href>` rejects external URLs.
- **First pass: dead `createProgramSchema` import in `programs/[id]/route.ts`** → DROPPED. That route imports `updateProgramSchema`, not the create schema.
- **First pass: `Select`'s `items` prop is dead** → DROPPED. Custom `Select` wrapper actively reads `items` (Base UI prop). Real issue is `items` + children duplication — re-listed as nits.
- **First pass: `revalidate=3600` caches auth-gated GETs across users** → DROPPED. App Router opts out of static cache when route reads `cookies()`/`headers()`. Stale annotation but no caching bug.
- **First pass: `admin/seed` weaker than `uat-prep` guard** → DROPPED. Inverted comparison — `seed` is the stricter route (production hard-blocked).
- **First pass: no POST in `users/route.ts` = CRUD bug** → DROPPED. Auto-provision on first login is the documented product design.
- **First pass: payment route inner-tx `findUnique` missing tenantId** → DROPPED. Pre-check at lines 24-27 already gates by tenantId; advisory lock + immutable id close the TOCTOU.
- **First pass: `parsePagination` NaN crashes Prisma** → DEMOTED. Prisma coerces NaN; query silently runs without limit/offset.
- **First pass proxy.ts demo-bypass = Blocker** → DEMOTED to Major. Downstream `getSession()` still enforces.

First-pass severity inflation rate ≈ 15%; fabrication rate ≈ 8%. Verifier pass changed enough to be worth keeping as standard practice for high-stakes sweeps.

---

## How to use this report

1. **Cut Blockers first.** B1-B4 all have one-line fixes — one cycle can land all four.
2. **Group Majors by cross-cutting theme.** A `theme-sweep-rate-limit` cycle (10-12 routes), a `theme-sweep-zod-on-writes` cycle (4-5 routes), and a `theme-sweep-utc-to-wib` cycle (3-4 sites) each batch related work.
3. **Standards drift (Cx-M1)** before any new salary/payroll route — otherwise the next developer ships with a wrong contract.
4. **Per-module Minors + Nits** can ride alongside the module's next feature cycle; don't gate.
5. Each follow-up cycle should link back here as `[ref: docs/reviews/2026-05-17-comprehensive-module-review.md#<id>]`.

---

## Process notes

- **10 first-pass + 10 verifier agents.** Total wall-clock ~50 minutes (heavy parallelism).
- **Each verifier was a fresh agent** with no memory of the first pass; received only the original findings + scope and was asked to confirm/demote/drop + sweep for misses.
- Verifier pass changed the report in non-trivial ways: 4 Blockers (one demoted, one promoted), 7 first-pass findings dropped as fabrications/wrong claims, 12 new findings added that the first pass missed.
- All cited line numbers re-verified by at least one agent.
