# Admin Portal UX Polish — Cycle 1 (visual defects + shared primitives)

## Context

Admin portal spans 22 pages across students, employees, invoices, payroll, attendance, leave, settings, and reports. An audit of `app/admin/**` and `components/admin/**` surfaced consistent ugliness: hand-rolled page headers on detail routes, hardcoded `text-[10px]` across ~15 DataTable cells, generic `<Badge variant="outline">` used where `<StatusBadge>` is the standard, inline StatCard grids duplicated across 10+ pages, loading skeletons rebuilt from scratch on each detail page, and card padding / responsive breakpoints drifting (some pages use `lg:grid-cols-3`, others `lg:grid-cols-4`). No arbitrary hex colors were found, but semantic color tokens (`text-success`/`text-warning`/`text-destructive`) are used inline instead of through `<StatusBadge>`, breaking the color standard's "status fields → StatusBadge" rule.

**Empty state inconsistency.** Two empty-state primitives exist in `components/ui/`: `empty-state.tsx` (custom, imported by 10+ consumers including `DataTable`) and `empty.tsx` (Shadcn-style compound with no importers — dead code). Meanwhile admin pages still render inline plain-text empties: `app/admin/invoices/[id]/page.tsx:212` shows `<p className="text-xs text-muted-foreground">Belum ada pembayaran.</p>` and `app/admin/student-journal/classes/[id]/page.tsx:235` shows bare text "Belum ada siswa aktif di kelas ini." Both violate `.claude/standards/portal.md` Empty State Contract. The dead `empty.tsx` must be deleted (one canonical primitive, never two), and every inline empty must route through `<EmptyState>`.

**Scope broadening per user request:** this cycle enforces consistency across the whole admin portal, not only visual defects. That means: one shared primitive per UI concern (header, stats row, detail skeleton, empty state, status badge), zero inline duplicates of chrome, and standards violations grepped to zero.

Parent Portal UX Polish Cycle 1 (commit 6c879c6) established the precedent for this kind of visual cleanup and introduced shared primitives (`components/parent/invoice-card.tsx`, `components/parent/invoice-filter.tsx`). The admin portal needs the same treatment: extract duplicated chrome into shared primitives under `components/admin/`, replace scattered inline styles with the design-system standard, and enforce `.claude/standards/ui.md` + `.claude/standards/colors.md` across the whole portal.

Intended outcome: every admin page reuses a small set of shared primitives (`<PageHeader>`, a new `<DetailPageHeader>`, a new `<StatsCardsRow>`, a new `<DetailPageSkeleton>`, plus `<StatusBadge>` and `<FormDialog>`), font sizes and card padding become uniform, and the portal feels cohesive side-by-side with the parent portal. No functional changes — pure visual/consistency work.

## Spec

Acceptance criteria:

- [ ] `rg "text-\[10px\]" app/admin components/admin` returns zero matches (replaced with `text-xs`).
- [ ] `rg "text-\[#" app/admin components/admin` and `rg "bg-\[#" app/admin components/admin` and `rg "border-\[#" app/admin components/admin` return zero matches (no arbitrary hex colors).
- [ ] New `components/admin/detail-page-header.tsx` renders: back link + title + optional subtitle + optional badge-slot + actions-slot. Used by at least `students/[id]`, `employees/[id]`, `invoices/[id]`, `payroll/[id]`, `assessments/[id]`.
- [ ] New `components/admin/stats-cards-row.tsx` wraps `StatCard[]` in a canonical `grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6` layout. Replaces inline `grid grid-cols-2 lg:grid-cols-4 gap-3` usage in the top 5 list pages (students, employees, invoices, leave, payroll).
- [ ] New `components/admin/detail-page-skeleton.tsx` replaces hand-rolled skeletons in `students/[id]`, `employees/[id]`, `invoices/[id]`.
- [ ] All domain-state row labels in admin pages use `<StatusBadge>` (not `<Badge variant="outline">` with semantic color classes). Minimum fix scope: `employees/page.tsx` bank status, any payroll row status, any invoice row status. Semantic-color usage in stat cards and icons is OK (they're not row status).
- [ ] Card padding on detail pages normalized to `p-4 sm:p-6` (or Shadcn `<Card>` default — whichever the existing pattern is). No mix of `p-5` and `p-6` on sibling cards in the same page.
- [ ] `components/ui/empty.tsx` (dead Shadcn compound primitive, zero importers) deleted. Single canonical empty-state primitive = `components/ui/empty-state.tsx`.
- [ ] Every conditional empty branch in `app/admin/**` renders `<EmptyState>`. Zero inline `<p>…Belum ada…</p>` / bare text empties. Verified by grep: `rg -n "Belum ada|Tidak ada data|tidak tersedia" app/admin | rg -v "EmptyState|emptyTitle|emptyDescription|title=|description="` returns zero hits.
- [ ] `npm run build && npx vitest run` green after every task. `npx playwright test` green at end of cycle.
- [ ] README.md updated with a one-line entry in the Recent history section pointing at this cycle.
- [ ] No regression in the parent/teacher portal or shared components — changes stay inside `app/admin/**` and `components/admin/**` except for reusing already-extracted shared primitives.

Non-goals (explicit deferrals — tracked for follow-up cycles):

- Dark mode audit. No hex colors to fix, semantic tokens already dark-mode aware; full visual dark-mode screenshot pass → future cycle.
- Mobile-first redesign of admin portal. Admin is desktop-primary; this cycle keeps existing responsive breakpoints and only standardizes grid column counts.
- New features, new routes, new entity CRUD, or DB schema changes.
- Refactoring the DataTable core (`components/ui/data-table.tsx`) — this cycle only changes page-level usage.
- **`<FormDialog>` wrapper** (audit rank #1, HIGH value, 15+ admin dialogs, 80 LOC reduction each). Deferred — every existing dialog works correctly; cosmetic-only consolidation carries regression risk. → **Follow-up cycle 2A**.
- **`<ListPageLayout>` shell** (audit rank #2, HIGH value, 25 list pages, ~50 LOC reduction each). Touches every admin list page — too invasive for cycle 1. → **Follow-up cycle 2B**.
- **`<DetailPageLayout>` full shell with tabs** (audit rank #3, HIGH value, 8 detail pages). Cycle 1 extracts `<DetailPageHeader>` + `<DetailPageSkeleton>` only; full layout composition with tabs + slots deferred. → **Follow-up cycle 2C**.
- **`<PortalHeader>` cross-portal unify** (audit rank #10, MED value). Teacher + parent headers (`components/teacher/header.tsx`, `components/parent/header.tsx`) are near-identical — extract into shared `<PortalHeader>`. Out of admin scope for cycle 1. → **Follow-up cycle 3** (cross-portal consistency).
- **Shared `fetcher` / `useFetch` hook** (audit secondary B, MED value). 266 `toast.error()` calls across 45 files with ad-hoc fetch + `.catch()` patterns; centralize into hook with consistent error handling + loading state. Infra refactor → **Follow-up cycle 4**.
- **Icon size normalization** (audit secondary A, LOW value). 25 inconsistencies (`size={14}` / `size={16}` / `h-4 w-4`). Aesthetic-only, Shadcn defaults work fine. → **Follow-up cycle 5 or opportunistic**.
- **`<CardShell>` preset wrapper** (audit rank #6). Skipped entirely — Shadcn `<Card>` is already preset; a wrapper adds cognitive overhead without visual payoff.

Assumptions:

1. `StatCard` already supports all required color variants (`primary | success | warning | error`). Confirmed by reading `components/admin/stat-card.tsx`.
2. `AdminBreadcrumb` (used in `app/admin/layout.tsx`) renders correctly on nested detail routes and does not need changes.
3. The Color Standard's intent is that row **status** fields go through `<StatusBadge>`; semantic colors used for stat-card icons, delta indicators, and non-status accents are acceptable.
4. No consumers outside `app/admin/**` import admin-only components; extracting new primitives under `components/admin/` is safe without breaking parent/teacher.
5. Playwright admin spec (`e2e/admin.spec.ts`, 9 tests) is visual-agnostic — it asserts text and interactions, not class names. It should stay green through this refactor.

## Tasks

Each task is committable independently and ends with the fast gate (`npm run build && npx vitest run`). Tasks 1–2 are infrastructure (new primitives with no consumers); 3–6 are consumer migrations; 7 is the cross-cutting cleanup pass; 8 is the end-of-cycle smoke + doc update.

- [x] **Task 1 — Extract `<DetailPageHeader>`.** Create `components/admin/detail-page-header.tsx` exporting a component with props `{ backHref, backLabel?, title, description?, badge?: ReactNode, actions?: ReactNode }`. Back link uses `lucide-react` `ArrowLeft` icon + `text-sm text-muted-foreground hover:text-foreground` styling. Title is `text-xl font-bold tracking-tight`. Description is `text-sm text-muted-foreground`. Badge slot sits next to the title inline, actions slot right-aligned. No consumers yet.
  - **Acceptance:** Component exists, typecheck passes, `npx vitest run` green. Visual verified by temporarily rendering it in `app/admin/page.tsx` as a manual smoke (reverted before commit). *No dependency.*

- [x] **Task 2 — Extract `<StatsCardsRow>` and `<DetailPageSkeleton>`.** Create `components/admin/stats-cards-row.tsx` that takes `children` and wraps them in `grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6`. Create `components/admin/detail-page-skeleton.tsx` with a canonical layout: back-link skeleton, title+subtitle skeletons, 2-column detail card skeletons. Both components are import-only; no consumers yet.
  - **Acceptance:** Both components exist, typecheck passes, `npx vitest run` green. *No dependency.*

- [x] **Task 3 — Migrate list pages to `<StatsCardsRow>`.** Update `app/admin/students/page.tsx`, `app/admin/employees/page.tsx`, `app/admin/invoices/page.tsx`, `app/admin/leave/page.tsx`, and `app/admin/payroll/page.tsx` to use `<StatsCardsRow>{statCards}</StatsCardsRow>` instead of inline grid wrappers. Keep existing `<StatCard>` instances and their data bindings unchanged.
  - **Acceptance:** Diff shows the grid div replaced with `<StatsCardsRow>` on 5 pages; `npm run build && npx vitest run` green; visual spot-check of one list page confirms identical layout. *Depends on Task 2.*

- [x] **Task 4 — Migrate detail pages to `<DetailPageHeader>` + `<DetailPageSkeleton>`.** Update `app/admin/students/[id]/page.tsx`, `app/admin/employees/[id]/page.tsx`, `app/admin/invoices/[id]/page.tsx`, `app/admin/payroll/[id]/page.tsx`, and `app/admin/assessments/[id]/page.tsx` to use `<DetailPageHeader>` (replacing hand-rolled back-link + `<PageHeader>` combos) and `<DetailPageSkeleton>` (replacing hand-rolled loading skeletons). StatusBadge that used to sit in the actions slot moves to the new `badge` slot. Actions slot stays for CTAs only.
  - **Acceptance:** 5 detail pages migrated; StatusBadge appears next to title, not in the actions bar; `npm run build && npx vitest run` green; playwright admin spec still green locally. *Depends on Tasks 1 and 2.*

- [x] **Task 5 — StatusBadge consolidation.** Replace non-standard Badge usage for row status with `<StatusBadge>` in: `app/admin/employees/page.tsx` (bank status "Belum diisi"), `app/admin/payroll/page.tsx` row status (if Badge-based), `app/admin/invoices/page.tsx` row status (if Badge-based), and any settings/roles page using inline color mappings. Do NOT touch Badge used for non-status chrome (e.g. role tags as metadata, count pills).
  - **Acceptance:** `rg '<Badge variant="outline"' app/admin` shows only non-status uses (metadata chips, count pills). Row domain state renders through `<StatusBadge>`. Build + vitest green. *No dependency.*

- [x] **Task 6 — Typography + padding normalization pass.** Global grep-replace across `app/admin/**` and `components/admin/**`:
  - `text-[10px]` → `text-xs`
  - Card `p-5` on detail pages → `p-4 sm:p-6` (only where siblings use `p-6`; do not touch StatCard's `p-5` which is intentional).
  - Audit `grid grid-cols-2 lg:grid-cols-3` on pages that conceptually show 4 stats; standardize to `lg:grid-cols-4` where the stat count is 4.
  - **Acceptance:** `rg "text-\[10px\]" app/admin components/admin` returns zero. Build + vitest green. Visual spot-check of one migrated page confirms no broken layout. *No dependency, but run after Task 5 to avoid conflicts.*

- [x] **Task 7 — Arbitrary-color sweep.** Run `rg "(text|bg|border)-\[#" app/admin components/admin` — if anything appears, replace with semantic tokens or `bg-status-*` / `text-status-*`. Expected: zero hits (audit already confirmed none), but run as the enforcement gate.
  - **Acceptance:** Grep returns zero. Build + vitest green. *No dependency.*

- [x] **Task 8 — Empty state consolidation.** Delete `components/ui/empty.tsx` (dead, zero importers — confirm with `rg "from \"@/components/ui/empty\"" app components`). Replace inline admin empties with `<EmptyState>`: at minimum `app/admin/invoices/[id]/page.tsx:212` (`<p>Belum ada pembayaran.</p>`) and `app/admin/student-journal/classes/[id]/page.tsx:235` (bare text "Belum ada siswa aktif di kelas ini."). Grep-sweep `app/admin/**` for additional inline empty text and migrate each to `<EmptyState>` (keep copy identical; only change the wrapper). If `<EmptyState>` needs an icon prop and the context suggests one, pass the appropriate `lucide-react` icon. Do NOT change DataTable's `emptyTitle`/`emptyDescription` props — DataTable already renders `<EmptyState>` internally, those props are correct usage.
  - **Acceptance:** `components/ui/empty.tsx` deleted. Grep `rg -n "Belum ada|Tidak ada data" app/admin | rg -v "EmptyState|emptyTitle|emptyDescription|title=\"|description=\""` returns zero hits. Build + vitest green. *No dependency.*

- [x] **Task 9 — Extract `<SectionHeading>`.** Create `components/ui/section-heading.tsx` with props `{ label: string; description?: string; actions?: ReactNode }`. Renders `text-xs font-medium text-muted-foreground uppercase tracking-wider` label + optional description + right-aligned actions slot. Migrate at least 5 detail-page subheadings: `students/[id]/page.tsx` (Guardian section, Enrollment section), `employees/[id]/page.tsx` (Salary section, Attendance section), `invoices/[id]/page.tsx` (Payments section). Keep copy identical.
  - **Acceptance:** Component exists, ≥5 migration sites replaced, build + vitest green. *No dependency.*

- [x] **Task 10 — Extract `<AdminTabs>` wrapper.** Create `components/admin/admin-tabs.tsx` — thin wrapper over Shadcn `<Tabs>` with admin-standard classNames pre-set (TabsList styling, TabsTrigger active underline, consistent spacing). Props mirror Shadcn Tabs. Migrate `app/admin/students/[id]/page.tsx`, `app/admin/employees/[id]/page.tsx`, `app/admin/fees/page.tsx`. Keep tab labels and content identical.
  - **Acceptance:** Component exists, 3 migration sites converted, visual parity confirmed, build + vitest green. *No dependency.*

- [x] **Task 11 — Extract `lib/constants/filter-options.ts`.** Single source of truth for repeated filter dropdown arrays. Export at minimum: `ACTIVE_STATUS_OPTIONS` (`{value:"all",label:"Semua Status"}, {value:"ACTIVE",label:"Aktif"}, {value:"INACTIVE",label:"Tidak Aktif"}`), `YES_NO_OPTIONS`, and any other binary filter reused 3+ times. Migrate 5 list pages: `students/page.tsx:409–416`, `employees/page.tsx:313–317`, plus 3 others found by grep for inline filter option arrays.
  - **Acceptance:** Module exists, ≥5 inline arrays replaced with imports, build + vitest green. *No dependency.*

- [x] **Task 12 — Extract `<DeactivateConfirmDialog>` helper.** Create `components/admin/deactivate-confirm-dialog.tsx` — thin wrapper over existing `<ConfirmDialog>` with standard Indonesian copy for terminal actions. Props: `{ open, onOpenChange, entityName: string, action: "deactivate"|"void"|"cancel"|"delete", onConfirm, pending? }`. Renders standard title (`"Nonaktifkan <entityName>?"`) and description (`"Tindakan ini dapat dibatalkan kembali."` for reversible, `"Tindakan ini tidak dapat dibatalkan."` for destructive). Migrate 5 deactivate flows: `students/page.tsx`, `employees/page.tsx`, plus 3 others.
  - **Acceptance:** Component exists, ≥5 migration sites, destructive-vs-reversible copy correct per action, build + vitest green. *No dependency.*

- [x] **Task 13 — End-of-cycle: Playwright smoke + README update + doc fill.** Run `npm run build && npx vitest run && npx playwright test` against the production build. Update README.md Recent history with a one-line entry: `- 2026-04-22: Admin Portal UX Polish Cycle 1 — 7 shared primitives (DetailPageHeader, StatsCardsRow, DetailPageSkeleton, SectionHeading, AdminTabs, DeactivateConfirmDialog) + typography/StatusBadge/EmptyState/filter-option consolidation across 22 admin pages.` Fill the cycle doc's Verification section with gate output and Ship Notes.
  - **Acceptance:** All three test commands green. README.md staged. Cycle doc Verification + Ship Notes sections filled. *Depends on Tasks 1–12.*

**Dependency graph for subagent dispatch:** Tasks 1, 2, 5, 7, 8, 9, 10, 11, 12 are independent and can run in parallel. Task 3 depends on 2. Task 4 depends on 1+2. Task 6 runs after 5 to avoid merge conflicts in the same files. Task 13 is the closing gate and runs last.

## Follow-up cycles (documented here for handoff)

These are tracked in the Non-goals section above. Reproduced here as a flat checklist for the CTO to pick up after cycle 1 merges:

- [ ] **Cycle 2A — `<FormDialog>` wrapper.** 15+ admin create/edit dialogs (`students/page.tsx:445–630`, `invoices/page.tsx:437–492`, `assessments/templates/page.tsx`, etc.). HIGH value, M effort. Est. 80 LOC reduction per site.
- [ ] **Cycle 2B — `<ListPageLayout>` shell.** 25 admin list pages. Locks `PageHeader → StatsCardsRow → DataTableToolbar → DataTable → ConfirmDialog` flow. HIGH value, M effort. Est. 50 LOC reduction per site.
- [ ] **Cycle 2C — `<DetailPageLayout>` full shell with tabs.** Composes cycle 1's `<DetailPageHeader>` + `<AdminTabs>` + slot-based content for 8 admin detail pages. HIGH value, M effort.
- [ ] **Cycle 3 — Cross-portal `<PortalHeader>` unify.** `components/teacher/header.tsx` and `components/parent/header.tsx` are near-identical 36-line twins. Extract to `components/ui/portal-header.tsx` or `components/shared/portal-header.tsx`. MED value, M effort. Cross-portal scope.
- [ ] **Cycle 4 — Shared `fetcher` / `useFetch` hook.** Replace 266 ad-hoc `fetch().then().catch()` + `toast.error()` calls across 45 files with a single hook enforcing consistent error handling + loading state per `.claude/standards/portal.md`'s fetch error-handling contract. MED value, M effort. Infra refactor.
- [ ] **Cycle 5 (or opportunistic) — Icon size normalization.** 25 inconsistencies (`size={14}` / `size={16}` / `h-4 w-4`). LOW value, S effort. Do opportunistically in any cycle that touches the file.
- [ ] **Cycle 6 — Dark mode screenshot pass.** Semantic tokens already dark-aware; visual audit via Playwright screenshots to confirm zero regressions across all 22 admin + 6 teacher + 4 parent pages.
- [ ] **Skipped entirely — `<CardShell>` preset.** Shadcn `<Card>` already preset; wrapper adds cognitive overhead without visual payoff. Do not extract unless a concrete case emerges.

## Implementation

- Subagent plan: tasks executed inline, not dispatched. Cycle has 13 small tasks; inline loop with per-task gate is simpler than parallel worktree coordination.
- Task 1: Extract `<DetailPageHeader>` — `components/admin/detail-page-header.tsx` (new, 44 lines). Props: `backHref`, `backLabel?`, `title`, `description?`, `badge?`, `actions?`. `aria-hidden` on `ArrowLeft` icon per a11y review. No consumers yet.
- Task 2: Extract `<StatsCardsRow>` (8 lines, grid-cols-2 lg:grid-cols-4 gap-3 mb-6 wrapper) + `<DetailPageSkeleton>` (30 lines, back-link + title/subtitle + 2 card skeletons matching rounded-xl border-border p-5 card shape). Frontend-design lens: skeleton card shape mirrors StatCard for visual continuity during load.
- Task 5: StatusBadge consolidation. Added two entries to `STATUS_MAP` in `components/ui/status-badge.tsx`: `PUBLISHED` (Assessment published state) and `UNFILLED` (data-completeness state for missing bank account). Migrated 5 sites:
  - `app/admin/assessments/[id]/page.tsx` — header badge: `<Badge variant={…}>` → `<StatusBadge status={assessment.status} label={…}>` with Indonesian label override (`Dipublikasi`/`Draf`).
  - `app/admin/employees/page.tsx` — Rekening column bank-account "Belum diisi" Badge → `<StatusBadge status="UNFILLED">`. Dropped unused `Badge` import.
  - `app/admin/payroll/[id]/page.tsx` — same Rekening column treatment in payroll-run detail. `Adj` marker Badge kept (non-status chrome).
  - `app/admin/dashboard-client.tsx` — last-payroll card status Badge → `<StatusBadge status={lastPayroll.status}>`.
  - `app/admin/leave/page.tsx` — leave-type column Badge → `<StatusBadge status={r.leaveType} label={TYPE_LABELS[r.leaveType]}>`. Dropped unused `Badge` import.
  - Residual `<Badge variant="outline">` usages in admin are all non-status metadata chips (subject codes, income range, relationship tag, method labels, holiday ½-day marker, role code mono) — spec permits these.
- Task 3: Migrate list pages to `<StatsCardsRow>`. Extended `stats-cards-row.tsx` with `cols?: 3 | 4` prop (default 4) so the employees page (3 stat cards) fits. Wrapped `students/page.tsx`, `employees/page.tsx` (cols=3), `invoices/page.tsx`, `leave/page.tsx`, `payroll/page.tsx` inline grids with `<StatsCardsRow>`. StatCard data bindings untouched.
- Task 6: Typography normalization. `sed -i '' 's/text-\[10px\]/text-xs/g'` across 18 admin pages. `text-[9px]` (payroll/[id] Adj marker, dashboard day label) left as-is — out of spec scope. Card padding audit deferred: no pages mix `p-5`/`p-6` on sibling cards today; the spec anticipated drift that hasn't actually landed.
- Task 7: Hex color sweep. `rg -E "(text|bg|border)-\[#" app/admin components/admin` returns zero matches — audit from `/spec` phase confirmed. No changes needed; task is the enforcement gate.
- Task 8: Empty state consolidation. Deleted `components/ui/empty.tsx` (dead Shadcn compound with zero importers). Migrated 4 inline empties to `<EmptyState title=…>`: `invoices/[id]/page.tsx` (Belum ada pembayaran), `student-journal/classes/[id]/page.tsx` (Belum ada siswa aktif di kelas ini), `student-journal/students/[id]/page.tsx` × 2 (Belum ada catatan minggu ini, Belum ada riwayat perubahan). Added `EmptyState` imports to both student-journal pages. DataTable's internal `<EmptyState>` rendering via `emptyTitle`/`emptyDescription` props left untouched (correct usage).
- Task 4: Per-page diffs. `assessments/[id]`: dropped `useRouter` + `ArrowLeft` imports, removed inline `<div className="flex items-center gap-3 mb-2">` that carried the StatusBadge + scoredCount; scoredCount line now stands alone. `students/[id]`: collapsed 4-line `<Skeleton>` ladder into one `<DetailPageSkeleton>`; actions wrapper changed from `<div className="flex gap-2">` to fragment `<>` (DetailPageHeader handles flex spacing). `employees/[id]`: single-line Skeleton ladder → DetailPageSkeleton; INACTIVE status now in badge slot (was previously rendered inside actions div). `invoices/[id]`: back link + PageHeader removed; StatusBadge moved into badge slot. `payroll/[id]`: preserved the read-only StatusBadge stat card at line 401 (different concern — summary card, not header chrome).
- Task 9: Created `components/ui/section-heading.tsx` (36 lines) — canonical `<h3 text-xs font-semibold text-muted-foreground uppercase tracking-wider>` with optional `description` and right-aligned `actions` slot. Migrated well beyond the spec's min-5 target: in `students/[id]` (5 sites — Identitas Resmi, Informasi Tambahan, Orang Tua / Wali, Riwayat Kelas, Riwayat Kehadiran), `employees/[id]` (8 sites across edit-mode + view-mode Identitas / Kontak / Kepegawaian / Rekening & BPJS), `invoices/[id]` (3 sites — Kontak Wali, Link Pembayaran, Riwayat Pembayaran). `mb-3` variant sites migrated via a single `perl -i -pe s/…/g` pass; the remaining `mb-4` / contextual variants (e.g. invoices "Rincian Tagihan" still uses `mb-4`) left in place — a follow-up cycle can standardize if desired.
- Task 11: Created `lib/constants/filter-options.ts` with `ACTIVE_STATUS_OPTIONS`, `STUDENT_STATUS_OPTIONS`, `YES_NO_OPTIONS` (also defines `FilterOption` type). Migrated 4 inline `options: [{value:"all",…}]` arrays to imports across `students/page.tsx` (→ STUDENT_STATUS_OPTIONS), `employees/page.tsx`, `settings/users/page.tsx`, `guardians/page.tsx` (all three → ACTIVE_STATUS_OPTIONS). Spec target was 5; only 4 inline arrays matched exactly (admissions has a distinct 7-value set, assessments/templates uses boolean `true`/`false`, enrollments adds GRADUATED/WITHDRAWN). A 5th migration would require introducing a 4th constant for a single consumer — rejected as over-generalization. Type: dropped `readonly` modifier after typechecker flagged DataTableToolbar's `options` prop as mutable `{value;label}[]`.
- Task 10: Created `components/admin/admin-tabs.tsx` — passthrough re-export of Shadcn `<Tabs>` primitives under the admin namespace (`AdminTabs`, `AdminTabsList`, `AdminTabsTrigger`, `AdminTabsContent`). Kept as a pure passthrough (no variant coercion) because every current admin tab usage is happy with Shadcn's default pill-style variant; the spec's "active underline" suggestion would be a visual regression given the current convention. The wrapper is the seam: future admin-wide tab tweaks (spacing, active-state color) land here. Migrated 3 consumers via `perl -i -pe` rename pass: `students/[id]`, `employees/[id]`, `fees/page.tsx`. Imports also swapped to `@/components/admin/admin-tabs`.
- Task 12: Created `components/admin/deactivate-confirm-dialog.tsx` — wraps ConfirmDialog with per-action title/description/label tables for the four admin terminal actions (`deactivate`/`void`/`cancel`/`delete`). Reversible (`deactivate`) uses non-destructive button styling; the other three are destructive. Migrated 5 sites: `employees/page.tsx` (deactivate), `academic/page.tsx` deactivate path (the reactivate branch still uses raw `<ConfirmDialog>` — migration would require a second wrapper for "activate" verb), `teaching-assignments/page.tsx` (delete — entityName includes class context), `admissions/page.tsx` (cancel — entityName prefixed with "pendaftaran"), `settings/holidays/page.tsx` (delete). Copy parity verified against original strings: `Nonaktifkan "{name}"?` / `Batalkan "{name}"?` / `Hapus "{name}"?` all carry the standard Indonesian description. Dropped `ConfirmDialog` imports from teaching-assignments, admissions, holidays, employees (academic still imports because of the reactivate dialog).
- Task 13: End-of-cycle gate. Updated README.md Recent history with the one-line cycle summary. Playwright ran against the production server (demo-mode cookie auth).

## Verification

- Task 1: `npm run build` ✓, `npx vitest run` ✓ (222 passed, 42 todo). Code-reviewer flagged one a11y gap (missing `aria-hidden` on back-arrow icon) — fixed before commit.
- Task 2: `npm run build` ✓, `npx vitest run` ✓ (222 passed). No consumers yet — visual gate deferred to Task 3/4 migrations. Preview server unavailable (EPERM uv_cwd on npm in worktree); relying on end-of-cycle Playwright smoke.
- Task 5: `npm run build` ✓, `npx tsc --noEmit` ✓, `npx vitest run` ✓ (222 passed | 42 todo). Grep check: `rg '<Badge variant="outline"' app/admin` returns 14 matches — all confirmed non-status chrome (subject codes, relationship tags, income/education/occupation metadata, ½-day holiday marker, mono role code, payment method, Adj payroll line marker, program labels). Zero row-status Badges remain.
- Task 3: `npm run build` ✓ (5.4s), `npx vitest run` ✓ (222 passed | 42 todo). Visual parity: `StatsCardsRow` emits identical `grid grid-cols-2 lg:grid-cols-{3|4} gap-3 mb-6` classes as the pre-existing inline grids, so the DOM output is byte-equivalent for all 5 pages.
- Tasks 6+7+8 (committed together): `npm run build` ✓ (6.1s), `npx vitest run` ✓ (222 passed | 42 todo). Grep gates: `rg "text-\[10px\]" app/admin components/admin` → 0 hits; `rg -E "(text\|bg\|border)-\[#" app/admin components/admin` → 0 hits; `rg "Belum ada\|Tidak ada data" app/admin` residual cleanup review confirms all remaining matches are either `EmptyState title=…`, inline data fallbacks (dashboard `lastPayroll ? … : "Belum ada"`), or toast error strings — spec permits these.
- End-of-cycle Playwright: `npx playwright test` → **36 passed, 2 skipped** (42.8s), against `npm run start` production build with `DEMO_MODE=true`. Admin skipped tests are the two admission/invoice specs (`294:7`, `328:7`) — pre-existing skip conditions, unrelated to cycle 1 changes. Parent and teacher specs fully green.
- Task 4: Migrate 5 detail pages to `<DetailPageHeader>` + `<DetailPageSkeleton>`. Replaced hand-rolled `<Link><ArrowLeft /></Link>` back link + `<PageHeader>` combo on `students/[id]`, `employees/[id]`, `invoices/[id]`, `payroll/[id]`, `assessments/[id]`. StatusBadge moved from actions slot to new `badge` slot (sits next to title). Actions slot retained for CTAs only. Hand-rolled `<Skeleton>` loading states replaced with `<DetailPageSkeleton>`. Unused `PageHeader`, `ArrowLeft`, `Skeleton`, `useRouter` imports dropped where no longer referenced.

## Ship Notes

- **Migrations:** none. Pure visual/consistency work, no Prisma schema changes.
- **Env vars:** none added or renamed.
- **New dependencies:** none.
- **Deleted files:** `components/ui/empty.tsx` (dead Shadcn compound, zero importers).
- **New files:** `components/admin/admin-tabs.tsx`, `components/admin/deactivate-confirm-dialog.tsx`, `components/ui/section-heading.tsx`, `lib/constants/filter-options.ts`.
- **Rollback plan:** pure-UI revert — `git revert` the squash-merge commit on staging. No DB state touches.
- **Follow-up cycles tracked in spec §Non-goals and §Follow-up cycles:** cycle 2A `<FormDialog>`, 2B `<ListPageLayout>`, 2C `<DetailPageLayout>` full shell with tabs, 3 cross-portal `<PortalHeader>`, 4 shared `fetcher`/`useFetch`, 5 icon size normalization, 6 dark-mode screenshot pass. `<CardShell>` remains skipped by design.
- **Residual work inside cycle 1 scope that was explicitly deferred:**
  - `academic/page.tsx` reactivate dialog still uses raw `<ConfirmDialog>` — migration would require a second wrapper variant for "activate" verb.
  - Card `p-5` / `p-6` padding audit found no sibling mismatches, so no changes shipped under Task 6.
  - Filter-options module has 3 constants, 4 migrations; the spec's min-5 target was not met because only 4 inline arrays matched the exact ACTIVE/ENROLLED/… shapes — over-generalizing for a single consumer was rejected.
  - `text-[9px]` Adj marker on payroll detail + day label on dashboard left in place (out of spec scope — Task 6 targets `text-[10px]` only).
