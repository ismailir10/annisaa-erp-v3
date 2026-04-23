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

| # | Task | Cited frames | Files touched | New files |
|---|---|---|---|---|
| **T0** | Preflight teardown — delete `SummaryHero` + `CardListItem` primitives + tests. Grep confirms no remaining consumers across `app/` and `components/` before delete. | — | DELETE: `components/portal/summary-hero.tsx`, `components/portal/__tests__/summary-hero.test.tsx`, `components/portal/card-list-item.tsx`, `components/portal/__tests__/card-list-item.test.tsx`. UPDATE: any consumer to inline equivalent (none expected; verify with grep). | — |
| **T1** | `/parent` home rebuild + header avatar plumbing | 1, 2, 3 | REWRITE: `app/parent/page.tsx`, `components/parent/household-overview.tsx` (or fold into page.tsx and DELETE). DELETE: `components/parent/parent-greeting.tsx` (replaced inline). | NEW: `components/parent/kid-card.tsx`, `lib/hijri.ts`. |
| **T2** | `/parent/invoices` list + detail | 4, 5, 6, 7 | REWRITE: `app/parent/invoices/client.tsx`, `app/parent/invoices/invoice-detail-sheet.tsx`, `app/parent/invoices/__tests__/client.test.tsx`. | — |
| **T3** | `/parent/attendance` rebuild | 8, 9, 10 | REWRITE: `app/parent/attendance/client.tsx`, `app/parent/attendance/page.tsx`. DELETE or REWRITE: `app/parent/attendance/week-summary-strip.tsx`. | — |
| **T4** | `/parent/reports` rebuild | 11, 12 | REWRITE: `app/parent/reports/page.tsx`. REVIEW: `app/parent/assessments-table.tsx` (light typography/spacing pass only). | — |
| **T5** | `/parent/profile` NEW route | 13 | UPDATE: `app/parent/page.tsx` if avatar href needs adjusting. | NEW: `app/parent/profile/page.tsx`. |

Per task brief: 4 PRs minimum (T1-T4). T0 lands first as a clean preflight, T5 lands last (depends on T1 avatar plumbing). Total = 6 PRs.

## Implementation

> Filled per task during Phase 4.

## Verification

> Filled per task during Phase 4. 375 + 1280 before/after screenshots required per commit, parity check against the approved HTML frame.

## Ship Notes

> Filled at Phase 4 close. No migrations, no env vars, no Prisma changes. Rollback = revert PRs in reverse order (T5 → T4 → T3 → T2 → T1 → T0).
