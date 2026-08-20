# UI Consistency & Contrast Audit — Core Modules

## Context

A screenshot from the running app showed the sidebar wordmark ("Talib" / "by An Nisaa' Sekolahku") rendering as near-invisible dark text on the dark green sidebar. That single defect turned out to be the visible tip of a systemic token problem.

**Method.** Seven parallel module auditors (Sonnet tier) read every in-scope surface against `.claude/standards/{ui,patterns,portal,colors,crud,voice}.md` and `design-system.html`. Findings were then verified live against a dev server (`DEMO_MODE=true`, port 3100) with a canvas-based WCAG contrast probe and a layout-overflow probe injected into the real DOM — so contrast ratios and overflow numbers below are measured, not estimated.

**Scope.** Admin shell + dashboard + settings, students, guardians, classes, admissions, enrollments, curriculum (semesters/themes/objectives), assessments, penilaian, raport, student-attendance, student-journal (all three portals), teacher portal, parent portal, public pages. **Excluded per request:** payment (`invoices`, `payments`, `fees`) and payroll (`(hr)/payroll`, `salary-components`, `teacher/slips`).

**Total: ~110 findings.** Two systemic root causes account for the majority:

1. **The brand teal has no accessible text/ink pairing.** `--status-*` families each ship a `-subtle` (light bg) + `-text` (dark fg) companion. `--primary`, `--warning`, `--success`, `--info` ship neither. Measured live: white on `--primary` `#5DB4B8` = **2.42:1** (the "Tambah Siswa" CTA, every default `<Button>`); `text-primary` on white = **2.13:1**; `text-warning` on white = **2.24:1**; `text-destructive` on white = **3.39:1**. WCAG AA needs 4.5:1. This is 119 `text-primary` + 82 `bg-primary` + 12 `text-warning` + 7 `text-success` + 25 bare-saturated `text-status-*` call sites.
2. **`SidebarInset` cannot shrink.** `components/ui/sidebar.tsx:310` sets `w-full flex-1` with no `min-w-0`, so any table wider than the content area expands the whole shell. Measured on `/admin/students` at a 1280px viewport: `document.scrollWidth` **1453** vs `clientWidth` **1280** — the app scrolls horizontally and the page's own action buttons ("Unduh Data", "Tambah Siswa") sit outside the viewport. Injecting `min-width: 0` on the inset live returned it to 1280 with the table scrolling correctly inside its own `overflow-x-auto`. Affects all 44 admin pages.

**Prior art.** Three UI cycles (`2026-06-23-ui-shadcn-audit`, `2026-06-23-ui-shadcn-polish`, `2026-06-24-ui-consistency-sweep`) landed on `staging` in late June and left an explicit deferred tail (typography-token retrofit, `SectionHeading` sweep, `loading.tsx` files, remaining `fetchJson` error branching). The stale local branches `feat/ui-sweep`, `feat/ui-shadcn-polish`, `codex/ui-shadcn-audit-build` are leftovers of already-squash-merged work — safe to delete, not to re-apply. Notably, that sweep fixed `tone="onDark"` on the **login** wordmark (T4) and missed the sidebar one.

Cross-checked `design-system.html` §Brand/Colors and §Components while deriving the token values below.

## Spec

Sequencing decision (confirmed with user): **four cycles, P0 first.** This cycle doc covers **Cycle A** only. Cycles B–D are specified at the end as a committed backlog, each to get its own cycle doc.

Token decision (confirmed with user): **dark ink on brand fills.** Keep `--primary` `#5DB4B8` exactly as-is — the brand hue does not change. Flip the *ink* on saturated fills to the dark sidebar green, and add darker `-text` companions for teal/warning/success used as text on light surfaces.

Derived values (computed, all against the real token hexes):

| New token | Value | Contrast | Use |
|---|---|---|---|
| `--primary-foreground` (changed from `#FFFFFF`) | `#1A2E2F` | **5.93:1** on `#5DB4B8` | ink on solid teal fills |
| `--primary-text` (new) | `#2A7073` | **5.73:1** on white, **5.27:1** on `primary/10` tint | teal as text/icon on light surfaces |
| `--warning-foreground` (new) | `#1A2E2F` | **6.10:1** on `#FF8C00` | ink on solid warning fills |
| `--warning-text` (new) | reuse `--status-late-text` `#B35C00` | 4.6:1 on white | warning as text |
| `--success-text` (new) | reuse `--status-present-text` `#00875A` | 4.56:1 on white | success as text |

### Acceptance criteria — Cycle A

- [ ] **Sidebar brand legible.** `components/admin/sidebar.tsx:163` passes `tone="onDark"`. Measured contrast for "Talib" ≥ 4.5:1 and for the sublabel ≥ 4.5:1 against `--sidebar` (`#1A2E2F`). Currently 1.23:1 and 1.87:1.
- [ ] **Sidebar group labels legible.** `components/ui/sidebar.tsx:403` no longer degrades `--sidebar-foreground` with `/70` (measured 3.63:1 → must be ≥ 4.5:1; full-opacity `#8AACAD` is 5.80:1). Affects "Kesiswaan / Akademik / Penilaian / Kelas Harian / Keuangan / SDM / Pengaturan" on every admin page.
- [ ] **No horizontal overflow of the admin shell.** `SidebarInset` gets `min-w-0`. On `/admin/students`, `/admin/classes`, `/admin/student-attendance`, `/admin/penilaian` at 1280px: `document.documentElement.scrollWidth === clientWidth`, and every `PageHeader` action button is fully inside the viewport. Wide tables scroll inside their own container.
- [ ] **Brand-ink tokens exist and are consumed.** `app/globals.css` defines `--primary-text`, `--warning-text`, `--success-text`, `--warning-foreground` with `--color-*` mappings; `--primary-foreground` is `#1A2E2F`. Zero `text-primary`, `text-warning`, `text-success` remaining as *text on a light surface* in scope — each replaced by its `-text` companion. Zero bare-saturated `text-status-{present,late,absent,leave,holiday,no-checkout}` used as a text color (25 sites) — each replaced by its `-text` variant.
- [ ] **No white-on-saturated-fill text in scope.** Verified live: default `<Button>`, `<Badge>` with `bg-primary`/`bg-warning`/`bg-status-*`, the teacher clock-in/out CTA, and the EMERGING level chip all measure ≥ 4.5:1.
- [ ] **`text-h3` is not a dead class.** Either `--type-h3`/`--text-h3` is added to `app/globals.css` alongside the existing display/h1/h2/body/small/caption scale, or the 3 usages (`app/parent/attendance/error.tsx:18`, `app/parent/invoices/error.tsx:18`, `app/teacher/student-journal/error.tsx:18`) move to `text-h2`. Grep for a token-shaped class with no matching CSS variable returns zero.
- [ ] **Raport level colour restored on the parent web view.** `app/parent/report-cards-list.tsx:145-152` consumes `sec.levelKey` (already emitted by `lib/raport/build.ts:54`) through `LEVEL_CHIP_CLASS_OFF` instead of the flat `bg-primary/10 text-primary` badge, so CONSISTENT / EMERGING / NEEDS_REINFORCEMENT are visually distinct on screen as they already are in the PDF (`lib/pdf/report-card.tsx:96`).
- [ ] **Admin journal correction is reachable.** `components/portal/week-grid.tsx:161-191` no longer hardcodes `isToday` as the editability gate; it takes an explicit prop (e.g. `editableDates` or `allowBackfill`) so the parent "only today" rule is preserved while `app/admin/student-journal/students/[id]/page.tsx`'s documented correction flow can actually run on past days.
- [ ] **Gates green.** `npm run build && npx vitest run` pass; `npx playwright test` green locally or deferred to the required CI `Playwright E2E` check; new Vitest/e2e coverage for the contrast-token pairings and the shell-overflow guard.

### Non-goals — Cycle A

- No re-skin of the public `/pendaftaran` enrollment flow (46 off-palette + 5 hardcoded-hex violations, the single largest concentration in the repo). That is Cycle D — it is a self-contained second design system and deserves its own diff.
- No touch-target resizing, no cross-portal `PageHeader` unification, no admin list-page parity work. Cycles B and C.
- No change to `--primary`, `--warning`, `--success`, `--status-*` hues. Ink and text companions only.
- No typography-token retrofit (`text-sm` → `text-body`); still deferred per `ui.md`.
- Payment and payroll surfaces untouched, per request — note that `app/parent/invoices/error.tsx` is touched **only** for the dead `text-h3` class, since it shares the root cause.

### Assumptions

1. **Dark ink on solid teal is acceptable visually, not just numerically.** 5.93:1 passes, but dark-on-teal buttons read differently from white-on-teal. Preview-verify screenshots should be reviewed before merge; if it reads wrong, the fallback is the darkened-teal option (`--primary-strong: #2F7D80`, 4.81:1 with white).
2. **Every cited line was verified against this worktree's HEAD** (`feat/ui-consistency-audit`, branched from `origin/staging`). Two auditor claims were corrected during synthesis: the repo-wide sweep reported zero invalid token classes but never tested `text-h3` (it is invalid, 3 usages); and `sec.levelKey` is genuinely available to the parent raport view via `lib/raport/build.ts:54`, so that fix is a one-liner rather than a data-plumbing change.
3. **`--status-late-text` / `--status-present-text` are the right values to alias for warning/success text** rather than introducing new hexes — they already pass and already appear in the same visual contexts.
4. **The 4-level `BB/MB/BSH/BSB` assessment scale is retired**, not merely unlinked. `app/teacher/assessments/[classSectionId]/[templateId]/[period]` is unreachable from nav but still live by direct URL, with its own colour/label maps. Cycle D deletes it. If it is still needed, raise before Cycle D.
5. **Changing `SidebarInset` affects every admin page**, so the overflow fix needs a broad preview-verify pass, not a spot check.

## Tasks

Ordered. T1 is the dependency root. Independent tasks fan out to subagents; T1/T2 stay on the main thread because everything else keys off them.

- [ ] **T1 — Brand ink + text token layer** · `depends on: none`
  - `app/globals.css`: add `--primary-text: #2A7073`, `--warning-text: #B35C00`, `--success-text: #00875A`, `--warning-foreground: #1A2E2F`; change `--primary-foreground: #FFFFFF` → `#1A2E2F`; register all four in the `@theme` `--color-*` block.
  - Acceptance: `npm run build` passes; the new classes resolve (`text-primary-text` etc. generate utilities); a Vitest unit test asserts each documented pair meets its ratio.
- [ ] **T2 — Shell overflow fix** · `depends on: none`
  - `components/ui/sidebar.tsx:310`: add `min-w-0` to `SidebarInset`.
  - Acceptance: live probe on the four widest admin list pages returns `scrollWidth === clientWidth` at 1280px and at 1024px; wide tables scroll internally.
- [ ] **T3 — Sidebar legibility** · `depends on: none`
  - `components/admin/sidebar.tsx:163` → `tone="onDark"`. `components/ui/sidebar.tsx:403` → drop the `/70` on `SidebarGroupLabel`.
  - Also `components/layout/legal-footer.tsx:5,9` (`text-sidebar-foreground/70` on the dark login card, ≈3.6:1).
  - Acceptance: measured ≥ 4.5:1 for the wordmark, sublabel, all seven group labels, and both footer links.
- [ ] **T4 — Consume the new text tokens (mechanical, fan out by module)** · `depends on: T1`
  - Replace `text-primary` → `text-primary-text`, `text-warning` → `text-warning-text`, `text-success` → `text-success-text` wherever the element sits on a light surface. Leave `text-primary` where it sits on a *dark* surface (e.g. inside the sidebar) — those are correct today.
  - Replace the 25 bare-saturated status text colours with their `-text` variants: `app/admin/student-journal/students/[id]/page.tsx:478`, `app/admin/students/[id]/page.tsx:1038,1042,1046,1050`, `app/admin/penilaian/page.tsx:44`, `app/admin/raport/page.tsx:61`, `app/admin/raport/raport-editor.tsx:347`, `app/admin/(hr)/employee-attendance/monthly/page.tsx:166,167,169`, `app/admin/(hr)/employees/[id]/page.tsx:440-443`, `app/teacher/assessments/[classSectionId]/[templateId]/[period]/client.tsx:59,375,453`, `components/attendance/calendar.tsx:149,150,152`, `components/parent/element-progress-row.tsx:92`, `components/teacher/leave-sheet.tsx:248` (plus the two invoice-detail sites, deferred with payment scope).
  - Fix the four repeated `bg-primary/10 text-primary` badges: `app/admin/admissions/page.tsx:786`, `app/admin/students/[id]/page.tsx:972`, `app/admin/guardians/[id]/page.tsx:446`, `app/admin/enrollments/status-chip.tsx:23`.
  - `components/admin/dashboard/pending-actions.tsx:43`: `bg-warning text-primary-foreground` → subtle-bg + `text-warning-text`.
  - `lib/curriculum/level-presentation.ts:43-47`: `EMERGING: "bg-status-late text-white"` → `-subtle` bg + `text-status-late-text`, matching `LEVEL_CHIP_CLASS_OFF`.
  - Acceptance: grep for each failing pattern returns zero in scope; live contrast probe on `/admin`, `/admin/students`, `/teacher`, `/parent` reports zero sub-4.5:1 text findings.
- [ ] **T5 — Teacher clock-in/out CTA** · `depends on: T1`
  - `app/teacher/home-client.tsx:250-271`: the primary daily action is a hand-rolled `motion.button` with white bold text on `bg-primary` / `bg-status-late` / `bg-status-present` (2.4 / 2.4 / 2.7:1). Convert to `<Button>` so it inherits the variant system, and apply the new ink token. Same for the success checkmark at `:238-247`.
  - Acceptance: all three states measure ≥ 4.5:1; the button is a real `<Button>`.
- [ ] **T6 — Dead `text-h3` class** · `depends on: none`
  - Add `--type-h3`/`--text-h3` to the scale, or retarget the 3 usages to `text-h2`. Pick one and note which in Implementation.
- [ ] **T7 — Chart legend/plot colour mismatch** · `depends on: T1`
  - `components/admin/dashboard/attendance-trend-chart.tsx:30-39`: `chartConfig` uses `--chart-*` but the `<Area>` fill/stroke uses a second hand-picked hex map, so tooltip swatches don't match the areas they label. Drop `chartColors`, read `--chart-*` for both. Also `:186` `text-[11px]` → `text-caption`.
- [ ] **T8 — Raport level colour on the parent web view** · `depends on: T1`
  - `app/parent/report-cards-list.tsx:145-152`: use `sec.levelKey` + `LEVEL_CHIP_CLASS_OFF` instead of the flat primary badge.
  - Acceptance: the three levels render visually distinct on screen and match the PDF chip colours; `NEEDS_REINFORCEMENT` renders info-blue per the rule documented in `lib/curriculum/level-presentation.ts`.
- [ ] **T9 — `WeekGrid` editability gate** · `depends on: none`
  - `components/portal/week-grid.tsx:161-191`: replace the hardcoded `isToday` gate with an explicit prop; keep parent-side "today only", enable admin correction of filled past days per `app/admin/student-journal/students/[id]/page.tsx:209-257`.
  - Also `:193` vs `:163-166`: readonly cells are `h-[36px]` while editable cells are `44px`, so every row visibly resizes on the "Ubah"/"Selesai" toggle and between the parent's Sekolah/Rumah tabs — equalise the height.
  - Acceptance: an admin can toggle a filled past-day cell; a parent still cannot; row height does not change between modes. New e2e coverage.
- [ ] **T10 — Divergent status-colour maps** · `depends on: T1`
  - `app/admin/(hr)/employee-attendance/monthly/page.tsx:21-28` and `app/admin/(hr)/employees/[id]/page.tsx:427` define two `STATUS_COLORS` copies that disagree on `PRESENT_NO_CHECKOUT` (`bg-status-late` vs `bg-status-no-checkout`) — same status, different colour depending on the page. Both consume `getStatusConfig`/`STATUS_MAP` from `components/ui/status-badge.tsx`.
  - `app/teacher/class-attendance/page.tsx:38`: `AVATAR_BG.ABSENT: "bg-destructive"` → `bg-status-absent` (same hex today, two token names for one semantic).
  - `app/teacher/class-attendance/page.tsx:29-34` and `app/teacher/sessions/[id]/client.tsx:27-32`: byte-identical `ROW_TINT` maps — extract one shared constant.
  - `components/parent/element-progress-row.tsx:14-16` vs `:63,69,75`: the docstring says `NEEDS_REINFORCEMENT` is `bg-status-absent`, the code uses `bg-status-leave`. Code is correct per the level-presentation rule; fix the docstring.
- [ ] **T11 — Review, simplify, verify** · `depends on: T1-T10`
  - Run the end-of-cycle gate. Re-run the live contrast + overflow probes across admin/teacher/parent and attach numbers to Verification. Request `superpowers:code-reviewer`.

## Implementation

_(filled by `/build`)_

## Verification

_(filled by `/build`)_

Audit evidence captured this cycle, before any fix:

- Live contrast probe, `/admin` dashboard and `/admin/students` at 1280px: 43 sub-threshold text findings on the students page alone. Worst: sidebar wordmark 1.23:1, sublabel 1.87:1, `text-primary` avatar initials 2.13:1, "Tambah Siswa" primary CTA 2.42:1, `text-warning` stat 2.24:1, `text-destructive` stat 3.39:1, sidebar group labels 3.63:1, "Aktif" status badge 4.16:1.
- Live overflow probe, `/admin/students` at 1280px: `scrollWidth` 1453 vs `clientWidth` 1280; `SidebarInset` measured 1197px wide inside a 1024px slot. Injecting `min-width:0` restored 1280 and left the table scrolling in its own container.
- Cross-checked `design-system.html` §Brand/Colors and §Components for the ink-pairing decision.

## Ship Notes

_(filled by `/ship`)_

---

## Follow-up cycles (committed backlog)

Each gets its own cycle doc when started. Findings are file-cited in the audit above and in the per-module auditor reports summarised here.

### Cycle B — shared-primitive consolidation

Where a `components/ui/*` or `components/admin/*` primitive already exists and a module hand-rolled its own:

- Two locally-defined `StatusBadge` clones in raport (`app/admin/raport/page.tsx:58-70`, `app/admin/raport/raport-editor.tsx:344-356`) and a third in `app/admin/enrollments/status-chip.tsx:14-26` → use `components/ui/status-badge.tsx`.
- `app/admin/settings/campuses/page.tsx:224-236` hand-rolled edit/deactivate icon buttons → `DataTableRowActions` (every sibling settings page already uses it).
- `app/admin/settings/users/page.tsx:354` (`mb-6`) and `app/admin/academic-years/page.tsx:346` (`mb-8`) hand-roll the stat grid `StatsCardsRow` exists for, and disagree with each other.
- `components/admin/guardian-edit-dialog.tsx:148,237`, `components/admin/dashboard/quick-actions.tsx:34` inline `SectionHeading`'s exact className.
- Two `PageHeader` components (`components/admin/page-header.tsx:18` `font-bold` / prop `description` vs `components/portal/page-header.tsx:24` `font-semibold` / prop `subtitle`) — the portal one's doc comment falsely claims it is shared by all three portals. Same title renders at two weights depending on portal.
- `app/admin/penilaian/page.tsx:161-182` raw `<table>` inside `overflow-hidden` (clips instead of scrolls) → `components/ui/table.tsx`.
- `components/attendance/calendar.tsx:162-186` hand-rolled modal backdrop → `Dialog`/`Sheet`. `components/portal/portal-tabs.tsx:180-188` hand-rolled count pill → `Badge`. `components/admin/invoices/manual-invoice-dialog.tsx:228` `<span role="button">` → real `<button>`.
- `EmptyState` contract violations in shared components, which propagate to all three portals: `components/portal/week-grid.tsx:81-87` and `components/student-journal/note-thread.tsx:41-47` return a plain `<p>`. `app/parent/student-journal/page.tsx:207-216` hand-rolls one empty state while using `EmptyState` at `:285-289` in the same file.
- `components/ui/sidebar.tsx:484`: `hsl(var(--sidebar-border))` wraps values that are `rgba()`/hex, not H/S/L triplets — invalid CSS, dormant until someone uses `variant="outline"`.

### Cycle C — admin list/detail parity + portal mobile

Admin parity (five people-modules audited side by side, plus the academic family):

- `app/admin/guardians/page.tsx:270` is the only list page with **no create button**. `app/admin/classes/client.tsx` and `app/admin/enrollments/page.tsx` are the only two with **no stat-cards row**. `app/admin/students/page.tsx:678` and `app/admin/admissions/page.tsx:898` pass `cols={4}` with only 3 cards, leaving an empty grid slot.
- `app/admin/enrollments/page.tsx`: no `DataTableToolbar`/search (`:93-113`), no `loading` passed to `DataTable` so it shows an empty state reading "Memuat…" (`:114-118`), hand-rolled "Lihat" button instead of `DataTableRowActions` (`:84-90`), and no pagination at all despite `pageSize: "100"`.
- Three pagination shapes across five lists: real server pagination (students/guardians/admissions), fetch-100-then-paginate-client-side (`classes/client.tsx:137,376-383`), and none (enrollments).
- Missing `emptyTitle`/`emptyDescription` → generic "Tidak ada data", against `voice.md`: `app/admin/classes/client.tsx:461-466`, `app/admin/semesters/client.tsx:326-331`.
- `app/admin/classes/[id]/client.tsx:822-851` has no back-navigation; `app/admin/enrollments/[id]/page.tsx:163-169` hand-rolls a header with the wrong type token and a non-canonical back label. Students/guardians use `DetailPageHeader`.
- Three loading treatments for four detail pages: shared `DetailPageSkeleton` (students, guardians), a bespoke skeleton (`classes/[id]/client.tsx:777-789`), plain text "Memuat…" (`enrollments/[id]/page.tsx:140`).
- Page-level early-return skeletons that hide the whole page including its title: `app/admin/settings/work-hours/page.tsx:86`, `app/admin/assessments/page.tsx:178`.
- `app/admin/enrollments/[id]/page.tsx:104` uses native `window.confirm()` — the only unstyled OS dialog in scope.
- `app/admin/classes/client.tsx:505-611` has required validation but no `<FieldLabel required>`. Sentence-case labels ("Nama kelas") against Title Case everywhere else. Row action says "Edit", dialog says "Ubah Kelas", detail button says "Ubah".
- `app/admin/classes/client.tsx:280-282` renders the entity name as a non-interactive `<span>` despite a working detail route; guardians uses `<button onClick={router.push}>` (no href, no new-tab); students uses a real `<Link>`. Three patterns for one affordance.
- `app/admin/semesters/[id]/objectives/client.tsx:280-306` filters as toggle-button pills; five sibling pages use `DataTableToolbar` dropdowns; raport and penilaian use a third raw `Field`+`NativeSelect` pattern.
- Inverted save/publish button emphasis: `app/admin/assessments/[id]/page.tsx:129-136` vs `app/admin/raport/raport-editor.tsx:288-299` weight the same action pair oppositely.
- `space-y-section` wrapper applied inconsistently, doubling the header gap on classes pages only (`classes/client.tsx:386`, `classes/[id]/client.tsx:779,820`); read-only detail grids use fixed `grid-cols-2` that never collapse on phones while their edit forms use `grid-cols-1 sm:grid-cols-2`.

Portal mobile (teacher + parent are mid-range Android, ≤390px primary):

- Touch targets under 44×44: `components/portal/portal-header.tsx:91-98` logout 32px (every portal page); `app/teacher/sessions/[id]/client.tsx:191-198` the status-cycle badge is the only control on the row at ~20px tall; `:202-225` `size="sm"` tap-in buttons at 28px; level-select buttons at 28-32px on the two core daily flows (`app/teacher/assessments/weekly/client.tsx:289-306`, `center/[center]/client.tsx:425-440`); `components/student-journal/note-thread.tsx:76-98` adjacent 28px edit/delete with 4px gap; `app/parent/student-journal/page.tsx:252-272` 32px week chevrons (vs 44px for the same control at `app/parent/attendance/page.tsx:189-203`); `components/portal/week-grid.tsx:205-211` 16px admin-edit pencil.
- `app/teacher/attendance/page.tsx:237-250`: the only entry point to leave/cuti is a `<Card onClick>` with no `role`, `tabIndex`, key handler, or focus ring — keyboard-unreachable.
- `components/parent/bottom-nav.tsx:18-28` now has 6 tabs in a fixed `h-16` bar with no `truncate`; `portal.md:34` still documents 4. "Penghubung" likely wraps at 375px.
- Missing `truncate`/`min-w-0` on roster rows with long Indonesian names: `app/teacher/class-attendance/page.tsx:236-247`, `app/teacher/assessments/weekly/client.tsx:271-280` (the sibling at `app/teacher/sessions/[id]/client.tsx:183-189` does it correctly).
- Four back-navigation patterns across teacher sub-pages, and `app/teacher/sessions/[id]/client.tsx` has none; two parent back-affordances at 20px vs 44px.
- Two error-boundary designs inside one portal (`app/teacher/error.tsx:13-27` vs `app/teacher/student-journal/error.tsx:12-26`); route-level `error.tsx`/`loading.tsx` exist only for teacher student-journal, not admin or parent.
- Three "sticky action bar above bottom nav" recipes (`sessions/[id]/client.tsx:278`, `center/[center]/client.tsx:485`, `[period]/client.tsx:449`).
- `app/teacher/sessions/[id]/client.tsx:278-287` requires an explicit Simpan while its two sibling grids save per tap, against `portal.md`'s Daily Data Entry contract — data-loss risk on navigate-away.
- Cross-portal journal divergence: `app/teacher/student-journal/students/[id]/page.tsx:109-119` shows neither a page title nor the student's name; "Sekolah/Rumah" vs "Di Sekolah/Di Rumah" vs no label at all; two `CompletionBar` implementations one click apart (`classes/[id]/page.tsx:70-86` vs `monitoring/page.tsx:69-76`); category headers styled `text-h2` in `week-grid.tsx:130-137` vs `text-xs uppercase muted` in `class-day-grid.tsx:165-167`.
- `components/student-journal/class-day-grid.tsx`: focus-visible on 1 of 4 interactive elements per row.
- `app/teacher/layout.tsx:18` and `app/parent/layout.tsx:15` use `py-6` where admin uses `py-page-y` — portal vertical padding is silently 25% smaller.

### Cycle D — public surfaces, copy, dead code

- **Re-skin `/pendaftaran`.** `app/pendaftaran/[token]/{page,client}.tsx` + `components/enrollment/signature-pad.tsx` carry 43 `emerald-*` usages and 5 hardcoded hexes (`#f4f6f3`, `#0C5C3F` ×3, `#fbfdfb`) — an entire second, undocumented design system on the surface a parent sees first. Also a hand-rolled `"T"` logo block instead of `TalibWordmark` (`page.tsx:30-39`) and the deprecated inline-asterisk required-field pattern (`client.tsx:417-438`) that `ui.md:97` retired and the sibling `app/daftar/client.tsx` already fixed.
- `app/page.tsx:182,222-223`: 3 remaining off-palette `gray-`/`red-` usages.
- **Retire the legacy 4-level assessment UI.** `app/teacher/assessments/[classSectionId]/[templateId]/[period]/**` and `app/admin/assessments/**` + `app/admin/assessment-templates/**` present a `BB/MB/BSH/BSB` vocabulary with its own colour maps alongside the canonical 3-level skala. The teacher route is unlinked but URL-reachable; the admin routes render as live, undeprecated CRUD. Confirm retirement, then delete — see Assumption 4.
- `app/legal/{privacy,terms}/page.tsx:9-10`: no brand chrome, no back link, orphaned from the footer that links to them.
- Voice: three spellings of "InsyaAllah" (`app/daftar/client.tsx:213`, `app/parent/attendance/page.tsx:180,219`, `app/parent/page.tsx:402`) against `voice.md:60`; `"Isi indikator (Indonesian)"` at `app/admin/semesters/[id]/objectives/client.tsx:801` vs the same field at `:884`; "Belum dibuat" vs "Belum disimpan" for one raport state (`app/admin/raport/page.tsx:69` vs `raport-editor.tsx:355`); `"Catat Pertanyaan"` against the `Tambah <Entity>` convention (`app/admin/admissions/page.tsx:892`); two phrasings of the identical cycle-tap hint (`class-attendance/page.tsx:254` vs `sessions/[id]/client.tsx:289`).
- `app/parent/perkembangan/[studentId]/page.tsx:137` prints a raw `YYYY-MM-DD` instead of `formatDate()`.
- `app/admin/guardians/page.tsx:305`: stale comment claims `side="bottom"`, code is `side="right"`, and the sibling students Sheet genuinely uses `side="bottom"`.
- `app/teacher/home-client.tsx:183-185`: greeting flashes the placeholder "Datang" before hydration.
- Delete the stale merged branches `feat/ui-sweep`, `feat/ui-shadcn-polish`, `codex/ui-shadcn-audit-build`.
- Close out the June 2026 deferred tail recorded in `docs/cycles/2026-06-24-ui-consistency-sweep.md:214-223`.
