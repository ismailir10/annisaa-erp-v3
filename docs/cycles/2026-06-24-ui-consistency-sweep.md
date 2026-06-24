# UI Consistency Sweep — Cross-Module Audit Remediation

## Context

A nine-subagent static audit (one per domain module: `core`, `hr`, `academic`, `students`, `finance`, `learning`, `student-journal`, `curriculum`, `reportCard`) compared every portal surface against `.claude/standards/{design-system.html,ui.md,patterns.md,portal.md,voice.md,colors.md,crud.md,security.md}` and surfaced **112 findings** (11 blocker · 53 major · 48 minor). The codebase's load-bearing chrome (admin shell, settings CRUD, DataTable usage, status badges, soft-delete confirm patterns) is largely on-standard — issues cluster around (a) a handful of cross-cutting patterns where 3+ modules drifted the same way, (b) three module-specific structural gaps (student-journal audit trail + author visibility, teacher per-tap optimistic save, reportCard PDF formality), and (c) two public surfaces that bypass the brand system entirely (`/daftar`, login).

The cross-cutting drift is the highest leverage: a single shared helper or token fix collapses 5-10 sibling findings at once. The structural gaps carry real user harm (lost teacher input on navigate-away, anonymous journal notes, parents reading *Perlu Penguatan* in praise-teal on a raport). The public-surface outliers are brand-integrity issues — a prospective parent's first impression (`/daftar`) is a different visual identity than the one they receive after enrollment.

This cycle remediates the audit. **Verification of every fix will be done via Chrome MCP on staging against the three real role sessions (admin/teacher/parent) before any task is marked complete** — the static audit is the input, the live walk is the gate. No ` bullshit` (unverified findings) should reach `/build`.

Out of scope (deferred to later cycles): the legacy AssessmentTemplate 4-level scoring UI (`app/teacher/assessments/[classSectionId]/[templateId]/[period]`) — already orphaned from nav, being retired by the curriculum cutover. Any new feature work — this cycle is remediation only.

## Spec

### Acceptance criteria

- [ ] **Brand integrity**: `/daftar` and `/login` render in the canonical brand system (teal `--primary`, `TalibWordmark`, Shadcn primitives). Zero `emerald-*`, `rose-*`, or hardcoded `#0C5C3F`/`#f4f6f3` in `app/daftar/**` or `app/page.tsx`. Verified live on staging `/daftar` (public) + `/` (login).
- [ ] **Token consolidation**: `--destructive` agrees with `colors.md`; `STATUS_MAP` covers `INCOME`/`DEDUCTION`; `lib/pdf/brand-tokens.ts` exists and is consumed by all three PDF renderers (`invoice-receipt`, `salary-slip`, `report-card`).
- [ ] **3-level skala consistency**: A single `lib/curriculum/level-presentation.ts` exports `LEVEL_LABEL_*` + `LEVEL_CHIP_CLASS` + `LEVEL_HEX`. All five screen surfaces (walas weekly, sentra center, parent home rollup, parent perkembangan, parent element-progress-row) AND both reportCard surfaces (parent drawer, admin editor chip) AND the raport PDF chip consume it. `NEEDS_REINFORCEMENT` renders info-leave (not absent-red, not praise-teal) on every surface. Verified live across `/teacher/assessments/*`, `/parent/perkembangan/[id]`, `/parent/reports`, `/parent/report-cards-list`, admin raport editor, sample raport PDF.
- [ ] **Destructive = AlertDialog, everywhere**: student Withdraw, raport unpublish, fee-component dropdown deactivate, academic-year activate (with sibling-demote consequence disclosed), academic roll-forward, leave-request reject button uses `variant="destructive"`. Zero destructive flows confirmed via grep + live click-through.
- [ ] **Recipe 6 (per-tap optimistic save)**: `/teacher/sessions/[id]`, `/teacher/assessments/center/[center]`, `/teacher/student-journal/entry` — bottom Save buttons removed, every tap POSTs immediately with optimistic UI + `toast.error` revert. Live test: tap → browser back → reload → state persisted.
- [ ] **Shadcn-first sweep**: zero hand-rolled progress bars (leave-sheet, BatchProgressCard, CompletionBar → `<Progress>`); zero bespoke admin lists (penilaian, raport roster → `<DataTable>`); zero plain-text "Memuat…" loading (curriculum themes/objectives → `<Skeleton>`); zero `<Loader2>` full-roster spinners (sentra).
- [ ] **Empty State Contract**: every conditional list render has a visible else branch via `<EmptyState>` (attendance-trend chart, WeekGrid empty, parent-attendance notes section, curriculum empty states).
- [ ] **Error handling**: zero `console.log`/`console.error` silent catches on user-facing fetches; every `fetchJson` checks `r.ok` and surfaces `toast.error` on failure (attendance prefetch, employees stats, payroll stats/compare, curriculum list fetches).
- [ ] **Hardcoded palette eliminated**: zero `bg-amber-*`/`text-amber-*`/`border-green-*`/`bg-blue-*`/`bg-red-*` literals in admin/portal surfaces — all routed through `bg-status-*-subtle`/`text-status-*-text` tokens (HEALTH_TONE, sibling-detect banner, KategoriIndikatorBuilder lockNotice, week-grid admin-edit, archived-year banner).
- [ ] **Banned portal sizes + inline styles eliminated**: zero `text-[10px]`/`text-[11px]` in `app/teacher/**`+`app/parent/**`+`components/{teacher,parent,student-journal,portal,attendance}/**`; zero inline `style={{ var(--celebration-gold-*) }}` (parent attendance, parent report-cards-list).
- [ ] **student-journal audit trail + author visibility**: audit tab renders actor name (not UUID); notes across all three portals show author avatar + name + role badge + createdAt timestamp; consolidated on shared `<NoteThread>`; admin "Simpan Perubahan" placebo removed.
- [ ] **reportCard formality**: PDF has letterhead (logo + school name + address + NPSN), *Tempat, tanggal* line, signature block with teacher + principal names + NIP, multi-page header/footer with page numbers. Sticky editor action bar. `CreateTermCard` migrated to `ResponsiveFormDialog`. Live PDF download verified on staging.
- [ ] **Voice + token sweep**: "Inquiry"→"Pertanyaan" (dashboard); "Cubit"→"Ketuk" (walas weekly footer); "WA:"→"WhatsApp" (invoice detail); raw Unicode arrows → lucide (employee attendance detail); `mb-8`→`space-y-section` (academic-years); `gap-3`→`gap-field` (GuardianFormBody, AdmissionFormBody); `text-sm`/`text-xs`→typography tokens (academic module sweep — *deferred per ui.md retrofit note; only high-traffic pages*).
- [ ] **Date timezone correctness**: class-attendance date init uses `getTodayInTimezone("Asia/Jakarta")`; WeekGrid `todayYmd` accepts prop or uses tz helper.
- [ ] **Dead code removed**: `app/parent/unpaid-invoices-table.tsx`, `components/parent/invoice-card.tsx`, `components/parent/invoice-filter.tsx` deleted (zero consumers).
- [ ] **All gates green**: `npm run build && npx vitest run && npx playwright test` pass; new e2e specs added for skala consistency + journal author visibility + per-tap optimistic save revert; `/audit-docs` zero `fail`.

### Non-goals

- **No new features.** This is remediation of audit findings only. If a finding implies product change (e.g. *"split banner tone into sick/absent/permission"* — keep scope to copy branch fix, not new API), narrow to the cosmetic fix.
- **No `text-sm`→`text-body` global retrofit.** `ui.md` explicitly defers typography-token retrofit to a follow-up cycle. Only high-traffic pages touched where a sibling finding already lands.
- **Legacy AssessmentTemplate UI** (`app/teacher/assessments/[classSectionId]/[templateId]/[period]`) — orphaned from nav, being retired. Skip.
- **PDF brand-token centralization for `salary-slip.tsx`** is in scope (shared `brand-tokens.ts`), but no redesign of the salary slip layout.
- **Raport Pembelajaran theme showcase (`PERFORMANCE_SHOWCASE`)** — keep current pooling logic; only fix chip color + section rendering.
- **Bilingual / English surfaces** — out of scope; product is Indonesian-only.
- **Performance optimizations** unrelated to a finding.

### Assumptions

1. **The 9 audit reports at `/var/folders/.../T/opencode/ui-audit/*.md` are accurate in their file:line citations.** Every fix task must re-verify the cited line still exists before editing — the audit was conducted against the current `staging` HEAD; if a cited line has moved, grep for the pattern, don't blindly apply.
2. **Voice/tone calls in the audit are correct.** Specifically: `NEEDS_REINFORCEMENT` = info (not red, not praise-teal); Ibu Nur raport copy is warm + honest; journal notes are an intimate touchpoint requiring author attribution. If user disagrees with any of these voice calls, raise before T2/T8/T19.
3. **`STATUS_MAP` extension is additive-safe.** Adding `INCOME`/`DEDUCTION` keys to `components/ui/status-badge.tsx` won't collide with existing usage. Verify via grep before merge.
4. **No backend schema migration needed.** `student-journal` author/audit fixes are pure Prisma `include` additions + UI — `User.name` already exists on the joined relation. If any join reveals a NULL `name`, surface as a finding during T19 (don't silently fall back).
5. **`useBeforeUnloadWhileRunning` hook (already in `components/admin/invoices/batch-progress-card.tsx`) is reusable** for the new per-tap optimistic save revert guards. Confirm export shape before extracting.
6. **`getTodayInTimezone` is the canonical tz helper** — already used in admin student-attendance + walas/sentra; safe to import in class-attendance + week-grid.
7. **The Chrome MCP verify pass will use real Google OAuth sessions** for `ismailir10@gmail.com` (admin), `ismail10rabbanii@gmail.com` (teacher), `rightjet.hq@gmail.com` (parent). If any session is not pre-authenticated in the user's Chrome profile, verification of that portal blocks — surface immediately.
8. **Audit classified severity conservatively.** A `major` may turn out to be `minor` (or vice versa) after live verification — reclassify during the verify pass before committing the fix.

## Tasks

Tasks are grouped by leverage. Dependencies marked with `depends on:`. `/build` dispatches independent tasks (different file trees) to parallel subagents; sequential dependencies stay on the main thread.

### Foundation — shared helpers (must land first)

- [ ] **T1 — Consolidate color + status-token layer** · `depends on: none`
  - Files: `app/globals.css` (`--destructive` → `#FF3B3B` per `colors.md`), `components/ui/status-badge.tsx` (extend `STATUS_MAP` with `INCOME` → present-green, `DEDUCTION` → absent-red; export `healthTone()` helper), `lib/pdf/brand-tokens.ts` (new — `TEAL/DARK/MUTED_FOREGROUND/BORDER/LIGHT_BG` referenced from `design-system.html` brand table), `lib/pdf/{invoice-receipt,salary-slip,report-card}.tsx` (consume brand-tokens).
  - Acceptance: `npm run build` passes; grep `#E63946` returns 0 in `app/globals.css`; all three PDFs import from `lib/pdf/brand-tokens`.
  - Scope note: this is the dependency root for T14 (palette sweep) + T15 (inline styles) + the reportCard/learning skala work in T2.

- [ ] **T2 — Extract `lib/curriculum/level-presentation.ts` (3-level skala single source)** · `depends on: T1`
  - Files: `lib/curriculum/level-presentation.ts` (new — exports `LEVEL_LABEL_SHORT` with `EMERGING="Belum Mampu"`, `LEVEL_LABEL_LONG`, `LEVEL_CHIP_CLASS` using `bg-status-present-subtle`/`bg-status-late`/`bg-status-leave` (info, NOT absent-red, NOT teal), `LEVEL_HEX` for PDF), consumers: `app/teacher/assessments/{weekly,center/[center]}/client.tsx`, `app/parent/{page,perkembangan/[studentId]/page}.tsx`, `components/parent/element-progress-row.tsx`, `app/parent/report-cards-list.tsx`, `app/admin/raport/raport-editor.tsx`, `lib/pdf/report-card.tsx`.
  - Acceptance: grep `LEVEL_LABEL\s*=` and `LEVEL_BG\s*=` returns 0 outside `lib/curriculum/level-presentation.ts`; live check on `/teacher/assessments/weekly` + `/parent/reports` shows `Perlu Penguatan` in info-blue, not red, not teal.
  - **Voice call baked in**: `NEEDS_REINFORCEMENT` = info-blue. Confirm with user before this lands if there's disagreement.

### Public surfaces (brand integrity)

- [ ] **T3 — Re-skin `/daftar` to brand system** · `depends on: T1`
  - Files: `app/daftar/{page,client.tsx}` — replace `bg-[#f4f6f3]`/`[#0C5C3F]`/every `emerald-*`/`rose-*` with `bg-background`/`text-primary`/`border-border`/`text-destructive`; replace bespoke `"T"` logo block with `<TalibWordmark size="md" showSublabel />`; replace hand-built `<ol>` Stepper with Shadcn `<Progress>` + visible step labels on mobile.
  - Acceptance: live on staging `/daftar` — visual matches login page brand frame; mobile viewport shows step labels (1/2/3 visible); form submits successfully end-to-end.
  - **Covers**: core blocker #1 + students blocker #2.

- [ ] **T4 — Login page a11y + Shadcn retrofit** · `depends on: none`
  - Files: `app/page.tsx` — wrap email input in `<Field><FieldLabel htmlFor="email">Email</FieldLabel><Input id="email" .../></Field>`; convert Google/Magic-link/demo-account `<button>`/`<motion.button>` to `<Button>` (preserve Google SVG via children); add `<TalibWordmark tone="onDark">` variant (or wrapper) to replace `text-white` override.
  - Acceptance: axe-core zero violations on `/`; keyboard-tab to email field announces "Email"; live sign-in with each of the three role accounts succeeds.
  - **Covers**: core blocker #2 + core major #5.

### Destructive-confirm sweep (cross-module)

- [ ] **T5 — AlertDialog / `variant="destructive"` sweep** · `depends on: none`
  - Files + changes:
    - `app/admin/students/[id]/page.tsx` — Withdraw flow: swap `<Dialog>` → `<AlertDialog>` (mirror sibling Graduate flow's `<ConfirmDialog destructive>`); lift `withdrawReason` Textarea into AlertDialog body.
    - `app/admin/raport/raport-editor.tsx` — Unpublish "Tarik penerbitan": wrap in `<AlertDialog>` with consequence copy; trigger button `variant="destructive"`.
    - `app/admin/fees/page.tsx` — Fee-component dropdown deactivate: add `<ConfirmDialog destructive>` (in-row `<Switch>` stays direct).
    - `app/admin/(hr)/leave-requests/page.tsx` — Reject button `variant={reviewAction === "reject" ? "destructive" : "default"}` instead of className tint (both mobile Sheet + desktop Dialog).
    - `app/admin/academic-years/page.tsx` + `app/admin/semesters/client.tsx` — Activate confirm: resolve currently-active sibling client-side, append "Tahun ajaran lain yang sedang aktif akan otomatis diubah menjadi Rencana." (mirror for semester). Roll-forward dialog: swap primary button label to `Ya, Gulir Kelas` minimum, prefer `ConfirmDialog destructive` with side-effect body.
  - Acceptance: live click-through each destructive flow on staging; click-outside does NOT dismiss (AlertDialog traps); consequence copy visible in dialog body.

### Per-tap optimistic save (Recipe 6 — learning + journal)

- [ ] **T6 — `/teacher/sessions/[id]` per-tap optimistic save** · `depends on: none`
  - Files: `app/teacher/sessions/[id]/client.tsx` — lift `cycleStatus`/`tapIn`/`tapOut` to fire `POST /api/teacher/sessions/{id}/attendance` immediately; mirror `saveState: "saving"|"saved"|"error"` per-row from `/teacher/class-attendance/page.tsx:106-147`; revert patched field on non-`ok`; drop bottom `<Button>Simpan</Button>`.
  - Acceptance: live on staging — tap 3 statuses, tap OS back, reload → all 3 persisted; simulate 500 → toast + revert.
  - **Covers**: learning blocker.

- [ ] **T7 — `/teacher/assessments/center/[center]` per-tap optimistic save** · `depends on: T2`
  - Files: `app/teacher/assessments/center/[center]/client.tsx` — lift `setCellLevel` to POST `/api/teacher/assessment-entries` (with `source: "CENTER"` + `activity` captured at page top); drop local `Map<string,Cell>` for an `entries` array mirror of walas; remove sticky bottom Save (`data-testid="center-save"`).
  - Acceptance: live — cell tap persists; reload preserves state; 500 reverts single cell with toast.
  - **Depends on T2** because the level-chip class will already be the shared helper.

- [ ] **T8 — student-journal entry per-tap save + `<WeekGrid editable>` + admin placebo fix** · `depends on: none`
  - Files:
    - `app/teacher/student-journal/entry/page.tsx` — move `fetch POST /entries/batch` into `handleToggle` (single-entry payload); optimistic flip; toast revert; remove bottom Save bar.
    - Replace `<ClassDayGrid>` with `<WeekGrid editable onToggle={handleToggle} />` per student (preserve prev/next student nav). Decision required: if `ClassDayGrid` accordion UX is preferred by stakeholder, document deviation in `design-system.html` §15 + `portal.md` WeekGrid Contract + AGENTS.md standards table instead of code change. **Surface to user before committing** — see Clarifications below.
    - `app/teacher/student-journal/students/[id]/page.tsx` — pass `editable` + `onToggle` to `<WeekGrid>`.
    - `app/admin/student-journal/students/[id]/page.tsx` — remove `handleSaveEditing` placebo + the `isEditing` toggle entirely (optimistic per-cell PATCH is the save); keep `lastAdminEdit` popover as the audit signal.
  - Acceptance: live — teacher entry: tap toggle, reload, persisted; admin: no placebo button, cells stay editable.

### Shadcn-first sweep (cross-module)

- [ ] **T9 — Replace hand-rolled progress bars with `<Progress>`** · `depends on: none`
  - Files: `components/teacher/leave-sheet.tsx` (2 bars), `components/admin/invoices/batch-progress-card.tsx` (GenerateCard + RetryCard), `app/admin/student-journal/{monitoring,classes/[id]}/page.tsx` (extract shared `<CompletionBar checked total />` to `components/student-journal/completion-bar.tsx`).
  - Acceptance: grep `style={{ width: '${pct}%'` returns 0 in scope; live leave-sheet + batch generate render Shadcn `<Progress>`.

- [ ] **T10 — Migrate bespoke admin lists to `<DataTable>`** · `depends on: none`
  - Files: `app/admin/penilaian/page.tsx` (`<table>` → `<DataTable>` with completion column via `<StatusBadge variant="outline">`); `app/admin/raport/page.tsx` (roster `<table>` → `<DataTable>` with StatusFilter Semua/Belum dibuat/Draft/Terbit + `<DataTableRowActions>`); `app/admin/classes/client.tsx` (move search `<Input>` into `DataTable searchPlaceholder=`; swap status `<Select>` for `<StatusFilter>`).
  - Acceptance: live — each list renders DataTable chrome (toolbar + row skeletons); sort/search/filter work.

- [ ] **T11 — Loading states → `<Skeleton>`** · `depends on: none`
  - Files: `app/admin/semesters/[id]/{themes,objectives}/client.tsx` (replace `<p>Memuat…</p>` × 6 with row-shaped `<Skeleton>` × 3-5); `app/teacher/assessments/center/[center]/client.tsx` (replace `<Loader2 className="animate-spin">` roster state with Skeleton list mirroring `/teacher/class-attendance/page.tsx:209-221`); new `app/teacher/assessments/weekly/loading.tsx` + `app/admin/fees/loading.tsx` (mirror `/parent/attendance/loading.tsx` + `/admin/invoices/loading.tsx`); remove `app/admin/fees/page.tsx:118` single-Skeleton early return; remove `app/admin/guardians/page.tsx:261` single-Skeleton early return.
  - Acceptance: throttled Slow 4G via Chrome MCP on each page → row-shaped skeletons, not plain text / single gray rectangle.

### Empty state + error handling sweep

- [ ] **T12 — EmptyState sweep** · `depends on: none`
  - Files: `components/admin/dashboard/attendance-trend-chart.tsx` (plain `<div>` → `<EmptyState icon={CalendarDays} ... />`); `components/portal/week-grid.tsx` (plain `<p>` → compact `<EmptyState>`); `app/parent/attendance/page.tsx:305-330` (notes section: always render heading; empty branch → `<EmptyState accent="warm">`); `app/admin/semesters/[id]/objectives/client.tsx:247-253,429-432` + `app/parent/perkembangan/[studentId]/page.tsx:109-118` (dashed-border divs → `<EmptyState>`).
  - Acceptance: every conditional list render has a visible else branch.

- [ ] **T13 — Error handling sweep (`toast.error` for user-facing failures)** · `depends on: none`
  - Files: `app/teacher/attendance/page.tsx:114` (`console.log` → `toast.error`); `app/admin/(hr)/employees/page.tsx:234,249,263` (silent `.catch` → at least one `toast.error`); `app/admin/(hr)/payroll/[id]/page.tsx:96-106` + `app/admin/(hr)/payroll/page.tsx:188-190` (`console.warn` + visible "gagal memuat" hint, or `toast.error`); `app/admin/(hr)/employee-attendance/monthly/page.tsx:45-55` (wrap in try/catch + `!res.ok` check); `app/admin/(hr)/leave-requests/page.tsx:270` + `app/admin/(hr)/salary-components/page.tsx:93` (`await res.json().catch(() => ({}))`); `app/teacher/slips/page.tsx:49-62` (append `.catch` with `toast.error` + `setLoading(false)`); `app/admin/semesters/[id]/{themes,objectives}/client.tsx` (`fetchJson`/`fetchList` — branch on `!r.ok`, `toast.error`, distinguish empty from failed).
  - Acceptance: live — Chrome MCP network throttle + 500 mock → visible toast, not silent empty.

### Hardcoded palette + banned-size + inline-style sweep

- [ ] **T14 — Hardcoded Tailwind palette → status tokens** · `depends on: T1`
  - Files: `app/admin/classes/{client.tsx:66-72,[id]/client.tsx:130-136}` (`HEALTH_TONE` → `border-status-present-subtle bg-status-present-subtle text-status-present-text` etc., extracted via `healthTone()` from T1); `app/admin/classes/{client.tsx:475,[id]/client.tsx:861}` (archived banner → `border-status-leave bg-status-leave-subtle text-status-leave-text`); `app/admin/admissions/page.tsx:68` (sibling-detect amber banner → `border-status-late/30 bg-status-late-subtle text-status-late-text`); `components/admin/assessments/KategoriIndikatorBuilder.tsx:64` (lockNotice amber → status-late tokens); `components/portal/week-grid.tsx:207,210` (admin-edit amber → `bg-warning-subtle hover:bg-warning-subtle/80 text-warning`); `app/admin/(hr)/employee-attendance/monthly/page.tsx:173-178` (legend raw enum keys → `getStatusConfig(key).label`).
  - Acceptance: grep `bg-amber-\|border-amber-\|text-amber-\|bg-emerald-\|text-emerald-\|bg-rose-\|text-rose-\|border-green-\|bg-blue-50\|text-blue-900` in `app/admin` + `app/teacher` + `app/parent` + `components/{admin,teacher,parent,portal,student-journal}` returns 0 (excluding PDFs which need hex).

- [ ] **T15 — Inline `style={{ var(--celebration-gold-*) }}` → className utilities** · `depends on: none`
  - Files: `app/parent/attendance/page.tsx:140-160` (5 spans); `app/parent/report-cards-list.tsx:49-79`.
  - Acceptance: grep `style={{.*var(--celebration-gold` returns 0; live visual identical.

- [ ] **T16 — Banned `text-[10px]`/`text-[11px]` → `text-xs`** · `depends on: none`
  - Files: `app/teacher/assessments/center/[center]/client.tsx:462` (`text-[11px]` → `text-xs`); `components/student-journal/class-day-grid.tsx:126` (`text-[10px]` → promote to Badge pill beside icon); `app/admin/classes/[id]/client.tsx:1034,1037,1043` (`text-[10px]`/`text-[9px]` → `text-caption` or tooltip-attr); `app/admin/invoices/[id]/page.tsx:284-286` (icon `size={10}` → `size={12}` min); also fix `app/admin/(hr)/payroll/[id]/page.tsx:459-461` (`size={10}` → `size={12}`).
  - Acceptance: pre-commit hook (`.githooks/pre-commit:183,206`) passes on all touched files.

### HR chrome cleanup

- [ ] **T17 — HR module cleanup** · `depends on: T1, T9, T13`
  - Files: `app/admin/(hr)/salary-components/page.tsx` (add `useIsMobile()` + `isMobile ? <Sheet side="bottom"> : <Dialog>`); `components/teacher/leave-sheet.tsx:313` (close Sheet before opening Dialog — or inline the 4-field form into Sheet body); `app/admin/(hr)/payroll/[id]/page.tsx:400-408` (4 hand-rolled stat cards → `<StatCard>` + `text-display`); `app/teacher/slips/[id]/page.tsx:179,216,252,306` (4 `<h2>` → `<SectionHeading>`); `app/teacher/slips/[id]/page.tsx:109-115` (`todayFormatted` → `formatDate()`); `app/admin/(hr)/employees/[id]/page.tsx:410,412,423,410-412` (Unicode arrow `<button>` → `<Button variant="ghost" size="icon"><ChevronLeft size={16}/></Button>`; `text-lg font-bold` → `text-display font-semibold`); `app/admin/(hr)/{payroll/[id],salary-components,leave-requests}/...` (drop `p-card` from `DialogContent`/`AlertDialogContent`/`SheetContent`); `app/admin/(hr)/employee-attendance/monthly/page.tsx:99,101` (`<button>` → `<Button variant="ghost" size="icon">`); `app/admin/(hr)/employees/[id]/page.tsx:347` + `app/admin/(hr)/salary-components/page.tsx:151-155` (both consume new `STATUS_MAP.INCOME/DEDUCTION` from T1 via `<StatusBadge>`).
  - Acceptance: live — salary-components Sheet on mobile viewport (375px); payroll detail stat cards match sibling list pages; leave sheet no longer stacks Dialog.

### Academic fixes

- [ ] **T18 — Academic module Recipe 2 + filter bar** · `depends on: T14`
  - Files: `app/admin/classes/[id]/client.tsx:828-1063` — add `<Link href="/admin/classes">← Kembali ke Daftar Kelas</Link>` above `PageHeader`; swap action order to `[Nonaktifkan, Ubah]`; **decision required**: convert Roster/Guru Pengajar/Kalender Sesi to `<Tabs>` OR document the flat-scroll exception in `crud.md` + cycle doc (see Clarifications); `app/admin/classes/client.tsx:396-472` — move search to `DataTable searchPlaceholder`, swap status `<Select>` for `<StatusFilter>`; `app/admin/academic-years/page.tsx:296,302,303,325,326` (`mb-8`/`mb-4` → wrap in `space-y-section`); `app/admin/academic-years/page.tsx:296` (`gap-3` → `gap-card`); class list PageHeader — append count to description or add StatCard row.
  - Acceptance: live — back link visible; action order matches crud.md; filter bar matches sibling admin lists.

### student-journal audit trail + author visibility

- [ ] **T19 — Journal audit trail + author names + NoteThread consolidation** · `depends on: none`
  - Files:
    - API: `app/api/student-journal/admin/audit/route.ts:47,97` — `include: { changedByUser: { select: { name: true } } }`, return `changedByName`; `app/api/student-journal/{children,students}/[id]/week/route.ts` (all 3 sibling routes) — `include: { authorUser: { select: { name: true } } }`, return `authorName` + `createdAt`.
    - `components/student-journal/note-thread.tsx` — extend `Note` type with `authorName` + `createdAt`; render avatar initials + `<Badge variant="outline">{roleLabel}</Badge>` + `{authorName}` + `{formatDate(note.createdAt, { day, month, year, hour, minute })}`.
    - `app/admin/student-journal/students/[id]/page.tsx:95-167` — drop local `NoteRow`, reuse `<NoteThread notes={...} onDelete={...} />`; audit tab row: render `{row.changedByName}` next to `formatDate(row.changedAt, { ..., hour, minute })`.
    - `app/teacher/student-journal/students/[id]/page.tsx:252-294` — drop inline `<Dialog>` note-compose; use `<NoteComposeDialog mode="create" ... />`.
    - `app/admin/student-journal/monitoring/page.tsx:116-125` — drop fabricated StatCards (`siswaWithNotes`, `hariKosong`); keep only `totalEntries` + `kelasSudahIsi` OR wire real aggregate queries.
    - `components/portal/week-grid.tsx:73-79` — accept `todayYmd` prop or import `getTodayInTimezone`.
  - Acceptance: live — audit tab shows actor name; note thread across 3 portals shows author + avatar + createdAt; admin journal page renders shared `<NoteThread>`.

### curriculum fixes

- [ ] **T20 — Curriculum drill-down UX** · `depends on: T11, T12`
  - Files: `config/admin-nav.ts:188-200` (`SEGMENT_LABELS` += `themes: "Tema"`, `objectives: "Tujuan Pembelajaran"`, `import: "Impor PROMES"`; collapse or label dynamic id segment); `app/admin/semesters/[id]/{themes,objectives}/client.tsx` — drop trailing "Nonaktifkan {nama}" wrapping button row; add inline terminal `<Button size="icon-sm" variant="ghost">` to each row matching Pekan card pattern; add cross-link PageHeader actions (`<Button variant="outline" render={<Link href={...objectives}>}>Lihat Tujuan Pembelajaran</Button>` and mirror); `app/parent/perkembangan/[studentId]/page.tsx:147-149` (raw `entry.date` → `formatDate(entry.date, { day, month, year })`); `app/admin/semesters/[id]/objectives/client.tsx:796` (`Isi indikator (Indonesian)` → `Isi indikator`); `app/admin/semesters/[id]/objectives/client.tsx:541-569,365-393` (icon-only "Aktifkan" → icon + text or `aria-label`); `app/admin/semesters/[id]/themes/client.tsx:122-128` (hand-rolled button-styled Link → `<Button variant="outline" size="sm" render={<Link}>`); `app/admin/semesters/client.tsx:207-245` (drop standalone "Kelola tema" duplicate of `onView`; move "Kelola IKTP" to `extraActions`); `app/admin/semesters/[id]/import/client.tsx:164,213` (drop `${res.status}` from copy; map 413/403 to actionable Indonesian strings); add indeterminate `<Progress>` + "Mengunggah berkas…" sub-label during PROMES upload.
  - Acceptance: live — breadcrumb on `/admin/semesters/[id]/themes` reads correctly; nonaktifkan button inline per row; cross-link navigates; parent perkembangan shows formatted date.

### reportCard formality

- [ ] **T21 — Raport PDF formality + editor UX** · `depends on: T2`
  - Files: `lib/pdf/report-card.tsx` — add letterhead band (logo slot + `{tenant.name}` + address + NPSN from tenant metadata); add right-aligned "Jakarta, {formatDate(generatedDate)}" above `signRow`; under each signature rule render homeroom teacher + principal names (and NIP if available) `fontSize:8 bold`; add `<Fixed>` footer `Page {pageNumber}/{totalPages}` + running header `{schoolName} · {studentName} · {termLabel}`; consume `LEVEL_HEX` from T2 for level chip color. `app/admin/raport/raport-editor.tsx:277-297` — sticky action bar (`sticky bottom-0 bg-background/95 backdrop-blur`); inline `bg-status-late-subtle` banner when `status==="PUBLISHED"` during edit. `app/admin/raport/page.tsx:162-175,236-314` — move `CreateTermCard` into `<ResponsiveFormDialog>` triggered by *Triwulan* button.
  - Acceptance: live — download sample raport PDF on staging `/admin/raport/[studentId]/[termId]/pdf` + `/api/guardian/raport/[studentId]/[termId]/pdf`; verify letterhead, tempat-tanggal, names under signature, page numbers on multi-page print.

### Voice + token + dead-code sweep

- [ ] **T22 — Voice copy + token drift sweep** · `depends on: none`
  - Files: `components/admin/dashboard/pending-actions.tsx:59` (`Inquiry menunggu tindak lanjut` → `Pertanyaan baru menunggu ditindaklanjuti`); `app/teacher/assessments/weekly/client.tsx:340` (`Cubit untuk menyimpan … (segera)` → `Ketuk tingkat untuk menyimpan. Catatan per indikator bisa ditambahkan dari detail siswa.`); `app/admin/invoices/[id]/page.tsx:287` (`WA:` → `WhatsApp `); `components/admin/dashboard/{pending-actions,activity-feed,attendance-trend-chart}.tsx` (`text-sm font-semibold` card titles → `text-h2 font-semibold`); `components/admin/{stat-card,quick-actions}.tsx` (`p-5`/`p-3.5`/`rounded-xl`/`hover:shadow-sm` → `p-card`/`shadow-card-resting` — document `rounded-xl` decision); `components/admin/dashboard/quick-actions.tsx:36` (`gap-3` → `gap-section` or named); `app/admin/students/[id]/page.tsx:542` + `app/admin/guardians/[id]/page.tsx:284,396` + `components/admin/guardian-edit-dialog.tsx:148,237` (inline `<h3>`/`<p>` headings → `<SectionHeading>`); `app/admin/students/[id]/page.tsx:866-867` (raw `<button>` icon-cells → `<Button variant="ghost" size="icon">`); `app/admin/students/[id]/page.tsx:744-751` (withdrawal-reason raw Textarea → `<Field><FieldLabel>...`); `app/admin/students/[id]/page.tsx:510-535` (Keluarkan: `variant="outline"` + red text → `variant="destructive"`; OR reorder per Recipe 2 — pick one); `app/admin/guardians/[id]/page.tsx:468` (`Rp {x.toLocaleString("id-ID")}` → `formatRupiah(inv.totalDue)`); `app/admin/admissions/page.tsx:864-868` + `app/admin/students/page.tsx:639` (`<StatsCardsRow cols={4}>` with 3 children → `cols={3}`); `app/admin/admissions/page.tsx:919-924` (`flex-col-reverse` → `<SheetFooter>`); `components/admin/guardian-edit-dialog.tsx:100,128,150,174,220,239` + `app/admin/admissions/page.tsx:184,223,258,277,330,370` + `app/daftar/client.tsx:277,483` (`gap-3` → `gap-field`); `app/admin/classes/client.tsx:152,252,271` + `app/admin/classes/[id]/client.tsx:*` + `app/admin/academic-years/page.tsx:79,89,105,120,156` (`toast.error("Gagal")` → actionable copy with retry hint); `app/admin/invoices/[id]/page.tsx:247` (`retrying ? "..." : "Coba Lagi"` → `"Memproses..."`); `app/admin/invoices/[id]/page.tsx:256` (raw `<h3>` → `<SectionHeading>`); `app/admin/payments/page.tsx:42-51` + `lib/finance/payments-ledger.ts:189` (extract `formatDateTime` to `lib/format.ts`); `app/admin/invoices/[id]/page.tsx:63-66` (hardcoded `<SelectItem>` × 4 → `PAYMENT_METHODS.map`); `app/admin/fees/page.tsx:182-186` (lift Tambah Komponen into `<PageHeader actions={...}>`); `components/attendance/{calendar.tsx:162-207,override-modal.tsx:92-114}` (hand-rolled `motion.div` modal → `<Dialog>`; raw `<Label>Status *</Label>` → `<Field><FieldLabel required>Status</FieldLabel>`); `app/layout.tsx:59` (`themeColor: "#0F172A"` → `"#1A2E2F"` matching `--sidebar`); `components/portal/portal-header.tsx:75` (`px-5` → align to `px-page-x` OR document portal override in `portal.md`).
  - Acceptance: grep sweep — `toLocaleString("id-ID")` returns 0 in `app/admin`; `Inquiry` returns 0 outside legacy enum strings; `Cubit` returns 0.

- [ ] **T23 — Dead code + minor cleanup** · `depends on: none`
  - Files: delete `app/parent/unpaid-invoices-table.tsx`, `components/parent/invoice-card.tsx`, `components/parent/invoice-filter.tsx` (confirm zero imports via `rg "from.*(unpaid-invoices-table|invoice-card|invoice-filter)"` first); `app/admin/(hr)/payroll/[id]/page.tsx:425` (`<Sheet>` always-on — add `useIsMobile` branch); `app/admin/student-journal/{monitoring,students/[id],classes/[id]}/page.tsx` (wrap in `<div className="px-page-x py-page-y space-y-section">`); `app/admin/semesters/[id]/objectives/client.tsx:275-301,206-243` (FilterGroup hand-rolled segmented → `<Select>` for Status/Kelompok, `<Tabs>` for Elemen — match sibling semester list page).
  - Acceptance: `npm run build` passes after deletes; grep returns 0 imports of deleted files.

### Final gate

- [ ] **T24 — Cycle-end gate + audit-docs + e2e additions** · `depends on: all`
  - Add e2e specs: `e2e/skala-consistency.spec.ts` (visit 5 screen surfaces + raport PDF; assert `Perlu Penguatan` chip class is info-token, not red/teal); `e2e/journal-author-visibility.spec.ts` (note thread shows author name + avatar); `e2e/optimistic-save-revert.spec.ts` (mock 500 on tap → toast + revert); `e2e/daftar-brand.spec.ts` (visual regression vs login page brand frame).
  - Run end-of-cycle gate: `npm run build && npx vitest run && npx playwright test` — all green.
  - Run `/audit-docs` — zero `fail` findings (update README route/portal counts if pages added/removed; bump standards-table if `design-system.html` touched).
  - Fill `## Verification` + `## Ship Notes`.

## Implementation

Filled by `/build` — per-task bullet of files touched + one-line summary. Foundation tasks (T1, T2) land first; independent tasks dispatch to parallel subagents per the dependency graph.

- **T1** — `app/globals.css` (`--destructive`/comment/`--chart-4`: `#E63946`→`#FF3B3B` per colors.md; grep `#E63946`=0), `components/ui/status-badge.tsx` (added `STATUS_MAP.INCOME`/`DEDUCTION` + icon + left-border entries; exported `healthTone()` for Sehat/Perhatian/Kritis/Libur/Tidak Aktif), new `lib/pdf/brand-tokens.ts` (`TEAL/DARK/MUTED_FOREGROUND/BORDER/LIGHT_BG`), `lib/pdf/{invoice-receipt,salary-slip,report-card}.tsx` consume it (aliased to local names to keep bodies untouched). Quick-win folded: moved `STATUS_META`+`StatusChip` out of `app/admin/enrollments/page.tsx` into sibling `app/admin/enrollments/status-chip.tsx` (fixes Next-16 page-export webpack bug from #365), palette routed through status tokens (was raw sky/amber/emerald/red), `page.tsx` + `[id]/page.tsx` imports updated.
- **T2** — new `lib/curriculum/level-presentation.ts` (single source: `Level` type + `LEVEL_LABEL_SHORT`/`LEVEL_LABEL_LONG`/`LEVEL_CHIP_CLASS`/`LEVEL_CHIP_CLASS_OFF`/`LEVEL_HEX`; NEEDS_REINFORCEMENT = info-leave/blue, NOT red/teal). `lib/raport/labels.ts` re-exports `RaportLevel`+`LEVEL_LABELS` from it (legacy names kept; local alias so in-file annotations resolve). Consumers rewired: `app/teacher/assessments/{weekly,center/[center]}/client.tsx` (dropped local LEVEL_LABEL/BG maps), `components/parent/element-progress-row.tsx` (NEEDS bar+text → status-leave), `app/parent/page.tsx` + `app/parent/perkembangan/[studentId]/page.tsx` (dropped local maps), `lib/pdf/report-card.tsx` (added `levelKey`, chip color via `LEVEL_HEX`), `lib/raport/build.ts` (passes `levelKey`). `.claude/standards/voice.md` glossary gained an Assessment skala subsection documenting the info-blue voice call. **Label policy (user-confirmed): fully unify** — short + long variants both live in the one module; existing label strings preserved (no raport semantic change). Note: deviates from the doc's literal `EMERGING="Belum Mampu"` short text (preserved "Belum" instead) to avoid contradicting raport's "Mampu Belum Konsisten" — flagged for review.
- **T3** — `app/daftar/{page,client}.tsx` re-skinned to the brand system: removed every `emerald-*`/`rose-*`/`[#0C5C3F]`/`[#f4f6f3]` (grep=0 in `app/daftar/**`); bespoke "T" logo block → `<TalibWordmark size="md" showSublabel />`; optional-label + body copy → `text-muted-foreground`/`text-foreground`; radio + error → `primary`/`destructive` tokens; hand-rolled `<ol>` Stepper → Shadcn `<Progress>` + always-visible step labels (was `hidden sm:inline`) with done-check icon. Cross-checked design-system.html §Brand + colors.md.
- **T4** — login (`app/page.tsx`) was already Shadcn-retrofitted by #367 (Field/FieldLabel/Input/Button all present, email `htmlFor` wired). Remaining gap: added `tone="onDark"` to `components/brand/talib-wordmark.tsx` (white text + white/70 sublabel for dark surfaces) so the login wordmark drops the `text-white` className override.
- **T5** (partial — destructive sweep): extended `components/ui/confirm-dialog.tsx` with optional `children` (body between description + footer). `students/[id]` Withdraw: Sheet/Dialog → `<ConfirmDialog destructive>` with the reason `Textarea` in the body (dialog stays open during processing, closes on success; empty reason throws so it stays open + toasts). `raport-editor` "Tarik penerbitan" trigger: `variant="outline"` → `variant="destructive"` (AlertDialog body was already correct). `leave-requests` reject button: className tint (`bg-destructive`) → `variant={reviewAction === "reject" ? "destructive" : "default"}` (both mobile Sheet + desktop Dialog). **Deferred for review:** fee-component dropdown deactivate (no Switch/deactivate surface found in `app/admin/fees` — target may not exist as described), academic-year activate sibling-demote consequence copy, roll-forward dialog primary button. Deactivate everywhere already uses `DeactivateConfirmDialog` (landed in #367).
- **T15** — inline `style={{ var(--celebration-gold-*) }}` → className utilities in `app/parent/attendance/page.tsx` + `app/parent/report-cards-list.tsx` (section border/bg + icon bg/text + heading text → `border-celebration-gold`/`bg-celebration-gold-subtle`/`text-celebration-gold-text` per colors.md). Grep `var(--celebration-gold` = 0.
- **T16** — banned sizes: `app/admin/classes/[id]/client.tsx` `text-[10px]`/`text-[9px]` → `text-caption`; icon `size={10}` → `size={12}` in `invoices/[id]`, `students/[id]`, `(hr)/payroll/[id]`. (center:462 + class-day-grid:126 no longer present — already fixed or shifted.)
- **T23** (partial) — deleted 3 zero-consumer dead files: `app/parent/unpaid-invoices-table.tsx`, `components/parent/invoice-card.tsx`, `components/parent/invoice-filter.tsx` (consumers verified = 0). Payroll Sheet-mobile + student-journal page-padding + objectives FilterGroup deferred.
- **T22** (partial — voice copy): "Inquiry menunggu tindak lanjut" → "Pertanyaan baru menunggu ditindaklanjuti" (dashboard); "Cubit untuk menyimpan…" → "Ketuk tingkat untuk menyimpan…" (walas weekly); "WA:" → "WhatsApp " (invoice + student detail); `Rp {x.toLocaleString("id-ID")}` → `formatRupiah(...)` (guardian detail). Remaining T22 items (gap/heading tokens, p-card, SectionHeading sweep) deferred.

## Verification

Filled by `/build`. Between-task gate (`npm run build && npx vitest run`) per task; end-of-cycle gate adds `npx playwright test`. **Chrome MCP preview-verify is mandatory for this cycle** per AGENTS.md `/ship` Step 3 — not skippable even though the work is mostly cosmetic, because the audit was conducted statically and the user explicitly required live verification to filter false positives before merge. Each fix task's acceptance line names the live staging URL + role session to spot-check.

- **T1 gate** — `npm run build` green; `npx vitest run` green (220 files / 2127 tests); `npm run lint` 0 errors (57 pre-existing warnings, none in T1 files). Playwright deferred to CI per #368. Cross-checked `.claude/standards/colors.md` brand table + design-system.html §Status palette for `--destructive=#FF3B3B` + healthTone tone mapping. Live Chrome MCP spot-check (brand tokens, StatusBadge INCOME/DEDUCTION, enrollments roster chip) deferred to `/ship` preview-verify.
- **T2 gate** — `npm run build` green; `npx vitest run` green (220 files / 2127 tests). Acceptance grep confirmed: `const LEVEL_LABEL\b` / `const LEVEL_BG\b` / `LEVEL_FULL_LABEL` = 0 outside `lib/curriculum/level-presentation.ts`. NEEDS_REINFORCEMENT now resolves to `bg-status-leave`/`text-status-leave-text`/`#0EA5E9` on every screen surface + PDF. Live cross-surface spot-check (weekly, center, parent reports, raport PDF chip) deferred to `/ship` preview-verify (Claude).
- **T3+T4 gate** — `npm run build` green; `npx vitest run` green (2127 tests). `grep emerald|rose-|#0C5C3F|#f4f6f3` in `app/daftar/**` = 0. Stepper labels now visible on mobile (375px) via Progress redesign. Login wordmark uses `tone="onDark"`. Cross-checked design-system.html §Brand. Live `/daftar` + `/` spot-check deferred to `/ship` preview-verify.

## Ship Notes

Filled by `/ship`. Anticipated: no DB migrations (all schema joins use existing relations); no env vars; rollback = `git revert` per task (commits are atomic per task). PDF brand-tokens centralization may surface in code review as "why not CSS vars in PDF" — answer: `@react-pdf/renderer` is server-side with no DOM/CSS-var access, hex is unavoidable, centralization is the mitigation.

---

## Audit source artifacts

Nine module reports at `/var/folders/_j/zvhyr6z55rqg_0m_xt3nx9gh0000gn/T/opencode/ui-audit/{core,hr,academic,students,finance,learning,student-journal,curriculum,reportCard}.md` — 112 findings total (11 blocker · 53 major · 48 minor). The cycle does not `git add -f` these (they live in tmp, not the repo) — their distilled form is baked into the Tasks above; the original reports can be re-generated by re-running the audit subagents if any citation needs re-verification during `/build`.
