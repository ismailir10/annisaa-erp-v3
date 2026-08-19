# Teacher Portal — UI + Copy Consistency

## Context

A full walkthrough of the teacher portal (Beranda, Absensi Kelas, Jurnal picker +
entry grid + per-student week, Penilaian hub + Pekanan + Sentra, Kehadiran Saya +
Cuti sheet, Slip Gaji, Profil, session roster) at 390px and 1280px, rendered against
staging data, surfaced the same three classes of problem the parent portal had before
`#500` — plus two hard accessibility failures the parent pass did not have to face,
because the teacher portal is the data-entry surface and the parent portal is not.

**Tap targets.** Every primary daily-entry control measured under 44px: the walas
level chips at 34px, the sentra level chips at 26px, the sentra **Simpan** at 32px,
every `Input`/`Select`/`NativeSelect` at 32px (the shadcn `h-8` base), the
`size="lg"` primary CTA at 36px, the journal note/week buttons at 43px wide, the slip
PDF and leave-cancel buttons at 28px, the back links at 20px. `#500` fixed this for
parent; teacher is the portal that is actually operated one-handed while standing in
a classroom.

**Contrast.** The three-way level control fails AA. Measured in-browser at 12px/500
on the unselected tint: `Mampu` 4.16:1, **`Belum` 2.22:1**, `Perlu` 5.65:1. Two
distinct causes — `LEVEL_CHIP_CLASS_OFF.EMERGING` used `text-status-late`, the *fill*
orange `#FF8C00`, where its siblings use the `-text` variants (the same mistake
`class-day-grid.tsx` already documents for `text-primary` at 2.24:1); and
`--status-present-text` `#00875A` is simply too light against
`--status-present-subtle`.

**Cross-page inconsistency.** Four eyebrow weights for one rank (400 on Profil, 500
on the Penilaian hub, 600 on Beranda, 700 in the `SectionLabel` primitive that no
teacher page used); five empty/error patterns, three of them on the sentra page and
two in `slips/page.tsx` alone; three back-link patterns using two different icons;
no week navigator at all on Penilaian Pekanan, so a walas could not reach last pekan.

**Copy.** `voice.md`'s sentence-case rule was not applied to teacher at all — roughly
forty Title Case strings, plus `MASUK`/`PULANG` in caps. `pekan` was never swept
(the carried-forward item from `#500`), and one instance is factually wrong: the
per-student week view prints a static "Minggu ini" above the week label, so a teacher
paging back three weeks still reads "this week". `Tap Masuk`/`Tap Pulang` use the
English verb where the rest of the portal says *Ketuk*. The journal week error
renders a double period because `{loadError}` already ends in one.

## Spec

- Every interactive target in the teacher portal is ≥44px.
- The three level chips all clear 4.5:1 in both selected and unselected states.
- One page-header, one empty-state component, one section-label rank, one back link,
  one week navigator across the portal.
- Sentence case for authored UI strings; DB-echoed values untouched. `pekan` is the
  school week; `minggu` survives only where it names the weekday.
- A teacher is never shown a disabled primary action without being told why.
- Non-goals, explicitly out of scope for this cycle:
  - **The two roll-call surfaces are not converged.** `/teacher/class-attendance`
    auto-saves per tap; `/teacher/sessions/[id]` requires an explicit Simpan. Which
    model wins is a product decision, not a UI pass — carried forward.
  - **`Belum` is not renamed.** The short label is semantically risky (it abbreviates
    "Mampu Belum Konsisten" but scans as "not able"), but the string reaches raport,
    the parent portal and the PDF. Carried forward.
  - No schema, API or route changes. Presentational and string-level only.

## Tasks

1. Shared primitives + tokens — level-chip contrast, `formatColDate`, `BackLink`,
   `.tap-target`.
2. Penilaian — walas Pekanan + Sentra Harian.
3. Shell consistency — headers, empty states, section labels, focus rings, skeletons.
4. Copy — sentence case, pekan sweep, the "Minggu ini" bug, error-string hygiene.
5. Beranda + Cuti polish.

## Implementation

**Primitives + tokens**
- `lib/curriculum/level-presentation.ts` — `LEVEL_CHIP_CLASS_OFF.EMERGING` now uses
  `text-status-late-text`, not the `text-status-late` fill. New
  `lib/curriculum/__tests__/level-presentation.test.ts` asserts every unselected chip
  paints with a `-text` token so the class of bug cannot come back.
- `app/globals.css` — `--status-present-text` `#00875A` → `#00704A` (4.16:1 → 5.62:1 on
  `--status-present-subtle`, 5.62:1 on white). Cross-portal token: every existing
  consumer gains contrast, none loses it. New `.tap-target` utility (`min-height: 2.75rem`)
  — `min-height`, so it beats the component's own `h-8` without a specificity fight.
- `components/portal/back-link.tsx` — new. `ArrowLeft` + "Kembali", 44px, focus ring.
  Chevrons stay reserved for list-row disclosure.
- `components/portal/week-grid.tsx` — `formatColDate` MM/DD → DD/MM.
- `components/ui/empty-state.tsx` — action buttons gain `.tap-target` (`size="sm"` is
  `h-7`, and an empty state's CTA is usually the only tappable thing on screen).
- `components/ui/native-select.tsx` — new `selectClassName` prop. `className` lands on the
  positioning wrapper, so the first attempt at a 44px picker sized the wrapper and left
  the `<select>` at 32px.

**Penilaian** — `assessments/{page,weekly/page,weekly/client,center/[center]/client}.tsx`
- Walas: `WeekNavigator` added (the page read `?date=` but only offered a picker in the
  empty branch, so last pekan was unreachable); subtitle de-nested; chips 34→44px at
  `text-sm`; `BackLink`; `EmptyState` replaces two dashed-border divs.
- Sentra: pekan + tema surfaced from the payload it already received; level chips 26→44px
  with a roving-tabindex keyboard handler matching the walas page; **Simpan** 32→44px and
  the disable reason now renders under it; sticky bar opaque with a blurred upgrade; date
  and age-group stay enabled on a read-only session (they were the only escape and were
  disabled); indicator buttons `text-primary-text` + focus ring.
- Hub: `SectionLabel`; walas description shortened so it stops truncating mid-explanation;
  the redundant "Sentra " prefix stripped from eight tiles that were truncating at 390px;
  focus rings on all nine cards.

**Shell** — `SectionLabel` replaces four hand-rolled eyebrow ranks (400/500/600 → one 700);
Profil field labels demoted out of eyebrow typography; `PageHeader` rendered in every
loading and empty branch (it used to appear only on the success path and shift the page);
`EmptyState` replaces the hand-rolled Card/centred-`<p>`/dashed-div error surfaces in
slips, attendance, class-attendance, journal entry and the per-student week view;
`BackLink` on five pages including the session roster, which had none; focus rings unified
on `ring-ring`; `class-day-grid` name column gets `min-w-0` (long names collided with the
`0/7` counter) and honours `prefers-reduced-motion`; calendar month nav 34→44px.

**Copy** — sentence case across ~40 strings; `pekan` sweep (`class-day-grid` aria label,
the per-student navigator); the static "Minggu ini" caption replaced with a derived
`· pekan ini` that only appears on the current week; `Tap Masuk/Pulang` → `Ketuk
masuk/pulang`; the journal week error no longer prints a double period; the roll-call
helper says what tapping does and that it auto-saves; zero counts drop their status colour;
`Cuti Sakit`/`Sakit` reconciled; a one-day leave stops printing its date twice; ASCII `...`
→ `…`; `dapat`/`bisa` and the missing comma in "Periksa koneksi, lalu"; four names for the
journal destination collapsed to two (nav "Jurnal", every page "Buku Penghubung").
`voice.md` gains a note that the sentence-case rule is portal-agnostic, and a `Ketuk`/`Tap`
glossary row.

**Beranda + Cuti** — leave balances off `.font-currency` onto `.font-amount` in neutral
foreground; `MASUK`/`PULANG` → `Masuk`/`Pulang`; `Selamat Pagi` → `Selamat pagi`; the `✓`
text glyph replaced with a `Check` icon; GPS status lines say what will happen instead of
"Menunggu..." / "GPS ditolak"; `--:--` placeholders replaced with an em dash; the Status
cell now maps every `AttendanceRecord.status` through `getStatusConfig` instead of three
`&&` branches that rendered an empty cell for SICK / PERMISSION / ON_LEAVE.

### Deliberately not done

- **The two roll-call surfaces are not converged** (`/teacher/class-attendance` auto-saves,
  `/teacher/sessions/[id]` requires Simpan). Owner excluded it — it is a product decision.
- **`Belum` is not renamed.** Owner excluded it; the string reaches raport, parent and PDF.

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run` — 301 files passed, 2 skipped; **2941 passed, 42 todo** (4 new).
- `npm run lint` — 0 errors, 59 warnings (all pre-existing, none in touched files).
- `npm run build` — succeeded.
- `bash scripts/verify-api-auth.sh` — ✓ 191/191 routes.
- `bash scripts/verify-rls-coverage.sh` — ✓ 41/41 tenant-scoped models.
- Playwright — **deferred to the required CI `Playwright E2E` check** (this harness cannot
  run Chromium locally). `e2e/teacher.spec.ts`, `teacher-assessments-weekly.spec.ts` and
  `teacher-assessments-center.spec.ts` were updated for the renamed strings.
- Rendered walkthrough at **390px** and **1280px** against staging data (DEMO_MODE server on
  the staging `DATABASE_URL`), before and after, across all eleven teacher surfaces.
- **Measured after:** level chips 34px → 44px at 14px, contrast `Mampu` 4.16 → **5.62**,
  `Belum` 2.22 → **4.50**, `Perlu` 5.65 (all ≥ AA). IKTP picker 32 → 44px. Sentra Simpan
  32 → 44px. Leave balance = Plus Jakarta Sans / 24px / 600 / `rgb(28,25,23)` (was
  JetBrains Mono / 700 / teal + blue). Zero real sub-44px targets remain on any teacher
  page at 390px — the residual matches are `<label>` text and `sr-only` inputs inside 44px
  labels. No app-level console errors at either width.
- Cross-checked `design-system.html` §3 typography scale and §14 page recipes: the level
  chips now sit on the documented 14px control ramp, and the status tints follow the §14
  subtle-tint pattern rather than painting fill colours as text.

## Ship Notes

- No migrations. No new env vars. No API or schema surface moved.
- **One cross-portal token change:** `--status-present-text` darkens by ~3%. It is used by
  status badges, attendance counts and parent chips; every one of them gains contrast.
  Called out here because it is the only change in this cycle whose blast radius reaches
  outside the teacher portal on purpose. `week-grid`'s DD/MM fix and `EmptyState`'s 44px CTA
  are the other two shared-surface effects, both strict improvements.
- Rollback: revert the PR merge commit. Everything is presentational, string-level, or a
  new component with no existing consumers.
- Carried forward: the two roll-call surfaces, and the `Belum` short label.
