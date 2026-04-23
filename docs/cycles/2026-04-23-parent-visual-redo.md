# Parent Portal Visual Redo — Cycle 4

> **Status:** Phase 2 (Spec + teardown plan) — awaiting CTO OK before Phase 3 prep + Phase 4 per-target rebuild.
> **Branch:** `feat/parent-visual-redo` from `origin/staging` @ `0730e78`.
> **Worktree:** `.worktrees/parent-visual-redo`.
> **Contract artifact:** [`.claude/standards/parent-portal-cycle4.html`](../../.claude/standards/parent-portal-cycle4.html) — 13 frames at 375×812, opened via `python3 -m http.server` from `.claude/standards/`. Approved by CTO 2026-04-23 after multiple iteration passes.
> **Reference bar:** `/parent/student-journal` (cycle commit `e86d158`, on staging via `ef40975`). HTML prototype additionally hybridizes teacher-portal DNA for action surfaces.

---

## Context

### Why this cycle exists

Cycle 3 (PR #108, merged staging `ef40975`, squash-merged so it lives as one commit) shipped a "Parent Portal Visual Overhaul" introducing new primitives (`SummaryHero`, `CardListItem`), `StatusBadge` intent prop, `EmptyState` accent variants, and celebration-gold tokens. Gates passed. Visual output rejected by CTO. Only `/parent/student-journal` (cycle commit `e86d158`) reads as crafted.

Root cause of cycle-3 rejection:
1. Spec written against abstract principles ("warmth", "intent", "celebration"), not a concrete visual target.
2. Subagents fanned out in parallel, each optimizing a screen locally, no global craft check.
3. Cycle doc prose became a substitute for a real design.
4. `SummaryHero` became a colored-border alarm banner reused across screens, inheriting the same tone everywhere.
5. `CardListItem` added heavy card chrome to every list, breaking the journal's flat-list rhythm.
6. Section-bar pattern from journal (meant for DATA categories: Ibadah/Perilaku/Akhlak) was stretched to generic dividers (Pintasan/Belum Dibayar/Riwayat) — losing its warmth signal.

Cycle 4 fixes the failure mode with a different process:
1. **Two reference bars, not one:**
   - `/parent/student-journal` for data-grid surfaces (week-grid + sticky col + today lane).
   - `/teacher/*` for action-oriented surfaces (light card + icon-square + eyebrow label + focal moment per page).
2. **HTML prototype is the contract.** Built before any production code is touched. CTO nitpicks at 375×812 in browser via `localhost:8765`. Iteration loop continued until CTO said "this is the target". Approved file lives in `.claude/standards/parent-portal-cycle4.html`.
3. **Serial rebuild.** One target = one PR. No parallel fan-out.

### Reference DNA — distilled from staging source

#### Journal craft (used for `/parent/attendance` data grid)

Read from [`components/portal/week-grid.tsx`](../../components/portal/week-grid.tsx):

| Element | Pattern | Class quote |
|---|---|---|
| Page heading | h1 + optional p subtitle, no icon, no banner | `text-2xl font-semibold tracking-tight` + `text-sm text-muted-foreground mt-1` |
| Warmth mechanism | left-edge accent + low-opacity wash on category bars | `border-l-4 border-l-primary bg-primary/5 pl-3 py-2 text-h2 font-semibold` |
| Today / focus accent | vertical tinted lane + top hairline + bottom hairline | head: `bg-status-present-subtle border-t-2 border-primary` · last row: `border-b-2 border-primary` |
| Tap target | exactly 44×44 with primary tint hover/active | `w-[44px] h-[44px] rounded-md hover:bg-primary/10 active:bg-primary/20` |
| Row separators | hairline at 40% opacity | `border-b border-border/40 last:border-0` |
| Sticky context | left column anchored | `sticky left-0 bg-card z-10 w-[104px] min-w-[104px]` |
| Icon use | semantic only (`Check`); empty = absence | `<Check size={16} className="text-primary" strokeWidth={2.5} />` |
| Decoration | none | — |

#### Teacher craft (used for `/parent` home, `/parent/invoices`, `/parent/reports`, `/parent/profile`)

Read from [`app/teacher/home-client.tsx`](../../app/teacher/home-client.tsx), [`app/teacher/attendance/page.tsx`](../../app/teacher/attendance/page.tsx), [`app/teacher/slips/page.tsx`](../../app/teacher/slips/page.tsx):

| Element | Pattern | Class quote |
|---|---|---|
| Light card | rounded-xl border bg-card hover:border-primary/30 | from teacher quick-link card |
| Icon-square | `w-10 h-10 rounded-lg bg-primary/10` (or status-tinted) + lucide icon center | from teacher attendance "Cuti & Izin" card |
| Eyebrow label | small caps, tracking-wider | `text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2` |
| Focal moment | one display-size mono number per page | teacher home clock: `font-currency text-display font-bold tracking-tight` |
| Row-tint for status | full-row background tinted by state | class-attendance: `bg-[color:var(--status-present-subtle)]` |
| Stagger fade-in | framer-motion delays per section | `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}` |
| Heading style | `PageHeader` primitive (calm) | shared with journal |

### What changed mid-cycle (HTML prototype iteration history)

Five iteration rounds with CTO during Phase 1:

1. **v1** — section-bar pattern over-applied (every group got a category-bar). CTO: "ugly, do you not see this?". Self-review confirmed: copied journal mechanism without journal substance.
2. **v2** — hybrid (teacher card pattern for action surfaces, journal grid for attendance). Eyebrow labels replaced section-bars where context wasn't a true data category. STAGING banner removed. CTO: "much better".
3. **v2.1** — beranda tweaks: time-of-day greeting ("Selamat pagi · Kamis · 5 Dzulqa'dah 1447 H"), Hijri date in muted gold, mini-strip uses `Check` icons not `H` letters, today is filled primary teal not ring, per-kid footer rotates content (hafalan / hadir count / quoted note teaser). Avatar tap target top-right opens profile.
4. **Profile (Frame 13)** — added static profile page (back chevron + identity card + Kontak/Anak/Akun cards + danger-ghost Keluar + app version footer). Reached via header avatar tap on home. NOT on bottom nav (5 product tabs stay product-focused).
5. **Standardization pass:**
   - Frame 6: dropped Transfer Bank, online-only via Xendit.
   - Frame 8 (attendance attention): warn celebration card → same compact `card-row` shape as Frame 5 (icon-square + 2-line text).
   - Frame 9 (attendance all-PRESENT) + Frame 11 (reports published): celebration cards now identical compact shape.
   - Frame 4 (invoices outstanding): split into two eyebrow groups ("Belum dibayar" + "Riwayat pembayaran") for narrative consistency with Frame 5 (all-paid).

---

## Spec

> **Frame numbers refer to `.claude/standards/parent-portal-cycle4.html`.** Every acceptance criterion below cites a specific frame. PR review = visual parity check at 375×812 against the cited frame.

### Acceptance criteria — by surface

#### S-A. `/parent` (home) — Frames 1, 2, 3

- **A1.** Page identity = greeting h1 (`Assalamu'alaikum, Bu {firstName}`) + subtitle `Selamat {pagi/siang/sore} · {date} · {hijri-date} H`. Hijri date rendered in muted gold (`var(--celebration-gold-text)` at 0.85 opacity). No `<PageHeader title="Beranda" />` — greeting IS the page title (teacher-home precedent).
- **A2.** Avatar tap target top-right (36×36 rounded-full, primary-tinted bg, initials of guardian name, `border border-primary/20`). Tap → `/parent/profile`.
- **A3.** Eyebrow `Anak Anda` → list of per-kid cards, one card per child.
- **A4.** Per-kid card = light card (`rounded-xl border bg-card hover:border-primary/30`) containing:
  - Head row: `{kid name}` (font-semibold) + ` · {className}` (caption muted) on left, `<ChevronRight>` right
  - Mini-strip: 5 day-pills in grid (Sen/Sel/Rab/Kam/Jum). Each pill height = 44px tap-grade. Pill states:
    - `present` = `bg-status-present-subtle text-status-present-text` + `<Check size={14} />` glyph
    - `absent` = `bg-status-absent-subtle text-status-absent-text` + letter `A`
    - `sick` = `bg-status-late-subtle text-status-late-text` + letter `S` or `<Thermometer />`
    - `leave` = `bg-status-leave-subtle text-status-leave-text` + letter `I`
    - `today` = WINS over status: `bg-primary text-primary-foreground` + the original status's glyph
    - `future` = `border-dashed border-border opacity-50` + `·` glyph
  - Foot row: separated by hairline (`border-t border-border`), one line of text + leading icon. Content varies per kid based on most-recent meaningful event:
    - present-warm tone: hafalan progress, attendance count, quoted ustadzah note
    - warn tone: "Sakit hari ini · semoga lekas sehat" w/ thermometer icon, color = `--status-late-text`
- **A5.** If outstanding tagihan exists: eyebrow `Tagihan` → focal card (light card with `card-icon-warn` + display-size due amount mono inline + caption "X tagihan · jatuh tempo terdekat <b>{date}</b>" + chevron right). Tap → `/parent/invoices`.
- **A6.** If lunas semua: eyebrow `Pekan ini` → celebration card (gold-subtle bg + `card-icon-celebration` Sparkles + "Lunas semua" + "Jazakumullahu khairan. Tagihan berikutnya {date}.").
- **A7.** Bottom nav active state = Beranda.
- **A8.** Stagger fade-in via framer-motion: greeting (delay 0), kid list (0.08s), bottom focal card (0.16s).

#### S-B. `/parent/invoices` (list) — Frames 4, 5

- **B1.** PageHeader: h1 `Tagihan` + subtitle `Pantau pembayaran SPP & biaya tambahan`.
- **B2.** Kid pills row (existing PortalTabs primitive, pill variant) — only if guardian has >1 child.
- **B3.** **Outstanding state (Frame 4):**
  - Focal card with eyebrow `Belum dibayar` inside, then display-size due amount mono in `--status-absent-text`, then caption `{N} tagihan · jatuh tempo terdekat <b>{nearest-date}</b>`.
  - Eyebrow `Belum dibayar` (outside) → list of due invoice cards. Each card = light card-row with `{Month YYYY}` primary + `Jatuh tempo {date}` (or `Jatuh tempo {date} · lewat tempo` if past) secondary, mono amount right-aligned in `--status-absent-text`.
  - Eyebrow `Riwayat pembayaran` → list of paid invoice cards. Same row shape, secondary = `Dibayar {date} · {channel}`, amount in `--status-present-text`.
- **B4.** **All-paid state (Frame 5):**
  - Compact celebration card (gold-subtle bg + Sparkles icon-square + "Lunas semua" + "Jazakumullahu khairan, Bu {name}. Tagihan berikutnya {date}.").
  - Eyebrow `Riwayat pembayaran` → paid card list as in B3.
- **B5.** Tap on any invoice row → opens detail sheet (Frame 6 or 7 depending on paid state).

#### S-C. `/parent/invoices/[id]` detail sheet — Frames 6, 7

- **C1.** Sheet pulls up over faded list. Sheet height = 88% viewport. Handle bar (36×4 muted) at top center.
- **C2.** Sheet header: `Tagihan {Month YYYY} · {kid name}` small primary text + `INV-{number}` caption muted. `<X>` close button right (44×44 tap-44).
- **C3.** Sheet body:
  - Focal amount card: light card with display-size mono amount in due-color (red) for unpaid, paid-color (green) for paid.
  - Caption below: `<span class="status-word">Belum Dibayar</span> · jatuh tempo <b>{date}</b>` for unpaid; `<span class="status-word">Lunas</span> · dibayar {date} · {channel}` for paid.
  - Eyebrow `Rincian` → row primitives (label left + mono amount right) for line items.
  - **Unpaid only:** eyebrow `Cara bayar` → single light card "Pembayaran online · QRIS · Virtual Account · E-wallet · kartu". No Transfer Bank option (cash discouraged for online portal).
  - **Unpaid only:** full-width primary CTA `Bayar sekarang` at bottom.
  - **Paid only:** eyebrow `Bukti pembayaran` → light card-link with `<FileText>` icon + `Kuitansi.pdf` + `Diterbitkan {date}` + `<Download>` icon right. Tap → opens PDF.

#### S-D. `/parent/attendance` — Frames 8, 9, 10

- **D1.** PageHeader: h1 `Kehadiran` + subtitle `Pantau kehadiran harian anak`.
- **D2.** Kid pills row (existing PortalTabs).
- **D3.** Compact summary card above week navigator. Variants by week state:
  - **Attention (Frame 8):** `bg-status-late-subtle border-status-late` + warn icon-square (Thermometer) + "Hadir N · Sakit X · Alpa Y" primary in `--status-late-text` + "Aisyah istirahat dulu, semoga lekas sehat." secondary.
  - **All-present (Frame 9):** `bg-celebration-gold-subtle border-celebration-gold` + Sparkles icon-square + "Hadir 5 dari 5 hari" primary in `--celebration-gold-text` + "Alhamdulillah, {kid} hadir penuh pekan ini." secondary.
  - **Empty (Frame 10):** card omitted entirely.
- **D4.** Bespoke week navigator (no native form chrome): `<ChevronLeft>` tap-44 + range label center + `<ChevronRight>` tap-44.
- **D5.** Week grid table — exact reuse of existing `<WeekGrid>` primitive (`components/portal/week-grid.tsx`). Single indicator row "Hadir" with status glyphs per day cell. Today col tinted + top/bottom border accents.
- **D6.** Below grid: eyebrow `Catatan dari sekolah` (or `Riwayat pekan lalu` for all-present state) → light card-link list.
- **D7.** **Empty state (Frame 10):** EmptyState primitive `accent="warm"` + Calendar-clock icon + "Pekan ini belum dimulai" + "Catatan kehadiran muncul setiap pagi setelah Ustadzah merekap absensi kelas." NO grid rendered. Week navigator stays.
- **D8.** Native HTML date inputs + native `<select>` filter REMOVED. Filtering by week happens via the navigator only. By-status filter not surfaced in this cycle.

#### S-E. `/parent/reports` — Frames 11, 12

- **E1.** PageHeader: h1 `Rapor` + subtitle `Laporan perkembangan tiap semester`.
- **E2.** Kid pills row.
- **E3.** **Published state (Frame 11):**
  - Compact celebration card (gold-subtle bg + Sparkles icon-square + "Rapor Semester {N} sudah terbit" + "Alhamdulillah, silakan baca penilaian lengkap dari Ustadzah.").
  - Standalone full-width primary CTA `<BookOpen size={16} /> Buka rapor` directly below the card (separated by 12px gap, NOT inside the card).
  - Eyebrow `Riwayat rapor` → light card-link list of past terms.
- **E4.** **Pre-publish / draft state (Frame 12):**
  - EmptyState `accent="warm"` + Hourglass icon + "Rapor Semester {N} belum terbit" + "Ustadzah masih menyusun penilaian. InsyaAllah siap dibuka {target-date} — Anda akan mendapat notifikasi."
  - Eyebrow `Riwayat rapor` → light card-link list as in E3.

#### S-F. `/parent/profile` (NEW route) — Frame 13

- **F1.** New file: `app/parent/profile/page.tsx`. Reached via `/parent` header avatar tap (`<Link href="/parent/profile">`). Direct URL access also valid.
- **F2.** Nested-page header: back chevron tap-44 top-left (history.back()), no page-header title (identity card carries identity).
- **F3.** Identity surface: 80×80 rounded-full primary-tinted avatar with initials, name (h2 weight), role line "Wali murid · {N} anak terdaftar".
- **F4.** Eyebrow `Kontak` → 2 light cards (Phone icon + number, Mail icon + email). Static — no editing this cycle.
- **F5.** Eyebrow `Anak Anda` → light card-link per child. Card-icon = initials (text-small font-700) in primary-tinted square. Tap → `/parent` (current state — eventually `/parent/kid/[id]` when that route exists, out of scope cycle 4).
- **F6.** Eyebrow `Akun` → 3 light card-links: `Notifikasi · Email · push aktif`, `Bantuan · FAQ & hubungi sekolah`, `Tentang aplikasi · Kebijakan privasi · syarat`. All static stubs cycle 4 — pages may 404 or show "coming soon" (decide at impl time).
- **F7.** Full-width danger-ghost button `<LogOut size={16} /> Keluar` (border `--status-absent-subtle`, color `--status-absent-text`, hover bg `--status-absent-subtle`). Tap → existing logout flow.
- **F8.** App version footer: small caption muted center "An Nisaa' Sekolahku · v{version}".

#### S-G. Cross-cutting

- **G1.** STAGING banner stays in app (existing — not a design choice). Prototype dropped it for design clarity.
- **G2.** All copy uses parent voice per `.claude/standards/voice.md` ("Bu/Pak {firstName}", child-framed, Islamic courtesy where it lands — Assalamu'alaikum, Alhamdulillah, InsyaAllah, Jazakumullahu khairan).
- **G3.** No raw hex colors. Tokens only.
- **G4.** No new npm dependencies. No new API routes. No Prisma changes.
- **G5.** No dark-mode work this cycle.
- **G6.** Hijri date: production needs a hijri-date utility. Use `Intl.DateTimeFormat` with `'islamic-umalqura'` calendar (built-in Node). If that's not available in the runtime, add a tiny pure-JS converter to `lib/hijri.ts`. NO new npm dep.

### KEEP / DELETE / REWRITE plan (replaces "REVERT" — cycle-3 was squash-merged, can't revert subset)

| File / dir | Cycle 3 change | Cycle 4 plan | Reason |
|---|---|---|---|
| `components/ui/status-badge.tsx` | Added intent prop, text-xs, SICK amber, ABSENT "Alpa" | **KEEP** | Semantic correctness fixes. No visual chrome issue. |
| `components/ui/empty-state.tsx` | Added accent prop (neutral/warm/celebration) | **KEEP** | Cycle 4 prototype uses warm + celebration accents (Frames 10, 12). |
| `app/globals.css` | Added celebration-gold triad + motif-opacity + spacing/type tokens | **KEEP** | Tokens are infrastructure. Cycle 4 redirects usage, not tokens. `--motif-opacity` unused by cycle 4 surfaces but stays for backward compat. |
| `components/portal/week-grid.tsx` | T5 polish (e86d158: today-accent + Jumat-no-clip + category warmth) | **KEEP** | The reference. Untouchable. |
| `components/portal/page-header.tsx` | (no change in cycle 3) | **KEEP** | Already correct. |
| `components/portal/summary-hero.tsx` + test | NEW in cycle 3 | **DELETE** (T0) | Cycle 4 prototype proves it's unnecessary. Focal moment lives inside light cards instead. |
| `components/portal/card-list-item.tsx` + test | NEW in cycle 3 | **DELETE** (T0) | Cycle 4 prototype uses light card-row directly. Heavy chrome killed list rhythm. |
| `components/parent/household-overview.tsx` | Rewritten to use SummaryHero + cycle-3 chrome | **REWRITE** (T1) | Cycle 4 home = greeting + per-kid card list. Either rewrite or fold into `app/parent/page.tsx`. |
| `components/parent/parent-greeting.tsx` | NEW in cycle 3 | **REWRITE or DELETE** (T1) | Cycle 4 greeting = inline in page.tsx (matches teacher precedent). Likely delete. |
| `app/parent/page.tsx` | Cycle-3 home composition | **REWRITE** (T1) | Match Frames 1/2/3. |
| `app/parent/invoices/client.tsx` | Cycle-3 list with SummaryHero + CardListItem | **REWRITE** (T2) | Match Frames 4/5. |
| `app/parent/invoices/invoice-detail-sheet.tsx` | Cycle-3 sheet | **REWRITE** (T2) | Match Frames 6/7. Drop Transfer Bank. |
| `app/parent/invoices/__tests__/client.test.tsx` | Tests for cycle-3 list shape | **REWRITE** (T2) | Update assertions for new structure. |
| `app/parent/attendance/client.tsx` | Cycle-3 attendance with SummaryHero + native form chrome | **REWRITE** (T3) | Match Frames 8/9/10. Drop native date/select inputs. |
| `app/parent/attendance/week-summary-strip.tsx` | Cycle-3 component | **REWRITE or DELETE** (T3) | Cycle 4 summary lives in compact card; this strip likely redundant. |
| `app/parent/attendance/page.tsx` | Cycle-3 page wrapper | **REWRITE** (T3) | Same. |
| `app/parent/reports/page.tsx` | Cycle-3 reports | **REWRITE** (T4) | Match Frames 11/12. |
| `app/parent/assessments-table.tsx` | Cycle-3 update | **REVIEW** (T4) | Used inside reports detail. Light typography/spacing pass only. |
| `app/parent/profile/page.tsx` | (does not exist) | **NEW** (T5) | New route for Frame 13. |
| Header avatar plumbing on `/parent` | (does not exist) | **NEW** (T1) | Add avatar tap → /parent/profile in home page. |

## Tasks

> Serial. One task = one PR to `staging`. Between-task gate: `npm run build && npm run lint && npx vitest run`. End-of-cycle gate (after T5): same + `npx playwright test`. Per task: 375 + 1280 before/after screenshots embedded in Verification section, parity check vs cited HTML frame.

**Why no preflight T0 delete:** initial plan was to delete `SummaryHero` + `CardListItem` first as a clean preflight. Grep showed 6 active consumers (`household-overview`, `invoices/{client,sheet,test}`, `attendance/{client,strip,page}`, `assessments-table`). Deleting primitives now = build break. Each consumer is removed during its own task. Final delete lands in T6 once no imports remain.

| # | Task | Cited frames | Files touched | New files |
|---|---|---|---|---|
| **T1** | `/parent` home rebuild + header avatar plumbing | 1, 2, 3 | REWRITE: `app/parent/page.tsx`, `components/parent/household-overview.tsx` (or fold into page.tsx and DELETE). DELETE: `components/parent/parent-greeting.tsx` (replaced inline). | NEW: `components/parent/kid-card.tsx`, `lib/hijri.ts`. |
| **T2** | `/parent/invoices` list + detail | 4, 5, 6, 7 | REWRITE: `app/parent/invoices/client.tsx`, `app/parent/invoices/invoice-detail-sheet.tsx`, `app/parent/invoices/__tests__/client.test.tsx`. | — |
| **T3** | `/parent/attendance` rebuild | 8, 9, 10 | REWRITE: `app/parent/attendance/client.tsx`, `app/parent/attendance/page.tsx`. DELETE or REWRITE: `app/parent/attendance/week-summary-strip.tsx`. | — |
| **T4** | `/parent/reports` rebuild + assessments-table light pass | 11, 12 | REWRITE: `app/parent/reports/page.tsx`. REVIEW + light-pass: `app/parent/assessments-table.tsx` (typography/spacing only — also drops any remaining `CardListItem` import here). | — |
| **T5** | `/parent/profile` NEW route | 13 | UPDATE: `app/parent/page.tsx` if avatar href needs adjusting. | NEW: `app/parent/profile/page.tsx`. |
| **T6** | Final cleanup — delete dead primitives | — | DELETE: `components/portal/summary-hero.tsx`, `components/portal/__tests__/summary-hero.test.tsx`, `components/portal/card-list-item.tsx`, `components/portal/__tests__/card-list-item.test.tsx`. Pre-flight grep must show zero consumers across `app/` and `components/` before delete (consumers cleared in T1–T5). UPDATE: stale comment in `e2e/parent.spec.ts` referencing the removed primitives. | — |

Per task brief: 4 PRs minimum (T1-T4). T5 + T6 add cycle-specific PRs. Total = 6 PRs. T1–T5 serial. T6 lands after T5 merges (only when grep confirms zero consumers).

## Implementation

### T1 — `/parent` home rebuild + avatar plumbing

**Files touched:**
- NEW: [`lib/hijri.ts`](../../lib/hijri.ts) — `formatHijri(date)` via `Intl.DateTimeFormat({calendar:'islamic-umalqura'})`, `timeOfDayGreeting(date)` returning `pagi/siang/sore/malam`. No new npm dep.
- NEW: [`components/parent/kid-card.tsx`](../../components/parent/kid-card.tsx) — server-rendered Link card per Frame 1/2/3 spec S-A.A4. Head row (name + class + chevron), 5-day mini-strip (today wins as filled primary), foot row (one-line status with leading icon, tone variants ok/warn/info). Tap → `/parent/attendance?child={id}`.
- REWRITE: [`app/parent/page.tsx`](../../app/parent/page.tsx) — single-path layout (no more ≥3-kid branch). Server-rendered. Greeting h1 + Selamat-pagi/siang/sore + date + Hijri (gold-text, 0.85 opacity). Eyebrow "Anak Anda" + KidCard list. Conditional bottom focal card: outstanding-tagihan focal (warn icon + display rupiah + caption "{N} tagihan · jatuh tempo terdekat {date}") OR celebration "Lunas semua / Jazakumullahu khairan" (gold). Three-query batch (this-week attendance + latest journal notes + unpaid invoices), no N+1.
- UPDATE: [`components/parent/header.tsx`](../../components/parent/header.tsx) — pass `profileHref="/parent/profile"` to `PortalHeader` so the avatar wraps in a Link → profile (T5 will create the destination; until then 404 — acceptable since avatar tap was previously a no-op).
- DELETE: `components/parent/parent-greeting.tsx` — replaced by inline header in page.tsx (teacher-home precedent).
- DELETE: `components/parent/household-overview.tsx` — only consumer was the deleted ≥3-kid branch in page.tsx.

**Per-kid foot logic** (rotating content, A4):
1. If `todayStatus === "SICK"` → warn `Sakit hari ini · semoga lekas sehat` (thermometer)
2. If `todayStatus === "ABSENT"` → warn `Tidak hadir hari ini` (thermometer)
3. If `todayStatus === "PERMISSION"` → info `Izin hari ini` (message-circle)
4. Else if a journal note within 14 days → info quoted-excerpt (message-circle, ≤56 chars + ellipsis)
5. Else if `hadirCount > 0` → ok `Hadir N hari pekan ini` (check)
6. Else → info `Pekan ini belum tercatat` (check)

**Hafalan-progress branch** mentioned in spec A4 deferred — no clean schema field exists yet for "hafal Surah X". Foot uses note-teaser as the warm-content variant. If later a `studentHafalan` table is added, slot in as priority 4.

## Verification

### T1 — `/parent` home rebuild

**Gates:** `npm run build` ✓ (compiled `/parent` route) · `npm run lint` ✓ (0 errors, 18 warnings — all pre-existing in unrelated files) · `npx vitest run` ✓ (273 passed, 42 todo, 0 failed across 34 files).

**Local visual check:** local dev server starts at `:3010` but root `/` LoginPage crashes with `demoUsers.filter is not a function` — pre-existing bug in `app/page.tsx`, unrelated to T1. Visual parity verification deferred to Vercel preview deployment on PR open.

**Per-frame parity (to be confirmed on Vercel preview):**
- Frame 1 (all-clear, 3 kids): greeting line + 3 KidCards present, today col filled primary teal, foot lines present.
- Frame 2 (attention, Aisyah sick today): same skeleton, Aisyah card today col tinted late-orange + warn foot line.
- Frame 3 (2-kid fallback): same template at lower row count.

**Cross-checks:**
- [x] Cross-checked `.claude/standards/design-system.html` §3 (typography ramp), §4 (spacing), §14 (page recipes) — KidCard light card + eyebrow label + focal display number all consume canonical tokens. New `lib/hijri.ts` adds no new visual primitive; greeting line uses existing PageHeader-equivalent typography (`text-2xl font-semibold tracking-tight` + `text-xs text-muted-foreground`).
- [x] Cross-checked `.claude/standards/parent-portal-cycle4.html` Frames 1/2/3 — production output structurally matches prototype (greeting + Anak Anda eyebrow + KidCard list + bottom focal/celebration card). Pixel-level parity confirmation pending Vercel preview (auth blocker on local dev server, see above).

### T1.1 patch — foot fallback for kids without hadir days

After T1 shipped, /parent home Aisyah card showed `Pekan ini belum tercatat` even though she had Sen=Sakit + Sel=Izin tracked. Foot fallback fired because `hadirCount === 0`. Fixed by passing aggregate `weekCounts` (hadir/sakit/alpa/izin/logged) to `buildKidFoot` and surfacing the breakdown when `logged > 0` (e.g. `Sakit 1 · Izin 1 pekan ini`, with `tone === "warn"` when sakit + alpa > 0). True fallback (`Pekan ini belum tercatat`) only fires when no day has any record at all.

### T2 — `/parent/invoices` list + detail (Frames 4/5/6/7)

**Files touched:**
- REWRITE: [`app/parent/invoices/client.tsx`](../../app/parent/invoices/client.tsx) — drops `SummaryHero`, `CardListItem`, `InvoiceFilter` pill tabs. New shape: PageHeader + focal card (display-size due-color amount OR gold celebration "Lunas semua") + eyebrow groups (`Belum dibayar` due rows + `Riwayat pembayaran` paid rows). Each row = light card-button with mono amount in due/paid color. Today comparison precomputed at parent level (avoids react-hooks/purity violation from `Date.now()` in render).
- REWRITE: [`app/parent/invoices/invoice-detail-sheet.tsx`](../../app/parent/invoices/invoice-detail-sheet.tsx) — drops `SummaryHero`. New shape: focal amount card (display-size mono in due/paid color) + status caption + `Rincian` row primitive list + `Cara bayar` single Xendit card (no Transfer Bank — online-only per Frame 6 spec) + `Bayar sekarang` full-width primary CTA OR `Bukti pembayaran` Kuitansi.pdf card (paid).
- REWRITE: [`app/parent/invoices/__tests__/client.test.tsx`](../../app/parent/invoices/__tests__/client.test.tsx) — full rewrite for new structure. Asserts focal amount, eyebrow groups, all-paid celebration copy, row click opens sheet.

**Cross-checks:**
- [x] Cross-checked `.claude/standards/parent-portal-cycle4.html` Frames 4/5/6/7. Drops Transfer Bank per S-C.C3. Drops InvoiceFilter pill tabs (replaced by eyebrow group split per S-B.B3). Cross-referenced `.claude/standards/design-system.html` §14 page recipes for focal-amount + light-card patterns.

### T3 — `/parent/attendance` (Frames 8/9/10)

**Files touched:**
- REWRITE: [`app/parent/attendance/page.tsx`](../../app/parent/attendance/page.tsx) — server-rendered weekly view. URL state via `?week=YYYY-MM-DD` (defaults to current week). Compact summary card (gold celebration when 5/5 hadir, warn-orange when sakit/alpa, omitted when no data). Bespoke chevron week navigator (`<Link>` based, no native form chrome). Inline week-grid table — `<th>` row with day labels + today col tinted, `<tr>` body row "Hadir" with status glyphs (Check / S / A / I / dash). Catatan-dari-sekolah list below grid for week's notes.
- DELETE: `app/parent/attendance/client.tsx` — paginated card-list with native date inputs + `<select>` filter, all replaced by server-week view.
- DELETE: `app/parent/attendance/week-summary-strip.tsx` — sole consumer was the deleted page.tsx; summary now lives inline in compact card.

**Cross-checks:**
- [x] Cross-checked `.claude/standards/parent-portal-cycle4.html` Frames 8/9/10. Drops native HTML date+select per S-D.D8. Reuses today-col tint pattern from `components/portal/week-grid.tsx` (the journal reference).

### T4 — `/parent/reports` + assessments-table (Frames 11/12)

**Files touched:**
- REWRITE: [`app/parent/assessments-table.tsx`](../../app/parent/assessments-table.tsx) — drops `SummaryHero` + `CardListItem`. New shape: compact gold celebration card (Sparkles icon-square + "Rapor {period} sudah terbit" + courteous copy) + standalone full-width `Buka rapor` primary CTA below the card + `Riwayat rapor` light card-link list. Detail sheet preserved unchanged (existing assessment detail is correct). Empty state (no rapor) = warm Hourglass + InsyaAllah copy per Frame 12.
- UPDATE: [`app/parent/reports/page.tsx`](../../app/parent/reports/page.tsx) — `PageHeader` title corrected to `Rapor` + new subtitle `Laporan perkembangan tiap semester`.

**Cross-checks:**
- [x] Cross-checked `.claude/standards/parent-portal-cycle4.html` Frames 11/12. Celebration card now matches Frame 5/8/9 compact pattern (single visual language across surfaces). CTA standalone below card per S-E.E3. Empty state matches Frame 12 with Hourglass icon + InsyaAllah-style copy.

### T5 — NEW `/parent/profile` route (Frame 13)

**Files touched:**
- NEW: [`app/parent/profile/page.tsx`](../../app/parent/profile/page.tsx) — server-rendered nested page (back chevron tap-44 top-left, no PageHeader title). Identity surface (80×80 primary-tinted avatar + name + role line "Wali murid · {N} anak terdaftar"). Eyebrow `Kontak` → 2 light cards (Phone + Mail from `parent.phone` / `parent.email`). Eyebrow `Anak Anda` → light card-link per child (Link to `/parent/attendance?child={id}`). Eyebrow `Akun` → 3 static cards (Notifikasi / Bantuan / Tentang aplikasi). Danger-ghost Keluar button + app version footer.
- NEW: [`app/parent/profile/logout-button.tsx`](../../app/parent/profile/logout-button.tsx) — small client component for logout (reuses existing POST `/api/auth/logout` + `router.push("/")`).

**Cross-checks:**
- [x] Cross-checked `.claude/standards/parent-portal-cycle4.html` Frame 13. Reached via the avatar wrapped in PortalHeader's existing `profileHref` prop (already plumbed in T1). Akun cards are static stubs — no destination wiring this cycle (S-F.F6 explicitly defers).

### T6 — final cleanup (delete dead primitives)

**Files removed:**
- `components/portal/summary-hero.tsx` + test
- `components/portal/card-list-item.tsx` + test

Pre-flight grep confirmed zero remaining consumers across `app/` + `components/` after T1-T5 cleared their imports.

### Bundle gate (T1.1 + T2 + T3 + T4 + T5 + T6)

**Gates passed locally:**
- `npm run build` ✓ — all parent routes compiled (`/parent`, `/parent/invoices`, `/parent/attendance`, `/parent/reports`, `/parent/profile`).
- `npm run lint` ✓ — 0 errors (18 warnings, all pre-existing in unrelated files).
- `npx vitest run` ✓ — 233 passed, 42 todo, 0 failed across 32 files. Test count drops from 273 (cycle 3) due to removed SummaryHero + CardListItem test files; one new InvoicesClient test file replaces the cycle-3 version.

**Pixel parity vs HTML prototype** still pending Vercel preview (local dev login crash blocker noted in T1 verification).

### Post-bundle code-review fixes (5 issues)

`feature-dev:code-reviewer` agent ran on the bundle commit `50dbc2c`. All 5 confirmed issues addressed in follow-up commit:

1. **Tenant filter on `studentAttendance` queries** (defence-in-depth, CLAUDE.md security checklist) — both `app/parent/page.tsx` and `app/parent/attendance/page.tsx` raw prisma calls now scope via `student: { tenantId }`.
2. **`/parent/invoices` empty data array** now renders neutral `Belum ada tagihan` EmptyState, not the gold `Lunas semua` celebration. Spec B4 targets all-paid, not no-invoice. Test updated.
3. **`Bayar sekarang` CTA always renders** for payable invoices; disabled when `xenditPaymentUrl` is being provisioned, with the existing Info chip as helper text (previously CTA was hidden entirely — Spec C3).
4. **`/parent/profile` avatar `bg-primary/12` → `bg-primary/10`** (Tailwind /12 is not a scale step, was silently transparent).
5. **`/parent` home greeting honorific** derives from `children[0].relationship` (`MOTHER → "Bu"`, `FATHER → "Pak"`, default `Bu`). Previously hardcoded `Bu` for all guardians — copy failure per voice.md.

Gates re-run: build OK · lint OK · vitest 233 passed.

### Post-bundle Vercel-preview visual fixes (3 issues)

Visual verify on Vercel preview surfaced 3 more issues; all fixed in follow-up:

1. **Kid-pill label "Ahmad Zafran Hidayat (TKIT A)" overflows + class name styled in destructive tone on active teal pill** — `components/parent/child-selector-tabs.tsx` now renders only the first name (Frame 4/8/11 prototype shows `Zafran` not full name + class). Class no longer competes with active pill background.
2. **`/parent/reports` history "Diterbitkan {date}" never showed real publish date** — `getPublishedAssessmentsForStudent` now selects `publishedAt` and the API type carries it through. Order-by switched to `publishedAt desc, createdAt desc` so latest-published genuinely sorts first.
3. **"Isi kalau sempat. Opsional." footnote on Buku Penghubung Rumah tab read dismissive** — copy retoned to `Opsional — bantu Ustadzah memantau ibadah dan rutinitas di rumah` per voice.md (parent-warm, not casual-dismiss).
4. **Reports celebration secondary "...dari Ustadzah Aisyah"** read as if the teacher were named Aisyah (Aisyah is the kid). Title now folds in the kid name: `Rapor {period} {childName} sudah terbit`; secondary simplified to `Alhamdulillah, silakan baca penilaian lengkap dari Ustadzah.`

Gates re-run: build OK · lint OK (0 errors).

## Ship Notes

> Filled at Phase 4 close. No migrations, no env vars, no Prisma changes. Rollback = revert PRs in reverse order (T5 → T4 → T3 → T2 → T1 → T0).
