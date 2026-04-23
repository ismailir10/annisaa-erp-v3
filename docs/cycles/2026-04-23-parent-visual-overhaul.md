# Parent Portal Visual Overhaul — Cycle 3

## Context

Cycle 2 (PR #106, hotfix PR #107, staging `03e0c1f`) fixed tokens, padding, overlay inner-padding, and added the `HouseholdOverview` primitive for ≥3-kid households. Every invariant on paper is now green: D1 silent-catch, D3 banned text sizes, D4 `toLocale`, voice glossary, overlay padding. **But the parent portal still feels amateur.** Cycle-2 was token retrofit; the rendered result is a chrome skeleton — correct geometry, no soul.

Target parent: Pak Budi, 7am on a 3-year-old Android A-series, 4G on KRL Commuter. He opens `/parent` to answer three questions in order — *did anyone not come today? is anything overdue? is the new rapor out?* The screen must answer those in 3 seconds with warmth, not a Bootstrap admin grid.

### Diagnosis — 375 px, staging seed (3-kid household, rightjetParent / Siti Nurhaliza)

Cross-checked `.claude/standards/design-system.html` §13 Overlays, §14 Page Recipes (Household Overview), §17 Voice, §18 Tone; `.claude/standards/portal.md` §Household Overview + §Portal Text-Size Scale; `.claude/standards/voice.md` parent persona. Evidence below is from the five screenshots captured at 375×812 on commit `03e0c1f` (staging tip).

#### /parent home (≥3-kid HouseholdOverview branch)

Ref screenshot: parent-home-household-overview.png.

- **[B Hierarchy flat]** H1 greeting "Assalamu'alaikum, Siti Nurhaliza Hidayat" + muted subtitle + urgency banner + 3 child-row cards all sit on the same visual weight axis. No single element says *"read me first"*. Eye bounces; there is no primary surface. (Principle 1 violated.)
- **[B + D Typography ramp]** H1 is `text-2xl font-semibold` on `text-foreground`, subtitle is `text-sm text-muted-foreground`. Size delta exists; weight + letter-spacing + color-contrast delta is minimal. Display→H1 ramp is not felt (Principle 2). design-system.html §17 defines `text-display` for landing moments — not used here.
- **[C Color timid]** Brand teal `#5DB4B8` appears on *one* avatar fallback tint and the bottom-nav active indicator. Everything else grey-on-white. Banner, child cards, signal cells all greyscale + red-tint. Teal absent from the signal surface where parent makes decisions (Principle 3).
- **[F Status severity]** All three rows render the **same** `StatusBadge status="INACTIVE" label="Belum tercatat"` — visually identical pills ([components/ui/status-badge.tsx](components/ui/status-badge.tsx) rendering `status-inactive` tone). When tomorrow teacher marks one kid PRESENT + one SICK + one ABSENT, the three badges will differ only in *text color* — fails the 3m-glance test (Principle 4). design-system.html §Status-chip set expects shape/icon differentiation, not just hue.
- **[A Density wrong]** Avatars `size-10` (40 px), centered vertically against two text rows, leave a 24 px gap below the ChevronRight — vertical padding imbalance. Name "Ahmad Zafran Hid…" truncates after 14 chars because the row simultaneously hosts avatar (40) + name + class + today-chip (~100 px) + chevron (16). Priority inverted: a `Belum tercatat` chip steals width from the kid's name.
- **[E Card chrome noise]** Every child row: `rounded-xl border border-border bg-card` outer + `border-t border-border bg-border` on the signal strip + internal signal cells each with their own background. Five surface layers per row × 3 rows = 15 layered surfaces. No surface reads as primary.
- **[K Islamic layer]** Greeting exists; surrounding visual gives no reinforcement — no subtle geometric accent on the banner, no warm illustrative motif, no Ramadan-aware switch. "Assalamu'alaikum" floats alone (Principle 7).
- **[G Empty states]** Rapor signal cell reads `"Rapor siap dibuka"` on a pale-green tint — functional but lacks moment (Principle 5). Attendance `"Belum tercatat"` is tombstone copy, not an invitation. voice.md says parent empty states should be warm — current copy is neutral-ops, not parental.
- **[A Density — 3rd kid below fold]** On 375×812 with STAGING banner + PortalHeader + H1+subtitle+banner, only 2 child rows fit above fold; Fatimah (TKIT B) requires scroll. 3-kid household home is the precondition — primary content must fit the fold.
- **[J Icons]** ChevronRight `size-4`; AlertCircle `size-5`; CheckCircle2 `size-5`; signal-cell label has no icon. Fleet feels scattered.

#### /parent/invoices (list + detail sheet)

Ref screenshot: parent-invoices-list.png.

- **[Wrong primitive]** Parent family has ≤5 invoices per child at steady state; current page renders a full `DataTable` with sortable headers (`Periode ↓ / Jumlah ↕ / Status ↕`), pagination, search. DataTable is admin-grade. For 2 rows visible, it reads as a database admin console, not a parent bill inbox. portal.md says "DataTable if >10 items or Card list if <10" — this is the <10 path, but the code ships a table anyway.
- **[B Hierarchy flat]** No summary: no *"Rp 1.700.000 outstanding · jatuh tempo 28 April"* hero. Parent's day-job question #1 ("how much do I owe?") takes 4 cognitive hops to answer from the table. design-system.html §14 outlines a StatCard hero for totals.
- **[F Status chips wrong severity]** `"Belum Dibayar"` renders as a blue-tinted pill (`text-status-leave-text` / `bg-status-leave-subtle`). Unpaid is **danger**, not info. Blue = IZIN/permission in the system; reusing it for overdue-bill creates semantic collision across the portal. Cross-checked design-system.html §Status palette: unpaid → `status-absent` red family, partial → `status-late` amber, paid → `status-present` green, void → `status-inactive` grey.
- **[B Amount duplication]** `"Rp 850.000"` black-bold + `"Sisa: Rp 850.000"` red — same number twice when unpaid = entire amount still owed. Noise. design-system.html §14 pattern shows a single `DataPoint` with tone on outstanding.
- **[A Density]** ChildSelectorTabs (46 px) + H1 "Tagihan Saya" (40 px) + filter pills (46 px) + table header (40 px) + 2 rows (96 px) = 268 px used of 812 px. Rest is empty grey. Fold underused, yet action (row ⋯) hidden at far-right requiring horizontal scroll or careful tap on "Lihat" text that's already clipped (" Liha… ").
- **[E Chrome noise]** Table inside a card-bordered container + card shadows + inner pill filters + outer H1 block — layers compete.
- **[C Color timid]** Brand teal on active child-selector pill + active filter pill + "Lihat" button outline — three spot uses. Nothing on the money data itself. Parent's "am I okay?" signal has no color.
- **[K Voice on empty/error]** voice.md says `"Alhamdulillah, semua lunas."` on zero-unpaid — current filter "Belum Bayar" empty state is unshown (visible rows exist for this fixture), but if filtered to "Sudah Dibayar" the message is cold. (Worth auditing in scope.)
- **[G Empty detail sheet]** `invoice-detail-sheet.tsx` — detail Sheet body after cycle-2 padding fix is readable but decoratively flat. No payment-method hint, no next-step CTA color hierarchy, no cultural courtesy on paid confirmation.

#### /parent/attendance (not a target this cycle — diagnosed for Spec justification)

Ref screenshot: parent-attendance.png.

- **Voice drift:** "Tidak Hadir 0" summary label — voice.md glossary requires `Alpa`. This is live drift that shipped through cycle-2 regression gate. Flag + fix **in-scope for this cycle** as a 3-char copy patch even though attendance is otherwise deferred.
- Stat trio + H1 ordering inverts hierarchy (stat before page title).
- DataTable wrong primitive (same as invoices — <10 parent use case).
- Native date inputs `dd/mm/yyyy` unstyled.
- Status badge "Alpa" (red text) + "Hadir" (green text) — distinct color but same pill shape + no icon, fails 3m glance (Principle 4, cross-cutting).
- **Deferred → Cycle 4**, except the `Tidak Hadir → Alpa` voice patch.

#### /parent/reports (not a target — diagnosed for Spec justification)

Ref screenshot: parent-reports.png.

- 1 card in 812 px of fold. Below-fold grey desert.
- Truncated title `"Laporan Perkembangan Semester 1 (D..."` at 20 chars — no indication of what's truncated.
- No subtitle with teacher name, grade summary, publication date, or warmth. voice.md says rapor publish = celebration event; current state = admin filetype.
- **Deferred → Cycle 4.**

#### /parent/student-journal

**Per user, already aligned.** Quick screenshot pass confirms: PortalTabs child switcher, DatePicker week nav, WeekGrid with sticky first column, today-column highlight, Ibadah/Perilaku grouped categories. Minor: today-column teal tint faint at 4G-dimmed screens, Jumat column clipped on 375. **Out of scope — note for cycle 4.**

### Inspiration benchmarks (for /build visual reference)

- **Revolut mobile home** — hero money number with chip below, soft card elevation, one primary surface per fold. (Reference for parent-home urgency banner + HouseholdOverview hero treatment.)
- **Monzo "Payments overdue"** card — warm-red tint, single action, no table chrome. (Reference for /parent/invoices summary hero.)
- **Headspace subtle geometric accent** — low-opacity motif behind greeting, cultural warmth without kitsch. (Reference for Islamic layer on parent home banner — a single sub-2% opacity geometric bismillah-dots pattern, not arabesque clipart.)
- **Duolingo warm empty states** — mascot + invitation copy + one CTA. (Reference for rapor-not-yet-published cell + invoice-paid celebration.)

---

## Spec

**Scope expanded per CTO direction: full parent portal, big cycle.** All 5 parent surfaces in one PR. Shared primitive work (S1–S5) consumed across targets to prevent duplication.

### Targets (5)

**T1 — /parent home** (`app/parent/page.tsx` + `components/parent/household-overview.tsx` + greeting block). First impression, 100% of parent sessions. Pak Budi Goal #1 + Goal #2 land here. design-system.html §14 Household Overview is canonical.

**T2 — /parent/invoices** (`app/parent/invoices/client.tsx` list + `app/parent/invoices/invoice-detail-sheet.tsx`). Pak Budi Goal #1 "Pay on time" + #1 frustration "late fee because didn't see invoice". DataTable wrong primitive for ≤5-item use; status color wrong; no summary hero.

**T3 — /parent/attendance** (`app/parent/attendance/page.tsx` + note dialog if any). Pak Budi Goal #2 "Know if Aisha present today". Current: DataTable wrong primitive, voice drift `Tidak Hadir`, native date inputs unstyled, stat trio above H1 inverts hierarchy, chips fail 3m glance.

**T4 — /parent/reports** (`app/parent/reports/page.tsx` + detail sheet). Pak Budi Goal #4 "See Aisha's rapor when issued". Current: single card in 812 px fold, truncated title, no context, no celebration when `PUBLISHED`. voice.md calls rapor publish a celebration event — current state is admin filetype listing.

**T5 — /parent/student-journal polish** (`app/parent/student-journal/page.tsx` + `components/portal/week-grid.tsx` cosmetic). User noted journal already aligned — scope reduced to: today-column highlight strengthen, Jumat column no-clip at 375, category-header typographic warmth, NoteThread time-stamps Indonesian formatting audit. No structural rework.

### Shared work (consumed across T1–T5)

**S1 — StatusBadge severity pass.** Extend `components/ui/status-badge.tsx` with `icon?: LucideIcon` + `variant?: 'solid' | 'intent'` props. `intent` variant: leading icon + label + subtle-tinted bg + 2px tone-tinted border-left. Map: PRESENT (Check, green-subtle), ABSENT (X, red-subtle), SICK (Thermometer, amber-subtle), PERMISSION (Info, blue-subtle), DRAFT/INACTIVE (Minus, neutral), UNPAID (AlertTriangle, red-subtle), PAID (CheckCircle2, green-subtle), PARTIAL (CircleDot, amber-subtle), PUBLISHED (Sparkles, gold-celebration), RAPOR_DRAFT (Clock, muted). Additive API. Cross-check design-system.html §Status-chip set.

**S2 — EmptyState warm accent.** Extend `components/ui/empty-state.tsx` with `accent?: 'warm' | 'celebration' | 'neutral'`. Warm = soft-radial teal tint + primary icon. Celebration = soft-gold tint + gold icon (rapor-published, all-lunas moments). Neutral = current default.

**S3 — Voice patch glossary sweep.** `Tidak Hadir → Alpa` in `app/parent/attendance/*`. Grep sweep `\b(Invoice|Present|Absent|Report Card|Tidak Hadir|Sick|Ill|Permission excused)\b` in `app/parent components/parent` → 0 after.

**S4 — Token audit.** Add `text-display` (`--text-display: 2rem; --tracking-display: -0.02em`) + `--shadow-card-elevated` + `--shadow-card-resting` + Islamic-motif opacity token `--motif-opacity: 0.03` to `app/globals.css` if missing. Each addition cites design-system.html §17 / §13.

**S5 — Parent primitive extractions.** Two new primitives required because 2nd-instance trigger met across T1–T4 per portal.md §Portal Primitive Inventory:
- `components/portal/summary-hero.tsx` — tone-tinted hero card (danger/warn/success/neutral) with primary number + secondary label + optional icon + optional CTA slot. Consumed by T1 urgency banner + T2 invoices outstanding + T3 weekly-attendance summary + T4 latest-rapor celebration. 4 consumers > 2nd-instance trigger.
- `components/portal/card-list-item.tsx` — tappable card row (avatar/icon slot + primary label + secondary meta + right-slot chip + chevron + press-state). Consumed by T1 child rows + T2 invoice rows + T3 attendance-day rows + T4 rapor-term rows. 4 consumers > 2nd-instance trigger.
Document extraction justification inline in each file header.

### Acceptance criteria

- [ ] **S1 StatusBadge.** `icon` + `variant='intent'` shipped. Existing call sites unchanged (opt-in). T1/T2/T3/T4 opt in. Unit test both variants.
- [ ] **S2 EmptyState.** `accent` prop shipped. Neutral default unchanged. Celebration + warm accents rendered via tokens only.
- [ ] **S3 Voice.** `Tidak Hadir → Alpa` + glossary sweep. Grep `\b(Invoice|Present|Absent|Report Card|Tidak Hadir|Sick|Ill)\b` in `app/parent components/parent` = 0.
- [ ] **S4 Tokens.** `text-display`, elevated/resting shadow pair, motif-opacity token in `globals.css` with §17/§13 citation.
- [ ] **S5 Primitives.** `components/portal/summary-hero.tsx` + `components/portal/card-list-item.tsx` shipped with file-header rationale + inline props doc. 2nd-instance trigger documented. Unit tests.
- [ ] **T1 home above-fold.** At 375×812: greeting w/ Islamic motif ≤3% opacity + elevated SummaryHero urgency banner + ≥2 child rows visible. 3rd row ≤1 thumb scroll away. 22-char name no truncate. Today-chip below name row (not inline). Signal cells distinct icons per intent. All-clear state = celebration SummaryHero "Alhamdulillah, semua lunas dan hadir hari ini".
- [ ] **T1 hierarchy.** `text-display` greeting + letter-spacing + contrast ramp display→body ≥2:1.
- [ ] **T1 2-kid fallback** matches craft level.
- [ ] **T2 invoices list.** DataTable → SummaryHero + CardListItem list. Hero: `formatRupiah(totalOutstanding)` + next-due + unpaid count, danger-tinted when >0 / celebration "Alhamdulillah, semua lunas." when 0. PortalTabs filter below hero. Per-row: period label + amount + status chip (S1 icon). Zero horizontal scroll at 375. `px-page-x` tokens preserved.
- [ ] **T2 detail sheet.** SummaryHero amount card + fee-component lines tabular-nums + payment history method icons + unpaid primary CTA "Lihat cara bayar" (links existing route, no new API). `p-card` inner wrapper preserved.
- [ ] **T2 status color correctness.** Unpaid = `status-absent` red (NOT blue), Partial = `status-late` amber, Paid = `status-present` green, Void = neutral. Cross-portal consumer audit confirms no regression.
- [ ] **T3 attendance.** DataTable → SummaryHero (Hadir N · Sakit M · Alpa K · Izin L week-to-date, tone from worst day in week) + CardListItem day rows. Native date `<input>` swapped to Shadcn DatePicker (already in tree via admin). H1 before stat (hierarchy fixed). Status chips use S1 intent icons. No pagination (<10 items steady-state). Voice: "Alpa" (not "Tidak Hadir").
- [ ] **T3 empty state.** No records yet → `EmptyState accent="warm"` with "Belum ada catatan kehadiran. Insyaallah akan muncul setelah Ustadzah mengisi absensi hari ini." copy.
- [ ] **T4 reports list.** Current single-card → SummaryHero (latest rapor status: celebration-tinted gold when PUBLISHED, muted when DRAFT) + CardListItem per semester. Card shows: semester label, academic year, teacher name, publish date, published badge. Tap → existing detail sheet. Celebration voice on PUBLISHED: "Rapor {semester} Aisyah sudah terbit · Alhamdulillah".
- [ ] **T4 detail sheet.** Rapor detail sheet retains existing data (no API change); visual pass: hero card with semester + term + status chip + publish date; score sections grouped by subject with tabular-nums; teacher notes block with warm-tinted left-accent; `p-card` inner wrapper.
- [ ] **T4 empty state.** Pre-publish → `EmptyState accent="warm"` with "Rapor belum terbit. InsyaAllah akan tersedia setelah Ustadzah finalisasi nilai." copy.
- [ ] **T5 journal polish.** Today-column tint strengthened to `--status-present-subtle` + 2 px top/bottom border-primary. Jumat column no-clip at 375 (grid-cols width audit). Category headers Ibadah/Akademik/Karakter: warm-tinted left-accent bar + `text-h2` weight. NoteThread timestamps via `formatDateShort`. No WeekGrid contract change.
- [ ] **Motion.** Sheet open 180 ms ease-out; status-chip transition 150 ms; row tap press-state `scale-[0.98]` 150 ms. Zero scroll-jank at 4× CPU throttling.
- [ ] **Screenshots.** 375×812 + 1280×800 per commit → Verification section. PR bundle: 10 before/after pairs covering all 5 targets + empty/celebration variants.
- [ ] **Gates.** D1/D3/D4/voice glossary = 0 drift in parent scope. Axe scan on /parent/{, invoices, attendance, reports, student-journal} zero new violations. Between-task `npm run build && npm run lint && npx vitest run`. End-of-cycle `+ DEMO_MODE=true npx playwright test`.

### Non-goals

- New API / route / Prisma / npm deps.
- Dark-mode fixes (flag-only if broken).
- StatusBadge API breaking change (prop additions only).
- Student journal structural rework — polish-only per user note.
- Illustrative asset files (all SVGs inline).
- Token additions beyond those cited from design-system.html §17 / §13.
- Teacher/admin portal changes (parent-only cycle — if S1/S2 touches shared `components/ui/` consumer-side, teacher/admin stay on default-variant path, zero drift).

### Decisions (ambiguity locked)

1. **Hero surface on home.** Banner IS the primary surface when any kid needs attention; the top child-row card IS the primary surface when all clear. Both elevated via `shadow-card`, others recede to `bg-card` only.
2. **Islamic motif choice.** Single geometric dot-lattice (8-pointed rub-el-hizb-inspired) inline SVG on greeting block background at 2–3% opacity. No calligraphy (typography rendering risk on mid-range Android). No moon/mosque icons (kitsch).
3. **Invoices list primitive.** Full replace of DataTable with `Card`-list (`<Card>` per row). Ordering + search + filter preserved via existing state hooks; pagination removed (parent household invoice count bounded).
4. **Status chip icons.** Lucide only, `size-3.5` (14 px), stroke-2. No new icons.
5. **Shared StatusBadge API.** Additive props (`icon?`, `variant?`). Default = current behavior. Opt-in at T1/T2 call sites.
6. **Voice patch scope.** Only `Tidak Hadir → Alpa` in parent attendance summary. No wider attendance rework this cycle.
7. **Animation library.** Framer Motion already in tree (used by PortalTabs/PortalBottomNav). No new dep; reuse.
8. **Screenshot evidence.** Playwright MCP at 375×812 + 1280×800 per commit; production staging URL (https://annisaa-erp-v3.vercel.app) as source of truth for before; dev server for after. Before-set captured once at start of `/build` and reused.

### Assumptions

1. **Staging seed intact.** rightjetParent still has 3 kids (Fatimah Az-Zahra added in cycle-2 A1). Verified: `git log prisma/seed.ts` shows A1 commit on staging.
2. **Framer Motion already imported where needed.** Verified: `components/portal/portal-tabs.tsx` imports `motion` from `framer-motion`; package.json includes it.
3. **`text-display` token exists.** **To verify in /build Step 0** — if missing from globals.css, this cycle adds it per design-system.html §17 with citation and flags token adoption for cycle 4 other surfaces.
4. **StatusBadge consumer count.** ~15 consumers across admin/teacher/parent. Additive API = zero consumer break. Verified via `grep -r 'StatusBadge' app components --include='*.tsx' -l | wc -l` in /build preflight.
5. **Xendit payment flow route exists.** T2 detail sheet CTA links to existing route (no new API). Verify in /build preflight.
6. **`frontend-design` subagent type does NOT exist.** Confirmed by inspecting available subagent_types (claude-code-guide, Explore, feature-dev:*, general-purpose, Plan, statusline-setup, superpowers:code-reviewer). `frontend-design` only exists as a **Skill** (`frontend-design:frontend-design`), not a subagent. Cycle-2 fallback rationale was correct but retry plan was wrong. **This cycle:** use `general-purpose` subagent + inside each subagent prompt, invoke `Skill("frontend-design:frontend-design")` first so the design-quality guide loads as subagent context, then execute task. Also attach explicit design-system.html section refs per task.

→ Correct any decision/assumption before `/build`, or proceed with these.

---

## Tasks

Organized T/S per target above. `/build` will fan subagents per S-task (independent) and sequence T-tasks per their S-dependencies. Between-task gate: `npm run build && npm run lint && npx vitest run`. End-of-cycle gate: also `DEMO_MODE=true npx playwright test` + axe.

### Preflight (pre-task, no commit)

- [ ] **P0. Before-screenshots.** Playwright MCP: navigate staging `https://annisaa-erp-v3.vercel.app` at 375×812 + 1280×800 → capture /parent, /parent/invoices list, /parent/invoices detail (open first unpaid), /parent/attendance (for S3 verification), /parent/reports (cycle-4 baseline). Save PNGs under `docs/cycles/assets/2026-04-23/before/` (gitignored if needed; else inline-reference in Verification). Result: 10 baseline screenshots ready.
- [ ] **P1. Assumption verifications.** Confirm `text-display` token status; count StatusBadge consumers; confirm Xendit CTA route; confirm Framer Motion import availability. Result: Spec assumptions green or one-sentence deviation documented.

### Shared primitive work (parallel subagent dispatch)

- [ ] **S1. StatusBadge severity icons.** Extend `components/ui/status-badge.tsx` with `icon?: LucideIcon` + `variant?: 'solid' | 'intent'`. `intent` = icon + label + subtle-tinted bg + 2 px tone-tinted border-left. Intent map inline.
  - File: `components/ui/status-badge.tsx`.
  - Acceptance: default variant byte-identical behavior; intent variant renders icon per map; unit test for both.
  - Cross-check: design-system.html §Status-chip set + voice.md glossary.
  - Depends on: none.

- [ ] **S2. EmptyState warm accent.** Extend `components/ui/empty-state.tsx` with `accent?: 'warm' | 'celebration' | 'neutral'`. Warm = teal tint + primary icon. Celebration = gold tint + gold icon. Neutral = default unchanged.
  - File: `components/ui/empty-state.tsx`.
  - Acceptance: default unchanged; tokens-only tinting; unit test.
  - Cross-check: design-system.html §Empty patterns + voice.md.
  - Depends on: none.

- [ ] **S3. Voice glossary sweep.** `app/parent/attendance/page.tsx` `"Tidak Hadir"` → `"Alpa"`. Grep sweep full parent scope.
  - Files: `app/parent/attendance/page.tsx` + any drift.
  - Acceptance: grep `\b(Invoice|Present|Absent|Report Card|Tidak Hadir|Sick|Ill)\b` in `app/parent components/parent` = 0.
  - Depends on: none.

- [ ] **S4. Token audit.** Add to `app/globals.css` (each with §-ref comment): `--text-display`, `--tracking-display`, `--shadow-card-elevated`, `--shadow-card-resting`, `--motif-opacity: 0.03`, `--celebration-gold` + `-subtle` + `-text` triad if not present.
  - File: `app/globals.css`.
  - Acceptance: T1–T4 consume tokens w/o arbitrary `[32px]` / raw hex.
  - Depends on: P1.

- [ ] **S5a. SummaryHero primitive.** New `components/portal/summary-hero.tsx`. Props: `{ tone: 'danger'|'warn'|'success'|'celebration'|'neutral'; icon?: LucideIcon; primary: ReactNode; secondary?: ReactNode; action?: ReactNode; elevated?: boolean }`. Token-tinted bg + 4 px tone-left-accent when elevated. Header file comment cites 2nd-instance trigger (T1 banner + T2 invoices + T3 attendance week + T4 rapor latest = 4 consumers).
  - File: new `components/portal/summary-hero.tsx`.
  - Acceptance: unit test per tone; visual at 375 via Playwright.
  - Depends on: S4.

- [ ] **S5b. CardListItem primitive.** New `components/portal/card-list-item.tsx`. Props: `{ href?: string; onClick?: () => void; leading?: ReactNode; primary: ReactNode; secondary?: ReactNode; meta?: ReactNode; trailing?: ReactNode; pressed?: boolean }`. Link or button render; press-state `active:scale-[0.98]` 150 ms; hover ring; focus-visible ring. Header cites consumers (T1 child rows + T2 invoice rows + T3 day rows + T4 rapor rows).
  - File: new `components/portal/card-list-item.tsx`.
  - Acceptance: keyboard nav (Enter/Space) works both forms; unit test.
  - Depends on: none.

### T1 — /parent home visual overhaul

- [ ] **T1a. Greeting block + Islamic accent.** `app/parent/page.tsx` greeting region: apply `text-display` ramp for Assalamu'alaikum line; secondary line muted; inline SVG geometric dot-lattice motif at 2–3% opacity behind greeting (absolute-positioned, pointer-events-none). Respects prefers-reduced-motion (static).
  - File: `app/parent/page.tsx` + inline `<svg>`.
  - Acceptance: visible ramp at 375 (screenshot); motif visible on white bg but not distracting; H1 contrast ≥ 4.5:1.
  - Cross-check: design-system.html §17 Typography + §18 Voice parent.
  - Depends on: S4.

- [ ] **T1b. Urgency banner elevation + hierarchy.** `components/parent/household-overview.tsx` banner region: swap flat `bg-destructive/10 border` for elevated `shadow-card bg-card border-l-4 border-l-destructive` when attention needed; elevated `shadow-card bg-card border-l-4 border-l-status-present` when all clear; add intent icon via S1; banner-as-primary-surface.
  - Files: `components/parent/household-overview.tsx`.
  - Acceptance: banner reads as primary surface (elevation + left-accent); child rows recede (no border, only hover ring); 3m glance test via 2×-shrunk screenshot shows banner first.
  - Cross-check: design-system.html §14 Household Overview mockup.
  - Depends on: S1.

- [ ] **T1c. Child row redesign.** `components/parent/household-overview.tsx` `ChildRow`: move today-chip from inline-with-name to row 2 (below name + class); expand name column to full row width; avatar upgrade to `size-11` with brand-teal-tinted gradient fallback; chevron `size-4 text-muted-foreground/60` on press transitions to primary. Tap press state: `active:scale-[0.98] transition-transform duration-150`.
  - File: `components/parent/household-overview.tsx`.
  - Acceptance: name no longer truncates at 22 chars; row vertical rhythm even; 3 rows fit in fold with banner above at 375×812 (verified screenshot).
  - Depends on: S1, T1b.

- [ ] **T1d. Signal cells severity + icons.** `HouseholdOverview` 3-up signal strip: each cell leads with intent icon (S1) + uppercase micro-label + primary value + optional hint. Tagihan cell teal-tinted when paid (not grey). Rapor cell gold-celebration-tinted when published.
  - File: `components/parent/household-overview.tsx`.
  - Acceptance: at 3m shrink, each cell's intent is decipherable from icon + color alone; color distinct per intent per design-system.html §Status palette.
  - Depends on: S1, S2.

- [ ] **T1e. 2-kid fallback path review.** `app/parent/page.tsx` <3-kid branch uses `PortalTabs` child switcher + per-child cards (existing). Apply same elevation + status-chip + Islamic motif pass to this branch so both paths feel crafted.
  - File: `app/parent/page.tsx` (pill-tab branch only).
  - Acceptance: pill-tab branch greeting + first card match 3-kid path craft level. Toggle-verified with seed adjustment in /build (temporary local change, reverted before commit).
  - Depends on: T1a, S1.

### T2 — /parent/invoices visual overhaul

- [ ] **T2a. Summary hero.** `app/parent/invoices/client.tsx`: replace top of page (post-ChildSelectorTabs) with an outstanding-summary card — `formatRupiah(totalOutstanding)` in large `text-display` tabular-nums, muted label "Total belum dibayar · {count} tagihan · jatuh tempo {nearestDue}" below, danger-left-accent when > 0, success-left-accent with Alhamdulillah copy when 0. PortalTabs filter moves BELOW the hero.
  - File: `app/parent/invoices/client.tsx`.
  - Acceptance: hero above-fold at 375; number is primary surface; tone matches state; zero layout shift on child switch.
  - Cross-check: design-system.html §14 (Parent money hero pattern).
  - Depends on: S4, S1.

- [ ] **T2b. Card list replacement.** Replace `<DataTable>` with responsive card list (each invoice = one `<button>` or `<Link>` card → opens detail sheet). Row: period label (e.g. "Mei 2026"), amount `formatRupiah`, status chip via S1 intent icon. Hover/active press state. Ordering preserved; no pagination (parent invoice count bounded).
  - File: `app/parent/invoices/client.tsx` (+ possibly extract `InvoiceCard` inline if small, else keep inline — no new primitive unless 2nd instance emerges).
  - Acceptance: table entirely removed; cards render on mobile + desktop; tap opens detail sheet; keyboard nav preserved; Playwright passes.
  - Depends on: S1, T2a.

- [ ] **T2c. Empty + clear states.** Filter = "Sudah Dibayar" with no results → `<EmptyState accent="celebration">` with "Alhamdulillah" copy. Filter = "Belum Bayar" with zero → `<EmptyState accent="warm">` with "Semua tagihan lunas" celebration copy. No-invoices-total → neutral warm invitation to contact school office.
  - File: `app/parent/invoices/client.tsx`.
  - Acceptance: filter-driven empty branches tested via Playwright toggling.
  - Depends on: S2.

- [ ] **T2d. Detail sheet hero + body.** `app/parent/invoices/invoice-detail-sheet.tsx`: replace current flat list with — (1) hero card with amount + status chip + due date, tone-tinted, (2) fee-component line items in mono tabular-nums, (3) payment history section with method icons, (4) primary CTA on unpaid "Lihat cara bayar" (link to existing flow), secondary "Tutup" outline.
  - File: `app/parent/invoices/invoice-detail-sheet.tsx`.
  - Acceptance: sheet body `p-card` preserved; hero card reads as primary; items tabular-aligned; CTA links existing route (no new API); opens smooth at 180 ms.
  - Cross-check: design-system.html §13 Overlays inner-padding, §14 invoice detail pattern.
  - Depends on: S1, T2a.

### T3 — /parent/attendance visual overhaul

- [ ] **T3a. Weekly summary SummaryHero.** Replace inline `Minggu ini:` chip row with `<SummaryHero>` — primary = "Hadir N · Sakit M · Alpa K · Izin L", tone = "success" if all Hadir, "warn" if any Sakit/Izin, "danger" if any Alpa. Icon = CalendarDays. S3 voice fix lands here.
  - File: `app/parent/attendance/page.tsx`.
  - Acceptance: hero above H1; voice = Alpa; tone derived correctly per week state; screenshot.
  - Depends on: S1, S3, S5a.

- [ ] **T3b. H1 + filter order.** Move `"Kehadiran Anak"` H1 above hero (header-first hierarchy) per portal PageHeader contract; date-range filter + status filter below H1. Swap native `<input type="date">` + native `<select>` for Shadcn DatePicker + Select.
  - File: `app/parent/attendance/page.tsx`.
  - Acceptance: H1 → hero → filters → list order; no native unstyled inputs; Playwright keyboard nav.
  - Depends on: T3a.

- [ ] **T3c. Day list card replacement.** Remove DataTable; render `<CardListItem>` per day — leading = date badge (Tanggal + weekday), primary = status chip (S1 intent), secondary = teacher note snippet if present. No pagination. Sort newest-first.
  - File: `app/parent/attendance/page.tsx`.
  - Acceptance: DataTable removed; cards render; status chips distinct icons; 3m-glance verified.
  - Depends on: S1, S5b, T3b.

- [ ] **T3d. Empty state.** No records → `<EmptyState accent="warm">` with warm Insyaallah copy.
  - File: `app/parent/attendance/page.tsx`.
  - Acceptance: empty branch explicit (portal.md §Empty State Contract); Playwright smoke.
  - Depends on: S2.

### T4 — /parent/reports visual overhaul

- [ ] **T4a. Latest-rapor SummaryHero.** Above rapor list: `<SummaryHero>` showing latest rapor status — celebration-gold when `PUBLISHED` with "Rapor {semester} Aisyah sudah terbit · Alhamdulillah" + primary CTA "Lihat Rapor" → opens detail sheet. Muted when DRAFT with "InsyaAllah rapor tersedia setelah Ustadzah finalisasi".
  - File: `app/parent/reports/page.tsx` (or `client.tsx`).
  - Acceptance: hero above the fold; tone derived from status; voice matches voice.md §rapor patterns.
  - Depends on: S1, S4, S5a.

- [ ] **T4b. Term card list.** Per-semester rapor rendered as `<CardListItem>` — leading = term icon (GraduationCap), primary = "Rapor Semester X {academicYear}", secondary = teacher name + publish date via `formatDate`, trailing = S1 intent chip (PUBLISHED/DRAFT). Tap → existing detail sheet.
  - File: `app/parent/reports/page.tsx` + minor edits to existing detail-sheet opener wiring.
  - Acceptance: title no longer truncates ambiguously; publish date visible; keyboard nav; screenshot.
  - Depends on: S1, S5b, T4a.

- [ ] **T4c. Detail sheet visual pass.** Existing rapor detail sheet: add `<SummaryHero>` header at top (semester + term + status chip + publish date); group score sections by subject with `text-h2` heading + `tabular-nums`; teacher notes block → warm-accent `border-l-4 border-l-primary bg-primary/5 p-card rounded-md`. `p-card` inner wrapper preserved.
  - File: rapor detail sheet component (locate in /build).
  - Acceptance: no API touch; sheet motion 180 ms; screenshot.
  - Depends on: S1, S5a.

- [ ] **T4d. Empty / pre-publish state.** No rapor yet → `<EmptyState accent="warm">` with "Rapor belum terbit. InsyaAllah akan tersedia setelah Ustadzah finalisasi nilai."
  - File: `app/parent/reports/page.tsx`.
  - Acceptance: empty branch explicit; Playwright smoke.
  - Depends on: S2.

### T5 — /parent/student-journal polish

- [ ] **T5a. Today-column highlight.** `components/portal/week-grid.tsx`: today cell bg `--status-present-subtle` + `border-t-2 border-b-2 border-primary`; week-header today-label `text-primary font-semibold`. Strengthen only — no layout change.
  - File: `components/portal/week-grid.tsx`.
  - Acceptance: today column readable at 4G-dimmed screen; screenshot.
  - Depends on: none.

- [ ] **T5b. Jumat no-clip at 375.** Audit grid-cols width; cap label column min-width; ensure all 5 weekday columns fit viewport. Sticky-first-column preserved.
  - File: `components/portal/week-grid.tsx`.
  - Acceptance: 375×812 screenshot shows Jumat column fully visible.
  - Depends on: T5a.

- [ ] **T5c. Category-header warmth.** Ibadah/Akademik/Karakter group headers: `border-l-4 border-l-primary bg-primary/5 pl-3 py-2 text-h2 font-semibold`. No additional spacing change.
  - File: `components/portal/week-grid.tsx` or wherever category groupings render.
  - Acceptance: visible tier between category header and row cells; screenshot.
  - Depends on: none.

- [ ] **T5d. NoteThread timestamp audit.** `components/student-journal/note-thread.tsx` (or current path): `toLocale` → `formatDate` / `formatTime` per portal standards.
  - File: NoteThread component.
  - Acceptance: grep `toLocale` in note-thread + parent journal = 0; visual unchanged (Indonesian locale preserved via formatter).
  - Depends on: none.

### Gates + ship

- [ ] **G1. Between-task gate per commit.** `npm run build && npm run lint && npx vitest run` — green before each commit.
- [ ] **G2. Regression greps.** D1/D3/D4/F voice = 0 drift in parent scope. Commands:
  ```
  grep -rn '\.catch(\s*()\s*=>\s*{\s*})' app/parent components/parent
  grep -rn 'text-\[10px\]\|text-\[11px\]' app/parent components/parent
  grep -rn 'toLocale' app/parent components/parent
  grep -rn '\b(Invoice|Present|Absent|Report Card|Tidak Hadir)\b' app/parent components/parent
  ```
  Acceptance: all four = 0.
- [ ] **G3. End-of-cycle gate.** `npm run build && npm run lint && npx vitest run && DEMO_MODE=true npx playwright test` + Playwright axe scan on /parent + /parent/invoices → zero new violations.
- [ ] **G4. Before/after screenshot PR bundle.** Pairs at 375×812: home ≥3-kid, home <3-kid fallback, invoices outstanding, invoices all-paid, invoice detail unpaid, invoice detail paid, attendance week with alpa, attendance empty, reports published-celebration, reports draft-muted, rapor detail sheet, journal today-highlight. Plus 3 desktop pairs (home/invoices/reports @1280). Embedded in PR description.
- [ ] **G5. `/ship` → PR to staging.** Auto-merge via `gh pr merge <n> --auto --squash`. Watch CI green; fix red via NEW commit.

### Dependency graph (for `/build` subagent fan-out)

```
P0, P1 (serial preflight)
  └─> S1, S2, S3, S4, S5b (parallel fan-out — independent)
        └─> S5a (needs S4)
              ├─> T1a (needs S4) → T1b (S1) → T1c (T1b,S5b) → T1d (S1,S2) → T1e
              ├─> T2a (S4,S1,S5a) → T2b (T2a,S1,S5b) → T2c (S2) + T2d (T2a,S1,S5a)
              ├─> T3a (S1,S3,S5a) → T3b → T3c (S1,S5b) + T3d (S2)
              ├─> T4a (S1,S4,S5a) → T4b (S1,S5b) + T4c (S1,S5a) + T4d (S2)
              └─> T5a, T5b (after T5a), T5c, T5d (parallel within T5)
  └─> G1 per commit; G2..G5 serial at end.
```

`/build` dispatch: P0/P1 serial. S1/S2/S3/S4/S5b parallel fan-out (5 subagents). S5a after S4. T1-chain / T2-chain / T3-chain / T4-chain / T5-chain parallel-across as S-deps land (expect 4 concurrent chain heads once S4+S5a land). Between-task gate G1 after every commit. Final G2–G5 serial. Every subagent prompt opens by invoking `Skill("frontend-design:frontend-design")` + cites relevant design-system.html §.

## Implementation

- **Task S4 (tokens):** `app/globals.css` +29 lines. New tokens — `--celebration-gold` + `-subtle` + `-text` triad (raw values `#D4A017` / `#FFF8E1` / `#8A6B00`, WCAG AA verified on subtle bg); `--shadow-card-resting` (Tailwind `shadow-sm` equivalent) + `--shadow-card-elevated` (6px blur, 2-layer); `--motif-opacity: 0.03` for Islamic geometric accents on greeting surfaces. Each block documented inline with design-system.html §13 / §14 / §18 citations. `@theme inline` block exposes them as `--color-celebration-gold-*` + `--shadow-card-*` Tailwind utilities. `npm run build` ✓, `vitest run` 240/240 pass, `npm run lint` 0 errors. Cross-checked design-system.html §14 Page Recipes (celebration patterns) + §13 Overlays (elevation).

## Verification

<!-- /build fills per task — before/after 375 + 1280 per commit -->

## Ship Notes

<!-- /ship fills -->
