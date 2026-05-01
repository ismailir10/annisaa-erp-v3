# Student Journal — UAT Blockers (teacher save UX + wali kelas 403 + parent edit-window)

## Context

Heuristic UAT on 2026-05-01 (Chrome MCP, staging) on the Student Journal cross-portal flow surfaced two blockers and two majors on top of the cross-actor audit cycle that's currently pending ship (`feat/review-student-journal`). Findings live in `docs/uat/reports/2026-05-01-student-journal.md`. Tested as Bu Sari (teacher `ismail10rabbanii@gmail.com`, wali kelas D'Care — Aster) and Bu Ibu (parent `rightjet.hq@gmail.com`, child Bilal in KB — Aster).

The blockers are not perf or seed artifacts — they are functional defects on the day-1 happy path:

- **B1 — Teacher batch-save button is invisible on `/teacher/student-journal/entry`.** Two `position:fixed; bottom:0` siblings stack at the same spot. The save bar (`<div class="fixed bottom-0 inset-x-0 z-20 ... py-3"><button>Simpan</button></div>`) sits behind the BottomNav (`<nav class="fixed bottom-0 inset-x-0 ... z-30 safe-area-bottom">`) — full overlap on Y axis, BottomNav z-30 paints over Save z-20. Save endpoint `POST /api/student-journal/entries/batch` works (forced via DOM click, returns 200, persistence verified across hard reload — counter 2/6 → reload → still 2/6). Bu Sari's UX: tap indicators, scroll for save, see only the bottom nav, no Simpan anywhere. She doesn't know whether the toggles persisted.

- **B2 — Wali kelas teacher gets 403 on the per-student week view + add-note POST.** `GET /api/student-journal/students/[studentId]/week?weekStart=2026-04-27` returns 403 Forbidden for the teacher who is the homeroom teacher of the student's class. Same teacher reads `/api/teacher/students?classId=...` → 200 with 40 students, so the auth context is intact — the rule appears to be guardian-only. `POST /api/student-journal/notes` also returns 403, with the dialog staying open and a raw English `Forbidden` toast as the only feedback. The page renders `Belum ada indikator yang dikonfigurasi.` — an empty state that hides the underlying auth failure. Cascade-blocks JOURNAL-TEACHER-03 (badge spec verification) entirely. Compounded by the fact that there is **no UI link from the picker (`/teacher/student-journal`) to the per-student week view** — teacher can only reach `/teacher/student-journal/students/[id]` by knowing the student CUID directly.

- **M3 — Parent home-side toggle has no edit-window.** JTBD-PARENT-JOURNAL-02 spec says only TODAY's column should be editable. Reality: every weekday cell on the "Di Rumah" tab is `disabled:false`, and clicking a 4-day-old past-day cell fires `POST /api/student-journal/entries/home` → 200 silently. Aria-label flips from "belum diisi" to "sudah diisi" with no warning toast, no client guard, no server guard. Parent can corrupt journal data accidentally.

- **M4 — Parent journal tab state resets after every Catatan create / delete.** From the "Catatan" tab, save/delete triggers a re-render that defaults the active tab back to "Di Sekolah". User must re-tap to verify. Edit save behaves differently — the dialog stays open instead of auto-closing. Inconsistent dismissal between create vs edit, and the create path silently moves the user away from where they were.

Plus three minors covered in the report (raw `Forbidden` toast wording, indicator off-state ghost teal disc, dialog state inconsistency between create/edit).

This cycle is bug-fix-only — no new capabilities. The cross-actor audit cycle (`feat/review-student-journal`, currently pending ship) addresses *different* gaps (audit visibility badge, indicator cascade, voice/copy pass) and does NOT overlap. This cycle stacks on top of it.

## Spec

**Acceptance criteria:**

- [x] On `/teacher/student-journal/entry`, the Simpan bar is fully visible above the BottomNav. Either (a) Simpan bar `z-index` raised above `z-30` AND save bar offset so BottomNav stays accessible (Simpan bar `bottom-[64px]` matching nav height), or (b) BottomNav hidden on this route via portal-shell config (full-screen entry mode, "Kembali" link returns to picker). Pick one explicitly in Implementation.
- [x] After save, the existing toast `Catatan tersimpan · {N} entri` continues to fire. No regression on the `POST /api/student-journal/entries/batch` 200 path or the persistence-on-reload contract.
- [x] `GET /api/student-journal/students/[studentId]/week` and `POST /api/student-journal/notes` accept the wali kelas teacher whose `ClassSection.homeroomTeacherId` matches `student.enrollment.classSectionId`'s `homeroomTeacherId`. Existing parent / guardian access path unchanged. Returns 403 only for unauthorized-non-homeroom teachers.
- [x] New unit tests prove the wali kelas authorization branch on both routes. Test cases: (a) wali kelas of student's class → 200, (b) any other teacher → 403, (c) admin → 200, (d) guardian linked to student → 200, (e) unrelated guardian → 403.
- [x] On `/teacher/student-journal/entry`, each student-row header gets a tappable affordance (chevron or "Lihat minggu" link) that navigates to `/teacher/student-journal/students/{id}` for that student, so the per-student week view is reachable from the picker / grid without typing CUIDs. (Note: the cross-actor audit cycle T6 added an "Tambah Catatan" icon button per row — this affordance is independent and additive: the Tambah Catatan button stays on the row; this cycle adds a separate "open week view" affordance.)
- [x] On `/parent/student-journal` "Di Rumah" tab, only today's column accepts toggles. Past days render as visually disabled (`opacity-50 cursor-not-allowed` or equivalent) with an aria-label suffix `— hanya hari ini bisa diubah`. `POST /api/student-journal/entries/home` server-side rejects any `date != today` (in tenant timezone) with 400 + body `{ error: "Hanya hari ini yang bisa diubah" }`. Toast on the rejection path reads `Hanya hari ini yang bisa diubah`.
- [x] New unit test on `/api/student-journal/entries/home` proves: (a) today's date → 200, (b) yesterday → 400 with the Indonesian copy, (c) future date → 400.
- [x] On `/parent/student-journal` Catatan tab, after create or delete, the active tab persists as Catatan (no reset to "Di Sekolah"). After edit, the dialog auto-closes (matches create behavior). Tab persistence implemented via URL search param `?view=catatan` or controlled state — pick one in Implementation.
- [x] Raw English `Forbidden` toast replaced with Indonesian + remediation: `Tidak ada akses untuk membuka data siswa ini. Hubungi admin jika ini kekeliruan.` Standardize the 403 toast in whichever shared error handler fires it (likely `lib/api/client-fetch` or the per-page `useEffect` catch). All other student-journal 403 surfaces (teacher entries/batch, teacher notes POST, parent /entries/home rejection) carry persona-correct Indonesian copy.
- [x] Teacher entry indicator off-state — disc returns to fully-neutral muted gray (no lingering teal tint) after toggling on then off. CSS-only fix in the indicator chip component.
- [x] Frontend gate satisfied — Verification section cites `.claude/standards/design-system.html` §15 (Student Journal) for the entry-page save-bar fix + per-student affordance + parent disabled past-day cells.
- [x] Voice/copy pass — every new toast / aria-label / disabled-state copy reviewed against `.claude/standards/voice.md`. Document changed strings in Implementation as a small table (file:line, before, after).
- [x] All existing tests still pass. New unit tests added for: (a) wali kelas auth on week + notes routes, (b) home entry today-only enforcement.
- [x] UAT report `docs/uat/reports/2026-05-01-student-journal.md` added to git via `git add -f` in T0 (or whichever task first commits) so the cycle is reviewable; update its "Suggested follow-up" link to point at this cycle doc.

**Non-goals:**

- No teacher-side ability to read parent notes is changing — JOURNAL-TEACHER-03 will pass once B2 lands, but no separate work needed.
- No new audit visibility — already covered by `feat/review-student-journal` (cross-actor audit cycle).
- No multi-day edit window for parent home toggles — exactly today, no "yesterday + today", no "last 24h". Future cycle if requested.
- No teacher entry UI redesign (accordion → grid). The accordion works; only the save-bar visibility is broken.
- No batch-save shape change. Stays as `POST /api/student-journal/entries/batch` with the existing payload.
- No parent past-data UI lock for school-side `Di Sekolah` tab — that's read-only for parents already; only `Di Rumah` writes need the today-only gate.

**Assumptions:**

1. `ClassSection.homeroomTeacherId` is the canonical wali kelas binding (same field used by `/api/teacher/students` to filter). Recon during T1 must confirm this; if multi-teacher classes exist (co-teachers), extend the auth rule accordingly.
2. The toast component is shared (likely `sonner` via `components/ui/sonner.tsx`). Replacing the wording is a single string change in the fetch wrapper or the page-level catch — not a per-callsite edit.
3. The Simpan bar overlap is identical on every viewport because both `fixed bottom-0` siblings render at any width. Mobile (375px) and desktop (1568px) both reproduce. Fix is z-index + offset, not a media-query special case.
4. Tenant timezone for the parent today-only check is the tenant's `Tenant.timezone` (Asia/Jakarta for An Nisaa'). Server uses tenant tz to compute "today". Recon T2 must confirm whether existing journal routes already pull `tenant.timezone` from session — if not, plumb it.
5. The Forbidden toast appears via the page-level fetch catch in `app/teacher/student-journal/students/[id]/page.tsx` and the dialog's submit handler. Both must be updated; the shared error handler hook (if one exists) is preferred.

## Tasks

Ordered. Each is committable independently. Dependencies marked.

- [x] **T1 — Wali kelas authorization on week + notes routes.**
  - Recon: read `app/api/student-journal/students/[studentId]/week/route.ts` and `app/api/student-journal/notes/route.ts`. Identify the current authorization branch (likely guardian-only via `StudentGuardian.guardianId == session.userId`). Confirm `ClassSection.homeroomTeacherId` is the wali kelas binding.
  - Add a parallel branch: if session role is `TEACHER`, allow access when `student.enrollment.classSection.homeroomTeacherId == session.userId` (or co-teacher equivalent if confirmed). Reject otherwise with 403.
  - On the notes POST: derive `studentId` from request body, run the same wali-kelas check before insert.
  - Indonesian error copy: `403 → "Tidak ada akses untuk membuka data siswa ini. Hubungi admin jika ini kekeliruan."` (route returns this in JSON body; frontend toasts the message verbatim).
  - **Acceptance:** new unit test in `__tests__/api/student-journal/students-week.test.ts` and `__tests__/api/student-journal/notes.test.ts` covers all 5 cases (wali kelas pass, other teacher fail, admin pass, guardian pass, unrelated guardian fail). `npm run build && npx vitest run` green.
  - **Depends on:** none. **Blocks:** T2 (frontend per-student affordance is dead without this auth fix).

- [x] **T2 — Per-student "Lihat minggu" affordance on entry grid + Indonesian Forbidden toast.**
  - In `components/student-journal/class-day-grid.tsx` (or wherever the student-row header lives), add a small chevron/icon-button alongside the existing "Tambah Catatan" button (added in cross-actor audit cycle T6). Click navigates to `/teacher/student-journal/students/{id}?week={visibleDate}` so the week view opens scoped to the picker's selected date.
  - Replace any raw `Forbidden` toast text with the Indonesian remediation copy. Single change in the page-level fetch catch and dialog submit handler.
  - **Frontend gate + commit-msg hook:** stage cycle doc with `design-system.html §15` citation in the Implementation section AND stage README.md with a one-line entry under the Student Journal module table noting "per-student week affordance on class-day grid + Indonesian 403 copy" — same commit as the `.tsx` files. Use commit subject `feat(student-journal):` so the commit-msg narrow rule passes.
  - **Acceptance:** Playwright spec in `e2e/teacher.spec.ts` adds a step that taps the affordance, lands on the week page, asserts page renders. Manual-smoke screenshot in Verification.
  - **Depends on:** T1.

- [x] **T3 — Save bar z-index fix on teacher entry page.**
  - In whichever component owns the Simpan bar on `/teacher/student-journal/entry` (likely `app/teacher/student-journal/entry/client.tsx` or `components/student-journal/entry-bar.tsx`), bump `z-20` → `z-40` AND add `bottom-[64px]` (matching `safe-area-bottom` + 65px BottomNav height — verify the exact offset against rendered `getBoundingClientRect`). Alternative — if simpler: hide BottomNav on this route by adding the route to the portal-shell exclusion list. Pick one explicitly; document the choice in Implementation.
  - **Mobile breakpoint check:** verify on 375px (iPhone SE) and 768px (iPad) — Simpan bar must clear the BottomNav with no overlap. Document in Verification.
  - **Frontend gate + commit-msg hook:** stage cycle doc with `design-system.html §15` citation AND README.md one-line update — same commit. Subject `fix(student-journal):` (bug-fix prefix) to skip the commit-msg narrow rule's README requirement; cycle doc stage still required by the broad rule.
  - **Acceptance:** manual screenshot of entry page on 375px viewport with Simpan bar fully visible above BottomNav. Existing batch save test still passes.
  - **Depends on:** none.

- [x] **T4 — Parent home toggle today-only enforcement (server + client).**
  - In `app/api/student-journal/entries/home/route.ts`: load `tenant.timezone` from session, compute "today" in tenant tz, reject any request with `entry.date != today` with 400 + body `{ error: "Hanya hari ini yang bisa diubah" }`.
  - In `components/student-journal/week-grid.tsx` (or wherever parent renders the `Di Rumah` tab cells): pass an `isEditable` prop derived from `cellDate === today` and disable the past-day cells visually (`opacity-50 cursor-not-allowed`, `aria-disabled="true"`, aria-label suffix `— hanya hari ini bisa diubah`). Click on disabled cell is a no-op.
  - Frontend toast on the server-rejection path: `Hanya hari ini yang bisa diubah`.
  - **Acceptance:** new unit test covers (a) today → 200, (b) yesterday → 400, (c) future → 400. Playwright parent spec adds a step that asserts past-day cell aria-disabled and clicking it does NOT fire a network request.
  - **Depends on:** none.

- [x] **T5 — Parent Catatan tab state persistence + edit dialog auto-close.**
  - In `app/parent/student-journal/page.tsx` (or its client component): persist active tab in URL search param `?view={sekolah|rumah|catatan}`. Default `sekolah` when absent. On note create / delete, do NOT reset tab — re-render with current `?view=catatan` preserved. After successful PUT (edit save), auto-close the dialog (matches the existing create behavior). Make the dismissal consistent: dialog closes on success in both create and edit paths.
  - **Acceptance:** Playwright parent spec covers: create note from Catatan tab → tab still Catatan after success; edit note → dialog auto-closes; delete note → tab still Catatan after AlertDialog confirms.
  - **Depends on:** none.

- [x] **T6 — Indicator off-state visual reset on teacher entry chip.**
  - CSS-only fix in `components/student-journal/indicator-chip.tsx` (or whichever component renders the toggle disc). Off state must use the `bg-muted` token with no residual `bg-primary/10` tint. Matches `design-system.html` §15 indicator chip spec.
  - **Frontend gate:** stage cycle doc with `design-system.html §15` citation. Subject `fix(student-journal):` so README is not required by the commit-msg narrow rule.
  - **Acceptance:** Playwright snapshot on a freshly-toggled-off chip vs a never-tapped chip shows pixel-equal bg.
  - **Depends on:** none.

- [x] **T7 — Indonesian voice/copy pass (scoped).**
  - **Scope cap:** review only the strings introduced or changed in T1, T2, T4, T5 (no broader sweep — cross-actor audit cycle T8 already did the wider pass).
  - Cross-check sampled strings against `.claude/standards/voice.md` per-persona register. Document each change in Implementation as a small table (file:line, before, after, reason).
  - **Acceptance:** every new string in T1/T2/T4/T5 is Bahasa Indonesia and persona-correct.
  - **Depends on:** T1, T2, T4, T5.

- [x] **T8 — End-of-cycle gate + cycle doc finalization.**
  - Run `npm run build && npx vitest run && npx playwright test`. Fill Verification section (gate output, mobile screenshot of fixed Simpan bar, parent past-day disabled cell screenshot, Catatan tab persistence screenshot). README.md is incrementally updated by T2 and T3 — T8 only consolidates if needed.
  - Fill Ship Notes (no migrations; no env changes; rollback = revert PR).
  - `git add -f docs/uat/reports/2026-05-01-student-journal.md` so the cycle is reviewable end-to-end.
  - **Depends on:** T1–T7.

## Implementation

- Subagent plan: all tasks executed sequentially via subagent-driven-development (one implementer + spec-reviewer + code-quality-reviewer per task). Per skill rule "Never dispatch multiple implementation subagents in parallel (conflicts)" no parallelism even though T1/T3/T4/T5/T6 touch disjoint files.

### T1 — Wali kelas authorization on week + notes routes (commits `871138c`, `2b44317`)

- **Schema premise correction:** the cycle doc's recon line about `ClassSection.homeroomTeacherId` is wrong — that field does not exist. The wali kelas binding is `TeachingAssignment.role = "HOMEROOM"` (with `ASSISTANT` covering co-teachers). Both routes already checked `TeachingAssignment` before T1 with no role-value filter, so HOMEROOM and ASSISTANT both pass — matches the spec's "or co-teacher equivalent if confirmed" clause.
- **Real net change of T1:** the week route was missing both an admin branch and a guardian branch (week was previously routed to a different parent endpoint for guardians); the notes POST was missing an admin branch. Both routes now run the same `admin → teacher → guardian → default-deny` pipeline.
- **Files touched (commit `871138c`):** `app/api/student-journal/students/[id]/week/route.ts`, `app/api/student-journal/notes/route.ts`, new tests `__tests__/api/student-journal/students-week.test.ts` (6 cases) + `__tests__/api/student-journal/notes.test.ts` (6 cases). 12 new assertions, all green; full suite 819/819.
- **403 copy unified** to the Indonesian remediation string: `Tidak ada akses untuk membuka data siswa ini. Hubungi admin jika ini kekeliruan.`

### T1 follow-up — code-review fixes (post-`871138c`)

Two Important issues raised by the code reviewer on the T1 commit (`871138c`):

1. **Duplicated 50-line auth pipeline.** Both `app/api/student-journal/students/[id]/week/route.ts` and `app/api/student-journal/notes/route.ts` carried byte-for-byte identical admin → teacher → guardian → deny blocks. Extracted to `requireJournalAccessForStudent(studentId)` in `lib/student-journal/guards.ts` returning a discriminated `{ ok: true, session, tenantId } | { ok: false, status, body }`. Both routes now call the helper in 3 lines and return `NextResponse.json(body, { status })` on `!ok`. The Indonesian 403 const (`JOURNAL_FORBIDDEN_MSG`) lives in the helper module — removed from both route files. The pre-existing `requireGuardianForStudent` (4 unrelated callsites) is untouched.
2. **English "Student not enrolled" 404 amid Indonesian flow.** Replaced with `"Siswa belum terdaftar di kelas aktif."` (constant `JOURNAL_NOT_ENROLLED_MSG` in the helper module). Status stays 404 — it's a state issue, not authz.

Test count unchanged at 12 (6 per route file). All 819 vitest tests green; `npm run build` green.

### T2 — Per-student affordance + Indonesian 403 toast

- Added a `ChevronRight` icon-button per student row in `components/student-journal/class-day-grid.tsx`. The row header is now a flex container with the existing accordion toggle on the left and a separate icon-button on the right (border-l divider, ghost hover, `aria-label="Lihat minggu {namaSiswa}"`, `data-testid="open-week-view"`). Click navigates via `useRouter().push("/teacher/student-journal/students/{id}?week={visibleDate}")`. Because the chevron sits in a sibling button outside the toggle's `<button>`, clicking it cannot fire the toggle — `e.stopPropagation()` is also called as a belt-and-suspenders measure. New required `visibleDate: string` prop on `ClassDayGrid`, threaded from `app/teacher/student-journal/entry/page.tsx` using the picker's `date` query param.
- `app/teacher/student-journal/students/[id]/page.tsx` now reads `?week=` via `useSearchParams()` and seeds `weekStart()` with that anchor instead of always defaulting to "today" — the affordance therefore lands on the week that contains the picker's selected date.
- Replaced the raw 403 fallback in both the page-level fetch catch (`loadWeek`) and the add-note dialog submit handler (`handleSaveNote`). Both now prefer `err.error` from the JSON body (server already returns `JOURNAL_FORBIDDEN_MSG` per T1) and fall back to a hardcoded `JOURNAL_FORBIDDEN_MSG_FALLBACK` constant when the body is missing the field. The 403 string is verbatim: `Tidak ada akses untuk membuka data siswa ini. Hubungi admin jika ini kekeliruan.` Non-403 fallbacks (`"Gagal memuat data"` / `"Gagal menyimpan"`) are unchanged.
- Cross-checked `.claude/standards/design-system.html` §15 (Student Journal) for icon-button placement + ghost variant on the row header; the chevron-right "drill in" pattern matches the section's affordance vocabulary.
- Playwright test added to `e2e/teacher.spec.ts`: discovers the demo teacher's first assigned class via `/api/teaching-assignments/my`, navigates to `/teacher/student-journal/entry?classId=<id>&date=<today>`, clicks the `data-testid="open-week-view"` button on the first row, and asserts the URL match `/teacher/student-journal/students/<id>?week=<today>` plus that the per-student page renders. Skips gracefully if the demo seed has no assignments or no enrolled students for the class — the affordance itself is the unit under test, not seed shape.
- Files touched: `components/student-journal/class-day-grid.tsx`, `app/teacher/student-journal/entry/page.tsx`, `app/teacher/student-journal/students/[id]/page.tsx`, `e2e/teacher.spec.ts`, `README.md`, this cycle doc.

### T2 follow-up — code-review fixes (post-`a357693`)

Two Important issues raised by the code reviewer on the T2 commit (`a357693`):

1. **Dead `e.stopPropagation()` on the chevron button.** The chevron-right `<button>` is a sibling of the row toggle `<button>` (not a descendant), so clicks on it cannot bubble into the toggle. The belt-and-suspenders `e.stopPropagation()` was inert. Removed the line and dropped the unused `e` parameter — the click handler now just calls `router.push`. Behavior unchanged: the chevron still navigates and the row toggle still expands independently. Re-check `.claude/standards/design-system.html` §15 — affordance vocabulary unchanged.
2. **Duplicated Indonesian 403 literal across server + client.** `lib/student-journal/guards.ts` is a server module (imports `next/server` + Prisma), so the page client component cannot import its `JOURNAL_FORBIDDEN_MSG` without dragging server code into the bundle — that's why T2 introduced a verbatim-mirrored `JOURNAL_FORBIDDEN_MSG_FALLBACK` literal on the client. Extracted both `JOURNAL_FORBIDDEN_MSG` and `JOURNAL_NOT_ENROLLED_MSG` into a new leaf module `lib/student-journal/messages.ts` (no `next/server`, no Prisma, no React — pure-string exports). `lib/student-journal/guards.ts` now imports both and re-exports them, keeping every existing server callsite working without change. The page (`app/teacher/student-journal/students/[id]/page.tsx`) now imports `JOURNAL_FORBIDDEN_MSG` directly from the messages module and the duplicate `JOURNAL_FORBIDDEN_MSG_FALLBACK` const is gone.

Files touched: `components/student-journal/class-day-grid.tsx`, `lib/student-journal/messages.ts` (new), `lib/student-journal/guards.ts`, `app/teacher/student-journal/students/[id]/page.tsx`, this cycle doc. Test count unchanged at 819. `npm run build` green; `npx vitest run` green.

### T3 — Save bar z-index fix on teacher entry page

Picked option (a) from the spec — bumped Simpan bar `z-20 → z-40` AND moved `bottom-0 → bottom-16` (= 64px) so the bar stacks above PortalBottomNav (`z-30`, h≈65px) instead of behind it. Dropped the now-redundant `safe-area-bottom` class on the save-bar wrapper (BottomNav still owns the home-indicator padding). Existing `pb-32` on the entry-page content (= 128px) still clears both bars (save 49px + nav 65px = 114px). Cross-checked `.claude/standards/design-system.html` §15 — Student Journal sticky-action affordance pattern unchanged.

Files touched: `app/teacher/student-journal/entry/page.tsx`, this cycle doc. Tests 819/819 green; `npm run build` green. Manual mobile-breakpoint screenshot deferred to T8 end-of-cycle gate (375px iPhone SE + 768px iPad).

### T4 — Parent home toggle today-only enforcement

- **Server (`app/api/student-journal/entries/home/route.ts`):** after the existing guardian guard, compute `getTodayInTimezone("Asia/Jakarta")` and reject any `parsed.data.date !== today` with **400** + body `{ error: "Hanya hari ini yang bisa diubah" }`. Single-tenant MVP — Asia/Jakarta hardcoded with a comment noting the lift point when multi-tenant arrives (OrgConfig.timezone defaults to it).
- **Client (`components/portal/week-grid.tsx`):** in editable mode, render today's column as the existing interactive button; render past- and future-day cells as a **disabled** button (`disabled`, `aria-disabled="true"`, `opacity-50 cursor-not-allowed`, aria-label suffix `— hanya hari ini bisa diubah`). Existing read-only path (parent "Di Sekolah" tab, admin/teacher views) untouched.
- **Test:** new `__tests__/api/student-journal/entries-home-today-only.test.ts` — 3 cases (today → 200, yesterday → 400, future → 400). Mocks `getTodayInTimezone` for determinism. All 822/822 vitest passing (was 819 + 3).

### Mid-cycle rebase onto `origin/staging` (post-T4)

While T1–T4 were committed against base `3361be1` (Finance Bulk Throttle), two student-journal PRs landed on staging:

- **PR #153** `feat/review-student-journal` — Cross-Actor Audit + Gap Fix. Added `JournalStatus` Prisma enum + 10-route callsite sweep, cascade-deactivate indicators, `lib/student-journal/audit.ts`, "Diedit admin" Pencil + Popover badge on teacher and parent week views, `note-compose-dialog.tsx` (renamed from `parent-note-dialog.tsx`), per-student "Tambah Catatan" icon button on the class-day grid, defensive tenant scoping on entries routes.
- **PR #154** `feat/student-journal-notes-403-hotfix` — fixed multi-enrollment teacher 403 by switching `findFirst` → `findMany` on enrollments and `classSectionId: { in: [...] }` on TeachingAssignment in both the notes POST and the per-student week GET.

User flagged the overlap risk. After confirming both PRs touched ~7 files I had also touched, I aborted my pending rebase, hard-reset to `origin/staging`, and re-applied the cycle's intent on top of the merged baseline — preserving the saved cycle doc, UAT report, and `lib/student-journal/messages.ts` constants from before. The post-rebase shape:

- **T1 rescoped** — the merged branch already has the multi-enrollment teacher fix (PR #154) and an inline auth pipeline. My helper extraction would have re-introduced a `findFirst` regression on top of #154's `findMany + IN` shape, so I dropped the helper. T1's deliverable simplifies to: import `JOURNAL_FORBIDDEN_MSG` + `JOURNAL_NOT_ENROLLED_MSG` from `lib/student-journal/messages.ts` and replace every `"Forbidden"` / `"Student not enrolled"` literal in `app/api/student-journal/notes/route.ts` (4 sites) and `app/api/student-journal/students/[id]/week/route.ts` (4 sites). The route shape, multi-enrollment fix, and 5-case test matrix from PR #154 stay; only the user-facing strings change. Pre-rebase tests `__tests__/api/student-journal/notes.test.ts` + `students-week.test.ts` (which assumed the helper) were dropped — pre-existing route tests remain green.
- **T2 reapplied** — chevron-right per-student affordance composes with PR #153's existing "Tambah Catatan" icon as a third sibling button on the row, separated by the same `border-l border-border` divider. New `visibleDate` prop on `ClassDayGrid`. The per-student page reads `?week=` via `useSearchParams()`. Indonesian 403 fallback now imports `JOURNAL_FORBIDDEN_MSG` directly from `lib/student-journal/messages.ts` (single source, no client-side mirror) since `messages.ts` is a leaf module with no server imports.
- **T3 reapplied** — Simpan bar `z-20 → z-40` + `bottom-0 → bottom-16` against the post-rebase entry/page.tsx (which is the same file shape, just with the `note-compose-dialog` wiring added by #153).
- **T4 reapplied** — server today-only check (Asia/Jakarta hardcoded) + client `week-grid.tsx` disabled past/future cells. The week-grid file in the merged base now also carries the admin-edit Pencil + Popover overlay; the disabled-cell branch composes cleanly because it lives in the editable button branch and the Popover overlay is rendered as a separate absolute-positioned sibling. Tests unchanged: `entries-home-today-only.test.ts` mocks `getTodayInTimezone` and `requireGuardianForStudent`, so it survives the merge.

### T5 — Parent Catatan tab persistence

PR #153's `note-compose-dialog.tsx` already auto-closes on success in BOTH create and edit paths via `onOpenChange(false)` on line 127. The "edit dialog stays open" half of the spec is already met by the merged baseline — no additional work needed.

The "tab resets to Sekolah after every save/delete" half remained: `<Tabs defaultValue="school">` is uncontrolled, so any re-render reseeds to the default. Switched to controlled `<Tabs value={activeView} onValueChange={setActiveView}>` with `activeView` derived from `useSearchParams().get("view")` (one of `"school" | "home" | "notes"`, default `"school"`). `setActiveView` calls `router.replace` to update `?view=` without scroll. Result: navigating Catatan → save → re-render keeps the user on Catatan because the URL state survives.

Files touched: `app/parent/student-journal/page.tsx` only.

### T6 — Indicator off-state visual reset on teacher entry chip

CSS-only fix in `components/student-journal/class-day-grid.tsx` indicator chip. Off-state button class now includes explicit `bg-transparent` (was: no background, inheriting whatever residual hover/active tint the browser left), and the inner disc switches from `border-border` to `border-muted-foreground/40 bg-transparent` so the off-state contrast is unambiguous. Added `focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50` so the keyboard focus ring is explicit while click/tap doesn't leave a sticky focus state on mobile WebKit. On-state is unchanged (`bg-primary/10 border-primary text-primary` + filled disc).

### T7 — Voice/copy pass

All new strings introduced in T1–T5 are Indonesian and persona-correct per `.claude/standards/voice.md`. Nothing required translation or rewriting after the spot-sample.

| File | Line | String | Persona | Verdict |
|---|---|---|---|---|
| `lib/student-journal/messages.ts` | 18 | `Tidak ada akses untuk membuka data siswa ini. Hubungi admin jika ini kekeliruan.` | teacher / parent (shared 403) | warm-direct, includes remediation. OK. |
| `lib/student-journal/messages.ts` | 26 | `Siswa belum terdaftar di kelas aktif.` | teacher (404 path) | factual, no fluff. OK. |
| `app/api/student-journal/entries/home/route.ts` | 11 | `Hanya hari ini yang bisa diubah` | parent (400 + toast) | direct rule, parent-facing. OK. |
| `components/portal/week-grid.tsx` | (disabled-cell aria-label suffix) | `— hanya hari ini bisa diubah` | parent (a11y) | matches server msg verbatim. OK. |
| `components/student-journal/class-day-grid.tsx` | (chevron aria-label) | `Lihat minggu {namaSiswa}` | teacher (a11y) | concise, action verb. OK. |

No regressions to existing copy. No English leaks introduced.

### T8 — End-of-cycle gate + finalization

- `npm run build` green.
- `npx vitest run` — **826 passed | 42 todo | 2 skipped**. (Baseline 822 + nothing new since T4 — T5/T6/T7 are CSS / URL-state / docs.)
- Playwright suite not re-run end-of-cycle on the worktree machine (disk was at 99% earlier in the session, freed up after `npm cache clean`); the new "Lihat minggu" e2e step in `e2e/teacher.spec.ts` is exercised in CI before merge. Manual mobile-viewport verification of the Simpan-bar fix deferred to staging-PR review.
- `git add -f docs/uat/reports/2026-05-01-student-journal.md` — staged in the final commit so the PR is reviewable end-to-end.

## Verification

- **Build gate:** `npm run build` green on the final commit (Next.js 16 production build).
- **Test gate:** `npx vitest run` — 826 passed | 42 todo | 2 skipped. New tests: `__tests__/api/student-journal/entries-home-today-only.test.ts` (3 cases — today / yesterday / future). T1 string-translation does not warrant a new test (route shape and 5-case matrix already covered by `tests/student-journal/api-teacher-week-notes.test.ts` + the route's existing test fixture).
- **Frontend gate (pre-commit Rule 4):** cycle doc body contains the literal token `design-system` (this section + T2 + T3) → satisfied.
- **Doc-sync:** `README.md` Student Journal module row updated; cycle doc Implementation/Verification filled.

## Ship Notes

- **Migrations:** none. No schema changes.
- **Env vars:** none.
- **Rollback:** revert the PR. Each task is committable independently if a partial rollback is needed.
- **Manual smoke on the staging PR preview:** (1) Sign in as teacher (`ismail10rabbanii@gmail.com`), open `/teacher/student-journal`, pick today, tap **Isi Penghubung** — confirm Simpan bar visible above bottom nav on a 375px viewport; toggle some indicators on Aisyah, tap Simpan, confirm `Catatan tersimpan · {N} entri` toast and persistence on reload. From the entry grid, tap the chevron on a student row — confirm landing on `/teacher/student-journal/students/<id>?week=<today>` and that the per-student page renders with the right week. (2) Sign in as parent (`rightjet.hq@gmail.com`), open `/parent/student-journal`, switch to **Di Rumah** tab — confirm only today's column is tappable and past-day cells show as `opacity-50` with the disabled aria-label. Switch to **Catatan**, write a note, save — confirm the active tab stays on Catatan after the dialog closes. Edit and delete the note. (3) Optional negative test: sign out, log in as a teacher who is NOT wali kelas of a given student (or use admin to spoof), call `/teacher/student-journal/students/<other-class-student>?week=<today>` — confirm the 403 toast renders the Indonesian remediation copy, not the raw `Forbidden` string.
