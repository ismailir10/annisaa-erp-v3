# Admin UI Standard — Cycle 1: shared primitives, mobile tables, Komponen Biaya

## Context

The owner asked for a comprehensive admin UI/UX audit on "Don't Make Me Think" (Krug) grounds: one standard, shadcn everywhere, less custom code — and called out **Komponen Biaya** (`/admin/fees`) as "so off". This is cycle 1 of an approved 3-cycle programme (C2: every admin form onto react-hook-form + zod; C3: split the `students/[id]` 2109-line, `classes/[id]` 1552-line and `admissions` 1056-line monoliths + `loading.tsx` coverage).

**Inputs.** (a) Code audit of every `app/admin/**` page and the shared component layer; (b) a visual pass — 44 admin routes screenshotted at 1280px and 390px against a seeded local demo-auth production build (2026-09-26), reviewed per module; (c) the open follow-ups of 2026-09-24-radical-ux-audit, 2026-09-25-admin-dmmt-overhaul and 2026-08-05-admin-ui-audit-fixes. UAT report `docs/uat/reports/2026-06-04-admin-teacher-full.md` is >60 days old — its "multiple Aktif academic years" finding is treated as *possibly stale — verify before acting*.

**What is already right** (converge on it, don't redo it): `PageHeader` on 46/51 pages; `DataTable` + `DataTableToolbar` + `DataTableRowActions` on 24 lists; Dossier (2b) / flat (2a) detail recipes; `ResponsiveFormDialog` + `Field` in 23 forms; `ConfirmDialog` 45×; one `StatusBadge` colour source; `lib/format.ts`.

**What is wrong, by leverage:**

1. **Every list is broken on a phone.** `DataTable` renders a plain horizontally-scrolling `<Table>` with no affordance; at 390px the trailing columns *and the row action* sit off-screen on employees, leave-requests (an approval queue — no way to approve), payroll, salary-components, holidays, users, invoices, payments, students, guardians, classes, admissions, academic-years, semesters, journal monitoring. One component, ~24 pages.
2. **Tabs have no owner.** `AdminTabs` is a passthrough, so pages restyle `TabsList` locally; `fees/page.tsx:215` adds `flex-wrap w-full`, which on mobile drops "Keringanan" onto its own centred row where it reads as a heading.
3. **Primary actions float in three places**: `PageHeader` (standard), a detached row above the filters (fees ×2 tabs), and section sub-headers (academic-years). Detail headers range from 1 button (guardians) to 5 including an inline red "Keluarkan" (students/[id]).
4. **Missing primitives breed custom code**: no DatePicker (20 files hand-use `<input type="date">`; `calendar.tsx` has 0 importers), no RupiahInput (fees structure, keringanan, manual invoice, billing wizard, student finance, employee salary each hand-parse numbers; employees/[id] shows raw `2000000` above `Rp 2.000.000`), no shared async combobox (parent/student/class-section pickers each re-wire Popover+Command; registry `combobox.tsx` unused). `form-field.tsx` is dead.
5. **Komponen Biaya**: tab 1 deactivates a fee component with **no confirm** (`fees/page.tsx:99-103,202`); "#" column is a sortable row index; tab 2 "Struktur per Program" opens on two empty selects although the active year is in the top bar, then renders a hand-rolled Card list of raw `<Input type="number">` — a different paradigm from its sibling tabs; deactivated components silently vanish from tab 2; tab 3 uses raw `AlertDialog` (`keringanan-tab.tsx:744-765`) and arbitrary sortable/non-sortable headers; Kode/Urutan have no help text; breadcrumb "Biaya" vs H1 "Biaya & Tagihan"; Keringanan — weekly per-student work — is reachable only through the Settings hub under a label that never names it (`config/admin-nav.ts:212-219`).
6. **Standard-breaking outliers**: campuses is a hand-rolled card grid; journal category/indicator forms are raw `<Dialog>`s (`student-journal/page.tsx:279-392`); raport editor and billing line-editor use raw `AlertDialog`; classes teacher-swap is a Sheet-only form gated on `canWrite` instead of `writeAllowed` with inline `toLocaleDateString` (`classes/[id]/client.tsx:1439-1549`); admissions convert is a raw `<Dialog>`; guardians name cell is a second, competing link to the detail page; hand-rolled Badge colours in `employees/[id]:476`, `classes/[id]:901`, `report-cards/templates:230`; raw text `<button>` in `payroll/[id]:475`; native unstyled file input on semester import; "Keluarkan dari Kelas" row action truncates.
7. **Small but everywhere**: breadcrumb renders "Detail › Detail" on nested dynamic routes (`config/admin-nav.ts:456` fallback); toolbar "Atur Ulang" renders permanently as a disabled grey word; Dossier mobile shows the jump-nav strip *and* the collapsible sections (same list twice), and `DetailRail` restacks below the sections on mobile duplicating their content (employees/[id]).
8. **Backlog still open**: monthly employee-attendance cells are 20×20px (`employee-attendance/monthly/page.tsx:179`); `employees/[id]:277,288,300` `grid-cols-2` with no mobile stacking; raport editor's unsaved-changes guard ignores sidebar/breadcrumb links.

**Intended outcome:** a phone-usable admin where every list, tab strip, header, date, money field and confirm behaves identically because it *is* the same component — and a Komponen Biaya area whose three tabs explain themselves.

## Spec

### Acceptance criteria

**Shared layer (changes reach every page)**
- [ ] `DataTable` on `<md`: the row-action column is sticky to the right edge with a left shadow; columns with `meta.priority: "low"` are hidden below `md`; the scroll container shows an edge-fade affordance when more content is to the right. Desktop rendering unchanged. Every list page marks its created/updated/secondary columns `priority: "low"`.
- [ ] At 390px, on every admin list page, the row action is visible without horizontal scrolling (checked by a Playwright assertion across the list routes).
- [ ] `AdminTabs*` owns tab styling: `AdminTabsList` is a single-row, horizontally scrollable strip on narrow screens (never wraps); page-level `className` overrides on `AdminTabsList` are removed.
- [ ] Primary-action rule, written in `ui.md` and applied: page-level primary → `PageHeader` actions; tab/section-scoped primary → the `actions` slot of that section's `DataTableToolbar` (same row as search). No detached button rows.
- [ ] `DetailPageHeader` shows at most **two** visible actions; the rest (and every destructive one) go into a `⋯` `DropdownMenu`, destructive items last and separated. students/[id] and classes/[id] adopt it.
- [ ] `DataTableToolbar` renders "Atur Ulang" only while a filter/search is active, as a ghost button with an `X` icon.
- [ ] Breadcrumbs never repeat "Detail": nested dynamic segments get their parent's noun (e.g. "Kelas", "Siswa") and known leaf segments (`themes`, `objectives`, `import`) are labelled.
- [ ] Dossier on `<lg`: jump-nav strip hidden (the collapsible sections are the navigation); `DetailRail` does not re-render content already present in a section.

**New primitives in `components/ui/`** (each with Vitest)
- [ ] `DatePicker` — value/onChange on `YYYY-MM-DD` strings (drop-in for today's native inputs); shadcn `Calendar` + `Popover` on fine pointers, native `<input type="date">` on `pointer: coarse`; Indonesian locale, `formatDate` display, `min`/`max`, disabled, `aria-invalid`.
- [ ] `RupiahInput` — "Rp" prefix, thousands separators while typing, emits an integer (or `null` when empty), right-aligned `tabular-nums`, `inputMode="numeric"`.
- [ ] `AsyncCombobox` — debounced search over a fetcher, loading/empty/error rows, clearable; `parent-picker`, `student-picker`, `class-section-picker` rebuilt on it with unchanged public props.
- [ ] `form-field.tsx` and the unused registry `combobox.tsx` deleted.
- [ ] All 20 native date inputs in `app/admin/**` and `components/admin/**` use `DatePicker`; all admin money inputs use `RupiahInput` (fees structure, keringanan, manual invoice, billing-run wizard, student finance block, employee salary).

**Komponen Biaya (`/admin/fees`)**
- [ ] Header: title "Biaya", breadcrumb matches; description states the model in one line ("Daftar komponen → tarif per program → keringanan per siswa").
- [ ] Tab labels: "Komponen Biaya", "Tarif per Program", "Keringanan Siswa"; the deep-link values (`?tab=components|structure|keringanan`) keep working.
- [ ] Komponen Biaya: "#" column replaced by a non-sortable "Urutan" shown muted after the name (or dropped from the table and kept in the form — see Assumption 4); deactivate goes through `ConfirmDialog` stating the consequence; "Tambah Komponen" lives in the toolbar `actions` slot; Kode and Urutan get `FieldDescription`.
- [ ] Tarif per Program: program + year default to the active academic year and the first active program; rendered as a `DataTable` (Komponen · Kategori · Tipe · Tarif) with an inline `RupiahInput` per row, a total row, one "Simpan Tarif" action and a dirty-state indicator; components deactivated but still carrying a tarif show a muted "nonaktif" row instead of vanishing; empty state uses `EmptyState`.
- [ ] Keringanan Siswa: raw `AlertDialog` → `ConfirmDialog`; every data column sortable-or-not by one rule (sortable where the API sorts); "Tambah Keringanan" in the toolbar `actions` slot; Nilai input is `RupiahInput` for nominal type.
- [ ] Sidebar Keuangan group gains "Keringanan" → `/admin/fees?tab=keringanan` (permission-gated like the fees page); Komponen/Tarif stay under Settings.

**Outliers**
- [ ] `ConfirmDialog` replaces raw `AlertDialog` in raport-editor and billing-run line-editor (no raw `AlertDialog` import left outside `confirm-dialog.tsx` in `app/admin` + `components/admin`).
- [ ] Journal category/indicator forms, classes teacher-swap → `ResponsiveFormDialog`; teacher-swap uses `writeAllowed` and `formatDate`.
- [ ] Admissions convert keeps its 3-way choice but is recorded as a named exception in `ui.md` (no code change) — see Assumption 5.
- [ ] Campuses → `DataTable` + `DataTableToolbar` status filter + `DataTableRowActions` (edit / deactivate), no card grid, no `motion.div`.
- [ ] Guardians: name cell is a `Link` styled as the row's primary text and the separate "Lihat" action is removed — and this "name is the link, no Lihat" pattern becomes the list rule in `ui.md`, applied to every list that currently has both.
- [ ] Hand-rolled Badge colour ternaries → `StatusBadge` (config extended where a status is missing); payroll raw text button → `Button variant="link"`; semester import file input → shadcn `Input type="file"`; "Keluarkan dari Kelas" no longer truncates.

**Backlog**
- [ ] Monthly employee-attendance day cells ≥44px on `pointer: coarse` (grid scrolls horizontally with the name column sticky).
- [ ] `employees/[id]` identity/edit grids stack to one column below `sm`; salary shows once, via `RupiahInput`.
- [ ] Raport editor unsaved-changes guard also intercepts app-shell `<Link>` navigation (sidebar, breadcrumb) via a small `useUnsavedChangesGuard` hook in `components/admin/`.
- [ ] "Multiple Aktif academic years": verified against current code/seed; fixed in the UI if reproducible, otherwise recorded as not reproducible.

**Standards**
- [ ] `ui.md`: DataTable mobile contract (`meta.priority`, sticky actions), primary-action rule, detail-header ≤2 + overflow, name-is-the-link rule, DatePicker / RupiahInput / AsyncCombobox mandates, admissions-convert exception.
- [ ] `patterns.md` Recipe 1 uses the components that exist (layout header + `AdminBreadcrumb`, `DataTableToolbar filters`) — no `SiteHeader`/`StatusFilter`.
- [ ] `crud.md`: Holiday moved out of Category A into a documented hard-delete exception (matches `app/api/config/holidays/[id]/route.ts:113`).

### Non-goals
- react-hook-form / zod on the client (Cycle 2). Forms touched here keep their `useState` internals.
- Splitting `students/[id]`, `classes/[id]`, `admissions` into modules; adding `loading.tsx` (Cycle 3).
- Teacher and parent portals, the public `/pendaftaran` funnel (its hex/emerald colours are known and out of scope).
- Any schema change, migration, or API behaviour change. Deleting unused shadcn primitives other than `form-field.tsx`/`combobox.tsx`.
- The employee-attendance "ALPA 27 on a non-school day" count (logic, not UI) — logged as a follow-up.

### Assumptions (correct me)
1. **Mobile tables = sticky actions + hidden low-priority columns**, not a card-list rewrite. Keeps one component and one mental model; card lists would be a second rendering path for every list.
2. **"Name is the link" replaces "Lihat"** on list rows (guardians today has both). Fewer buttons, a bigger tap target, and it's how people already try to use the table. The `⋯` menu keeps edit/deactivate.
3. **DatePicker goes native on touch** (you chose this) — the Calendar popover only on mouse/trackpad.
4. **Komponen Biaya "Urutan"** leaves the table (it only orders invoice lines) and stays in the form with help text; the table sorts by it by default.
5. **Admissions "Konversi ke Siswa"** is a genuine three-way decision (merge / new / cancel) — forcing it into `ConfirmDialog` would hide a choice. Documented as an exception instead.
6. **Keringanan gets a sidebar entry** that deep-links the existing tab rather than a new route — no new page, no API change.
7. Works on the session's designated branch `claude/serene-mendel-y846yr` (in `.worktrees/admin-ui-standard-c1`) rather than `feat/<slug>`; the PR still targets `staging`.

## Tasks

Dependencies: T1–T4 are independent foundations. T5 needs T1 (tabs), T2 (RupiahInput), T3 (toolbar actions). T6–T8 need T2/T3. T9 needs T2. T10 is last.

- [ ] **T1 — DataTable mobile contract + AdminTabs + toolbar reset + breadcrumb labels + Dossier mobile dedupe.** `components/ui/data-table.tsx` (sticky action column, `meta.priority`, edge fade), `components/admin/admin-tabs.tsx` (owned scrollable list), `components/ui/data-table-toolbar.tsx` (reset only when active), `config/admin-nav.ts` (segment labels), Dossier nav/rail. *Accept:* Vitest for priority/sticky classes and breadcrumb labels; 390px screenshots show actions on employees/leave-requests.
- [ ] **T2 — Primitives: DatePicker, RupiahInput, AsyncCombobox**; rebase three pickers; delete `form-field.tsx`, `combobox.tsx`. *Accept:* unit tests per primitive; picker tests still green.
- [ ] **T3 — Header/action rules.** `DetailPageHeader` ≤2 visible + overflow menu; apply to students/[id], classes/[id]; tab-scoped primary actions into toolbar `actions` (fees, academic-years). *Accept:* no detached action rows; students/[id] shows ≤2 buttons + `⋯`.
- [ ] **T4 — Mark `priority: "low"` columns on every admin list** (mechanical; per-module subagents). *Accept:* Playwright 390px row-action visibility check passes on all list routes.
- [ ] **T5 — Komponen Biaya redesign** (`app/admin/fees/page.tsx`, `components/admin/fees/*`, `config/admin-nav.ts`). *Accept:* all Komponen Biaya criteria; fees Vitest updated; e2e touching fees green.
- [ ] **T6 — Confirm/dialog outliers** (raport-editor, line-editor, journal forms, teacher-swap). *Accept:* grep finds no raw `AlertDialog`/form `Dialog` in admin outside the shared components + the documented admissions exception.
- [ ] **T7 — List/row outliers** (campuses DataTable, name-is-the-link across lists, StatusBadge ternaries, payroll link button, file input, truncation). *Accept:* criteria above; campuses tests updated.
- [ ] **T8 — Date and money input sweep** (20 date files, remaining money inputs, employee salary). *Accept:* `grep 'type="date"'` in `app/admin` + `components/admin` returns only `date-picker.tsx`.
- [ ] **T9 — Backlog** (attendance cells, employee grids, unsaved-changes guard, active-year verification). *Accept:* criteria above.
- [ ] **T10 — Standards sync** (`ui.md`, `patterns.md`, `crud.md`) + README if a module line changes. *Accept:* `bash scripts/audit-docs.sh` exits 0.

## Implementation

## Verification

## Ship Notes
