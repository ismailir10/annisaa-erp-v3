# Display signals — times, totals, KPI cards, unread badges, payroll adjustments

## Context
The 2026-09-29 full E2E review (`docs/uat/reports/2026-09-29-full-e2e.md`) found a cluster of places where the UI shows a number or badge that is wrong or missing, even though the stored data is right:

- **TCH-1** (major) — `formatTime` calls `toLocaleTimeString` with no `timeZone`. SSR (UTC) prints "Masuk 00.02", the browser (WIB) prints "07.02": React #418 hydration error on every `/teacher` and `/teacher/sessions/[id]` load, and wrong times on any device not on WIB.
- **FIN-1** (major) — Tagihan Manual dialog: Total reads Rp 0 / lags one edit behind. `total` is a `useMemo` keyed on the reference returned by `form.watch("lines")`, which react-hook-form mutates in place.
- **HR-6** (major) — `/admin/employee-attendance` ALPA card shows 0 while a row says Alpa: `computeAbsentCount` only counts rows with *no* record, not explicit `ABSENT` records. **HR-13** (minor) — `/admin/employees` stat cards keep mount-time counts after deactivate/restore (different data path, same "stale card" symptom).
- **X-3** (major) — journal unread counting treats a missing read watermark as zero, so the first note in a thread never raises a badge.
- **HR-2** (major) — "Edit Variabel Kehadiran" deletes and regenerates every `PayrollItemLine`, wiping manual adjustments (+100.000 → Rp 0).
- **X-11** (minor) — teachers see payroll slips as "Tersedia" before the admin "sends" them.
- **ACAD-8** (minor) — Buku Penghubung monitoring "Kelas sudah isi" KPI tests the rounded `completionPct`, "Terakhir diisi" tests any entry.

## Spec
- [x] `formatTime` (and any sibling formatter in `lib/format.ts` that reads a timestamp) renders in `Asia/Jakarta` regardless of the process zone; output identical under `TZ=UTC`, `Asia/Jakarta`, `America/Los_Angeles`. No React #418 on `/teacher` in a browser with `timezoneId: Asia/Jakarta`.
- [x] Tagihan Manual Total equals the sum of typed amounts after every keystroke.
- [x] ALPA card counts explicit `ABSENT` records (plus no-record rows on working days); the four cards add up to the roster.
- [x] `/admin/employees` stat cards refresh after deactivate and restore without a reload.
- [x] A thread with no read row for the viewer counts every note from the other party as unread (`countUnreadNotes`, `countUnreadNotesByStudent`) — teacher grid, teacher home, parent Jurnal page all use these.
- [x] Saving Edit Variabel Kehadiran preserves each line's manual `adjustmentAmount`/`adjustmentNote`; `finalAmount = calculatedAmount + adjustmentAmount`; item totals derive from final amounts.
- [ ] X-11: teacher slip visibility matches the state the admin UI actually releases — **deferred to lead** (Assumption 3).
- [x] Monitoring "Kelas sudah isi" and "Terakhir diisi" share one definition (a class is filled iff it has a checked entry this week).
- [x] A Vitest per finding that fails on the old code and passes on the new.

### Non-goals
- No schema migration, no new dependency, no auth/session code, no redesign.
- No new unread-badge UI on parent home or the parent bottom-nav (they have none today; only the Jurnal page consumes the unread endpoint).
- No change to how payroll is calculated, only to what survives a recalculation.

### Assumptions
1. Manual adjustments are carried across recalculation by `componentDefId`; an adjustment whose component no longer produces a line (component disabled since generation) has nowhere to attach and is dropped.
2. Removing the "missing watermark = zero" rule means a wali/teacher who has never opened a thread sees a badge for the whole history on first load, and it clears on first open (the read watermark is written then). The lead's spec explicitly asks for this.
3. **X-11 is not implemented.** The finding assumes an admin "send slips" step gates teacher visibility. That step was removed on purpose in `docs/cycles/2026-08-06-salary-slip-email-removal.md` (no `send-slips` route exists; `SLIPS_SENT` is never written by code), which states teachers should see the slip as soon as the run is `APPROVED`. `EXPORTED` is written by the BSI export route. The only hidden state is `DRAFT`, which is already hidden. Changing visibility to `EXPORTED`-only would reverse that documented product decision, so it is left for the lead.

## Tasks
- [x] **T1 — TCH-1: pin display times to Asia/Jakarta.** `lib/format.ts` (`formatTime`, new `formatDateTime`, `formatRelativeTime` fallback), `payment-activity-card`, two PDF routes. *Accept:* TZ-independent Vitest.
- [x] **T2 — FIN-1: Tagihan Manual Total.** Derive from `useWatch`, drop the stale `useMemo`. *Accept:* jsdom test types amounts and reads Total each time.
- [x] **T3 — HR-6 + HR-13: HR stat cards.** `computeAbsentCount` counts explicit ABSENT; Izin card counts LEAVE/SICK/PERMISSION; employees page refetches stats after deactivate/restore.
- [x] **T4 — X-3: unread with no watermark.** `lib/student-journal/note-reads.ts`.
- [x] **T5 — HR-2: keep manual payroll adjustments on recalc.** New `lib/payroll/adjustments.ts`, variables route.
- [ ] **T6 — X-11: teacher slip visibility.** Investigated; deferred to lead (Assumption 3). No code change.
- [x] **T7 — ACAD-8: one "filled" definition on monitoring.** Page + `admin/classes` route.

## Implementation
- Subagent plan: driver=claude-sonnet-5-5, no subagents — this is a fix-cycle agent run by the lead (one harness tier, no down-tier available); seven small independent slices whose context is the shared finding list, so fan-out would cost more than it saves.
- Task 1: `lib/format.ts` — new `DISPLAY_TIME_ZONE`, `formatTime` uses `timeZone` + `hourCycle: "h23"` (never "24.05") and returns `--:--` for an unparseable value; new shared `formatDateTime`; `formatRelativeTime`'s >30-day fallback now prints the WIB calendar day instead of the UTC date part. `components/admin/invoices/payment-activity-card.tsx` (client component with the same bug) now calls `formatDateTime`. `app/api/guardian/invoices/[id]/pdf/route.ts` and `app/api/slips/[payrollItemId]/pdf/route.ts` date formatters pinned to `Asia/Jakarta` (server, UTC on Vercel). `formatDate`/`formatDateShort`/`formatMonthLabel` parse a date-only string as a local date and format it locally, so they are zone-stable and untouched. Other `toLocale*` calls in the repo either already carry `timeZone` or format date-only values.
- Task 2: `components/admin/invoices/manual-invoice-dialog.tsx` — `useWatch({ control, name: "lines" })` replaces `form.watch("lines")`; `total` is derived each render (a handful of rows) instead of `useMemo` on a mutated-in-place reference.
- Task 3: `app/admin/(hr)/employee-attendance/absent-stat.ts` — `computeAbsentCount` = explicit `ABSENT` records (any day) + no-record rows on working days; new `computeExcusedCount` (LEAVE/SICK/PERMISSION) used by the Izin card so the four cards add up. `app/admin/(hr)/employees/page.tsx` — stats fetch extracted to `fetchStats`, re-run after deactivate and restore.
- Task 4: `lib/student-journal/note-reads.ts` — `countUnreadNotes` drops the `createdAt` bound when there is no watermark; `countUnreadNotesByStudent` queries `never-opened` students unbounded and opened ones after the oldest watermark (`OR`), then groups in memory. Doc comment records why the old "missing = zero" rule went. Consumers unchanged (teacher home `app/teacher/page.tsx`, class-grid and unread API routes, parent Jurnal page).
- Task 5: new `lib/payroll/adjustments.ts` (`applyLineAdjustments`, Decimal math like the line-adjust route). `app/api/payroll/[id]/items/[itemId]/variables/route.ts` reads existing lines' adjustments inside the transaction before `deleteMany`, recreates lines with `adjustmentAmount`/`adjustmentNote`/`finalAmount`, and writes item totals from the final amounts.
- Task 6: no change — see Spec Assumption 3. Existing `app/api/__tests__/slips-my.test.ts` continues to pin the current contract.
- Task 7: `app/admin/student-journal/monitoring/page.tsx` — `kelasSudahIsi` = classes with `checkedCount > 0`. `app/api/student-journal/admin/classes/route.ts` — `lastFilledAt` groupBy gets `checked: true`, so `checkedCount > 0` ⇔ `lastFilledAt != null`.
- Manual review (the `code-review` skill / reviewer agents were not run on staged diffs in this harness; diff read adversarially per task): T3 — an explicit `ABSENT` on a holiday counts (row says Alpa, so the card must); T4 — `OR` never empty (either `neverOpened` or `watermarks` is non-empty when `studentIds` is), so Prisma never gets `OR: []`; T5 — empty `existing` list reproduces the engine's totals exactly (tested).

## Verification
- Frontend diffs (`components/admin/invoices/*`, `app/admin/**`) checked against `design-system.html`: no markup, class, token or copy changed — only derived values and data refresh.
- Task 1: `lib/__tests__/format.test.ts` — 7 new tests incl. one that flips `process.env.TZ` across UTC / WIB / LA and asserts one output; passes under default and `TZ=UTC`.
- Task 2: new jsdom test "keeps the Total row in step with every typed amount" — red on HEAD's component, green now.
- Task 3: `absent-stat.test.ts` +5, employees `page.test.tsx` +1 (stat cards after deactivate) — the page test is red on HEAD's page, green now.
- Task 4: `lib/student-journal/__tests__/note-reads.test.ts` rewritten (7 tests); 4 red against HEAD's `note-reads.ts`, all green now.
- Task 5: `lib/payroll/__tests__/adjustments.test.ts` (5) + route test "manual adjustments survive a recalculation".
- Task 7: `monitoring/__tests__/page.test.tsx` (KB 4 entries / 0% counts as filled: "2 / 3", belum isi 1) + `admin/classes/__tests__/route.test.ts`.

## Ship Notes
- Migrations: none. Env vars: none. Dependencies: none.
- Behaviour changes to call out on the PR: (a) first-time viewers now see an unread badge for existing other-party notes until they open the thread; (b) recalculating attendance variables now keeps manual line adjustments; (c) X-11 intentionally not changed — see Assumption 3.
- Rollback: revert the PR (no data written in a new shape; `adjustmentAmount`/`adjustmentNote` are existing columns).
<!-- task 2 committed -->
<!-- task 3 committed -->
