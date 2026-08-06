# Admin UI Audit Fixes — Kesiswaan / Akademik / Penilaian / Kelas Harian

## Context

A cross-discipline interface review (`/better-interface`, full mode) walked the four admin nav groups the school actually uses daily — Kesiswaan, Akademik, Penilaian, Kelas Harian — across accessibility, layout, writing, typography, colors and UI polish. It returned 5 HIGH and 10 MEDIUM findings, every one evidenced at `file:line` and, where behaviour was involved, reproduced against a running dev server. Three of them are systemic and live in shared code, so they leak into portals outside the audited scope: 121 form controls across `app/admin` have no accessible name, the sidebar group labels fail WCAG AA contrast at 3.64:1, and 13 call sites render raw JavaScript exception strings as user-facing Indonesian error copy (captured live: `Failed to execute 'json' on 'Response': Unexpected end of JSON input` shown as the entire error state on `/admin/raport/templates`). The outcome this cycle wants: every finding closed, the three systemic ones closed at their root in shared code rather than per-page, and no new visual language introduced — all fixes expressed in the existing token/primitive system.

Verdict from the review was `Block`. This cycle is the remediation.

### Findings inventory (source of truth for the tasks below)

| # | Sev | Domain | Root location |
|---|---|---|---|
| 1 | HIGH | Accessibility | `components/ui/field.tsx:101` — `FieldLabel` is a sibling `<Label>`; 45 controls in scope (121 repo-wide) have no `htmlFor`/`id` and no `required` |
| 2 | HIGH | Colors | `components/ui/sidebar.tsx:403` — `text-sidebar-foreground/70` = 3.64:1 on `--sidebar`, AA needs 4.5:1 |
| 3 | HIGH | Writing | 13 sites — `err instanceof Error ? err.message : "<fallback>"` leaks runtime exception text |
| 4 | HIGH | UI polish | `app/admin/raport/raport-editor.tsx:358` — no dirty tracking, back button discards unsaved narratives |
| 5 | HIGH | Writing | `app/admin/student-journal/students/[id]/page.tsx:448` — soft-delete labelled "Hapus" / "Ya, Hapus" |
| 6 | MED | UI polish | `components/admin/sidebar.tsx:90,218` — `group-data-[state=open]/collapsible:rotate-90` with no `group/collapsible` declared anywhere: dead CSS, chevrons never rotate |
| 7 | MED | UI polish | `app/admin/penilaian/page.tsx:98`, `app/admin/raport/templates/page.tsx:193` — `buttonVariants()` without `cn()` keeps base `border-transparent`, outline buttons render borderless |
| 8 | MED | Writing | `app/admin/penilaian/page.tsx:91` — H1 "Penilaian" vs nav/breadcrumb "Pemantauan" |
| 9 | MED | Writing | Glossary drift: "Record" ×5 in `student-attendance`, "Tidak Hadir" in `students/[id]:1043` |
| 10 | MED | Accessibility | `student-attendance/page.tsx:154-176,412,424,693` — Select with a dead placeholder as its only label; `Dari`/`Sampai`/`Bulan` spans unassociated |
| 11 | MED | Accessibility | `semesters/[id]/objectives/client.tsx:540,556` icon-only buttons unnamed; `students/[id]/page.tsx:976` ~20px hit area |
| 12 | MED | Layout | `enrollments/[id]/page.tsx:152,175`, `components/portal/week-grid.tsx:104`, `components/student-journal/note-thread.tsx:41` — loading/empty/header bypass the shared primitives |
| 13 | MED | Colors | `app/admin/penilaian/page.tsx:43-47` — `primary` used for "in progress" where the house semantic is `status-late` |
| 14 | MED | Writing | `penilaian/page.tsx:194`, `student-attendance/page.tsx:508,554` — raw `YYYY-MM-DD` instead of `formatDate()` |
| 15 | MED | Typography | `penilaian/page.tsx:50,203`, `raport/templates/page.tsx:228` — counts/ratios without `tabular-nums` |

## Spec

**Acceptance criteria**

- [ ] AC1 — Every `<FieldLabel>` in `app/admin/**` and the shared admin dialogs is programmatically bound to its control (`htmlFor`/`id`), and every `<FieldLabel required>` has a control carrying `required` + `aria-required="true"`. Verified by a repo-wide check that reports zero unbound pairs.
- [ ] AC2 — Sidebar group labels measure ≥ 4.5:1 against `--sidebar` in the light theme (the only theme the admin shell ships), with the value recorded in Verification.
- [ ] AC3 — No user-facing error string can contain a raw runtime exception message. A single shared helper owns the "API-authored message or Indonesian fallback" decision, and all 13 call sites use it.
- [ ] AC4 — Leaving the raport editor with unsaved edits raises a confirmation; confirming discards, cancelling stays. Covered by a test.
- [ ] AC5 — Every confirmation dialog whose API performs a soft delete says "Nonaktifkan", not "Hapus".
- [ ] AC6 — Sidebar group chevrons rotate to reflect open/closed state.
- [ ] AC7 — Outline buttons rendered through `buttonVariants()` show the same border as `<Button variant="outline">`.
- [ ] AC8 — `/admin/penilaian` H1 matches its nav label and breadcrumb ("Pemantauan").
- [ ] AC9 — `voice.md` glossary is respected in the audited scope: no "Record", no "Tidak Hadir" for the Alpa concept.
- [ ] AC10 — Every visible filter control in `/admin/student-attendance` has a programmatic name.
- [ ] AC11 — Icon-only controls in scope have an `aria-label`; icon-only hit areas are ≥ 24×24 CSS px.
- [ ] AC12 — Loading states use `Skeleton`/`DetailPageSkeleton`, empty states use `EmptyState`, detail headers use `DetailPageHeader` — no hand-rolled `<p>` substitutes in the audited files.
- [ ] AC13 — "In progress" completion state uses the `status-late` token family, not `primary`.
- [ ] AC14 — No raw `YYYY-MM-DD` reaches the screen in the audited files; all dates go through `lib/format`.
- [ ] AC15 — Counts and ratios that are scanned in a column or update in place carry tabular figures.
- [ ] Gates: `npm run build && npx vitest run` green between every task; `npx playwright test` green locally or deferred to CI with the reason recorded.

**Non-goals**

- No redesign. No new components, no new tokens, no new spacing or type scale. Every fix reuses what already exists.
- No behavioural/API change beyond the raport-editor navigation guard. No schema change, no migration.
- Keuangan, SDM, Pengaturan and the HR routes are **not** audited this cycle. They are touched only where a systemic fix (AC1, AC3) sweeps through them — those edits are mechanical and carry no per-page judgement.
- Teacher and parent portals are not audited; `week-grid.tsx` and `note-thread.tsx` are shared and get their empty-state fix, which those portals inherit.
- The `penilaian` duplicate-class-name ambiguity ("KB · Kelompok Bermain" twice) is **deferred** — it needs a data check on whether prod class names are unique per campus before it counts as a defect.

**Assumptions**

1. Admin shell is light-theme only; contrast is verified for the light pairing and the dark sidebar surface, not for a dark app theme.
2. Fixing `field.tsx` consumers (adding `htmlFor`/`id`) is preferred over changing `FieldLabel` to auto-generate ids via context — the explicit-id pattern is already the house convention in `admissions`, `classes` and `semesters`, and a context rewrite would silently change 121 call sites.
3. Repo-wide sweep for AC1 and AC3 is in scope even outside the four audited nav groups, because leaving half a systemic fix applied is worse than either extreme.
4. `Playwright E2E` may be deferred to the required CI check if it cannot run in this harness; the four required checks still gate the merge.

## Tasks

- [x] **T1 — Shared shell + primitives.** Fix the sidebar contrast (#2) and the dead chevron group class (#6) in `components/ui/sidebar.tsx` + `components/admin/sidebar.tsx`; wrap both `buttonVariants()` call sites in `cn()` (#7); replace the plain-`<p>` empty states in `components/portal/week-grid.tsx` and `components/student-journal/note-thread.tsx` with `EmptyState` (#12, shared half). *Accepts when: computed group-label contrast ≥ 4.5:1, chevron `transform` changes with open state, outline `buttonVariants` border matches `<Button variant="outline">`, and no plain-`<p>` empty state remains in those two components.* **No dependencies — do first, it is the highest-leverage change.**
- [x] **T2 — Form-control accessibility sweep (#1).** Bind every `FieldLabel`/control pair in `app/admin/**` + `components/admin/**` + `components/student-journal/**` with `htmlFor`/`id`, and add `required aria-required="true"` wherever the label is marked `required`. Mechanical and file-partitionable — dispatch one subagent per file. *Accepts when: the unbound-pair count across those trees is 0, and a vitest asserts `getByLabelText` resolves for the student create dialog and the guardian edit dialog.* **Independent of T1.**
- [x] **T3 — Error-message hygiene (#3).** Add `userMessage(err, fallback)` to `lib/` (reuse `lib/api` if a home already exists there); it returns the API-authored message when the error came from an API envelope and the Indonesian fallback otherwise, and logs the raw error. Convert all 13 `instanceof Error ? .message` sites. *Accepts when: a vitest proves a thrown `TypeError` yields the fallback and an API-authored message passes through, and no `instanceof Error ?` message leak remains in `app/admin` or `components/admin`.* **Independent.**
- [x] **T4 — Raport editor unsaved-changes guard (#4).** *(partial by explicit user decision — see Implementation)* Track the editor's dirty state against the loaded snapshot; gate the back action behind a confirm and register a `beforeunload` listener while dirty. *Accepts when: a vitest shows the back handler does not fire while dirty until the confirm is accepted.* **Independent.**
- [x] **T5 — Penilaian page (#8, #13, #14, #15, and the raw-table half of #12).** H1 → "Pemantauan"; `primary` → `status-late` for the started-not-done badge; `formatDate()` on `sentraDate`; tabular figures on the two ratio spans; route the raw `<table>` through the shared `Table` primitive. *Accepts when: the page renders with the corrected title, the badge uses status tokens, no raw ISO date appears, and the table uses `components/ui/table`.* **Depends on T1** (shares `buttonVariants` line).
- [x] **T6 — Kisi-kisi page (#15, verb-first label).** Tabular figures on the `terisi` counter; "Ke Raport Siswa" → verb-first, matching the sibling page's "Susun Raport". *Accepts when: the counter uses tabular figures and the header action is verb-first.* **Depends on T1.**
- [x] **T7 — Kelas Harian copy + labels (#5, #9, #10, #14 attendance half, empty-state descriptions).** "Hapus catatan?"/"Ya, Hapus" → "Nonaktifkan…"; "Record" ×5 → "Catatan" incl. the "0 record" subtitle; "Tidak Hadir" → "Alpa" in `students/[id]`; give the class Select a real label and convert `Dari`/`Sampai`/`Bulan` spans to `<label htmlFor>`; `formatDate()` in both attendance dialogs; add descriptions to the three title-only empty states. *Accepts when: no glossary-Avoid term remains in scope, every attendance filter has a programmatic name, and no raw ISO date appears in the dialogs.* **Depends on T2** (label work must not collide).
- [x] **T8 — Kesiswaan + Akademik leftovers (#11, #12 page half, minor consistency).** `enrollments/[id]` → `DetailPageHeader` + `DetailPageSkeleton` + `EmptyState`; `aria-label` on the two icon-only buttons in `objectives/client.tsx`; raise the guardian-row icon hit area from `p-1` to ≥24px; "Semua status" → "Semua Status"; `Batal` → `ghost` in the three objectives dialogs. *Accepts when: those files use the shared primitives, every icon-only control is named, and hit areas measure ≥24px.* **Depends on T2.**

Order: T1 → (T2, T3, T4 in parallel) → (T5, T6 after T1; T7, T8 after T2). One commit per task.

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet (per CLAUDE.md § Harness Roster). Tasks run **sequentially** rather than in the parallel waves T1-T8 imply — T2 (label sweep), T3 (error helper) and T5-T8 overlap on the same files (`student-attendance/page.tsx`, `raport/templates/page.tsx`, `bulk-promote-dialog.tsx`), so concurrent subagents would collide. Fan-out happens *within* each task instead: one subagent per disjoint file group. Driver reviews distilled output, runs gates, and commits.
- Decisions confirmed by the user before build: AC1 + AC3 sweep **repo-wide** (all 121 controls / 13 error sites, not just the 4 audited nav groups); root cause fixed with **explicit `htmlFor`/`id` per call site**, not a context rewrite of `components/ui/field.tsx`.

- Task 1: Shared shell + primitives — `components/ui/sidebar.tsx`, `components/admin/sidebar.tsx`, `app/admin/penilaian/page.tsx`, `app/admin/raport/templates/page.tsx`, `components/portal/week-grid.tsx`, `components/student-journal/note-thread.tsx` + 3 test files — group-label opacity `/70`→`/90` (5.01:1); chevron rotation rewired to `group/nav-group` + `group-data-[panel-open]/nav-group:rotate-90` after confirming Base UI emits `data-panel-open`, never `data-state`; both `buttonVariants()` call sites wrapped in `cn()` so tailwind-merge drops the base `border-transparent`; the two plain-`<p>` empty states replaced with `EmptyState` (title + description, no action — both components render in admin, teacher and parent contexts).

- Task 2: Form-control accessibility sweep — 21 files across `app/admin/**`, `components/admin/**`, `components/student-journal/**` + 2 new test files — 119 controls given `id`/`htmlFor` pairs plus `required` + `aria-required="true"` where the label was marked required; the remaining 2 are group labels (work-hours "Hari Kerja", manual-invoice "Komponen Biaya") bound with `aria-labelledby` on the `role="group"` `<Field>`, which is the correct pattern for a label with no single target control. `ClassSectionCombobox` and `StudentPicker` gained an optional `id` prop forwarded to their popover trigger. Four subagents on disjoint file groups; driver reconciled id uniqueness across co-rendering surfaces. Non-blocking notes from review: `aria-required="true"` is hardcoded inside `ClassSectionCombobox` (`students/[id]/page.tsx:123`) and `StudentPicker` (`manual-invoice-dialog.tsx:219`) rather than derived from a prop — correct for every current call site, worth threading if either is reused for an optional field.

- Task 3: Error-message hygiene — new `lib/api/client-errors.ts` (`ApiError` + `userMessage`) + 12 client files + `lib/finance/run-bulk-{generate,retry}.ts` — a message is displayable only if it was thrown as `ApiError` at the point client code read an API error envelope; everything else (parse errors, network failures, library throws) resolves to the caller's existing Indonesian fallback, with the raw error always logged. Scope ran wider than the 13 listed sites: a multi-line-aware scan found three more leaks the original line-based grep missed, all in the teacher portal (`assessments/center/[center]/client.tsx` ×2, `assessments/weekly/client.tsx`), fixed here since the user chose repo-wide. Two finance helpers had to convert their throws too, or their authored messages would have been swallowed by the new fallback. Non-blocking note from review: `userMessage` logs a bare `console.error(err)` while the codebase's client convention is a bracketed scope tag (`console.error("[invoices] …", err)`) — the helper has no call-site context to supply one.
- Follow-up spotted while verifying, NOT fixed (out of T3's scope): the templates error state renders its title and description as near-identical strings ("Gagal memuat kisi-kisi" / "Gagal memuat kisi-kisi."), because the description is the derived message. Worth collapsing in a later pass.

- Task 4: Raport editor unsaved-changes guard — `app/admin/raport/raport-editor.tsx` + new `app/admin/raport/__tests__/raport-editor.test.tsx` (9 tests) — an `EditableSnapshot` baseline (levels, narratives, att.{permitted,sick,unexcused,total}, hafalan, height, weight) is captured on load and re-captured after a successful save; `isDirty` gates all three back-control call sites behind an `AlertDialog` and registers a `beforeunload` listener while dirty. Confirm label follows `ui.md`'s `Ya, <Verb>` table ("Ya, Keluar"), matching the sibling unpublish dialog in the same file.
- **Known limitation, accepted by the user rather than fixed:** the guard covers the in-editor back button and browser close/reload. It does **not** cover a client-side route change — clicking any `AppSidebar` link or a breadcrumb unmounts the editor without calling `onBack` and without firing `beforeunload` (App Router client transitions don't). Next.js App Router exposes no supported navigation-blocking API, so closing this needs an app-shell dirty-state context that intercepts `<Link>` clicks across every admin page. The user chose to ship the button + tab-close guard and track the rest separately rather than widen a UI-audit cycle into an app-shell change. Follow-up options considered: app-shell nav guard, or autosave-on-blur for the editor (the better end-state, but a behaviour redesign needing its own spec).

- Task 5: Penilaian page — `app/admin/penilaian/page.tsx` + new `app/admin/penilaian/__tests__/page.test.tsx` + `e2e/admin.spec.ts` — H1 "Penilaian" → "Pemantauan" so it stops contradicting the breadcrumb derived from the same nav entry; `CompletionBadge`'s in-progress branch moved off brand `primary` onto the `status-late` family the app already uses for partial states; `formatDate()` applied to the raw ISO `sentraDate`; `font-currency` on the two scanned ratio elements; the hand-rolled `<table>` converted to the shared `components/ui/table` primitive. The primitive defaults to `whitespace-nowrap` inside an `overflow-x-auto` container, which would have turned wrapping text into horizontal scroll at narrow widths — `whitespace-normal` on the two text columns preserves the original behaviour. `e2e/admin.spec.ts:93` asserted the old H1 and would have failed the required CI Playwright check; updated in the same commit.

- Task 6: Kisi-kisi page — `app/admin/raport/templates/page.tsx` + new `app/admin/raport/templates/__tests__/page.test.tsx` — `font-currency` on the `terisi` counter (it updates in place as slots fill, so the badge width was shifting); "Ke Raport Siswa" → "Susun Raport" on both the header action and the empty-state action, matching the sibling page that links to the same destination; `aria-live="polite"` added alongside the existing `aria-busy` so screen-reader users are told when the grid finishes loading, as the two sibling pages already do. Minor inconsistency left as-is per review: T5 puts `font-currency` on whole mixed text+number elements while T6 wraps only the digits — `font-variant-numeric` is a no-op on letters, and both shapes have precedent in the codebase.

- Task 7: Kelas Harian copy + labels — `app/admin/student-attendance/page.tsx`, `app/admin/student-journal/{page,classes/[id]/page,students/[id]/page}.tsx`, shared `components/ui/data-table-toolbar.tsx` + 2 new test files — the note-delete confirmation stopped claiming a permanence the API doesn't have ("Nonaktifkan catatan?" / "Ya, Nonaktifkan"); glossary-Avoid terms replaced ("Record" → "Catatan" ×5 including the "0 catatan" subtitle, "Tidak Hadir" → "Alpa" on the stat tile, the status filter and the override dialog); the class filter and the Dari/Sampai/Bulan date inputs given real `<label htmlFor>` associations; `formatDate()` in both dialogs; descriptions added to three title-only empty states; `aria-invalid` + inline `FieldError` added alongside the existing toasts so a validation failure is not announced only by a transient toast.
- **Scope extension inside T7, disclosed:** while verifying AC10 ("every visible filter control has a programmatic name") in the browser, the search box and status filter were still unnamed — the defect lives in shared `components/ui/data-table-toolbar.tsx`, which every admin list page uses. Its search `Input` had a placeholder but no name, and its filter `SelectTrigger` relied on a `SelectValue` placeholder that never renders because the filter value always matches an option. Both now carry an `aria-label`; the filter reads "Filter {label}" rather than the bare label, because pages routinely have a form field of the same name (bare "Status" made an existing test's `getByLabelText("Status")` ambiguous). This closes the same defect on every admin list, not just this page.

- Task 8: Kesiswaan + Akademik leftovers — `app/admin/enrollments/{page,[id]/page}.tsx`, `app/admin/semesters/[id]/objectives/client.tsx`, `app/admin/students/[id]/page.tsx` + 2 new test files — the enrollments detail page stopped hand-rolling what the app already has primitives for (`DetailPageSkeleton` for loading, `EmptyState` with a route back for not-found, `DetailPageHeader` with the `crud.md` back-label shape), keeping its status badge and state-transition buttons untouched; the two icon-only controls in `objectives` gained instance-specific `aria-label`s ("Ubah IKTP #3") since several rows render at once; the guardian-row icon buttons went `p-1` → `p-1.5` to reach exactly 24×24; "Tidak Hadir" → "Alpa"; "Semua status" → "Semua Status"; three `Batal` buttons moved from `outline` to the canonical `ghost`.

## Verification

### Preview-verify (PR #457)

- Iteration 1 (`https://annisaa-erp-v3-git-feat-admin-dfe93a-ismails-projects-196d40d3.vercel.app`), signed in as the admin account per `.claude/verify-accounts.json`. Flows: `/admin/students` (list + create dialog), `/admin/penilaian`, `/admin/student-attendance`, `/admin/student-journal`. **blockers=0, minors=2.**
  - Confirmed on the real preview: sidebar group labels legible with chevrons pointing down while expanded; `/admin/penilaian` H1 "Pemantauan", "Entri pada 6 Agustus 2026", table inside `[data-slot="table-container"]`, "Susun Raport" border `rgb(229,226,222)`; `/admin/student-attendance` subtitle "0 catatan", stat tile "ALPA", filters labelled Dari / Sampai / Kelas; the students create dialog resolved an accessible name for 15 of 16 controls. No console errors on any flow.
  - Minor 1 → **fixed in this iteration, not deferred**: the DataTable footer's page-size `Select` (`components/ui/data-table-pagination.tsx:38`) was the one unnamed control — it renders only the number, so nothing named it. Given the cycle's own AC1/AC10, and that this control sits on every admin list, it got `aria-label="Baris per halaman"` rather than a PR comment.
  - Minor 2 → not actionable: three `503`s on `/.well-known/vercel/jwe`, an `OPTIONS /`, and a `HEAD /admin/student-journal`. These are Vercel infra/deployment-protection probes; the real document navigations returned `responseStatus: 200` (checked via the Navigation Timing entry). No app route 5xx'd.
- **Flow not exercised:** the raport editor's unsaved-changes guard. Staging currently has 0 students, so reaching the editor needs a full year → class → student → enrollment → term → assessment seed chain. Rather than write six entities into the shared staging database for one interaction, this relies on its 9 unit tests (including save-then-clean and type-then-revert). Recorded rather than silently skipped.

### /audit-docs report — 2026-08-06 (`/ship` preflight #6)

| Check | Status | Detail |
|---|---|---|
| Route count (CLAUDE) | ok | claimed=185 actual=185 |
| Portal page counts (CLAUDE) | ok | claimed=41/13/8 actual=41/13/8 |
| Component count | ok | claimed=65 actual=65 |
| E2E spec count | ok | claimed=33 actual=33 |
| Standards-table files | ok | every referenced file present under `.claude/standards/` |
| Interface-craft skills | ok | every `better-*` has a SKILL.md and is listed in `link-agent-skills.sh` |
| ADR archive cutoff (60d) | warn | 2 rows older than the 2026-06-07 cutoff: 2026-05-20, 2026-06-05 — candidates for `docs/adrs/archive.md` |
| File Structure paths | ok | all 13 paths present |
| Workflow refs | ok | `/audit-docs` referenced 5× in CLAUDE.md, skill present |

**Summary:** 8 ok, 1 warn, 0 fail → `/ship` preflight passes (only `fail` blocks).

**Actions:** trim the two pre-cutoff ADR rows from README's active table into `docs/adrs/archive.md` in a future cycle — out of scope here, and this cycle added no ADR.

(Recorded here rather than stdout: the skill routes to stdout once Ship Notes is filled, but the cycle doc is the single artifact for this cycle and `/ship` preflight #6 refers to this result.)

### End-of-cycle

- Final gates: `npm run build` clean; `npx vitest run` = **290 passed | 2 skipped (292 files), 2674 passed | 42 todo (2716 tests), 0 failures**.
- Playwright: **local run deferred to CI** (env cannot execute it). The repo's own guard refused, verbatim: `Refusing to run e2e against non-local DATABASE_URL host "aws-1-ap-southeast-1.pooler.supabase.com". These specs create + mutate data via the API and would pollute that database (DEMO_MODE does not switch the DB — see lib/db.ts).` No local Postgres is available in this harness and overriding with `E2E_ALLOW_REMOTE_DB=1` would write test rows into the shared staging database. The required CI check `Playwright E2E` gates the merge; CTO will not merge on red. One e2e assertion was updated in this cycle (`e2e/admin.spec.ts:93`, the `/admin/penilaian` heading), so that check is the one that proves it.
- `docs/uat/jobs/admin.md` updated: JTBD-ADMIN-RAPORT-01 gained the unsaved-changes guard (including its known sidebar gap), and the "Last audited" line was bumped to this cycle.
- Cross-checked `.claude/standards/design-system.html` across the cycle for the sidebar group-label treatment, outline-button border, status-token families and dialog button labels — every fix stays inside the documented system; no new tokens, components, spacing or type steps were introduced.

- Task 8: covered by the same gate run as Task 7 (**290 passed | 2 skipped, 2674 passed, 0 failures**) and the same `superpowers:code-reviewer` pass, which verified the hit-area arithmetic (6 + 12 + 6 = 24px) and that the enrollments header conversion preserved every handler and variant.
- Task 7: gates passed — `npm run build` clean, `npx vitest run` = **290 passed | 2 skipped (292 files), 2674 passed | 42 todo (2716 tests), 0 failures** (covers T7 and T8). Reviewed by `superpowers:code-reviewer`: clean — it confirmed the `ABSENT` enum value is untouched by the "Alpa" relabel, that no e2e or unit test asserted the old strings, that the `DetailPageHeader` conversion preserved the transition-button logic byte-for-byte, and it re-ran all five new tests against pre-fix sources to prove they genuinely fail there.
- Task 7 browser verification on `/admin/student-attendance`: every visible control now resolves an accessible name (Dari, Sampai, Kelas, "Cari nama siswa...", "Filter Status") — the unnamed-control list is empty, where before the class filter, search box and status filter had no name at all. Subtitle renders "0 catatan"; the empty state renders title + description.
- Note for future test authors: a client page using `use(params)` cannot be rendered in this repo's jsdom/vitest/RTL combo by passing `Promise.resolve(...)` — the Suspense retry tick never flushes and the tree stays on the fallback. Both new detail-page tests pre-attach React's `status: "fulfilled"` / `value` markers, which is the documented pre-resolved-thenable contract (verified against the installed `react-dom@19.2.7` `trackUsedThenable`), not an internal hack.
- Task 6: covered by the same gate run as Task 5 (**286 passed | 2 skipped, 2669 passed, 0 failures**) and the same `superpowers:code-reviewer` pass, which confirmed no repo-wide stragglers referenced the old "Ke Raport Siswa" label.
- Task 5: gates passed — `npm run build` clean, `npx vitest run` = **286 passed | 2 skipped (288 files), 2669 passed | 42 todo (2711 tests), 0 failures** (covers T5 and T6 together). Reviewed by `superpowers:code-reviewer`: clean — it grepped the repo for stragglers on both renamed strings, confirmed the three badge states stay visually distinct, and empirically stashed the two page files to prove all five new tests fail against the pre-fix code.
- Task 5 browser verification: H1 renders "Pemantauan", sentra line renders "Entri pada 5 Agustus 2026" (no raw ISO on the page), the table sits inside `[data-slot="table-container"]`, and the completion badge computes `font-variant-numeric: tabular-nums`. At 375px the table container reports `scrollWidth === clientWidth` (327/327) — no new horizontal scroll.
- Task 4: gates passed — `npm run build` clean, `npx vitest run` = **284 passed | 2 skipped (286 files), 2664 passed | 42 todo (2706 tests), 0 failures**. Reviewed by `superpowers:code-reviewer`, which independently re-derived the editable-field set to rule out a false-clean snapshot and confirmed the save-path re-baseline and `beforeunload` teardown are correct. Its two actionable notes were applied: confirm label shortened to "Ya, Keluar", and the tests extended from one field to five cases (narrative, capaian level, attendance count, save-then-clean anti-nag, type-then-revert stays clean). Its third note — the sidebar-link bypass — is the accepted limitation recorded above.
- Task 3: gates passed — `npm run build` clean, `npx vitest run` = **283 passed | 2 skipped (285 files), 2655 passed | 42 todo (2697 tests), 0 failures**. Reviewed by `superpowers:code-reviewer`: clean — it traced every converted catch block back to every reachable throw site to rule out swallowed messages, and confirmed all Indonesian fallbacks are byte-identical.
- Task 3 live reproduction of the original defect: with `fetch` patched to return `new Response("", {status: 500})` for `/api/admin/raport/templates`, the UI renders **"Gagal memuat kisi-kisi. / Coba lagi"** and the page contains no English exception text; the raw `SyntaxError: Failed to execute 'json' on 'Response'` appears in the browser console only. Before the fix that exact string was the entire error state.
- Task 2: gates passed — `npm run build` clean, `npx vitest run` = **282 passed | 2 skipped (284 files), 2651 passed | 42 todo (2693 tests), 0 failures**. Reviewed by `superpowers:code-reviewer`: clean; it independently reverted `students/page.tsx` to HEAD and confirmed the new test fails with `Unable to find a label with the text of: /^Nama Lengkap\*?$/`, so the test genuinely guards the fix.
- Task 2 independent check by the driver: unbound `FieldLabel` count across the three trees went **121 → 2** (both justified above); the two apparent duplicate ids in `guardian-edit-dialog.tsx` were read in full and confirmed to sit in mutually exclusive `showRelationship` branches.
- Task 1: gates passed — `npm run build` clean, `npx vitest run` = **280 passed | 2 skipped (282 files), 2648 passed | 42 todo (2690 tests), 0 failures**. Reviewed by `superpowers:code-reviewer`: clean, no issues.
- Task 1 browser verification (dev server, `DEMO_MODE=true`, demo super-admin session): sidebar group label computes `oklab(… / 0.9)` = **5.01:1** against `--sidebar`; all seven open groups now compute `rotate: 90deg` on their chevron (was `none`); `Ke Raport Siswa` computes `borderColor: rgb(229,226,222)`, matching a native `<Button variant="outline">` (was `rgba(0,0,0,0)`). Screenshot confirms chevrons point down while expanded.
- Instrument note for future audits: Tailwind v4 compiles `rotate-90` to the CSS **`rotate`** property, not `transform`. Reading `getComputedStyle(el).transform` reports `none` even when the rule applies — finding #6 was still real (dead `group/collapsible` selector, plus `data-state` never emitted), but `transform` is the wrong property to measure it with.
- Cross-checked `.claude/standards/design-system.html` §Sidebar + §Buttons for the group-label and outline-button treatments; opacity step and border token both stay within the documented system — no new visual language introduced.

## Ship Notes

- **Migrations:** none. No schema change, no data migration.
- **Env vars:** none.
- **API contract:** unchanged. Every fix is client-side presentation, copy, or accessibility wiring. `lib/finance/run-bulk-{generate,retry}.ts` changed the *class* of the error they throw (`Error` → `ApiError`) but not the message or the control flow.
- **Rollback:** revert the commits. Nothing to unwind.

### Visible changes worth watching after deploy

- **`/admin/penilaian` H1 is now "Pemantauan"** (was "Penilaian"), matching its nav item and breadcrumb. Anyone who knows the page by its old title will see a different heading; the URL is unchanged. `e2e/admin.spec.ts` was updated to match.
- **"Alpa" replaces "Tidak Hadir"** on the attendance stat tile, the status filter, the override dialog and the student detail tile — per `voice.md`'s glossary. The stored value `ABSENT` is untouched, so no data or API meaning changed. Note the **employee**-attendance override modal (`components/attendance/override-modal.tsx`) still says "Tidak Hadir"; it is a different domain and was out of this cycle's scope.
- **"Catatan" replaces "Record"** across `/admin/student-attendance`, including the page subtitle, which now reads "N catatan".
- **The journal note-delete dialog now says "Nonaktifkan"**, not "Hapus". The behaviour was always a soft delete — only the copy was wrong. Anyone trained on the old wording should be told the action is unchanged.
- **Sidebar group labels are more legible** (contrast 3.64:1 → 5.01:1) and **group chevrons now rotate** to show open/closed state. Cosmetic but immediately visible on every admin page.
- **Outline buttons rendered via `buttonVariants()` now show their border** — affects "Susun Raport" on `/admin/penilaian` and `/admin/raport/templates`.
- **Every admin list's search box and status filter gained an accessible name** via the shared `DataTableToolbar`. No visual change; screen-reader output changes on every list page in the portal.

### Known limitation shipping with this cycle

The raport editor's unsaved-changes guard covers the in-editor back control and browser close/reload, but **not** sidebar or breadcrumb navigation — those are client-side route changes, and Next.js App Router offers no supported way to block one. An admin who edits a narrative and then clicks "Siswa" in the sidebar still loses the edit silently. The user reviewed this and chose to ship rather than widen the cycle into an app-shell change. Two candidate follow-ups: an app-shell dirty-state context that intercepts `<Link>` clicks, or autosave-on-blur for the editor (the better end-state, needs its own spec).

### Smoke steps on the preview URL

1. `/admin` — sidebar group labels readable; chevrons point down while groups are expanded.
2. `/admin/penilaian` — H1 reads "Pemantauan"; "Susun Raport" has a visible border; the sentra line shows a formatted Indonesian date, not `YYYY-MM-DD`.
3. `/admin/student-attendance` — filters read Dari / Sampai / Kelas / Filter Status; subtitle says "N catatan"; empty state has a description.
4. `/admin/raport` → open a student, edit a narrative, click "Kembali ke daftar" — the confirmation appears; Batal keeps the edit, "Ya, Keluar" discards it. Save, then click back — no confirmation.
5. `/admin/students` → "Tambah Siswa" — tab through the form and confirm each field announces its label.
