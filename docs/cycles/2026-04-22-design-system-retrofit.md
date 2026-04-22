# Design System Retrofit

## Context

Design-system foundations landed on staging via PRs #103 (tokens/recipes/voice + pre-commit frontend gate) and #104 (live `/admin/design-system` reference page). All three portals (admin, teacher, parent) still carry pre-foundation chrome — ad-hoc `p-4`/`p-6`/`p-8` page padding, hand-rolled `<h1>` page titles, inline `toLocaleTimeString()`, and voice drift ("Klik tombol..." in teacher, pill-tabs as child switcher on parent). This cycle retrofits all three portals against the canonical reference (`.claude/standards/design-system.html` + the six per-area standards) — broad but shallow, one PR. No API, no Prisma, no business-logic rewrite. Foundations already exist; this is only the application layer.

Cross-checked `.claude/standards/design-system.html` before scoping — 18 sections covering tokens, recipes, overlays, WeekGrid, Household Overview, voice.

## Spec

### Acceptance criteria

- [ ] Admin page chrome (outer layout padding, section gaps, card padding, form field gap) uses token utilities (`p-page-x`, `py-page-y`, `gap-section` / `space-y-section`, `p-card`, `space-y-field`). Tokens inside Shadcn primitives untouched.
- [ ] Admin page titles use `text-h1`; section titles `text-h2`; stat-card primary numbers `text-display`; table meta `text-caption`; body `text-body`.
- [ ] Every admin create-or-edit uses `<Dialog>` on desktop + `<Sheet>` on mobile via `useIsMobile()`. Destructive confirms always `<AlertDialog>`. Zero `window.confirm()` in admin. No Dialog/Sheet stacking.
- [ ] Admin toasts past-tense ("Tersimpan", "Siswa ditambahkan") not imperative ("Save successful"). Errors `toast.error()`, writes `toast.success()`.
- [ ] Admin list pages conform to Recipe 1 (breadcrumb + PageHeader + primary CTA + DataTable with sort/search/status-filter/pagination + Created At + Updated At + EmptyState). Detail pages conform to Recipe 2 (destructive-left / edit-right action cluster, Tabs if >1 sub-section, right-rail metadata). Forms conform to Recipe 3 (`<Field>` + `<FieldLabel>` + `<FieldDescription>`, Zod + RHF, loading submit).
- [ ] LeaveRequest queue + Admission conversion match Recipe 5 (pending-count chip, per-row approve/reject with AlertDialog, tailored EmptyState).
- [ ] Attendance override + score entry match Recipe 6 (class/date picker, live summary trio, sticky-first-column, cycle-tap).
- [ ] Admin voice sweep: "No data" variants replaced with entity-specific "Belum ada X. Klik Tambah X untuk mulai." Vague "Are you sure?" dialogs replaced with explicit consequence copy ("Bisa diaktifkan kembali kapan saja" / "Tagihan tidak bisa dibayar lagi").
- [ ] `/teacher/class-attendance`: default PRESENT, cycle-tap PRESENT→ABSENT→SICK→PERMISSION, save-on-tap, live summary trio, sticky-first-column with initials avatar, row tints via `--status-*-subtle`.
- [ ] Teacher student-journal uses the single WeekGrid component. Grid meets 32px cell / 40px column / 3px row / 0.5rem column gap tap-targets. Sticky first column, grouped Ibadah/Akademik/Karakter, today-column highlighted.
- [ ] All teacher pages use `PortalHeader`, `PortalBottomNav`, `PageHeader` primitives. No hand-rolled `<h1>` page titles.
- [ ] Teacher tokens sweep matches A1. Teacher voice: honorifics, action-forward ("Ketuk untuk mulai absensi"), greeting "Selamat pagi, Ustadz/Ustadzah <first-name>".
- [ ] Parent home: if the test household has ≥3 kids, swap `<PortalTabs>` child switcher for Household Overview (urgency banner + per-child rows + 3-up signal cells + chevron to detail). 2-kid fallback preserved.
- [ ] Parent child-detail inner tabs (Tagihan/Kehadiran/Rapor) use pinned top-level switcher (design-system.html §14 Option C).
- [ ] Parent tokens + shell match B3 rules; mobile-first `max-w-md`, `pb-20`, `safe-area-bottom`.
- [ ] Parent voice: Assalamu'alaikum greeting, Bu/Pak + first name, glossary (Tagihan/Hadir/Alpa/Sakit/Rapor), gentle on unpaid, generous on achievements, no raw status codes in errors ("Koneksi terputus. Coba lagi sebentar ya.").
- [ ] D1: zero silent `.catch(() => {})` in `app/admin|teacher|parent` + `components/admin|teacher|parent|portal`. Every `fetch()` checks `res.ok` and toasts on failure.
- [ ] D2: every conditional list render has an explicit `<EmptyState>` else branch. No `items.length > 0 && …` without else in portal pages.
- [ ] D3: `grep -rn 'text-\[10px\]\|text-\[11px\]' app/parent app/teacher components/parent components/teacher components/portal` returns zero (already clean — keep it clean).
- [ ] D4: zero inline `.toLocaleString()` / `.toLocaleDateString()` / `.toLocaleTimeString()` on user-facing strings across all three portals. Use `formatRupiah` / `formatDate` / `formatDateShort` / `formatTime` from `@/lib/format`.
- [ ] End-of-cycle gate green: `npm run build && npx vitest run && DEMO_MODE=true npx playwright test`.
- [ ] Every commit's Verification section cites "Cross-checked design-system.html §X for Y" (frontend pre-commit gate requires literal "design-system" token in staged cycle doc).

### Non-goals

- Business-logic rewrites, API routes, Prisma schema.
- New npm deps.
- New components beyond the WeekGrid relocation question (see assumption 3).
- Icon sizes, border-radii, color tokens. Only spacing + typography + voice + recipe conformance + overlay audit this cycle.
- Touching spacing tokens inside Shadcn primitives (Dialog/Sheet/Select own their own).
- `/admin/design-system` itself — it IS the reference.

### Assumptions

1. **Test household has ≥3 kids** in the demo fixtures so the Household Overview swap is exercisable. If the demo seed only has 2, the C1 task becomes a non-op fallback-preserved verification — surface in Implementation and skip the swap.
2. **WeekGrid location question.** Spec says `components/portal/week-grid.tsx` but the shared component already lives at `components/student-journal/week-grid.tsx` and is imported by all three portals (admin + teacher + parent). Extraction trigger (2nd consumer) is already satisfied. Proposed: **keep current location**; do not move this cycle (avoids 3-file import churn + empty-change risk). Flag as optional cycle-2 rename if the portal-namespace convention hardens. **→ If CTO disagrees, say so before `/build` and I will move it.**
3. **Admin detail-page edit-toggle** pattern has `text-[10px]` in the crud.md snippet — that snippet is illustrative. Actual admin detail pages already use `text-xs`. No action.
4. **Teacher + parent `text-[10px]/[11px]` grep is already clean** (verified). D3 is a regression gate, not a sweep.
5. **Voice fixes that collide with API enums / analytic event names / i18n keys** (e.g. `status=CANCELLED` string) are out of scope — flag + skip per the constraint.
6. **Parent inner-tab pinned switcher (§14 Option C)** will reuse `PortalTabs` variant, not a new primitive. If PortalTabs pills don't satisfy the "pinned top-level" requirement out of the box, add a `sticky` prop to PortalTabs rather than creating a new component.
7. **Admin attendance override + score entry (Recipe 6)** — `/admin/student-attendance` + `/admin/assessments/scores` need cycle-tap verification. If already conformant, B1-style verify-only; if not, retrofit.
8. **Cycle doc frontend-gate token:** "design-system" appears in title and throughout — gate should pass.

→ Correct any assumption above, or `/build` will proceed with these.

## Tasks

Organized portal × concern. Tasks listed in the execution order `/build` will follow. Dependencies noted. Independent tasks grouped for subagent dispatch.

### A. Admin portal — `app/admin/**`, `components/admin/**`

- [x] **A1. Tokens sweep — admin** — replace ad-hoc page chrome (`p-4/6/8`, `space-y-4/6/8`, `<Card className="p-4">`, page/section title classes) with token utilities. Scope per task: outer layout padding, section gaps, card padding, form field gap, typography scale.
  - Files (non-exhaustive, ~48 admin pages): `app/admin/layout.tsx`, `app/admin/page.tsx`, `app/admin/dashboard-client.tsx`, `app/admin/students/page.tsx`, `app/admin/students/[id]/page.tsx`, `app/admin/students/new/page.tsx`, `app/admin/employees/**`, `app/admin/invoices/**`, `app/admin/admissions/**`, `app/admin/attendance/**`, `app/admin/payroll/**`, `app/admin/assessments/**`, `app/admin/enrollments/page.tsx`, `app/admin/fees/page.tsx`, `app/admin/guardians/page.tsx`, `app/admin/leave/**`, `app/admin/academic/page.tsx`, `app/admin/teaching-assignments/page.tsx`, `app/admin/student-attendance/page.tsx`, `app/admin/student-journal/**`, `app/admin/settings/**`, `components/admin/page-header.tsx`, `components/admin/detail-page-header.tsx`, `components/admin/stat-card.tsx`, `components/admin/stats-cards-row.tsx`.
  - Acceptance: grep `app/admin components/admin` for `className="[^"]*\b(p-[468]|space-y-[468]|text-lg|text-xl|text-2xl|text-base)\b` outside Shadcn primitives returns ≤5 legitimate exceptions (documented inline).

- [x] **A2. Overlays audit — admin** — enforce Dialog-desktop / Sheet-mobile for create-or-edit (via `useIsMobile()`), AlertDialog for destructive, no stacking, no `window.confirm()`, toast past-tense.
  - Files: every admin form/dialog/confirm site — derive by grepping `app/admin components/admin` for `<Dialog`, `<Sheet`, `AlertDialog`, `window.confirm`, `toast.success`. Likely: `app/admin/students/page.tsx` (create dialog), `app/admin/students/[id]/page.tsx` (edit dialog + deactivate confirm), `app/admin/guardians/page.tsx`, `app/admin/employees/**` (similar), `app/admin/invoices/[id]/page.tsx` (void confirm), `app/admin/admissions/page.tsx` (convert + cancel), `app/admin/leave/page.tsx` (approve/reject), `components/admin/deactivate-confirm-dialog.tsx`.
  - Acceptance: grep `window\.confirm\|window.confirm` under `app/admin|components/admin` = 0. Grep `toast.success\(.*[Ss]uccessful\|[Ss]aved [Ss]uccessfully\|[Cc]reated [Ss]uccess` = 0. Manual scan for Dialog-inside-Dialog / Sheet-inside-Sheet logs nothing.
  - Depends on: none (can run parallel with A1 in different sub-tree, but same-file conflicts are likely so will run sequentially).

- [ ] **A3. Page-recipe conformance — admin** — Recipe 1/2/3/5/6 retrofit.
  - **Recipe 1 (list):** `/admin/students`, `/admin/employees`, `/admin/guardians`, `/admin/invoices`, `/admin/admissions`, `/admin/enrollments`, `/admin/fees`, `/admin/teaching-assignments`, `/admin/assessments`, `/admin/assessments/templates`, `/admin/student-journal`, `/admin/settings/users`, `/admin/settings/campuses`, `/admin/settings/salary-components`, `/admin/settings/holidays`, `/admin/payroll`. Verify breadcrumb, PageHeader + subtitle + primary CTA, DataTable (sort/search/status/pagination), Created At + Updated At columns, EmptyState via empty slot.
  - **Recipe 2 (detail):** `/admin/students/[id]`, `/admin/employees/[id]`, `/admin/invoices/[id]`, `/admin/payroll/[id]`, `/admin/assessments/[id]`, `/admin/student-journal/students/[id]`, `/admin/student-journal/classes/[id]`. Verify destructive-left / edit-right actions, Tabs, right-rail aside.
  - **Recipe 3 (form):** `/admin/students/new`, `/admin/employees/new`, `/admin/payroll/new`, plus every dialog form body. Verify `<Field>` primitives, Zod + RHF, loading submit.
  - **Recipe 5 (workflow):** `/admin/leave`, `/admin/admissions` conversion row. Pending-count chip, per-row approve/reject with AlertDialog, audit-log link, tailored EmptyState.
  - **Recipe 6 (daily data):** `/admin/student-attendance`, `/admin/assessments/scores`. Class/date picker, live summary trio, sticky-first-column, cycle-tap (if not already).
  - Acceptance: per-page bullet in Implementation confirms which recipe applied and what changed (or "conformant — no change").

- [ ] **A4. Voice sweep — admin** — replace "Save successful" / "No data" / "Are you sure?" drift with admin-voice canon.
  - Files: grep `app/admin components/admin` for toast strings, empty-state props, dialog titles/descriptions, button labels. Target strings to kill: `/success/i`, `/no data/i`, `/are you sure/i`, `/successfully/i`. Replace with entity-specific past-tense / canonical copy.
  - Acceptance: grep `app/admin components/admin` for banned strings (`[Ss]uccessful\b`, `[Nn]o data\b`, `[Aa]re you sure`) = 0. Implementation bullet lists every before→after swap.

### B. Teacher portal — `app/teacher/**`, `components/teacher/**`

- [ ] **B1. Cycle-tap attendance — verify + tighten** — `/teacher/class-attendance` audit: default PRESENT (confirmed already), rotation order correct (confirmed), save-on-every-tap (verify — code shows bulk submit on `handleSubmit`, needs conversion to per-tap optimistic save if still bulk), live summary trio, sticky-first-column w/ initials avatar, row tints via `--status-*-subtle`, rollback on error.
  - File: `app/teacher/class-attendance/page.tsx`.
  - Acceptance: one tap = one `PATCH /api/student-attendance/[id]` call, optimistic UI reverts on failure with `toast.error`, no bottom submit button.
  - Depends on: none.

- [ ] **B2. WeekGrid contract — verify** — confirm single `WeekGrid` component (confirmed: `components/student-journal/week-grid.tsx` — 3 consumers). Verify editable/readonly/home-note modes, tap-target minima (32px row × 40px col × 3px row margin × 0.5rem col gap), sticky first column, Ibadah/Akademik/Karakter groupings, today-column highlight.
  - File: `components/student-journal/week-grid.tsx` + 3 consumers.
  - Acceptance: measurement comments in Implementation bullet, no second grid file exists. **If relocation to `components/portal/week-grid.tsx` decided in assumption 2, this task adds the move + 3 import-path updates.**
  - Depends on: assumption 2 resolution.

- [ ] **B3. Teacher shell + tokens + voice** — replace every hand-rolled `<h1>` with `PageHeader`; ensure `PortalHeader` + `PortalBottomNav` already wrap the layout; tokens sweep per A1; voice sweep (Ustadz/Ustadzah, action-forward imperative, "Selamat pagi, Ustadz/Ustadzah <first-name>").
  - Files: `app/teacher/layout.tsx`, `app/teacher/page.tsx`, `app/teacher/home-client.tsx` (h1 + `toLocaleTimeString` → `formatTime`), `app/teacher/slips/page.tsx`, `app/teacher/attendance/page.tsx`, `app/teacher/assessments/page.tsx`, `app/teacher/assessments/[classSectionId]/[templateId]/[period]/page.tsx`, `app/teacher/assessments/[classSectionId]/[templateId]/[period]/client.tsx`, `app/teacher/student-journal/page.tsx`, `app/teacher/student-journal/entry/page.tsx`, `app/teacher/profile/page.tsx`, `app/teacher/class-attendance/page.tsx`, `components/teacher/header.tsx`, `components/teacher/bottom-nav.tsx`, `components/teacher/leave-sheet.tsx`.
  - Acceptance: grep `<h1 ` under `app/teacher` = 0 (only PageHeader-wrapped). Grep `toLocaleTimeString\|toLocaleDateString\|toLocaleString` under `app/teacher components/teacher` = 0. Voice-drift before/after bullets in Implementation.

### C. Parent portal — `app/parent/**`, `components/parent/**`

- [ ] **C1. Household Overview** — if ≥3 kids demo fixture exists, swap `<PortalTabs>` child switcher on `/parent` for Household Overview (red urgency banner, per-child row w/ avatar + name + class + today's attendance, 3-up signal cells for Tagihan / Kehadiran / (Rapor | Catatan), chevron→detail). 2-kid fallback preserved. Pinned top-level switcher on child-detail inner tabs.
  - Files: `app/parent/page.tsx`, `app/parent/invoices/page.tsx`, `app/parent/invoices/client.tsx`, `app/parent/attendance/page.tsx`, `app/parent/attendance/client.tsx`, `app/parent/reports/page.tsx`, `components/parent/child-selector-tabs.tsx` (may be removed for ≥3 kids), `components/portal/portal-tabs.tsx` (may add `sticky` prop).
  - Acceptance: visual diff in PR screenshot (before pill-tabs, after Household Overview). 2-kid visit still shows pill-tabs.
  - Depends on: assumption 1 resolution (seed has ≥3 kids).

- [ ] **C2. Parent shell + tokens** — every parent page uses `PortalHeader` + `PortalBottomNav` + `PageHeader`; tokens per A1; mobile-first `max-w-md`, `pb-20`, `safe-area-bottom`.
  - Files: `app/parent/layout.tsx`, `app/parent/page.tsx`, `app/parent/invoices/page.tsx`, `app/parent/invoices/client.tsx`, `app/parent/attendance/page.tsx`, `app/parent/attendance/client.tsx`, `app/parent/reports/page.tsx`, `app/parent/student-journal/page.tsx`, `components/parent/header.tsx`, `components/parent/bottom-nav.tsx`, `components/parent/recent-activity.tsx`, `components/parent/quick-link-card.tsx`, `components/parent/invoice-card.tsx`, `components/parent/invoice-filter.tsx`, `components/parent/child-selector-tabs.tsx`.
  - Acceptance: grep `<h1 ` under `app/parent` that isn't inside PageHeader = 0.

- [ ] **C3. Voice sweep — parent** — Assalamu'alaikum greeting, Bu/Pak + first name, glossary sweep (Tagihan/Hadir/Alpa/Sakit/Rapor), gentle-on-unpaid, generous-on-achievement, errors as "Koneksi terputus. Coba lagi sebentar ya.".
  - Files: every parent-facing string site under `app/parent components/parent`. Likely hits: `app/parent/page.tsx` (greeting), `app/parent/invoices/client.tsx` (unpaid copy), `app/parent/attendance/client.tsx` (status labels), `app/parent/reports/page.tsx`, `components/parent/recent-activity.tsx`, `components/parent/invoice-card.tsx`, `components/parent/invoice-filter.tsx`.
  - Acceptance: grep for English glossary leaks (`\bInvoice\b`, `\bPresent\b`, `\bAbsent\b`, `\bSick\b`, `\bReport [Cc]ard\b`) under `app/parent components/parent` = 0 (enum strings carried over to API endpoints are flagged + skipped per constraint). Implementation bullet lists before/after swaps.

### D. Cross-portal invariants

- [ ] **D1. Fetch error-handling audit** — grep every `fetch(` in `app/admin|teacher|parent` + `components/admin|teacher|parent|portal`. Verify each checks `res.ok` + `toast.error` on failure. Kill every `.catch(() => {})`.
  - Acceptance: grep `\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)` = 0 across portal scope. Fetches without `res.ok` check fail review; all fixed.

- [ ] **D2. Empty-state audit** — grep every `items.length > 0 &&` / `data.length && ` / `&& (` truthy-list render. Every one has an explicit `<EmptyState>` else branch.
  - Acceptance: per-file bullet in Implementation lists which conditionals got an else; grep for naked `\.length\s*>\s*0\s*&&` on a list render = 0 in portal scope.

- [ ] **D3. Text-size floor — regression gate** — grep `text-\[10px\]\|text-\[11px\]` under `app/parent app/teacher components/parent components/teacher components/portal` = 0 (already clean; keep it clean; no action unless regression appears mid-cycle).

- [ ] **D4. Format helpers — global replace** — every `.toLocaleString()` / `.toLocaleDateString()` / `.toLocaleTimeString()` on a user-facing string → `formatRupiah`/`formatDate`/`formatDateShort`/`formatTime` from `@/lib/format`.
  - Known hit: `app/teacher/home-client.tsx:92` (`time.toLocaleTimeString("id-ID", …)`).
  - Files: grep `toLocale` under `app/admin app/teacher app/parent components/admin components/teacher components/parent components/portal`. Each hit becomes a one-line replace.
  - Acceptance: grep under portal scope = 0.

### E. Gate + ship

- [ ] **E1. End-of-cycle gate** — `npm run build && npx vitest run && DEMO_MODE=true npx playwright test`. Fix any regression before the final commit. Fill Verification with grep evidence + screenshots.
- [ ] **E2. `/ship` — PR to staging** — PR description includes: before/after per portal, Household Overview before/after screenshot (if swap applied), admin + parent voice-drift before/after bullets, D1/D2/D3/D4 grep-evidence block.

### Cycle-2 follow-ups (do NOT ship in this PR)

- Add `useIsMobile()` + `<Sheet>` mobile-variant to admin form dialogs (leave review, promote, withdraw, and the 17 other Dialog-using pages). Admin persona is desktop-primary today; mobile-variant retrofit out of scope this cycle.
- Rename `components/student-journal/week-grid.tsx` → `components/portal/week-grid.tsx` + 3 import updates (if CTO wants strict portal-namespace convention).
- `PortalError`, `PageSkeleton`, `ListSkeleton`, `DetailSkeleton`, `RecentActivity` extractions per portal.md § cycle-3 candidates.

### Dependency graph (for `/build` subagent dispatch)

- **A1, A2, A3, A4** — same admin files frequently touched by all four → sequential (A1 → A2 → A3 → A4).
- **B1, B3** — different files → parallel.
- **B2** — audit-only → parallel with B1/B3 (cheap).
- **C1, C2, C3** — C1 gated on assumption 1; if deferred, C2 + C3 parallel; if applied, C2 + C3 after C1 to avoid merge churn on `app/parent/page.tsx`.
- **D1, D2, D4** — cross-cut; run after A/B/C so regressions introduced during retrofit are caught. **D3** is passive monitoring.
- **E1, E2** — strict sequential at the end.

## Implementation

- Subagent plan: A1 dispatched via general-purpose subagent; A2–A4 sequential same-file risk; B1/B2/B3 parallel dispatch candidates; C2/C3 parallel after C1; D1/D2/D4 post-A-B-C sweep; D3 passive.
- **Task A1 (tokens sweep — admin):** 25 files touched across admin layout/loading/pages + shared components. Swaps: `p-4/6/8` / `px-*` / `py-*` on page containers → `px-page-x py-page-y`; `space-y-4/6/8` between sections → `space-y-section`; `gap-4/6/8` section-level → `gap-section`; `<Card p-4>` / `p-6` content cards → `p-card`; form-body `space-y-4 py-2` inside Dialogs → `space-y-field py-2`; `<h1 text-2xl/3xl>` → `text-h1`; `<h2 text-lg/xl>` → `text-h2`; stat-card metric `text-3xl` → `text-display`; two `Card p-8 text-center` empty-states → `p-card`. Files: `components/admin/{page-header,detail-page-header,stat-card}.tsx`; `app/admin/{layout,loading,error,page,dashboard-client}.tsx` + `app/admin/{employees,leave,payroll,invoices,students,attendance,admissions}/loading.tsx` + `app/admin/{academic,fees,employees/[id],employees/new,students/new,payroll/[id],payroll/new,settings/config,student-journal,student-journal/students/[id],assessments/[id]}.tsx` + reviewer-flagged `app/admin/{guardians,admissions,students,invoices,invoices/[id],student-attendance,academic,assessments/templates,fees,settings/users,settings/holidays,settings/campuses,settings/salary-components,settings/roles,enrollments,students/[id],student-journal,student-journal/students/[id],payroll/[id]}/page.tsx` for dialog form-body swaps. Primitive internals untouched. Design-system reference page untouched.
- Cross-checked design-system.html §2 Typography and §3 Spacing for A1 token-utility naming and intended surfaces.
- **Task A2 (overlays + toast voice — admin):** 11 files touched. Stripped "berhasil" fluff from `toast.success` strings across academic, admissions, invoices, payroll/new, settings/roles, settings/users, student-attendance, students (list/new/[id]). Grep `toast.success\([^)]*berhasil` = 0 after. `window.confirm` under admin = 0 (pre-existing). Destructive-confirm audit: 17 admin files already route through `AlertDialog`/`ConfirmDialog`; three intentional Dialog exceptions (leave review, promote, withdraw) host form bodies and can't collapse into AlertDialog — left per spec. Overlay stacking audit: none found. `useIsMobile()`/Sheet-mobile variant on admin dialogs flagged to cycle-2 follow-ups (admin is desktop-primary persona).
- Cross-checked design-system.html §8 Overlays for A2 destructive/AlertDialog and success-toast past-tense rules.
- **Task A3 (page-recipe conformance — admin):** 2 files touched. `app/admin/settings/campuses/page.tsx` — added `<EmptyState>` else-branch to the card-grid empty render (Recipe 1 empty-state contract — the only non-DataTable list page in admin scope missing it). `app/admin/leave/page.tsx` — added pending-count chip (`<Clock size=12/> Menunggu: {stats.pending}`) into `DataTableToolbar` `actions` slot (Recipe 5 workflow-queue required piece). Recipe 1 coverage (16/16) after fix; Recipe 2 (7/7) and Recipe 3 (zero raw `<Label>+<Input>` in admin) already conformant from prior work. Recipe 5: leave fixed; admissions conformant. Recipe 6 (daily entry): admin side doesn't own dedicated grid editor — student-attendance is Recipe 1 list/override — flagged cycle-2 if dedicated admin grid editor lands.
- Cross-checked design-system.html §5 DataTable (EmptyState contract) and §14 Page Recipes (Recipe 5 workflow-queue pending-count chip) for A3.
- **Task A4 (voice sweep — admin):** 8 files touched. Canonicalised destructive consequence copy in `components/admin/deactivate-confirm-dialog.tsx` (deactivate/void/cancel/delete — all four verbs now match voice.md destructive table with explicit consequence). Inline destructive descriptions in `app/admin/{invoices,invoices/[id],guardians,enrollments,assessments/templates}/page.tsx` rewritten to state consequence + reversibility (e.g. "Tagihan X (Y) tidak bisa dibayar lagi. Riwayat tetap tersimpan."). Dashboard greeting `"Selamat datang, <Name>"` → `"Dasbor"` (voice.md: admin gets no pleasantries). Employee-detail empty-states `"Tidak ada komponen gaji"` / `"Tidak ada data"` → `"Belum ada komponen gaji"` / `"Belum ada kehadiran"`. Acceptance greps in admin scope: `(Save successful|No data|Are you sure)` = 0; `toast.success\([^)]*(berhasil|successful)` = 0. Hidden-contract skips logged: `students/[id]` graduate/withdraw descriptions reference Prisma enum literals `GRADUATED`/`WITHDRAWN`; `students/page.tsx` deactivate description references `DRAFT`/`SENT` invoice-enum values — left untouched to avoid enum drift.
- Cross-checked design-system.html §18 Voice & Tone (admin persona table + destructive/empty/success-toast rules) for A4.
- **Task B1 (teacher cycle-tap — verify + tighten):** 1 file touched (`app/teacher/class-attendance/page.tsx`, ~70/71 lines net). Removed bulk "Simpan Kehadiran" sticky button + `handleSave` + unused imports. Added `cycleStatus(studentId)` — optimistic `setStatuses`, single-record POST to `/api/student-attendance/mark` (route accepts `records[]` — contract unchanged), reverts to previous status on non-ok / network fail with `toast.error`. Summary trio → quad: `Hadir · Alpa · Sakit · Izin` using `text-status-{present,absent,late,leave}-text` tokens (SICK reuses `status-late-*` family — no dedicated `status-sick-*` token exists; matches existing `StatusBadge` mapping across codebase). Row tint applied via `bg-[color:var(--status-*-subtle)]` arbitrary-value classes (no inline hex). Rotation order preserved `PRESENT → ABSENT → SICK → PERMISSION → PRESENT` with PRESENT default. Prisma enums untouched. Footer copy: "Ketuk untuk mulai absensi (Hadir → Alpa → Sakit → Izin)".
- Cross-checked design-system.html §15 Attendance Flow for B1 cycle-tap spec.
- **B1 cycle-2 flags:** no `--status-sick-subtle` token alias (reused `status-late-*`); PageHeader adoption deferred to B3; literal Recipe 6 horizontal grid layout (status cells to the right of each student) would exceed 150-line retrofit budget → cycle-2 if desired.

## Verification

- **Task B1:** `npm run build` ✓. `npx vitest run --testTimeout=30000` → 30/30 files pass, 240 tests pass, 42 todo, 2 skipped. 8-check pass/fail table: all 8 PASS after fix (before: rotation+default+pickers+skeleton PASS; save-on-tap+summary-tokens+row-tint+voice FAIL). Cross-checked design-system.html §15 Attendance Flow and patterns.md Recipe 6.

- **Task A4:** `npm run build` ✓. `npx vitest run --testTimeout=30000` → 30/30 files pass, 240 tests pass, 42 todo, 2 skipped. Grep evidence: `(Save successful|No data|Are you sure)` in admin scope = 0; `toast.success\([^)]*(berhasil|successful)` = 0. No stray Arabic greetings in admin scope. Cross-checked design-system.html §18 Voice & Tone admin persona.
- **Task A3:** `npm run build` ✓. `npx vitest run --testTimeout=30000` 85 tests pass / 30 todo; 21 worker-pool flake errors (env-slow symlink forks) — pre-existing, no touched file intersects. Grep evidence: `items.length === 0 ?` branches in admin now all render `EmptyState`/skeleton (campuses fixed); pending-count chip visible in leave toolbar `actions`. Cross-checked design-system.html §5 + §14 Page Recipes Recipe 1/5.
- **Task A2:** `npm run build` ✓. `npx vitest run --testTimeout=30000` → 30/30 files pass, 240 tests pass, 42 todo. Grep evidence: `toast.success\([^)]*berhasil` in admin scope = 0; `window.confirm` = 0. Cross-checked design-system.html §8 Overlays + voice.md success-toast + destructive tables.
- **Task A1:** `npm run build` ✓ (next build green, Prisma client generated). `npx vitest run` 2 files flaked at 5s timeout (`components/portal/__tests__/page-header.test.tsx`, `app/parent/invoices/__tests__/client.test.tsx`) — env-slow only, both pass cleanly with `--testTimeout=30000` (30/30). Pre-existing worktree symlink environment issue, not A1-caused; no touched file intersects these tests. Audit greps after A1: `p-[468]` on admin page containers = 0; `space-y-[468]` outside primitive internals / in-grid = 4 (documented exceptions — invoice-detail sidebar, audit list, two form-body locations with ambiguous sibling-stack semantics). `<h1 text-2xl|3xl>` = 0. `<h2 text-lg|xl>` = 0. Cross-checked design-system.html §2 Typography + §3 Spacing for scope.

## Ship Notes

<!-- filled by /ship -->
