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
- [ ] **T2 — Form-control accessibility sweep (#1).** Bind every `FieldLabel`/control pair in `app/admin/**` + `components/admin/**` + `components/student-journal/**` with `htmlFor`/`id`, and add `required aria-required="true"` wherever the label is marked `required`. Mechanical and file-partitionable — dispatch one subagent per file. *Accepts when: the unbound-pair count across those trees is 0, and a vitest asserts `getByLabelText` resolves for the student create dialog and the guardian edit dialog.* **Independent of T1.**
- [ ] **T3 — Error-message hygiene (#3).** Add `userMessage(err, fallback)` to `lib/` (reuse `lib/api` if a home already exists there); it returns the API-authored message when the error came from an API envelope and the Indonesian fallback otherwise, and logs the raw error. Convert all 13 `instanceof Error ? .message` sites. *Accepts when: a vitest proves a thrown `TypeError` yields the fallback and an API-authored message passes through, and no `instanceof Error ?` message leak remains in `app/admin` or `components/admin`.* **Independent.**
- [ ] **T4 — Raport editor unsaved-changes guard (#4).** Track the editor's dirty state against the loaded snapshot; gate the back action behind a confirm and register a `beforeunload` listener while dirty. *Accepts when: a vitest shows the back handler does not fire while dirty until the confirm is accepted.* **Independent.**
- [ ] **T5 — Penilaian page (#8, #13, #14, #15, and the raw-table half of #12).** H1 → "Pemantauan"; `primary` → `status-late` for the started-not-done badge; `formatDate()` on `sentraDate`; tabular figures on the two ratio spans; route the raw `<table>` through the shared `Table` primitive. *Accepts when: the page renders with the corrected title, the badge uses status tokens, no raw ISO date appears, and the table uses `components/ui/table`.* **Depends on T1** (shares `buttonVariants` line).
- [ ] **T6 — Kisi-kisi page (#15, verb-first label).** Tabular figures on the `terisi` counter; "Ke Raport Siswa" → verb-first, matching the sibling page's "Susun Raport". *Accepts when: the counter uses tabular figures and the header action is verb-first.* **Depends on T1.**
- [ ] **T7 — Kelas Harian copy + labels (#5, #9, #10, #14 attendance half, empty-state descriptions).** "Hapus catatan?"/"Ya, Hapus" → "Nonaktifkan…"; "Record" ×5 → "Catatan" incl. the "0 record" subtitle; "Tidak Hadir" → "Alpa" in `students/[id]`; give the class Select a real label and convert `Dari`/`Sampai`/`Bulan` spans to `<label htmlFor>`; `formatDate()` in both attendance dialogs; add descriptions to the three title-only empty states. *Accepts when: no glossary-Avoid term remains in scope, every attendance filter has a programmatic name, and no raw ISO date appears in the dialogs.* **Depends on T2** (label work must not collide).
- [ ] **T8 — Kesiswaan + Akademik leftovers (#11, #12 page half, minor consistency).** `enrollments/[id]` → `DetailPageHeader` + `DetailPageSkeleton` + `EmptyState`; `aria-label` on the two icon-only buttons in `objectives/client.tsx`; raise the guardian-row icon hit area from `p-1` to ≥24px; "Semua status" → "Semua Status"; `Batal` → `ghost` in the three objectives dialogs. *Accepts when: those files use the shared primitives, every icon-only control is named, and hit areas measure ≥24px.* **Depends on T2.**

Order: T1 → (T2, T3, T4 in parallel) → (T5, T6 after T1; T7, T8 after T2). One commit per task.

## Implementation

- Subagent plan: driver=claude-opus-5, dirty-work=claude-sonnet (per CLAUDE.md § Harness Roster). Tasks run **sequentially** rather than in the parallel waves T1-T8 imply — T2 (label sweep), T3 (error helper) and T5-T8 overlap on the same files (`student-attendance/page.tsx`, `raport/templates/page.tsx`, `bulk-promote-dialog.tsx`), so concurrent subagents would collide. Fan-out happens *within* each task instead: one subagent per disjoint file group. Driver reviews distilled output, runs gates, and commits.
- Decisions confirmed by the user before build: AC1 + AC3 sweep **repo-wide** (all 121 controls / 13 error sites, not just the 4 audited nav groups); root cause fixed with **explicit `htmlFor`/`id` per call site**, not a context rewrite of `components/ui/field.tsx`.

- Task 1: Shared shell + primitives — `components/ui/sidebar.tsx`, `components/admin/sidebar.tsx`, `app/admin/penilaian/page.tsx`, `app/admin/raport/templates/page.tsx`, `components/portal/week-grid.tsx`, `components/student-journal/note-thread.tsx` + 3 test files — group-label opacity `/70`→`/90` (5.01:1); chevron rotation rewired to `group/nav-group` + `group-data-[panel-open]/nav-group:rotate-90` after confirming Base UI emits `data-panel-open`, never `data-state`; both `buttonVariants()` call sites wrapped in `cn()` so tailwind-merge drops the base `border-transparent`; the two plain-`<p>` empty states replaced with `EmptyState` (title + description, no action — both components render in admin, teacher and parent contexts).

## Verification

- Task 1: gates passed — `npm run build` clean, `npx vitest run` = **280 passed | 2 skipped (282 files), 2648 passed | 42 todo (2690 tests), 0 failures**. Reviewed by `superpowers:code-reviewer`: clean, no issues.
- Task 1 browser verification (dev server, `DEMO_MODE=true`, demo super-admin session): sidebar group label computes `oklab(… / 0.9)` = **5.01:1** against `--sidebar`; all seven open groups now compute `rotate: 90deg` on their chevron (was `none`); `Ke Raport Siswa` computes `borderColor: rgb(229,226,222)`, matching a native `<Button variant="outline">` (was `rgba(0,0,0,0)`). Screenshot confirms chevrons point down while expanded.
- Instrument note for future audits: Tailwind v4 compiles `rotate-90` to the CSS **`rotate`** property, not `transform`. Reading `getComputedStyle(el).transform` reports `none` even when the rule applies — finding #6 was still real (dead `group/collapsible` selector, plus `data-state` never emitted), but `transform` is the wrong property to measure it with.
- Cross-checked `.claude/standards/design-system.html` §Sidebar + §Buttons for the group-label and outline-button treatments; opacity step and border token both stay within the documented system — no new visual language introduced.

## Ship Notes

<!-- filled by /ship -->
