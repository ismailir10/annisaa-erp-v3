# Parent Portal Mobile Navigation — Option A built

> **Status: BUILT, staging only.** Owner reviewed the three options on 2026-08-01 and
> picked **Option A** (5 tabs + a "Lainnya" overflow sheet), with `Penghubung` renamed to
> `Jurnal`. This document keeps the original audit and options for context; the
> Implementation / Verification / Ship Notes sections below describe what was actually
> built. The throwaway mockup route from the proposal pass has been deleted.
> **Not promoted to production** — awaiting owner confirmation.

## Context

The parent portal bottom nav currently carries **six** tabs. The Portal Consistency
Standard (`.claude/standards/portal.md` line 34 and line 167) specifies **four** for the
parent portal and caps `PortalBottomNav` at **"4–5 tabs"**. The bar drifted past its own
contract when `Capaian` was added in PR #278 (Curriculum C6 — Parent Perkembangan
Rollup); `Penghubung` had already pushed it to five.

### Current implementation

| Item | File |
|---|---|
| Parent tab list (6 items) | [components/parent/bottom-nav.tsx:18-28](../../components/parent/bottom-nav.tsx) |
| Shared bar primitive | [components/portal/portal-bottom-nav.tsx:26-72](../../components/portal/portal-bottom-nav.tsx) |
| Mounted in layout, `pb-20` gutter | [app/parent/layout.tsx:13-22](../../app/parent/layout.tsx) |
| Teacher equivalent (5 tabs) | [components/teacher/bottom-nav.tsx](../../components/teacher/bottom-nav.tsx) |

Pattern: fixed bottom tab bar, `h-16`, `max-w-md mx-auto`, `flex-1` slots with
`justify-around`, 20 px lucide icon over a 12 px label, animated `layoutId` underline,
`safe-area-bottom`. No drawer, no header nav. `Profil` is not a tab — it hangs off the
header avatar ([components/parent/header.tsx:33](../../components/parent/header.tsx)).

### The six items and their real cadence

| Tab | Route | Cadence | Already summarised on `/parent` home? |
|---|---|---|---|
| Beranda | `/parent` | every session | — (is the home) |
| Tagihan | `/parent/invoices` | monthly, high anxiety | **yes** — outstanding total + nearest due date focal card |
| Kehadiran | `/parent/attendance` | daily glance | **yes** — 5-day strip per child in `KidCard` |
| Penghubung | `/parent/student-journal` | daily-ish | **yes** — latest note excerpt in `KidCard` foot |
| Capaian | `/parent/perkembangan` | weekly | **yes** — "Perkembangan minggu ini" card, 3 latest entries |
| Rapor | `/parent/reports` | **2× per year** | no |

Every drill-down except Rapor is already reachable from the home in one tap. The tab bar
is largely a second, redundant path — while costing the width that breaks it.

### Measured failure (not a subjective "feels cramped")

Measured in-browser on the mockup, which reuses `PortalBottomNav`'s exact markup and
classes. `getBoundingClientRect()` on each slot:

**375 px (iPhone SE/12 mini, the design target):**

| Slot | Width | Left–Right |
|---|---|---|
| Beranda | 64.6 | 0 – 64.6 |
| Tagihan | 60.0 | 64.6 – 124.6 |
| Kehadiran | 73.8 | 124.6 – 198.5 |
| Penghubung | 89.5 | 198.5 – 287.9 |
| Capaian | 63.7 | 287.9 – 351.7 |
| **Rapor** | **50.7** | **351.7 – 402.4 → 27.4 px past the 375 px viewport** |

`Rapor`'s label right edge lands at 394.4 px. **The sixth tab is clipped: only "Ra" and
half its icon are visible, and roughly half its tap target is off-screen.**

**360 px (the most common Android width — the actual pilot device class): the `Rapor`
tab disappears entirely.** Its slot runs 352 – 402 against a 360 px viewport.

Two further consequences of `flex-1` + `justify-around` with unequal labels: slots range
from **50.7 px to 89.5 px — a 77 % spread**, so tap targets are inconsistent; and the two
right-most items sit at x ≈ 320 and x ≈ 377, the hardest part of a one-handed right-thumb
arc, which is exactly where the clipping also lands.

### Label-width budget at 375 px

`px-2` per slot costs 16 px, so the usable label width is `375 / n − 16`:

| Tabs | Slot | Label budget | Fits? |
|---|---|---|---|
| 6 | 62.5 px | 46.5 px | ✗ — `Kehadiran` (57.8) and `Penghubung` (73.5) both blow it |
| 5 | 75.0 px | 59.0 px | ✓ up to `Kehadiran` (57.8). `Penghubung` (73.5) still does **not** fit |
| 4 | 93.8 px | 77.8 px | ✓ including `Penghubung` (73.5) |

This is the hard constraint any option has to respect.

## Spec — the three options

All three are rendered at 375 px from `app/nav-proposal/page.tsx`, which reuses the real
`KidCard` and a byte-for-byte copy of the `PortalBottomNav` classes.

### Baseline — today, 6 tabs

`docs/proposals/parent-nav/00-current-375.png`, `01-current-360.png`

### Option A — 5 tabs + a "Lainnya" sheet

`02-option-a-375.png`, `03-option-a-sheet-375.png`

`Beranda · Tagihan · Kehadiran · Pesan · Lainnya`. `Lainnya` opens a bottom sheet
holding `Capaian`, `Rapor`, `Profil` — the surfaces whose cadence is weekly or
semester-ly. Measured: five equal 75 px slots, nothing clipped.

- **Changes:** the tab array, one new sheet component, one label rename. No new routes.
- **Why:** restores the documented 4–5 cap, matches the teacher portal's 5-tab shape,
  keeps every daily surface one tap away, and pulls `Profil` out of the header-avatar
  hiding place into a labelled list.
- **Tradeoffs:** `Penghubung` (73.5 px) does not fit a 75 px slot, so it must shorten —
  the mockup uses `Pesan`, which is an **open naming decision**, since "Buku Penghubung"
  is the established An Nisaa' term. `Lainnya` is a non-destination: it costs an extra
  tap and tells the parent nothing about what is inside.
- **Variant A′:** 4 tabs — `Beranda · Tagihan · Penghubung · Lainnya`. 93.8 px slots keep
  the real `Penghubung` name, but push `Kehadiran` (a daily glance) into the sheet.

### Option B — merge the three record surfaces into "Catatan"

`04-option-b-375.png`

`Beranda · Catatan · Tagihan · Rapor · Profil`, where `Catatan` is one page holding
`Kehadiran | Penghubung | Capaian` as in-page sub-tabs above the existing child pills.

- **Changes:** one new route that hosts the three existing views; three routes become
  sub-tabs (keep the old URLs as redirects). Reuses `PortalTabs` — no new primitive.
- **Why:** the three merged surfaces are the same object viewed three ways — per-child,
  per-week records of school life. Merging them makes lateral movement between them one
  tap instead of two, and every remaining top-level label is ≤ 7 characters, so the bar
  has real breathing room at 360 px and below.
- **Tradeoffs:** two levels of horizontal tabs stacked (child pills over sub-tabs) is a
  known comprehension risk for the target persona. `Catatan` is a coined umbrella term
  parents have never seen. Deep links into the three routes must be preserved.

### Option C — a per-child hub

`05-option-c-375.png`

`Beranda · Anak · Tagihan · Lainnya`. `Anak` is a hub keyed to the selected child:
today's status banner, then `Kehadiran`, `Penghubung`, `Capaian`, `Rapor` as labelled
rows with live meta ("2 catatan baru dari Bu Sari").

- **Changes:** one new hub route, the tab array, a small `Lainnya` sheet for
  `Profil`/`Keluar`. The four child surfaces keep their current routes untouched.
- **Why:** it matches the parent's actual mental model — *"how is Aisyah doing"*, not
  *"open the attendance module"*. Four 93.8 px slots are the roomiest of any option, only
  the least-used item (`Lainnya`, centre x ≈ 328) sits in the awkward thumb zone, and every
  label keeps its real product name. Each row can carry a real-language status line, which
  a 12 px tab label cannot.
- **Tradeoffs:** the biggest IA change and the most build. It adds a tap for a parent who
  wants attendance directly. For a **single-child** family — the majority — `Anak` is a
  hub over one child and risks reading as a pointless extra layer, so it needs a
  single-child collapse rule.


## Decision

Owner picked **Option A**, with `Penghubung` → `Jurnal`. Options B and C are not built;
Option C stays on the table as a possible follow-on cycle and should be validated with
`/uat parent` before anyone commits to it.

## Tasks

1. Teach `PortalBottomNav` an `action` item variant (button + `aria-haspopup`/`aria-expanded`) and make slots equal-width.
2. Build the `Lainnya` overflow sheet holding Capaian, Rapor, Profil.
3. Recut the parent tab array to 4 destinations + the overflow trigger; rename the journal tab to `Jurnal`.
4. Align the parent journal page copy to `Jurnal` (label only — no route, API or DB change).
5. Update the Portal Consistency Standard with the measured width budget and the 5-slot ceiling.
6. Cover the whole contract with unit + e2e tests, including the 375/360 no-clip assertions.

## Implementation

| Task | Files |
|---|---|
| 1 | [components/portal/portal-bottom-nav.tsx](../../components/portal/portal-bottom-nav.tsx) — `PortalBottomNavItem` is now a `link \| action` union; slots use `flex-1 basis-0 min-w-0` and `px-1`; added `focus-visible` ring, `truncate` guard, and a `useReducedMotion()` guard on the indicator spring |
| 2 | [components/parent/more-sheet.tsx](../../components/parent/more-sheet.tsx) — new. vaul `Drawer` (bottom, modal, swipe-dismiss, drag handle). Rows are `min-h-14`, labelled `nav aria-label="Menu lainnya"`, and forward `?child=` |
| 3 | [components/parent/bottom-nav.tsx](../../components/parent/bottom-nav.tsx) — `Beranda · Tagihan · Kehadiran · Jurnal · Lainnya`; `Lainnya` stays lit while on any of its destinations |
| 4 | [app/parent/student-journal/page.tsx](../../app/parent/student-journal/page.tsx) — `PageHeader` title and two toast strings now say `Jurnal` |
| 5 | [.claude/standards/portal.md](../../.claude/standards/portal.md) — width-budget table, 5-slot ceiling, `basis-0` rule, item-variant table |
| 6 | [components/portal/__tests__/portal-bottom-nav.test.tsx](../../components/portal/__tests__/portal-bottom-nav.test.tsx), [components/parent/__tests__/bottom-nav.test.tsx](../../components/parent/__tests__/bottom-nav.test.tsx), [e2e/parent.spec.ts](../../e2e/parent.spec.ts) |
| — | [components/teacher/bottom-nav.tsx](../../components/teacher/bottom-nav.tsx) — see "Scope note" below |
| — | [vitest.setup.ts](../../vitest.setup.ts) — global `matchMedia` stub, needed by `useReducedMotion()` under jsdom |
| — | [scripts/capture-parent-nav.mjs](../../scripts/capture-parent-nav.mjs) — screenshots both widths **and** fails if any slot is clipped or under 44 px |

### Scope note — the teacher tab was renamed too

Equal-width slots exposed that `Penghubung` (73 px) does not fit a 5-slot bar at **any**
supported width: the budget is 67 px at 375 px and 64 px at 360 px. It only ever rendered
whole because `flex-basis: auto` let it steal width from its narrow `Kelas` neighbour —
the same defect that pushed the parent portal's 6th tab off-screen.

Leaving the teacher bar alone would have shipped a truncated `Penghubu…`, so the teacher
**nav label** is now `Jurnal` as well. This also satisfies the standard's own rule that
the parent portal must match the teacher pattern; divergent labels for one surface would
have violated it. Teacher and admin **page** headings, the `/teacher/student-journal`
route, `/api/student-journal/*` and every DB field are untouched — this is a nav-label
change only. Flagged for the owner: this was not in the original ask.

### Deliberately not done

- No route, redirect, API-path or schema change. `student-journal` remains the slug everywhere.
- Admin + teacher page copy still says "Buku Penghubung" (staff vocabulary).
- Options B and C not built.

## Verification

Full gate, all green on `feat/parent-nav-mobile-proposal`:

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0, 0 errors (55 pre-existing warnings, none in changed files) |
| Unit | `npx vitest run` | **257 files passed, 2 skipped; 2548 tests passed, 42 todo** |
| Build | `npm run build` | exit 0 |
| API auth | `bash scripts/verify-api-auth.sh` | 185 / 185 routes covered |
| RLS | `bash scripts/verify-rls-coverage.sh` | 39 / 39 models covered |
| E2E | `E2E_ALLOW_REMOTE_DB=1 npx playwright test e2e/parent.spec.ts e2e/teacher.spec.ts` | **19 passed, 2 skipped (pre-existing skips)** |

E2E note: `playwright.config.ts` refuses a non-local `DATABASE_URL` because most specs
create rows. The parent + teacher specs run here are read-only page loads and navigation,
so they were run against the staging DB behind the documented `E2E_ALLOW_REMOTE_DB=1`
override. **No rows were written.** The remaining 31 specs are deferred to the required
CI `Playwright E2E` check.

### Measured, both HIGH findings closed

`node scripts/capture-parent-nav.mjs` — the script exits non-zero if any slot is clipped
or under 44 px:

```
375px — 5 slots     Beranda/Tagihan/Kehadiran/Jurnal/Lainnya, 75.0px each, 0.0 → 375.0
360px — 5 slots     Beranda/Tagihan/Kehadiran/Jurnal/Lainnya, 72.0px each, 0.0 → 360.0
All slots inside the viewport, all tap targets >= 44px.
```

- **HIGH #1 (clipped tab)** — closed. Was 402.4 px of content in a 375 px viewport; now exactly 375.0.
- **HIGH #2 (sub-44 px tap target)** — closed. Was 50.7 px allocated / ~23 px visible; now a uniform 75.0 px × 64 px.
- **MED #3 (77 % slot-width spread)** — closed. Every slot identical at both widths.
- **MED #4 (label does not fit)** — closed. Zero truncation on either portal at 375 px or 360 px (`label_needed == label_shown` for all 10 labels).

Screenshots in `docs/proposals/parent-nav/`: `00-current-375.png` / `01-current-360.png`
are the broken before-state; `fixed-375-nav.png`, `fixed-375-sheet.png`,
`fixed-360-nav.png`, `fixed-360-sheet.png` are the shipped state.

### Interface review (better-interface, `full`)

- **Accessibility** — overflow trigger is a `<button aria-haspopup="dialog" aria-expanded>`, never `aria-current`; `aria-current="page"` still marks the active destination; `focus-visible:ring-2` added to every slot (there is no global focus style in `app/globals.css`, so tabs previously had none); sheet rows are `min-h-14`; keyboard Tab + Enter covered by unit test. Reduced-motion guard added to the indicator spring.
- **Layout** — `flex-1 basis-0` caps the row; `truncate` is the last-resort guard for sub-360 px screens; sheet anchors to the bottom, inside the one-hand thumb arc.
- **Writing** — `Lainnya` + "Halaman yang tidak dibuka setiap hari" tells the parent what is behind the tab; each row carries a plain-language description rather than a bare noun.
- **Typography** — all labels stay at `text-xs`; the banned `text-[10px]`/`text-[11px]` grep returns zero.
- **Colors** — no token changes. Nav label `--muted-foreground` `#57534E` on `--card` `#FFFFFF` ≈ 7.6:1, AA + AAA.
- **UI** — cross-checked `design-system.html` §14 Portal Shell; the bar keeps its `h-16` / `max-w-md` / `safe-area-bottom` contract, and the sheet reuses the existing vaul `Drawer` rather than introducing a new overlay primitive.

### Not verified

- Real-device testing on a physical mid-range Android — emulated viewports only.
- The other 31 e2e specs locally (deferred to the required CI check).
- Vercel preview walk-through — recorded separately on the PR.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **Data changes:** none. Label-only rename; no route, redirect, API path or DB field moved.
- **Rollback:** revert the PR. No state to unwind.
- **User-visible change to communicate:** the parent bottom bar drops from 6 tabs to 5; Capaian, Rapor and Profil now live behind "Lainnya". `Penghubung` reads `Jurnal` in both the parent and teacher navs.
- **Promotion:** staging only. Production ship is held pending owner confirmation.
