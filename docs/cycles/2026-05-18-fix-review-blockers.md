# Fix Review Blockers (B1–B4)

## Context

The 2026-05-17 comprehensive module review ([docs/reviews/2026-05-17-comprehensive-module-review.md](../reviews/2026-05-17-comprehensive-module-review.md)) surfaced 4 Blockers. **Builder re-verified each against current `origin/staging` (this cycle's branch base) before implementing — the prior review's worktree (`claude/vigorous-boyd-50e3c8`) was 69 commits behind staging, so two of the four Blockers are stale.**

**Re-verification result:**

| ID | Original claim | Status after re-verification |
|---|---|---|
| B1 | withdraw warning never fires — `data.unpaidInvoices` vs API `unpaidInvoiceCount` | **REAL** — verified at [app/admin/students/[id]/page.tsx:276](../../app/admin/students/[id]/page.tsx) and [app/api/students/[id]/withdraw/route.ts:68](../../app/api/students/[id]/withdraw/route.ts) |
| B2 | `openEditGuardian` nullifies `parentNik`/`employerAddress`/`employerCity` | **DROPPED — fabricated.** Form initializer at [page.tsx:158](../../app/admin/students/[id]/page.tsx) reads `g.parent.nik ?? ""` etc.; `Guardian.parent` type at line 28 includes all three fields; API GET at [route.ts:21](../../app/api/students/[id]/route.ts) does `include: { guardians: { include: { parent: true } } }` returning all fields; form has input controls at lines 634/638/639. Re-edit preserves DB values. |
| B3 | Template POST silently discards `categories` | **DROPPED — already fixed on staging.** Schema at [lib/validations/assessment-template.ts:7-17](../../lib/validations/assessment-template.ts) declares `categories`; POST handler at [app/api/assessments/templates/route.ts:110-123](../../app/api/assessments/templates/route.ts) does nested `categories.create` with cascading `indicators.create`. Reviewer was looking at stale code 69 commits behind. |
| B4 | POST attendance override upsert bypasses `isLocked` payroll-lock guard | **REAL** — verified at [app/api/attendance/[id]/override/route.ts:112-130](../../app/api/attendance/[id]/override/route.ts); upsert `update` branch never checks `isLocked`, PUT guard at line 58 does. |

This cycle therefore lands **B1 + B4 only**. B2 + B3 dropped from scope. The review report itself stays committed as durable Context, with a Verification-section note clarifying which findings were fabricated/stale.

**Assumptions:**
1. B1 fix mirrors the API response shape exactly — both occurrences of `data.unpaidInvoices` on the warning line become `data.unpaidInvoiceCount`.
2. B4 fix mirrors the existing PUT guard at `override/route.ts:58` — same Indonesian error message ("Record terkunci (payroll sudah disetujui)"), same 400 status. Pre-upsert read is `findUnique({ where: { employeeId_date: { employeeId, date } } })`.
3. B4 needs a vitest covering the new guard. B1 is too thin for a unit test — relies on manual smoke + end-of-cycle Playwright.
4. No new e2e specs required — existing attendance + admin-students specs cover the happy paths. End-of-cycle Playwright catches regressions.

## Spec

Acceptance criteria — all must pass before `/ship`:

- [ ] **B1:** withdrawing a student with unpaid invoices renders the warning toast naming the correct count.
- [ ] **B4:** POST `/api/attendance/[id]/override` rejects with 400 + "Record terkunci (payroll sudah disetujui)" when the existing `attendanceRecord` for `{employeeId, date}` has `isLocked = true`; PUT path unchanged; new vitest covers the guard.
- [ ] All fixes covered by `npm run build && npx vitest run`.
- [ ] Full end-of-cycle gate green: `npx playwright test` (no e2e regressions on attendance / admin-students specs).
- [ ] Cycle doc Verification section filled with gate output + manual smoke notes + explicit note about B2/B3 drop.

**Non-goals:**
- B2 + B3 (dropped — see Context table).
- Cross-cutting Majors / Minors / Nits from the 2026-05-17 review (separate sweep cycles).
- Re-running the comprehensive review against current staging (separate cycle if desired).
- Test-coverage backfill beyond what each fix needs.

## Tasks

Two tasks, sequential (both small; second touches different module so could parallelize but inline is faster than subagent spin-up).

- [x] **T1 — B1: fix withdraw warning field name.** Edit [app/admin/students/[id]/page.tsx:276-277](app/admin/students/[id]/page.tsx) — change both occurrences of `data.unpaidInvoices` to `data.unpaidInvoiceCount`. Acceptance: code change lands; manual smoke (or future Playwright addition) confirms warning text and count value populate correctly.

- [ ] **T4 — B4: block POST attendance-override upsert when existing record is locked.** Edit [app/api/attendance/[id]/override/route.ts:112](app/api/attendance/[id]/override/route.ts) — before `prisma.attendanceRecord.upsert`, run `prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId, date } } })`; if `existing?.isLocked`, return same 400 payload as PUT guard at line 58. Add vitest in [app/api/__tests__/](app/api/__tests__/) asserting POST returns 400 when target record `isLocked=true`. Acceptance: new test passes; PUT untouched; smoke via curl confirms.

**Task ordering / dependencies:** None — T1 and T4 touch disjoint files. Inline sequential.

**Between-task gate:** `npm run build && npx vitest run` between each commit.

**End-of-cycle gate:** Full `npx playwright test` plus `feature-dev:code-reviewer` + `superpowers:code-reviewer` pass on the combined diff (T4 touches `app/api/**`, security-sensitive per build skill).

## Implementation

- Subagent plan: 2 tasks (T1 + T4) after B2 + B3 dropped from scope; both executed inline by CTO. T1 is 1-line edit, T4 is guard + test. Between-task gate (`npm run build && npx vitest run`) + reviewer pass per task, one commit per task.
- **T1** — B1: fix withdraw warning field name. Edited `app/admin/students/[id]/page.tsx:276-277` — both occurrences of `data.unpaidInvoices` → `data.unpaidInvoiceCount`. UI now reads the actual API field returned by `app/api/students/[id]/withdraw/route.ts:68`.

## Verification

- **T1 gate:** `npm run build` ✅ pass (full route table generated, no compile errors). `npx vitest run` ✅ 175 test files / 1663 tests pass, 2 skipped, 42 todo. Duration 181s.
- **T1 reviewer:** `feature-dev:code-reviewer` ✅ clean — diff matches spec, grep across `app/` + `lib/` for `unpaidInvoices` finds zero remaining references in source code (only docs / cycle metadata).
- **T1 manual smoke:** deferred to end-of-cycle Playwright run.
- **T1 design-system check:** no visual / component change — string-only rename inside an existing `toast.success` call; design-system surface untouched (no Shadcn component swap, no className edit).

## Ship Notes

<!-- filled by /ship -->
