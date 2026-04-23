# ConfirmDialog→AlertDialog + Jakarta TZ + Promote Races + Schema/Zod Alignment

**Date:** 2026-04-24
**Role:** cto
**Cycle type:** Code — three sub-bundles, one cycle

## Context

Follow-up to `docs/cycles/2026-04-24-comprehensive-code-review.md` Triage table. Items 1-4 landed via `critical-money-and-auth-hotfix` + `parent-portal-text-size-sweep`. Remaining CRIT findings: **5 (ConfirmDialog primitive), 7 (Jakarta TZ bug), 8 (promote capacity races), 10 (Prisma schema + Zod alignment)**.

Three independent sub-bundles, one cycle (not one commit) — ordered A→B→C by blast radius: isolated UI primitive → API + lib → schema + migration.

Self-review against staging HEAD `fdb6a63` confirmed every file:line in the review doc still matches current code (lines for `lib/parent-helpers.ts` shifted by +11/+12 due to earlier cache-comment insertion, `schema.prisma` User model moved from 42→39, etc.). No overlap with already-merged PRs.

### Cross-references
- `.claude/standards/ui.md` — Shadcn-FIRST, overlays rule, variant="destructive" rule
- `.claude/standards/design-system.html` §Overlays — AlertDialog rule for destructive confirms
- `.claude/standards/api.md` — transaction boundaries, mutation shape
- `.claude/standards/security.md` — Zod at boundary, role gates
- `lib/attendance/timezone.ts` — canonical `getTodayInTimezone`
- `app/api/students/[id]/enroll/route.ts` — reference pattern for capacity race fix (SELECT … FOR UPDATE inside `$transaction`)

## Spec

### Success criteria (across three sub-bundles)

**A · ConfirmDialog→AlertDialog**
- `components/ui/confirm-dialog.tsx` internals rebuilt on Radix `AlertDialog` primitive
- Public API preserved: `{ open, onOpenChange, title, description, confirmLabel, cancelLabel, onConfirm, destructive, loading }`
- Destructive button uses `variant="destructive"` (token, no inline `bg-destructive`)
- Auto-close only on successful `onConfirm` resolution — dialog stays open if promise rejects
- Vitest covers both success + rejection paths
- Playwright smoke: existing destructive flows (invoice void, student graduate/withdraw, enrollment void, campus deactivate) still close on success, still show error toast on failure

**B · Jakarta TZ + promote races**
- `lib/parent-helpers.ts` `getTodayStudentAttendance` uses `getTodayInTimezone("Asia/Jakarta")`
- `lib/parent-helpers.ts` `getStudentAttendanceRecent` uses local `toLocalYmd` helper
- Vitest mocks system time to 02:00 WIB + 22:00 WIB; both helpers return correct local date
- `POST /api/students/[id]/promote` capacity check inside `$transaction` with `SELECT … FOR UPDATE` (mirrors enroll route)
- `POST /api/promotions` bulk promote: target capacity fetched inside transaction via FOR UPDATE, not from outer `targetSection`
- Vitest: two concurrent promotes to full class — one succeeds, one gets 400 capacity error
- Vitest: concurrent bulk promotes — total inserts never exceed capacity
- `app/api/attendance/today/route.ts:12` uses `getTodayInTimezone` fallback

**C · Prisma schema + Zod alignment**
- `lib/validations/program.ts` enum = `["SEMESTER", "YEAR_ROUND", "SESSION"]` (matches schema comment + seed); no stray "YEARLY" references
- `lib/validations/enrollment.ts` enum drops `"TRANSFERRED"` (schema is source of truth)
- `lib/validations/leave.ts` → `leaveType: z.enum(["ANNUAL", "SICK", "PERMISSION", "OTHER"])`
- `schema.prisma` every relation has explicit `onDelete` — core entities (Student/Employee/ClassSection/Parent/Program/AcademicYear/Campus/Tenant): `Restrict`; leaf/audit/log: `Cascade` (StudentAttendance, StudentJournalEntry, StudentJournalNote, StudentJournalAudit, AttendanceRecord, PayrollItem, PayrollItemLine, EmailLog, Payment, InvoiceLine, StudentAssessmentScore)
- `schema.prisma:39` — `User.email @unique` → `@@unique([tenantId, email])`; `lib/auth.ts` resolves user by `(tenantId, email)` where needed
- `schema.prisma` composite uniques — `ClassSection @@unique([tenantId, academicYearId, name])`, `PayrollRun @@unique([tenantId, periodStart, periodEnd])`
- Migration lands; pre-check SQL in Ship Notes
- End-of-cycle: `npm run build && npx vitest run && npx playwright test` green

### Out of scope
- Other review-doc items (secondary bench, deferred)
- Design-system visual regressions
- UAT execution

## Tasks

Ordered A→B→C. Each task = one commit (between-task gate `npm run build && npx vitest run` between commits).

### Sub-bundle A — ConfirmDialog → AlertDialog (review §T5 #1, #6, standards drift)
- [ ] **A1** — Install/verify `@radix-ui/react-alert-dialog`; scaffold `components/ui/alert-dialog.tsx` (stock Shadcn) if missing
- [ ] **A2** — Rewrite `components/ui/confirm-dialog.tsx` on AlertDialog. Preserve public API. Destructive → `variant="destructive"`. AlertDialogFooter enforces cancel-left + confirm-right. No inline `bg-destructive`
- [ ] **A3** — Fix auto-close bug: `onOpenChange(false)` only after `onConfirm` resolves; keep open on rejection. Add vitest for success + rejection paths
- [ ] **A4** — Playwright MCP smoke on 4 callers (invoices/:495, students/[id]/:740,:780, enrollments/:339, settings/campuses/:229). Other 10+ callers auto-pickup via preserved API — no caller changes expected

### Sub-bundle B — Jakarta TZ + promote races (review §T7 #2,#3, §T2 #1,#2, §T4 #9)
- [ ] **B1** — `lib/parent-helpers.ts:179` — replace `new Date().toISOString().slice(0,10)` with `getTodayInTimezone("Asia/Jakarta")`
- [ ] **B2** — `lib/parent-helpers.ts:319` — replace `since.toISOString().split("T")[0]` with `toLocalYmd(since)`
- [ ] **B3** — Vitest mocks system clock to 02:00 WIB + 22:00 WIB; assert `getTodayStudentAttendance` + `getStudentAttendanceRecent` return correct WIB date (both helpers)
- [ ] **B4** — `app/api/students/[id]/promote/route.ts` — move capacity check inside `$transaction` + `SELECT … FOR UPDATE` on ClassSection (mirror enroll route pattern). Add concurrent-promote test (two promotes to full class — one succeeds, one 400)
- [ ] **B5** — `app/api/promotions/route.ts` — fetch target capacity inside transaction via FOR UPDATE, not outer `targetSection.capacity`. Add concurrent-bulk-promote test
- [ ] **B6** — `app/api/attendance/today/route.ts:12` — replace UTC fallback with `getTodayInTimezone("Asia/Jakarta")`

### Sub-bundle C — Prisma schema + Zod alignment (review §T8 #1-6)
- [ ] **C1** — `lib/validations/program.ts:7,15` — enum → `["SEMESTER", "YEAR_ROUND", "SESSION"]`. Grep for "YEARLY" in codebase; remove stale refs
- [ ] **C2** — `lib/validations/enrollment.ts:5` — drop `"TRANSFERRED"` from enum (schema is source of truth)
- [ ] **C3** — `lib/validations/leave.ts:4` — `leaveType: z.enum(["ANNUAL", "SICK", "PERMISSION", "OTHER"])`
- [ ] **C4** — `prisma/schema.prisma` — declare explicit `onDelete` on every relation (30+ fields). Core entities: `Restrict`. Leaf/audit/log/attendance models: `Cascade`. Generate migration
- [ ] **C5** — `prisma/schema.prisma:39` — `User.email @unique` → `@@unique([tenantId, email])`. Pre-check: run SQL to confirm zero duplicate `(tenantId, email)` rows. Update `lib/auth.ts` + demo-login where email-only lookup. Migration (drop + add UNIQUE INDEX)
- [ ] **C6** — `prisma/schema.prisma` — `ClassSection @@unique([tenantId, academicYearId, name])` + `PayrollRun @@unique([tenantId, periodStart, periodEnd])`. Pre-check: confirm no conflicts exist
- [ ] **C7** — Fill Ship Notes: migration names, up/down summary, rollback plan, pre-check SQL, zero-downtime note for Vercel Postgres

## Implementation

### A1 — AlertDialog scaffold verify (no code change)

Existing `components/ui/alert-dialog.tsx` already on `@base-ui/react/alert-dialog` (stock Shadcn layout; dep `@base-ui/react ^1.3.0` in package.json). Exports: `AlertDialog`, `AlertDialogTrigger`, `AlertDialogPortal`, `AlertDialogOverlay`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogMedia`. `AlertDialogAction` wraps `<Button>` (accepts `variant`). `AlertDialogCancel` uses `AlertDialogPrimitive.Close` → auto-closes on click. `AlertDialogFooter` stacks col-reverse on mobile and `flex-row justify-end` on desktop — provides cancel-left + confirm-right on desktop.

Note: spec said "Radix" but repo uses Base UI — primitive-level behavior equivalent for our needs (modal blocks Esc/backdrop, AlertDialogAction doesn't auto-close so we can gate on promise resolution).

**No code change — verification commit (cycle doc only).**

### A2 — ConfirmDialog rewrite on AlertDialog

`components/ui/confirm-dialog.tsx` rewritten on `AlertDialog` primitives. Public API preserved verbatim: `{ open, onOpenChange, title, description, confirmLabel, cancelLabel, onConfirm, destructive, loading }` — every existing caller auto-picks up the fix.

Key structural shifts vs old `Dialog`-based impl:
- `Dialog` → `AlertDialog` (modal locks Esc/backdrop-click; destructive confirms can only be dismissed via explicit Cancel).
- `<Button className={destructive ? "bg-destructive …" : ""}>` → `<AlertDialogAction variant={destructive ? "destructive" : "default"}>` — token-based, no inline color class. Satisfies `ui.md` overlays rule.
- Cancel button: `<DialogClose><Button variant="outline">` → `<AlertDialogCancel>` (which wraps `AlertDialogPrimitive.Close` rendering stock `Button variant="outline"` by default). Auto-closes on click — no manual state.
- Footer: `<DialogFooter>` → `<AlertDialogFooter>`. On desktop this is `flex-row justify-end` so cancel-left + confirm-right ordering follows JSX order (cancel first).

Auto-close behavior **intentionally preserved for this commit** (still closes in `finally` regardless of success/failure). A3 flips it to success-only and adds vitest.

## Verification

_End-of-cycle gate: `npm run build && npx vitest run && npx playwright test` green. Cross-checked design-system.html §Overlays (AlertDialog rule) for sub-bundle A._

## Ship Notes

_Filled at cycle end by C7. Will include migration names, up+down summaries, rollback plan, pre-check queries, Vercel Postgres zero-downtime note._

<!-- design-system baseline consulted: §Overlays (AlertDialog rule for destructive confirms). -->
