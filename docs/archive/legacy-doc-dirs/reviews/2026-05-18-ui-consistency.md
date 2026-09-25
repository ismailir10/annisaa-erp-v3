# UI Consistency Review — All Modules

**Date:** 2026-05-18
**Scope:** Comprehensive UI-only code review across all portals, admin modules, shared components, and entry surfaces.
**Method:** 7 parallel reviewers via `feature-dev:code-reviewer` agent. Each reviewer cross-checked module files against canonical standards: `.claude/standards/{ui,patterns,crud,portal,voice,colors,design-system.html}.md`. Read-only. No code changes.
**Reviewers focus:** Shadcn-FIRST adherence, DataTable conventions, overlay rules (Dialog/Sheet/AlertDialog), spacing/color tokens, voice glossary, empty/error/loading state contracts, cross-module + cross-portal consistency.

---

## Executive Summary

Overall implementation is **decent and shippable**, with consistent use of Shadcn primitives, shared `<PageHeader>` / `<DataTable>` / `<StatusBadge>` / `<Field>`, and Indonesian voice across the admin and portals. Most modules follow the canonical recipes from `patterns.md`.

**Top systemic findings (recurring across 3+ modules):**

1. **Destructive confirms inconsistent.** Three patterns in use — `<AlertDialog>`, `<ConfirmDialog destructive>`, plain `<Dialog>`. Several destructive flows skip confirm entirely. Standard = `<AlertDialog>` always.
2. **"Tidak Hadir" vs "Alpa" split.** Admin uses "Tidak Hadir"; teacher/parent portals + `voice.md` glossary use "Alpa". User-facing inconsistency between portals.
3. **Inline `style={{}}` for CSS vars / dynamic widths.** Anti-pattern called out by `colors.md`. 5+ instances in parent + 2 in admin + 2 in teacher leave-sheet. Tailwind aliases or `<Progress>` should replace.
4. **Raw `<button>` / raw `<input>` instead of Shadcn primitives.** Login page (`app/page.tsx`), portal header logout, attendance calendar nav, teacher student-journal nav, payroll detail. Bypasses variant tokens.
5. **Date display drift.** Multiple sites render raw ISO `YYYY-MM-DD` or inline `.toLocaleDateString()` instead of `formatDate()` / `formatDateShort()` from `lib/format.ts`. Payroll detail (4 spots), teacher slips, attendance modal, calendar.
6. **Ad-hoc spacing (`mb-4`, `gap-3`, `mt-8`, `p-6`) instead of tokens (`mt-section`, `gap-section`, `p-card`).** Recurs in academic, fees, attendance, settings, sheet form bodies (5 occurrences across guardians/invoices/students).
7. **Empty State Contract violations.** `<EmptyState>` component bypassed by raw `<div>` / `<p>` fallbacks. Parent student-journal zero-children case; teacher attendance fetch-error degrades to silent empty calendar.
8. **Duplicate / parallel components.** Two `<PageHeader>` (admin vs portal), two form-field wrappers (`form-field.tsx` legacy vs canonical `<Field>`), three status-color maps (`StatusBadge` + 2 in attendance calendar).

**Counts (high+medium confidence findings only):**

| Severity | Count |
|---|---|
| Blocker / Critical | 4 |
| Major / Important | 38 |
| Minor / Medium | 35 |
| **Total** | **77** |

No issues block release. Roughly 1-2 cycles of focused cleanup would clear the Major tier.

---

## TL;DR Action List (prioritized)

### P0 — Critical (data correctness or user-visible safety)

- [ ] **`app/teacher/error.tsx:20`** — Remove raw `error.message` exposure. Use fixed Indonesian copy only.
- [ ] **`components/attendance/calendar.tsx:16-35`** — Delete local `STATUS_COLORS` + `STATUS_TEXT_COLORS`. Import `getStatusConfig()` from `status-badge.tsx`. Fixes "Tidak Hadir" vs "Alpa" drift.
- [ ] **`app/admin/(hr)/payroll/[id]/page.tsx:525-558`** — Convert Approve + Send Slips confirms from `<Dialog>` to `<AlertDialog>` (irreversible workflow).
- [ ] **`app/admin/settings/salary-components/page.tsx:95-101`** — Add `<AlertDialog>` guard before `toggleEnabled()` (currently fires silently).

### P1 — Major (standard violations, cross-module inconsistency)

**Component dedup**
- [ ] Delete `components/ui/form-field.tsx`. Migrate consumers to `<Field>` + `<FieldLabel>`.
- [ ] Consolidate `components/admin/page-header.tsx` + `components/portal/page-header.tsx`. Rename `description` → `subtitle` everywhere, keep portal version.

**Destructive confirms (standardize on `<AlertDialog>` / `<DeactivateConfirmDialog>`)**
- [ ] `app/admin/(hr)/leave/page.tsx:471,523` — replace `className="bg-destructive ..."` with `variant="destructive"`.
- [ ] `app/admin/(hr)/employees/[id]/page.tsx:338` — append "Bisa diaktifkan kembali kapan saja" reassurance copy.
- [ ] `app/admin/teaching-assignments/page.tsx:124,205` — confirm hard-delete is intentional Category A exception, else switch to soft-delete.
- [ ] `app/admin/settings/roles/page.tsx` — custom-roles delete: switch to `onDeactivate` for soft-delete-first pattern.
- [ ] `app/admin/settings/{campuses,holidays,salary-components}/page.tsx` — migrate `<DialogClose><Button/></DialogClose>` → `<DialogClose render={<Button/>}>`.

**Date formatting**
- [ ] `app/admin/(hr)/payroll/[id]/page.tsx:354,357,359,534` + `payroll/page.tsx:66` — `formatDateShort()` for all period dates.
- [ ] `app/teacher/slips/[id]/page.tsx:118-121` — replace inline `toLocaleDateString` with `formatDate()`.
- [ ] `components/attendance/{override-modal.tsx:88, calendar.tsx:79,186}` — same.

**Voice glossary alignment**
- [ ] `app/admin/student-attendance/page.tsx:54,264,376` + `app/admin/(hr)/attendance/monthly/page.tsx:172-179` — "Tidak Hadir" → "Alpa".

**Color tokens (replace inline `style={{}}` for CSS vars)**
- [ ] `app/parent/assessments-table.tsx:108-126` — celebration card → Tailwind aliases.
- [ ] `app/parent/attendance/page.tsx:140-174` — celebration + status-late cards → aliases.
- [ ] `app/parent/invoices/client.tsx:249-250` — drop redundant `style` (className already covers).
- [ ] `components/teacher/leave-sheet.tsx:221,234` — replace inline-style progress bars with Shadcn `<Progress>`.
- [ ] `app/admin/student-journal/monitoring/page.tsx:72` — same.

**Shadcn-FIRST**
- [ ] `app/page.tsx:176-191` — landing login: raw `<input>` + `<button>` → `<Input>` + `<Button>`.
- [ ] `app/page.tsx:208` — bare div skeleton → `<Skeleton>`.
- [ ] `app/page.tsx:195` — `text-red-400` → `text-destructive`.
- [ ] `components/portal/portal-header.tsx:88-93` — raw `<button>` → `<Button variant="ghost" size="icon-sm">`.
- [ ] `components/attendance/{calendar.tsx:94,98, override-modal.tsx:119}` — raw `<button>` → `<Button>`.
- [ ] `app/teacher/student-journal/students/[id]/page.tsx:174-199` — raw `<button>` → `<Button variant="ghost">`.
- [ ] `app/admin/(hr)/payroll/[id]/page.tsx:436,456` — raw `<button>` → `<Button>`.
- [ ] `app/admin/assessments/[id]/page.tsx:157-170` — score selector raw buttons → `<Button variant="outline" size="sm">`.

**Form field discipline**
- [ ] `app/admin/(hr)/employees/page.tsx:581` + `employees/[id]/page.tsx:229` — raw `<label>` + `<Checkbox>` → `<Field>` + `<FieldLabel>`.
- [ ] `components/attendance/override-modal.tsx:93,103,108` — `<Label>Status *</Label>` → `<FieldLabel required>Status</FieldLabel>`.
- [ ] `app/admin/assessments/templates/page.tsx:409,416` — wrap editor inputs in `<Field>`.
- [ ] `app/admin/fees/page.tsx:217` — wrap fee-row inputs in `<Field>` + `<FieldLabel>`.
- [ ] `app/admin/settings/{roles,users}/page.tsx` — add missing `<DialogDescription>` for a11y.

**Overlays rule**
- [ ] `components/teacher/leave-sheet.tsx:312-313` — stop stacking Dialog over Sheet. Move form into nested `<SheetContent>` view or close Sheet first.
- [ ] Settings dialogs (all 6 modules) — add `<Sheet>` mobile branch via `useIsMobile()` or `<ResponsiveFormDialog>`.

**Empty state + error contracts**
- [ ] `app/parent/student-journal/page.tsx:205-214` — raw `<div>` zero-children → `<EmptyState>`.
- [ ] `app/teacher/attendance/page.tsx:164-170` — fetch error: add persistent `fetchError` state + `<EmptyState>` / inline error card. Toast alone insufficient.
- [ ] `app/parent/page.tsx:199-209` — home: hand-rolled header → `<PageHeader>`.
- [ ] `app/legal/{privacy,terms}/page.tsx` — wrap in `app/legal/layout.tsx` with brand header + back link + footer. Currently contextually orphaned from login.

**Action column hygiene**
- [ ] `app/admin/(hr)/employees/page.tsx:336` — drop `onEdit` (duplicates "Lihat" route).
- [ ] `app/admin/assessments/page.tsx:163-175` — drop redundant "Edit Nilai" `extraAction`.

### P2 — Minor (cleanups)

- [ ] Spacing tokens — replace `mb-4`/`mb-8`/`gap-3`/`p-6` with `mt-section`/`gap-section`/`p-card` across academic, fees, attendance, settings/users, settings/config, payroll detail comparison row, sheet form bodies (`guardians:265`, `invoices:853`, `students:552,597`, `invoices/[id]:336`).
- [ ] `text-[10px]` arbitrary text size — fix in `components/brand/talib-wordmark.tsx:12`, `components/student-journal/class-day-grid.tsx:126`. Replace with `text-caption`.
- [ ] `app/teacher/student-journal/error.tsx:18` — undefined `text-h3` token → use `text-h2`.
- [ ] `app/admin/student-journal/page.tsx:212` — remove outer `px-page-x py-page-y` wrapper (layout already provides).
- [ ] `app/layout.tsx:59` — `themeColor: "#1A2E2F"` to match brand sidebar.
- [ ] `app/admin/settings/holidays/page.tsx:91` — verify hard-delete vs soft-deactivate semantics; align copy.
- [ ] `app/admin/settings/config/page.tsx:137` — disabled timezone input → read-only label+value.
- [ ] `app/admin/settings/users/page.tsx:448` + `roles/page.tsx:451` — add `<DialogDescription>`.
- [ ] `app/admin/(hr)/leave/page.tsx:464-487` — wrap mobile Sheet buttons in `<SheetFooter>`.
- [ ] `app/admin/(hr)/leave/page.tsx:408-415` — filter "Semua" first, not last (match other modules).
- [ ] `app/admin/(hr)/attendance/page.tsx:210-219` — `<DataTableToolbar>` for filter row.
- [ ] `app/admin/(hr)/employees/[id]/page.tsx:320-323` — `<StatusBadge>` instead of inline `<Badge>` with hardcoded classes.
- [ ] `app/teacher/home-client.tsx:154` — replace `Ustadz/Ustadzah` slash with gender-aware or neutral form.
- [ ] `app/teacher/class-attendance/page.tsx:138-146` — loading skeleton: add `<Skeleton>` for PageHeader title.
- [ ] `components/teacher/teacher-header.tsx` — pass `userSubtitle` per `portal.md` spec.
- [ ] `components/portal/portal-header.tsx:94` — add `title="Keluar"` alongside `aria-label`.
- [ ] `app/legal/{privacy,terms}/page.tsx` — drop `prose-slate` (clashes with warm-toned tokens).
- [ ] `components/parent/bottom-nav.tsx:8-14` — update `portal.md` spec to reflect 5-tab parent nav (or revert to 4).
- [ ] `app/parent/page.tsx:215-226` — for families with ≥3 children, render Household Overview urgency banner + 3-up signal cells per `portal.md`.
- [ ] `app/admin/academic/page.tsx:543` — cancel label "Tutup" → "Batal".
- [ ] `components/ui/status-badge.tsx:247` — use `cn()` instead of template-literal class merging.
- [ ] `components/admin/deactivate-confirm-dialog.tsx:29` — `"Nonaktifkan"` → `"Ya, Nonaktifkan"` for consistency with `void`/`cancel`.
- [ ] `app/admin/admissions/page.tsx:715` — `DialogClose` `render`-prop migration.
- [ ] `app/admin/admissions/page.tsx:726-733` — admission cancellation copy: replace generic "tidak bisa dibatalkan" with reversible language.
- [ ] `app/admin/students/page.tsx:535-543` — switch to `<DeactivateConfirmDialog>` for canonical copy alignment.
- [ ] Remove early-return `<Skeleton>` guards (use only `DataTable loading` prop) in: `enrollments:254`, `assessments:178`, `fees:118`, `teaching-assignments:181`.
- [ ] `app/admin/(hr)/attendance/page.tsx:230-237` — verify pagination is intentional omission (daily all-employees-one-day view).
- [ ] `components/ui/spinner.tsx` — confirm intended vs `<Skeleton>`-only loading rule.
- [ ] `app/parent/error.tsx:19` vs sub-route errors at `text-h3` — align heading sizes.

---

## Per-Module Findings

### 1. Admin Core

#### `app/admin/page.tsx` + `layout.tsx`
- **Minor**: dashboard stat grid uses `gap-4` (`page.tsx:173`) — should be `gap-section`.

#### `app/admin/academic/`
- **Major**: section spacing ad-hoc `mb-8`/`mb-4` (`page.tsx:367,375,376,398,399,409,410`) — replace with `mt-section`.
- **Minor**: Assign Teacher dialog cancel label "Tutup" (`page.tsx:543`) — canonical is "Batal".

#### `app/admin/admissions/`
- **Minor**: `DeactivateConfirmDialog action="cancel"` (`page.tsx:726-733`) ships generic "Aksi ini tidak bisa dibatalkan" — misleading for reversible admission cancellation.
- **Minor**: `DialogClose` wraps `<Button>` (`page.tsx:715`) — migrate to `render` prop.

#### `app/admin/assessments/`
- **Major**: action column duplicates view destination as "Edit Nilai" `extraAction` (`page.tsx:163-175`) — drop redundant entry.
- **Minor**: score selector buttons hand-rolled (`[id]/page.tsx:157-170`) — use `<Button variant="outline" size="sm">`.
- **Minor**: template editor `<Input>` lacks `<Field>` wrapper (`templates/page.tsx:409,416`).

#### `app/admin/enrollments/`
- **Major**: early-return `<Skeleton>` guard (`page.tsx:254`) inconsistent with peers — DataTable `loading` prop alone suffices.

#### `app/admin/fees/`
- **Minor**: tab section spacing `mt-4`/`mb-4` (`page.tsx:182,198`) — use tokens.
- **Minor**: fee row `<Input>` unwrapped (`page.tsx:217`) — add `<Field>` + `<FieldLabel>`.

#### `app/admin/guardians/`
- **Minor**: Sheet body uses `px-4 pb-4` (`page.tsx:265-267`) — should be `p-card`.

#### `app/admin/invoices/`
- **Minor**: error fallback uses `p-6` (`page.tsx:770`) — should be `p-card`.

#### `app/admin/students/`
- **Minor**: uses generic `<ConfirmDialog>` (`page.tsx:535-543`) — `<DeactivateConfirmDialog>` would keep copy canonical.

#### `app/admin/teaching-assignments/`
- **Major**: hard DELETE on Category A entity (`page.tsx:124,205`) — confirm intentional or convert to soft-delete.

#### `app/admin/student-attendance/`
- **Major**: "Tidak Hadir" used in filter + stat labels (`page.tsx:54,264,376`) — replace with "Alpa" per `voice.md`.

#### `app/admin/student-journal/`
- **Major**: `page.tsx:212` adds outer `px-page-x py-page-y` wrapper, doubling layout padding.
- **Minor**: `CompletionBar` inline `style={{ width }}` (`monitoring/page.tsx:72`) — use `<Progress>`.

**Cross-module patterns (admin core):**
1. Ad-hoc spacing inside Sheet form bodies (5 occurrences across guardians/invoices/students).
2. "Tidak Hadir" vs "Alpa" split between admin and portals.
3. Early-return `<Skeleton>` guards inconsistent across enrollments/assessments/fees/teaching-assignments.

---

### 2. Admin HR

#### `app/admin/(hr)/employees/`
- **Major**: deactivate confirm missing soft-delete reassurance copy (`[id]/page.tsx:338`).
- **Major**: deactivate uses `ConfirmDialog` not `AlertDialog` (`[id]/page.tsx:338`) — verify underlying primitive.
- **Minor**: raw `<label>` + `<Checkbox>` for BPJS (`page.tsx:581`, `[id]/page.tsx:229`).
- **Minor**: `onEdit` routes to detail page (`page.tsx:336`) — duplicate of "Lihat".

#### `app/admin/(hr)/attendance/`
- **Major**: filter row hand-rolled (`page.tsx:210-219`) — should use `<DataTableToolbar>`.
- **Minor**: DataTable lacks `pagination` prop (`page.tsx:230-237`) — verify intentional.
- **Minor**: monthly legend shows raw status keys "PRESENT"/"LATE"/"ABSENT" (`monthly/page.tsx:172-179`) — localize.

#### `app/admin/(hr)/leave/`
- **Major**: reject button uses `className="bg-destructive ..."` (`page.tsx:471,523`) — use `variant="destructive"`.
- **Minor**: missing `<SheetFooter>` (`page.tsx:464-487`).
- **Minor**: status filter "Semua" last instead of first (`page.tsx:408-415`).

#### `app/admin/(hr)/payroll/`
- **Major**: Approve + Send Slips use `<Dialog>` not `<AlertDialog>` (`[id]/page.tsx:525-558`) — irreversible.
- **Major**: raw ISO dates in period summary + list (`[id]/page.tsx:354,357,359,534`, `page.tsx:66`) — use `formatDateShort()`.
- **Minor**: raw `<button>` edit triggers (`[id]/page.tsx:436,456`) — use `<Button>`.
- **Minor**: salary tab inline `<Badge>` with hardcoded classes (`employees/[id]/page.tsx:320-323`) — use `<StatusBadge>`.

**Cross-module patterns (admin HR):**
1. Three different destructive-confirm implementations across four modules.
2. Raw ISO date display in payroll — single most widespread date-format omission.
3. Ad-hoc `mb-4` toolbar/comparison spacing.
4. Raw `<label>` for checkboxes in employees.

---

### 3. Admin Settings

#### `app/admin/settings/campuses/`
- **Important**: no Sheet mobile branch on dialog (`page.tsx:187`).
- **Important**: `<DialogClose>` wraps `<Button>` instead of `render` prop (`page.tsx:219`).
- **Medium**: card grid uses raw `<button>` icon buttons (`page.tsx:172-176`) — should use `<DataTableRowActions>` or `<DropdownMenu>`.
- **Medium**: confirm label "Nonaktifkan" missing "Ya," prefix (`page.tsx:235`).

#### `app/admin/settings/holidays/`
- **Medium**: hard DELETE on Category A entity (`page.tsx:91`) — verify vs `crud.md` soft-deactivate rule.
- **Low**: missing status filter (Aktif/Tidak Aktif) on DataTable (`page.tsx:163-170`).

#### `app/admin/settings/config/`
- **Important**: ad-hoc spacing — no `mt-section` between PageHeader and Card (`page.tsx:92`).
- **Medium**: disabled timezone input reads as broken (`page.tsx:137`) — show read-only label+value instead.

#### `app/admin/settings/roles/`
- **Medium**: ad-hoc `mb-8`/`mb-3` (`page.tsx:88,432`).
- **Medium**: missing `<DialogDescription>` (`page.tsx:451-455`).
- **Medium**: custom-roles uses hard DELETE on Category A.

#### `app/admin/settings/salary-components/`
- **Critical**: deactivate fires without `<AlertDialog>` confirm (`page.tsx:95-101`).

#### `app/admin/settings/users/`
- **Medium**: ad-hoc `gap-3 mb-6` on stats grid (`page.tsx:364`).
- **Medium**: missing `<DialogDescription>` (`page.tsx:448-449`).

**Cross-module patterns (settings):**
1. **Universal**: no Sheet (mobile) branch on any dialog across 6 modules.
2. Inconsistent destructive-confirm implementations (5 different approaches).
3. Consistent wins: `<Field>`/`<FieldLabel>`, `<StatusBadge>`, `toast.*`, `<DataTable>` + `<DataTableColumnHeader>` + `<DataTableRowActions>` used uniformly. Voice register correct.

---

### 4. Teacher Portal

#### Shell + nav
- Solid. `TeacherHeader` wraps `PortalHeader` correctly; `BottomNav` wraps `PortalBottomNav`. Optional `userSubtitle` not passed (minor).

#### `app/teacher/error.tsx`
- **Critical**: raw `error.message` exposed to user (`line 20`) — Fetch Error Contract violation. Remove.

#### `app/teacher/student-journal/error.tsx`
- **Important**: undefined `text-h3` token (`line 18`) — use `text-h2`.

#### `app/teacher/slips/[id]/page.tsx`
- **Important**: inline `toLocaleDateString` (`lines 118-121`) — use `formatDate()`.
- **Minor**: `&&` conditional render in deduction section (`line 252`) — acceptable for non-list, low confidence.

#### `app/teacher/attendance/page.tsx`
- **Important**: fetch-error silent empty state (`lines 164-170`) — needs persistent UI, not transient toast.

#### `components/teacher/leave-sheet.tsx`
- **Important**: stacked Dialog over Sheet (`line 313`) — overlays rule violation.
- **Important**: `style={{ width }}` on progress bars (`lines 221,234`) — use `<Progress>`.

#### `app/teacher/home-client.tsx`
- **Important**: "Ustadz/Ustadzah" literal slash (`line 154`) — voice-standard mismatch.

#### `app/teacher/class-attendance/page.tsx`
- **Important**: loading skeleton missing `<PageHeader>` skeleton (`lines 138-146`) — title pop-in.

#### `app/teacher/student-journal/students/[id]/page.tsx`
- **Important**: raw `<button>` for week nav + back (`lines 174-199`) — use `<Button>`.

**Cross-area patterns (teacher):**
1. `text-h3` undefined; root vs nested error pages divergent.
2. Raw `error.message` in root error.
3. Stacked Dialog over Sheet.
4. Inline date formatting + inline `style={{}}` progress bars.

---

### 5. Parent Portal

#### Shell + nav
- **Medium**: `py-6` raw value instead of `py-page-y` token (`layout.tsx:14`). Same in teacher layout.
- **Medium**: logout missing `title="Keluar"` (`portal-header.tsx:94`).
- **Low**: 5-tab bottom-nav diverges from 4-tab spec (`bottom-nav.tsx:8-14`) — product decision; update spec or revert.

#### `app/parent/page.tsx` (Home)
- **High**: Household Overview urgency banner + 3-up signal cells missing for ≥3 children (`lines 215-226`).
- **Medium**: hand-rolled `<h1>` header instead of `<PageHeader>` (`lines 199-209`).

#### `app/parent/assessments-table.tsx` + `attendance/page.tsx`
- **High**: inline `style={{ color/background/borderColor: "var(--celebration-*)" }}` (5 instances). Tailwind aliases exist.

#### `app/parent/invoices/client.tsx`
- **Medium**: redundant `style={{ borderColor: "var(--border)" }}` (`lines 249-250`) — className covers.

#### `app/parent/error.tsx`
- **Medium**: heading size `text-h2` vs sub-route `text-h3` divergence.

#### `app/parent/student-journal/page.tsx`
- **Medium**: zero-children empty branch uses raw `<div>`/`<p>` (`lines 205-214`) — should use `<EmptyState>`.

#### Cross-portal parity
- **High**: `components/student-journal/class-day-grid.tsx:126` uses banned `text-[10px]`.
- **Medium**: teacher root error leaks raw `error.message` — parent does not. Parity gap.

**Cross-area patterns (parent):**
1. Inline `style` for CSS vars — most widespread violation (5 instances across 2 files).
2. Home is only page bypassing `<PageHeader>`.
3. Household Overview not implemented for ≥3-child families.
4. Empty State Contract generally good; one exception in student-journal zero-children.
5. No raw hex literals.

---

### 6. Auth / Payment / Legal / Root

#### Root + landing
- **Critical**: hardcoded `text-red-400` for auth error (`app/page.tsx:195`) — use `text-destructive`.
- **Important**: `themeColor: "#0F172A"` mismatches brand sidebar `#1A2E2F` (`app/layout.tsx:59`).
- **Important**: bare `<div>` skeleton (`app/page.tsx:208`) — use `<Skeleton>`.
- **Important**: raw `<input>` + `<button>` on login form (`app/page.tsx:176-191`) — use Shadcn primitives.
- **Important**: `TalibWordmark` sublabel uses `text-muted-foreground` (light-surface token) on dark login shell — low contrast.

#### Auth callback
- No UI issues. Server route. Blank flash on landing is inherent Next.js limitation.

#### Payment
- No UI issues. Server-side redirect shims.

#### Legal
- **Important**: legal pages render bare `<main>` — no brand header, no back-link, no footer. Contextual dead-end from login. Create `app/legal/layout.tsx`.
- **Important**: `prose-slate` clashes with warm-toned token palette.

#### Brand
- **Minor**: `text-[10px]` in `talib-wordmark.tsx:12` — use `text-caption`.

**Cross-area patterns (auth/landing):**
1. Raw HTML form elements on login page = single largest Shadcn-FIRST violation in scope.
2. Dark-surface color inheritance gap — tokens calibrated for light bg used unmodified on dark shell.
3. Legal pages contextually isolated.

---

### 7. Shared Components

#### `components/ui/**` (Shadcn primitives)
- 63 files total. `spinner.tsx` is extra over the declared 62; verify vs `<Skeleton>`-only standard.
- **Important**: `form-field.tsx` legacy wrapper duplicates `<Field>` system — delete and migrate.
- **Medium**: `status-badge.tsx:247` template-literal class merge instead of `cn()`.

#### `components/admin/**`
- **Important**: two `<PageHeader>` components diverge in prop API (`description` vs `subtitle`) and typography (`text-body` vs `text-sm`). Consolidate.
- **Important**: `deactivate-confirm-dialog.tsx:29` — `"Nonaktifkan"` lacks `"Ya, "` prefix (inconsistent with `void`/`cancel`).

#### `components/portal/**`
- Centralization solid; teacher + parent wrap correctly without inlined copies.
- **Medium**: `portal-header.tsx:88-93` logout = raw `<button>` instead of `<Button>`.

#### `components/attendance/**`
- **Critical**: `calendar.tsx` maintains local `STATUS_COLORS` + `STATUS_TEXT_COLORS` parallel to `StatusBadge`'s `STATUS_MAP`. Uses `"Tidak Hadir"` for ABSENT — diverges from `"Alpa"` canonical.
- **Important**: `override-modal.tsx:93,103,108` raw `<Label>...*</Label>` — use `<FieldLabel required>`.
- **Important**: `override-modal.tsx:88` + `calendar.tsx:79,186` inline `.toLocaleDateString()`.
- **Medium**: `calendar.tsx:94,98` raw `<button>` nav controls.

#### `components/student-journal/**`
- **Important**: `class-day-grid.tsx:126` arbitrary `text-[10px]`.

#### `components/brand/**`
- Single canonical wordmark. Logo asset (`/logo.png`) referenced directly in header + sidebar — not abstracted but consistent.

#### Design-system showcase (`app/admin/design-system/`)
- iframe-based reference rendering. No drift.

#### Duplicates summary
| Pair | Recommendation |
|---|---|
| `admin/page-header.tsx` (`description`) vs `portal/page-header.tsx` (`subtitle`) | Keep portal version. Rename callers. |
| `ui/form-field.tsx` vs `ui/field.tsx` | Delete `form-field.tsx`. |
| `attendance/calendar.tsx` `STATUS_COLORS`/`STATUS_TEXT_COLORS` vs `status-badge.tsx` `STATUS_MAP` | Remove calendar's local maps; import `getStatusConfig()`. |

**Cross-cutting (component library):**
1. Raw `<button>` recurs across portal shell + attendance shared components.
2. Inline `.toLocaleDateString()` in shared attendance components.
3. `form-field.tsx` still callable — perpetuates split.
4. Status label divergence: calendar's `"Tidak Hadir"` blocks `voice.md`-corrected `"Alpa"` from propagating.

---

## What's Decent / Working Well

To balance the punch list:

- **Shadcn-FIRST broadly observed.** Most form inputs, dialogs, tables, badges, toasts use canonical primitives.
- **`<DataTable>` + `<DataTableColumnHeader>` + `<DataTableRowActions>`** used uniformly across all admin list pages.
- **`<StatusBadge>` + `<Field>`/`<FieldLabel>`** adoption consistent in settings + admin core.
- **Indonesian voice** consistent across both admin (neutral imperative) and portals (persona-driven).
- **`toast.success/error`** universal feedback channel; no `alert()` calls.
- **`<EmptyState>`** present on most list pages; contract failures are scattered, not systemic.
- **Portal shell centralization** is good — `PortalHeader`, `PortalBottomNav` consumed without inlined copies.
- **No raw hex literals** (`text-[#…]`, `bg-[#…]`) anywhere in parent portal scope.
- **Branding** single-source (`TalibWordmark`, `/logo.png`).
- **Payment + auth-callback** correctly minimal (server routes).
- **Frontend gate** mechanism (cycle doc must mention `design-system`) is working — drift caught above is well-contained.

---

## Suggested Next Steps

1. **One cleanup cycle covering P0 + P1 token/copy fixes.** Most are mechanical edits — could fit in a single `feat(ui-consistency)` cycle, 1-2 days of work.
2. **Spawn focused tasks for component dedup** (P1): merge `<PageHeader>`, delete `form-field.tsx`, unify status maps. Each is a small, high-value cycle on its own.
3. **Audit `<AlertDialog>` usage** repo-wide to lock destructive-confirm pattern. Add lint rule or `pre-commit` heuristic flagging `<Dialog>` containing words like "tidak bisa diubah" / "permanen".
4. **Decide spec drift for parent bottom-nav** (4 → 5 tabs) and Household Overview threshold (≥3 children). Update `portal.md` or revert UI.
5. **`/uat` runs** on each portal area would catch interaction-level UI issues this static review missed (timings, overlay flow, mobile touch targets). Not a substitute, complementary.

---

**Reviewed by:** 7 parallel `feature-dev:code-reviewer` agents.
**Confidence:** High/medium only (low-confidence nitpicks filtered out at agent level).
**Caveat:** Review is static. Browser-only issues (z-index stacking under real load, focus traps, animation jank, mobile viewport) not in scope.
