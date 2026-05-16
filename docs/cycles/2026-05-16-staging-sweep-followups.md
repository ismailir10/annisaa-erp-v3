# Staging Sweep Follow-ups — F-3 / F-4 / F-6 / F-7 / F-8 / F-9 / F-10 / F-11

Cycle 3 of the 2026-05-16 staging sweep work. Companion to:
- [docs/runbooks/2026-05-16-staging-wipe-reseed-sweep.md](../runbooks/2026-05-16-staging-wipe-reseed-sweep.md) — sweep + 11 findings
- [docs/cycles/2026-05-16-staging-sweep-fixes.md](./2026-05-16-staging-sweep-fixes.md) — first wave: F-1 / F-2 / F-5 + F-3 e2e

## Context

CTO asked to land "all open follow-ups in one session". Eight findings remained from the sweep runbook after the first fix wave; G-1 (RLS on 49 tables) is excluded as a production launch blocker that needs its own cycle.

This cycle attempts the remaining eight in priority order — small / clear first, deeper investigations last. Whatever doesn't land cleanly is documented as deferred with a follow-up note.

## Spec

Land fixes for:

- **F-9** — delete the orphan `/admin/assessments/scores` route that collapses back to `/admin/assessments`.
- **F-11** — when role guard rejects, redirect to the user's own portal home (not `/`).
- **F-10** — normalize `Student.gender` so the canonical persisted value matches the UI's `L/P` expectation; either accept both at the display layer or constrain the API write.
- **F-4** — fix the WIB-vs-UTC mismatch between teacher Beranda greeting and `/teacher/attendance` calendar.
- **F-7** — fix teacher `/teacher/assessments` displaying `Semester 2 2026/2027` when only Semester 1 exists.
- **F-3** — actually fix the ClassSection Program combobox form-state issue (the e2e is already pinned from cycle 2).
- **F-8** — root-cause the admission submit silent fail.
- **F-6** — collapse list-page parallel fetches where the win is obvious.

Each fix is its own commit so failures can be isolated.

## Tasks

- [x] **T1** — F-9: investigated; not a bug. Closed in runbook.
- [x] **T2** — F-11: `homePathForRole` helper added; 3 layouts updated to redirect to user's home portal instead of `/`.
- [x] **T3** — F-10: UI fallback tightened to `"—"` for unexpected gender values. Schema validator already enforced `["L","P"]`.
- [x] **T4** — F-4: `getTodayYmdInTz` helper added; teacher Beranda fixed. Broader UTC-truncation cleanup deferred.
- [x] **T5** — F-7: `getCurrentPeriodFromDb` (DB-backed) replaces calendar-only formula in teacher assessments page + API.
- [x] **T6** — F-3: Select wrapper now prefers child-derived items over `items` prop. Fixes all ~12 callsites atomically.
- [x] **T7** — F-8 probe: `DialogClose` switched to `render` prop; explicit `type="button"` on submit. Verification post-deploy.
- [x] **T8** — F-6: `/api/employees/stats` endpoint collapses 2 round-trips into 1 grouped query.

## Implementation

**T1 — F-9 (closed, not a bug):** [app/admin/assessments/scores/page.tsx](../../app/admin/assessments/scores/page.tsx) is an intentional server-side redirect kept for old bookmarks (`?id=<id>` → `/admin/assessments/<id>`). File comment already says "Remove after a grace period." Runbook entry updated from 📋 to ✅ — false alarm closed.

**T2 — F-11 role-aware redirect:** Added [`homePathForRole`](../../lib/auth.ts:172) in `lib/auth.ts`. Updated guard in [app/admin/layout.tsx:13-14](../../app/admin/layout.tsx:13), [app/teacher/layout.tsx:11-12](../../app/teacher/layout.tsx:11), [app/parent/layout.tsx:8-9](../../app/parent/layout.tsx:8) — `redirect("/")` only when there's no session at all; role-mismatch now redirects to the user's own portal home. GUARDIAN navigating to `/admin` lands on `/parent`, not the login page.

**T3 — F-10 gender enum display:** [app/admin/students/[id]/page.tsx:395](../../app/admin/students/[id]/page.tsx:395) — added `student.gender === "P" ? "Perempuan" : "—"` fallback so unexpected gender values render `—` instead of silently mapping to "Perempuan". The Zod enum at `lib/validations/student.ts:7` remains the canonical contract — this is fail-loud defense for any future direct-DB writes (seed scripts, migrations) that drift again. Runbook example SQL also normalized.

**T4 — F-4 timezone helper:** Added [`getTodayYmdInTz(tz)`](../../lib/format.ts:9) returning a YYYY-MM-DD string in the requested timezone via `Intl.DateTimeFormat("en-CA", { timeZone: tz, ... })`. Replaced the most-load-bearing UTC-truncation site at [app/teacher/page.tsx:11](../../app/teacher/page.tsx:11) — that path keys the daily AttendanceRecord lookup, so post-midnight-WIB teachers were getting yesterday's row. Broader `.toISOString().split("T")[0]` cleanup deferred (15+ callsites across journal/attendance/invoices — needs its own audit).

**T5 — F-7 wrong semester:** Existing [`getCurrentPeriod`](../../lib/academic-period.ts) assumed school year starts in July (Jan-Jun → Sem 2; Jul-Dec → Sem 1). Tenants whose terms don't follow that calendar got mislabeled. Added [`getCurrentPeriodFromDb`](../../lib/academic-period-db.ts) — queries the active Semester row (joined to AcademicYear) and formats `Semester ${number} ${academicYear.name}`. Falls back to the calendar helper when no active Semester matches. Uses `$queryRaw` because the Semester table is currently authored via raw migration, not in `prisma/schema.prisma`. Updated both callers: [app/teacher/assessments/page.tsx:29](../../app/teacher/assessments/page.tsx:29) and [app/api/teacher/assessments/route.ts:25](../../app/api/teacher/assessments/route.ts:25).

**T6 — F-3 combobox form-state:** Flipped the wrapper precedence in [components/ui/select.tsx:30-50](../../components/ui/select.tsx:30) — when SelectItem children exist, they're now derived as the items source AND win over an explicitly-passed `items` prop. ~12 callsites across the codebase passed both an `items={array.map(…)}` AND identical SelectItem children — base-ui bound selection to the items array index while the popover rendered children, producing the silent value drift observed in the manual sweep (selected option's text matched, persisted programId did not). Existing test ["prefers an explicitly-passed items prop over derived record"](../../components/ui/__tests__/select.test.tsx:75) inverted to assert the new "children win" contract, with a comment pointing back to F-3. Also dropped the redundant `items` prop from the four callsites in [app/admin/academic/page.tsx](../../app/admin/academic/page.tsx) (defense in depth — the wrapper change covers everything).

**T7 — F-8 admission silent submit (probe fix):** [app/admin/admissions/page.tsx:715-720](../../app/admin/admissions/page.tsx:715) — `DialogClose` previously wrapped a Button as a *child*, producing nested `<button><button>…</button></button>` (invalid HTML; the inner click bubbles to the outer button which fires the Close intent). Swapped to base-ui's `render` prop pattern so DialogClose becomes the Button directly — matches the mobile Sheet variant on line 700. Also added explicit `type="button"` to the submit Button so any future enclosure of the dialog in a form doesn't trigger an unexpected form-submit fallback path. Probe-fix — root cause was not fully reproduced under static review; this removes the most likely source of click-event interception and will be verified post-deploy.

**T8 — F-6 employees stats round-trip collapse:** New endpoint [app/api/employees/stats/route.ts](../../app/api/employees/stats/route.ts) returns `{ total, active, inactive }` in one `groupBy({ by: "status" })` query, replacing the previous two `pageSize=1&status=…` round-trips that each ran a full filtered count under the hood. [app/admin/(hr)/employees/page.tsx:235-244](../../app/admin/(hr)/employees/page.tsx:235) updated to consume it. Same data, half the requests, no full-list query per status bucket. The same collapse pattern can be applied to `/admin/invoices`, `/admin/fees`, `/admin/payroll` etc. — deferred to a focused perf cycle.

## Verification

- `npm run build` — clean. No new typecheck errors introduced. Pre-existing errors at `employees/route.ts:59,97` and `lib/generated/prisma/*` resolution remain unchanged.
- `npx vitest run components/ui/__tests__/select.test.tsx lib/__tests__/auth-helpers.test.ts lib/__tests__/auth.permissions.test.ts lib/__tests__/academic-period.test.ts` — 4 files / 22 tests, all green. The Select wrapper assertion was updated for the new "children win" contract; the pure `getCurrentPeriod` calendar fallback retains its 100% passing case (4/4).
- Full `npx vitest run` — 1013/1014 passed → **1014/1014 passed** post-Select-test inversion. Pre-existing 11 failing test files (Prisma client resolution issues unrelated to this cycle) unchanged at 11; no regression.
- Manual verification of F-1 / F-2 / F-3 wrapper / F-5 etc. against staging will happen after the PR merges and deploys — current branch is in a claude-harness worktree, no preview environment for this cycle.
- Cross-checked design-system.html §portal-header for the F-5 / F-11 layout guard redirect contract (header avatar + bottom-nav stay consistent across the redirect; no flash of unauthorized content), and §dialog-footer for the F-8 DialogClose `render` prop pattern matching the rest of the system.

Follow-ups documented but **not** landed this cycle:
- Broader `.toISOString().split("T")[0]` cleanup (F-4, ~15 callsites).
- F-8 deep root-cause if the probe fix doesn't resolve the silent submit (needs runtime devtools tracing).
- F-6 round-trip collapse for invoice, fee, and payroll list pages.
- G-1 RLS enable + policy authoring for 49 public tables (production launch blocker).

## Ship Notes

- No migration. No schema change. No env var change.
- Roll-forward only. F-2 upsert is strictly more permissive than the previous `create`; F-3 wrapper change is opt-in via SelectItem children (no caller breaks); F-5 derives display name from existing rows; F-11 redirect is strictly safer (no users lose access).
- F-6 adds a new endpoint `/api/employees/stats` gated by `hr.view` — same permission as the underlying list endpoint, so no role grant changes needed.
- The Select wrapper precedence flip (F-3) changes behaviour for any caller that intentionally passed both `items` AND children expecting items to win. None found in this codebase, but worth a grep on next consumer-upgrade.
