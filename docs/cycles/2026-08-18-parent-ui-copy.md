# Parent Portal — UI + Copy Consistency

## Context

A full walkthrough of the parent portal (Beranda, Tagihan, Kehadiran, Jurnal, and the
Lainnya destinations — Perkembangan, Rapor, Profil) at 390px and 1280px, rendered against
staging data, surfaced three classes of problem.

**The owner's specific complaint — the Tagihan amount reads as harsh and intimidating.**
Measured on `origin/staging` and confirmed against the deployed staging CSS bundle, the
summary figure rendered as JetBrains Mono / 24px (32px ≥640px) / weight 700 /
letter-spacing −0.48px / `#CC0000`. Six things stack:

1. JetBrains Mono is a **code** face — at display size in bold it reads as terminal output.
2. `--status-absent-text` is the attendance **Alpa** colour. `lib/curriculum/level-presentation.ts`
   already records the voice call that red is reserved for Alpa and destructive actions; an
   unpaid-but-not-yet-due bill is neither.
3. Bold + display size + `leading-none` = maximum visual mass.
4. `.font-currency` forces −0.02em onto a monospace face: the digits crowd while the mono
   space after "Rp" stays 0.6em wide — the "Rp   3.802.500" gap.
5. `tracking-tight` on the same element was **dead code** — `.font-currency` wins the
   cascade (verified in the shipped bundle: `.font-currency` at byte 195718,
   `.tracking-tight` at 53302).
6. Four red signals for one fact: uppercase eyebrow, red figure, red row amounts, red icon tile.

**Cross-page inconsistency.** Four page-header patterns (including Profil, which had no
`h1` at all), four empty-state patterns, three section-heading ranks, three child-selector
behaviours, four child-name renderings, and three sub-44px tap-target families.

**Copy.** `#498` fixed the Capaian/Perkembangan and semester/triwulan splits and landed a
`voice.md` glossary, but left `pekan` vs `minggu` unresolved, moved further into Title Case
("Reset" → "Atur Ulang", new "Dibayar Sebagian"), and introduced
"Belum ada Pekan aktif minggu ini." — a mid-sentence capital plus both words in one sentence.

## Spec

- Parent-facing money reads as a school bill, not a terminal dump. Red appears once, only
  when a total is genuinely overdue.
- One page-header, one empty-state accent policy, one section-label rank, one child-selector
  presentation, one week navigator across the portal.
- Every interactive target ≥44px in the parent portal.
- `pekan` is the school week everywhere in parent-facing copy; `minggu` survives only where
  it names the weekday.
- Sentence case for authored UI strings; DB-echoed values untouched.
- Non-goals: no drawer/sheet rewrite, no `Invoice.periodLabel` backfill (normalised on read),
  no admin/HR or teacher surfaces.

## Tasks

1. Shared primitives — `.font-amount`, `components/portal/{amount,section-label,week-navigator}.tsx`.
2. Tagihan money treatment — list, detail sheet, home tile.
3. Portal shell consistency — headers, empty states, section labels, child selector, tap targets, desktop nav.
4. Copy — pekan sweep, sentence case, the "Pekan aktif" string, version line.
5. Perkembangan + home polish.

## Implementation

**Primitives**
- `app/globals.css` — added `.font-amount` (brand sans + `tabular-nums lining-nums` + −0.01em).
  `.font-currency` is **unchanged**: 25 admin/HR files use it for kode, NIK, rekening and jam,
  where a mono ledger face is correct. Its comment now says so.
- `components/portal/amount.tsx` — `<Amount>` (sizes `display`/`row`/`line`, tones
  `neutral`/`paid`/`overdue`, "Rp" demoted to 0.6em muted) and `<AmountStatus>` chips.
- `components/portal/section-label.tsx`, `components/portal/week-navigator.tsx`.
- `lib/format.ts` — `formatRupiahParts`, `formatInvoicePeriod` ("Apr-2026" → "April 2026",
  ad-hoc labels pass through).

**Tagihan** — `app/parent/invoices/{client,invoice-detail-sheet}.tsx`, `app/parent/page.tsx`
- Summary, row, line, focal and history amounts all through `<Amount>`; state on chips.
- Summary section label "Belum dibayar" no longer printed twice (list is "Rincian tagihan").
- Row dates carry the year (short month so they hold one line at 390px).
- Filter selects stack below 400px; "Jatuh tempo terdekat" used to fill its trigger.
- Detail sheet: `data-[side=right]:w-full` — SheetContent's base `data-[side=right]:w-3/4`
  outranked the call site's `w-full`, so the sheet rendered at 292/390px with a dead gutter.
  Vestigial bottom-sheet drag handle removed from the side sheet.
- Home Tagihan tile: neutral amount, brand-teal icon tile.

**Shell** — `PortalTabs` pills and journal tab triggers to `min-h-11`; `PortalBottomNav`
constrained to `max-w-md` from `md:` up; `WeekNavigator` replaces two divergent controls;
Profil gained a `PageHeader` (and full child names); `SectionLabel` replaces every
hand-rolled eyebrow in the parent portal; Jurnal's child switcher moved above the title with
first names, and the duplicated name line removed.

**Copy** — `pekan` sweep including the `week-grid.tsx` lock reason and its deliberate twin in
`app/api/student-journal/entries/home/route.ts` (kept in sync, test updated);
"Belum ada Pekan aktif minggu ini." → "Belum ada pekan aktif saat ini.";
sentence case across filters, tabs, buttons and status chips; Profil's stale `v3.4.2` literal
replaced with the deploy sha when Vercel supplies one.
`.claude/standards/voice.md` gained a **Capitalization** rule and a **Pekan** glossary row,
and now states explicitly that glossary rows fix word choice, not capitalisation — the
previous "Lewat Tempo" row was being read as licence for Title Case.

**Perkembangan + home** — the child list rendered as a centred vertical stack because
`Card`'s base `flex flex-col` outranks a call-site `flex items-center`; replaced with the same
plain row markup every other portal list uses. KidCard's "Pekan ini belum tercatat" no longer
ships a tick icon; the home journal quote is attributed ("Ustadzah · 10 Agu · …"); the A/S/I
key only renders when the strip actually contains one of those glyphs.

### Corrections to the original findings

- **"PageHeader `mb-6` + `space-y-6` double gap" was a mis-diagnosis.** Measured in the
  browser, `space-y-6` contributes **0px** on these wrappers, so `mb-6` was the only gap and
  there was nothing to fix. The `mb-0` overrides were reverted; Profil keeps `mb-0` because
  its header sits in a flex row beside the back chevron.
- Per-row "Lewat tempo" chips were tried and reverted — four identical red chips competed
  with the one summary chip that matters. The muted "· lewat tempo" note returned to the date line.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 301 files passed, 2 skipped; 2937 tests passed, 42 todo.
- `npm run lint` — 0 errors, 59 warnings (all pre-existing, none in touched files).
- `npm run build` — succeeded.
- `bash scripts/verify-api-auth.sh` — ✓ 191/191 routes.
- `bash scripts/verify-rls-coverage.sh` — ✓ 41/41 tenant-scoped models.
- Playwright — **deferred to the required CI `Playwright E2E` check** (this harness cannot
  run Chromium locally). `e2e/parent.spec.ts` tab assertions use case-insensitive regexes and
  are unaffected by the sentence-case change.
- Rendered walkthrough at **390px** and **1280px** against staging data (DEMO_MODE server on
  the staging `DATABASE_URL`): Beranda, Tagihan, Tagihan detail sheet, Kehadiran, Jurnal,
  Perkembangan (list + detail), Profil.
- Measured after: amount = Plus Jakarta Sans / 28px / 600 / −0.28px / `rgb(28,25,23)` /
  `lining-nums tabular-nums`, identical at both widths (no `sm:` jump). Detail sheet width
  390/390px (was 292/390). Zero sub-44px targets on the Jurnal page (was four).
  Desktop bottom nav 448px centred (was 1280px full-bleed).
- Cross-checked `design-system.html` §3 typography scale and §14 page recipes: the money
  ramp now sits inside the documented scale instead of reaching past `--type-display`, and
  status chips follow the §14 subtle-tint pattern already used by `LEVEL_CHIP_CLASS_OFF`.

## Ship Notes

- No migrations. No new env vars. `VERCEL_GIT_COMMIT_SHA` is read on the Profil page if
  present and is already injected by Vercel — absent locally, where the line simply omits it.
- `formatInvoicePeriod` normalises on read only; `Invoice.periodLabel` rows are untouched, so
  rollback is a pure revert with no data implication.
- Rollback: revert the PR merge commit. All changes are presentational plus two shared
  components; no API contract or schema surface moved.
- Deliberately out of scope, carried forward: the teacher `class-day-grid` aria label
  ("Lihat minggu …") and the teacher journal page's "Minggu sebelumnya/berikutnya" buttons
  still say *minggu* — staff surfaces were not in this cycle's scope and changing them would
  have touched teacher tests.
