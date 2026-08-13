# Parent Buku Penghubung unblock + nav label clarity

## Context

Bu Shanti (pilot admin, An Nisaa') reported three parent-portal confusions on 13 Aug 2026. Two are real defects, one is a communication gap:

1. **Wali cannot see or fill "Di Rumah" indicators at all.** `app/parent/student-journal/page.tsx` hides the entire Tabs block (Di Sekolah / Di Rumah / Catatan) behind `schoolEntries.length === 0 && homeEntries.length === 0 && notes.length === 0`. On a week with no data the parent gets an EmptyState instead of the grid — so a wali can never make the *first* tick, and the feature only "unlocks" after a teacher writes something. That is a chicken-and-egg bug, not the intended design: the API (`GET /api/student-journal/children/[id]/week`) already returns `homeCategories` unconditionally. Prod (`vxwywmvpxetdgnxejjgk`) has a correctly seeded template — 3 HOME categories / 13 active indicators, 3 SCHOOL categories / 16 indicators — but `StudentJournalEntry = 0`, so **every** wali on prod currently sees the dead-end EmptyState. Pilot blocker.

2. **Today-only edit window kills compliance.** A wali who forgets Monday cannot fill it on Wednesday. The rule came from UAT [`docs/uat/reports/2026-05-01-student-journal.md`](../uat/reports/2026-05-01-student-journal.md) finding JOURNAL-PARENT-02 (severity major), whose suggestion reads: *"Edit-window-of-N-days is acceptable but pick one — silent past-day backfill corrupts the trust artifact."* That report is 104 days old (staleness rule → treat detail as possibly stale), but its recommendation is explicitly compatible with a bounded window. The defect it fixed was *silent* backfill; a visible, server-enforced window preserves the trust artifact. Owner decision 13 Aug 2026: window = current week + previous week.

3. **"Penilaian" menu appears to have vanished.** PR #444 (`ee52cf72`, 1 Aug) cut the parent bottom nav from 6 tabs to 5 because the 6th overflowed the viewport by 27.4px at 375px and did not render at all at 360px. `Capaian` / `Rapor` / `Profil` moved into a "Lainnya" overflow sheet. Nothing was removed — but the destination carries three different names across the product (nav says "Capaian", the page title says "Perkembangan", the user calls it "Penilaian"), and "Capaian" is *also* a curriculum domain term ("Capaian Perkembangan Diri" / CP) used in `app/admin/semesters/[id]/objectives`. Settling the parent-facing label on **Penilaian** removes the overload and matches how the admin already speaks.

Separately, Bu Shanti asked how to run bulk billing when per-child amounts differ (arrears, uniform orders, staggered new-intake instalments). Bulk generate reads `ProgramFeeStructure` only — one amount per program × academic year × recurring component, with no per-student override and no arrears carry-over. Owner decision 13 Aug 2026: **keep the manual workaround, no code this cycle**; document the procedure as a runbook so the pilot admin can execute it unaided.

## Spec

### Acceptance criteria

- [ ] Parent `/parent/student-journal` renders the Di Sekolah / Di Rumah / Catatan tabs whenever the tenant template has at least one ACTIVE category, regardless of whether any entry or note exists for the displayed week.
- [ ] The EmptyState only shows when the template genuinely has no ACTIVE categories in either scope; its copy points at the school/admin, not at "guru belum mengisi".
- [ ] A wali can toggle a "Di Rumah" indicator on any date from the start of the previous week through today (inclusive), on both the current-week and previous-week grid views.
- [ ] Dates outside that window — future days, and days before the previous week's Monday — render as disabled cells with an aria-label that states the actual rule.
- [ ] `POST /api/student-journal/entries/home` rejects out-of-window dates with HTTP 400 and an Indonesian message naming the real window; the client toast surfaces the same string.
- [ ] Server and client derive the window from **one** shared helper — no duplicated date arithmetic.
- [ ] Teacher (`/teacher/student-journal/students/[id]`) and admin (`/admin/student-journal/students/[id]`) WeekGrid edit behaviour is byte-for-byte unchanged: teacher stays today-only, admin keeps `disablePastDays={false}` full past-day correction.
- [x] ~~Parent-facing label for `/parent/perkembangan` reads **Penilaian**…~~ **Superseded 13 Aug 2026** — the premise was stale (see T5). The label already reads "Perkembangan" everywhere and matches `.claude/standards/voice.md:83`. Revised criterion: parent **nav** copy contains no "Capaian"; the sanctioned in-page "Capaian per elemen" heading and all curriculum-domain uses (admin objectives, raport editor, validation messages, e2e specs) stay untouched.
- [ ] `docs/runbooks/tagihan-serentak.md` exists and documents the bulk-then-manual billing procedure, including the `(studentId, periodLabel)` dedup trap.
- [ ] `npm run build && npx vitest run` green; `npx playwright test` green locally or deferred to CI with a reason recorded.

### Non-goals

- Per-student fee overrides (beasiswa, diskon adik-kakak, cicilan) and automatic arrears carry-over into the next period's invoice. Explicitly deferred by the owner on 13 Aug 2026 — this cycle ships a runbook, not billing code.
- Seeding prod curriculum (`Theme`/`SubTheme`/`LearningObjective`/`AchievementIndicator` all 0) and prod fee master (`FeeComponentDef` / `ProgramFeeStructure` both 0). Owner deferred to a later cycle.
- Any change to the parent journal CRUD shape, note threading, or the teacher batch-entry grid.
- Restoring a 6th bottom-nav tab. The 5-tab cap stands.
- Cross-portal terminology alignment between the parent "Perkembangan" surface and the admin/teacher "Penilaian" surface. Owner decided 13 Aug 2026 to keep them distinct; revisit only with a deliberate glossary change to `voice.md`.
- Widening the SCHOOL-scope (teacher) edit window.

### Assumptions

1. "Current + previous week" means: editable floor = the Monday of the week *before* the week containing today; ceiling = today. `weekDates()` renders Mon–Fri only, so a 14-day span surfaces as at most 10 tappable cells.
2. The floor is anchored to **today's** week, not to the week the parent is currently viewing — navigating back four weeks must not unlock those cells.
3. `Asia/Jakarta` remains the single tenant timezone, consistent with the existing `getTodayInTimezone("Asia/Jakarta")` call sites.
4. Renaming the nav label does not require a route change; `/parent/perkembangan` stays as-is.
5. Existing `components/portal/__tests__/week-grid.test.ts` three-argument calls must keep compiling — the new window parameter is optional and additive.

## Tasks

- [x] **T1 — Unblock the parent journal grid (independent)**
  Change the render gate in `app/parent/student-journal/page.tsx` from "no entries and no notes" to "no ACTIVE categories in either scope", and rewrite the EmptyState copy per `.claude/standards/voice.md` (the school configures indicators; the wali is not waiting on a teacher).
  *Acceptance:* with zero entries and zero notes for the week, the Di Rumah tab renders 3 categories / 13 indicators and every in-window cell is tappable.

- [x] **T2 — Shared backfill-window helper (independent)**
  Add `lib/student-journal/backfill.ts` exporting the window floor and an `isHomeEntryDateEditable(date, todayYmd)` predicate, reusing `weekStart` from `lib/student-journal/week.ts`. Unit-test the boundaries: today, yesterday, previous-week Monday, the Sunday before it, tomorrow.
  *Acceptance:* vitest covers all five boundary dates including a Monday-today edge case (floor is exactly 7 days back).

- [x] **T3 — Server enforcement (depends on T2)**
  Replace the `date !== today` guard in `app/api/student-journal/entries/home/route.ts` with the T2 predicate and update `HOME_TODAY_ONLY_MSG` to name the real window.
  *Acceptance:* route test asserts 200 for previous-week Monday, 400 for the Sunday before it and for tomorrow, with the new message.

- [x] **T4 — WeekGrid window support + parent wiring (depends on T2, T3)**
  Extend `isWeekGridDateEditable` in `components/portal/week-grid.tsx` with an optional earliest-editable-date argument, thread a matching optional prop through `WeekGrid`, fix the locked-cell aria-label so it states the real rule, and pass the T2 floor from the parent Di Rumah grid only. Teacher and admin call sites stay untouched.
  *Acceptance:* existing three-argument `week-grid.test.ts` cases still pass unchanged; new cases cover the windowed mode; teacher today-only and admin `disablePastDays={false}` behaviour verified by test.

- [x] **T5 — ~~Rename Capaian → Penilaian~~ → residual nav sub-label cleanup only (independent)** *(rescoped mid-cycle — see below)*
  **The original T5 premise was wrong.** It was written against a stale main checkout. In the worktree the parent nav label and both page titles already read "Perkembangan" and already agree with each other — PR #467 (`63e476a7`, 2026-08-09) fixed exactly this ambiguity and codified the outcome in `.claude/standards/voice.md:83`: *"Perkembangan … | Capaian (keep Capaian only for the per-element achievement level inside the page, never as the nav or page label)"*. Bu Shanti's own message confirms she sees "Perkembangan"; her confusion is that the admin and teacher portals call the equivalent area "Penilaian", so she expected the parent one to match. That is a cross-portal naming question, not a defect.
  Owner decision (13 Aug 2026): **keep "Perkembangan"** — the audited 4-day-old standard stands, and the parent-facing surface keeps the softer word (a wali reading about their child, not a staff member grading). The cross-portal mismatch is answered in the reply to Bu Shanti, not in code. Renaming the admin/teacher side to match was considered and rejected as out of scope (touches `/admin/penilaian`, teacher nav, assessment centre, e2e specs).
  Residual cleanup actually performed: the `PARENT_MORE_ITEMS` description in `components/parent/more-sheet.tsx` still read "Capaian anak per elemen" — nav sub-label context, which the glossary bans — now "Perkembangan anak per elemen"; stale "Capaian" comments in `more-sheet.tsx` and `bottom-nav.tsx` corrected. The in-page `<h2>` "Capaian per elemen" in `app/parent/perkembangan/[studentId]/page.tsx` is **deliberately left alone** — it is the exact usage the glossary sanctions.
  *Acceptance:* no "Capaian" remains in parent nav copy; the sanctioned in-page heading and every curriculum-domain "Capaian" (admin objectives, raport editor, `lib/validations/curriculum.ts`, e2e specs) are untouched.

- [x] **T6 — Billing runbook (independent)**
  Write `docs/runbooks/tagihan-serentak.md`: fee-master prerequisites, bulk run for uniform SPP, manual multi-line invoices for arrears / uniforms / staggered instalments, and the `(studentId, periodLabel)` dedup trap that makes a same-label manual invoice silently exclude a child from the bulk run.
  *Acceptance:* a pilot admin can follow it without asking a follow-up question; the dedup trap is called out with a worked label example.

Frontend diffs in T1, T4 and T5 are cross-checked against `.claude/standards/design-system.html` (overlay/table/empty-state and portal-nav sections) plus `better-accessibility` for the disabled-cell affordance.

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet-5; tasks [T1, T2, T5, T6] parallel (disjoint file sets), tasks [T3, T4] sequential behind T2 (T4 also serialised behind T1 — both touch `app/parent/student-journal/page.tsx`).
- Task T1: Unblock the parent journal grid — `app/parent/student-journal/page.tsx`, `app/parent/student-journal/__tests__/page.test.tsx` (new) — render gate moved off "no entries this week" onto "no ACTIVE categories in either scope", so a wali with configured indicators always gets the tappable Di Rumah grid; EmptyState copy rewritten to name the school as the party who configures indicators instead of implying the wali is waiting on a teacher.
- Task T2: Shared backfill-window helper — `lib/student-journal/backfill.ts` (new), `lib/student-journal/__tests__/backfill.test.ts` (new) — pure `homeEntryEditFloor(todayYmd)` / `isHomeEntryDateEditable(date, todayYmd)` over `weekStart` from `week.ts`; no clock reads inside, so the server route (T3) and the React grid (T4) share one definition of the window.
- Task T5 (rescoped): residual parent-nav copy cleanup — `components/parent/more-sheet.tsx`, `components/parent/bottom-nav.tsx`, `components/parent/__tests__/bottom-nav.test.tsx` — dropped the last "Capaian" from nav sub-label copy, corrected two stale comments, and retargeted the two test assertions that keyed off the old string. No rename, per the owner decision recorded in Tasks → T5.
- Task T6: Billing runbook — `docs/runbooks/tagihan-serentak.md` (new) — Indonesian operator guide for the bulk-then-manual billing flow. Every UI string it tells the admin to click was verified against the code before commit: "Biaya & Tagihan", "Komponen Biaya", "Struktur per Program", "Buat Tagihan", "Tagihan Manual", "Lanjutkan", "Coba Lagi Link", "Link Gagal".
- Task T3: Server enforcement — `app/api/student-journal/entries/home/route.ts`, `lib/validations/student-journal.ts`, `__tests__/api/student-journal/entries-home-edit-window.test.ts` (renamed from `…-today-only.test.ts`), `docs/uat/jobs/parent.md` — guard swapped to the shared predicate, `HOME_TODAY_ONLY_MSG` → `HOME_EDIT_WINDOW_MSG` with copy naming the real window, and the guard's comment rewritten (the old one claimed all backfill was rejected). Guard ordering unchanged: auth still precedes the date check, with a test pinning that.
  **Security fix folded in.** The `superpowers:code-reviewer` pass caught a regression the widening introduced: `ymd` was shape-only (`/^\d{4}-\d{2}-\d{2}$/`), so an impossible date like `2026-07-99` passes validation, and because the window predicate compares strings lexicographically it sorts *inside* the window whenever the window straddles a month boundary (verified: today `2026-08-03` → floor `2026-07-27` → `2026-07-99` accepted). Under the old exact-equality rule this was unreachable, so the loose regex had been harmless. `ymd` now round-trips through `Date` — the same guard `lib/validations/curriculum.ts` already used — and a regression test covers it.
- Task T4: WeekGrid window support + parent wiring — `components/portal/week-grid.tsx`, `app/parent/student-journal/page.tsx`, `components/portal/__tests__/week-grid.test.ts` — `isWeekGridDateEditable` gained an optional 4th arg and `WeekGrid` a matching optional prop, so omitting it preserves teacher today-only and admin `disablePastDays={false}` exactly. The hardcoded "hanya hari ini bisa diubah" aria-label became `lockedCellReason()`, which states the rule actually in force (future / today-only / windowed) and mirrors the server's wording. The parent page passes `homeEntryEditFloor(getTodayInTimezone("Asia/Jakarta"))` to the Di Rumah grid only — derived from wall-clock today, never from the week being viewed, so navigating back to an old week leaves every cell locked.

## Verification

- Pre-cycle baseline (measured on this branch before any task, after `npx prisma generate`): `Test Files 290 passed | 2 skipped (292)`, `Tests 2686 passed | 42 todo (2728)`, zero failures. Note the worktree needed `npx prisma generate` first — `lib/generated/prisma` is not checked in, and without it 26 test files fail to resolve `@/lib/generated/prisma/client`.
- Tasks T1, T2, T5, T6: `feature-dev:code-reviewer` pass over the combined T1+T2 diff returned **no blockers and no high-confidence issues**; it independently re-derived the day-of-week for every hardcoded calendar date in the backfill tests and confirmed the new parent-page test fails against the old gate condition (i.e. it is not vacuous). Two sub-threshold nits noted and accepted: no explicit test for the single-scope-empty case (behaviour verified by reading `week-grid.tsx`), and the new empty-state copy states WHY but not what-happens-next.

## Ship Notes
