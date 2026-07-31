# Parent Portal Mobile Navigation — Proposal (owner review, not built)

> **Status: PROPOSAL ONLY.** No production code changed. The only files added are a
> throwaway mockup route (`app/nav-proposal/`), a capture script, and the screenshots
> under `docs/proposals/parent-nav/`. Nothing is shipped, no PR is open. Delete the
> mockup route before the real implementation cycle.

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

## Recommendation

**Option A now; Option C as the follow-on**, in two separate cycles.

The nav is not merely cramped — a tab is **unreachable on the pilot's most common screen
width**. That is a live defect on prod and deserves the smallest, fastest correct fix, not
a coupled IA redesign. Option A restores the documented contract, needs no new routes and
no URL migration, and can ship in one cycle behind the normal gates.

Option C is the better long-term structure and is where I would put the next cycle, but it
should be validated first — run `/uat parent` against a click-through of the hub before
committing to the build, specifically to test whether single-child parents read `Anak` as
useful or as an extra tap.

Option B is the one I would not build: it stacks two horizontal tab rows and coins a new
umbrella noun, spending most of Option C's comprehension risk for less of its benefit.

**Open decision for the owner (blocks Option A):** what replaces `Penghubung` in a 75 px
slot? Candidates: `Pesan`, `Jurnal`, `Catatan`, `Buku`. Alternatively take variant A′
(4 tabs) and keep the real name.

## Tasks

Not decomposed — this cycle intentionally stops at the proposal. `/spec` will decompose
whichever option the owner picks.

## Implementation

None. Mockup + capture harness only:

- `app/nav-proposal/page.tsx`, `app/nav-proposal/mock-nav.tsx` — throwaway static route,
  no auth, no DB, no network. `?v=current|a|a-sheet|b|c`.
- `scripts/capture-nav-proposal.mjs` — Playwright capture into `docs/proposals/parent-nav/`.
- `next.config.ts` — `devIndicators: false` so the dev badge does not sit over the first
  tab in screenshots. **Mockup-only; revert with the branch.**

## Verification

- `npx tsc --noEmit` — clean, no errors in the added files.
- Measured `getBoundingClientRect()` on every nav slot at 375 px and 360 px in the
  Browser pane; numbers in the Context table above are that raw output, not estimates.
- Rendered and screenshotted all five states at 375 px (plus the 360 px baseline) via
  `node scripts/capture-nav-proposal.mjs`; six PNGs written to `docs/proposals/parent-nav/`.
- Cross-checked `design-system.html` §14 Portal Shell and `.claude/standards/portal.md`
  lines 29–43 + 167–177 — both fix the parent bar at 4 tabs and the shared primitive at
  4–5; the shipped 6-tab bar violates both.
- Text-size gate: `grep -rn 'text-\[10px\]\|text-\[11px\]' app/parent components/parent
  components/portal` → zero. All options stay on `text-xs`.
- Contrast: nav label `--muted-foreground` `#57534E` on `--card` `#FFFFFF` ≈ **7.6:1**,
  passes AA and AAA. No colour change needed in any option.
- **Not run:** `npm run build`, `npx vitest run`, `npx playwright test` — proposal branch,
  no production code touched. Required before any implementation cycle ships.
- **Not run:** preview-verify — nothing is pushed, no PR, no Vercel preview.

### Pre-existing defects found in the shared bar (out of scope, worth their own cycle)

Both affect the **teacher** portal too, since they live in `PortalBottomNav`:

1. No `focus-visible` ring on the tab links ([portal-bottom-nav.tsx:43](../../components/portal/portal-bottom-nav.tsx)),
   and `app/globals.css` defines no global focus style — keyboard users get only the UA
   default outline, which the layered fixed bar largely swallows.
2. The `layoutId` spring ([portal-bottom-nav.tsx:48-52](../../components/portal/portal-bottom-nav.tsx))
   has no `prefers-reduced-motion` guard, and `globals.css` has no global reduced-motion block.

## Ship Notes

Nothing to ship. Branch `feat/parent-nav-mobile-proposal` is local; no PR opened, no
deploy, per the owner-review-first instruction.
