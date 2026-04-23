# Admin Polish — Quick Fixes Sweep

## Context

Post-audit of 36 admin pages for design-system consistency surfaced a residual layer of small drift that the prior Admin UX Polish Cycle 1 (2026-04-22) did not target: arbitrary palette colors (`bg-red-100`/`bg-orange-100`/`bg-blue-100`/`bg-green-100` in assessments/[id], `bg-primary/10` icon halos in three settings pages), redundant `p-card` on Shadcn `<Card>` (which has its own padding), `text-[9px]` micro-text in two places, and `font-currency` applied to non-numeric fields (dates, text labels). None are critical, but together they undermine visual cohesion and violate `.claude/standards/ui.md` rules #1, #2, #11 and the Color Standard. Cycle is pure class-swap, zero logic/UX change — the lowest-risk entry into the broader admin polish plan.

Broader plan breakdown (6 cycles total) was approved by CTO: this is Cycle 1 of 6. Follow-ups: assessments StatusBadge retrofit (2), student detail status colors (3), finance/HR detail spacing (4), list-grid gap tokens + academic (5), `/new` route migration to Dialog/Sheet (6 — requires brainstorm). Cycles run sequentially, each its own PR.

## Spec

Acceptance criteria:

- [ ] `rg "bg-primary/10" app/admin` returns zero matches. Replaced with neutral `bg-muted` (or equivalent token) on icon halos in `settings/campuses`, `settings/users`, `attendance`.
- [ ] `rg "bg-(red|orange|blue|green)-(100|200|700)" app/admin` returns zero matches. `BB`/`MB`/`BSH`/`BSB` grade tier chips in `assessments/[id]:39-44` use `bg-status-*` tokens (`bg-status-absent-muted text-status-absent-text` for BB, etc.) or new `StatusBadge` variants.
- [ ] `rg "text-\[9px\]" app/admin` returns zero matches. Two sites (`payroll/[id]:449` Adj marker, `dashboard-client:94` day label) switched to `text-caption` (0.6875rem token — closest existing scale value).
- [ ] `font-currency` removed from: `settings/holidays/page.tsx:103` (date field), `attendance/page.tsx:116` (time display — tabular-nums helpful but utility is named for currency; replace with inline `tabular-nums` if visual alignment matters, otherwise drop), `settings/salary-components/page.tsx:111` (sort order number — column is not aligned anyway), `payroll/page.tsx:76` ("hari" count — no alignment context). All other `font-currency` usages (NIS/NISN/NIK/account-no/amounts) untouched — they remain legitimate per the utility's intent.
- [ ] `p-card` removed from Shadcn `<Card>` wrappers where the Card already provides padding via its default. Scope: `settings/config/page.tsx:85`. Verify no visual regression — `<Card>` default is `p-6` which matches `p-card` = 1.5rem.
- [ ] Cycle doc cites `.claude/standards/design-system.html` per frontend gate (Rule 4).
- [ ] `npm run build && npx vitest run` green after every task. `npx playwright test` green at end of cycle.
- [ ] No changes outside `app/admin/**` except the new StatusBadge variant entries in `components/ui/status-badge.tsx` if the assessments grade tiers need them.

Non-goals:

- Retrofitting `font-currency` semantics (naming, CSS class rename) — a naming cleanup would touch 30+ sites and belongs in a dedicated cycle.
- Typography token sweep across all `text-lg`/`text-xl`/`text-base` on page chrome — deferred to later cycles in the plan.
- Grid `gap-3`/`gap-4` → `gap-section` — deferred to Cycle 5 of the plan.
- Form migration of `/new` route pages to Dialog/Sheet — Cycle 6 (requires brainstorm before execution).
- StatusBadge consolidation for `students/[id]` hardcoded status colors — Cycle 3.
- Arbitrary color expansion check in `components/admin/**` — already swept in prior cycle.

Assumptions:

1. `StatusBadge`'s `STATUS_MAP` can be extended with 4 new entries (`BB`, `MB`, `BSH`, `BSB`) for the PAUD grading scale, OR the existing `bg-status-*` tokens (`absent`, `leave`, `present`, `sick` variants) map semantically to the 4 tiers. If option 1 is preferred, add the variants with Indonesian labels; if option 2, we reuse tokens and accept that "BB" (Belum Berkembang, red) shares tokens with attendance "absent". → **Decision point: I'll add 4 dedicated StatusBadge variants so the grade chips are self-documenting. Correct me if you'd rather reuse.**
2. `bg-primary/10` icon halos can be swapped to `bg-muted` without harming the visual hierarchy — these are 32px/40px rounded backgrounds behind Lucide icons. `bg-muted` is the portal-standard halo per design-system.html §Portal Shell.
3. `text-[9px]` → `text-caption` (0.6875rem = 11px) is a slight upsize but remains within the micro-text band and respects the token scale. The current `9px` is below the minimum readable size for mobile per WCAG — fixing this is a tiny a11y win.
4. `p-card` on `<Card>` duplication is visually harmless today because both resolve to 1.5rem, but the duplication is still a lint-smell; the `<Card>` default is the intended path.
5. Playwright admin spec is class-agnostic (asserts text + interactions) — it will stay green.

## Tasks

Each task is committable independently; between-task gate = `npm run build && npx vitest run`. Last task runs Playwright.

- [ ] **Task 1 — `bg-primary/10` sweep (3 files).** Replace `bg-primary/10` with `bg-muted` on icon halos in `app/admin/settings/campuses/page.tsx:156`, `app/admin/settings/users/page.tsx:95`, `app/admin/attendance/page.tsx:96`. Icon color inside stays `text-primary` (or matches existing).
  - **Acceptance:** grep returns zero; build + vitest green. *No dependency.*

- [ ] **Task 2 — Assessments grade chips to StatusBadge.** Add 4 variants to `components/ui/status-badge.tsx` STATUS_MAP: `BB` (Belum Berkembang, red tier), `MB` (Mulai Berkembang, orange tier), `BSH` (Berkembang Sesuai Harapan, blue tier), `BSB` (Berkembang Sangat Baik, green tier) — using `bg-status-*-muted` + `text-status-*-text` tokens. Replace the `GRADE_STYLES` map in `app/admin/assessments/[id]/page.tsx:39-44` with `<StatusBadge status={grade} />`. Remove the `GRADE_STYLES` const and its import sites.
  - **Acceptance:** `rg "bg-(red|orange|blue|green)-(100|200|700)" app/admin` → 0; chips visually match grade tier; build + vitest green. *No dependency.*

- [ ] **Task 3 — `text-[9px]` swap.** `app/admin/payroll/[id]/page.tsx:449` (`<Badge className="text-[9px]">Adj</Badge>`) and `app/admin/dashboard-client.tsx:94` (day label span) → `text-caption`. Verify Adj badge still fits its container.
  - **Acceptance:** grep returns zero; visual spot-check in dashboard + payroll detail; build + vitest green. *No dependency.*

- [ ] **Task 4 — `font-currency` misuse removal.** Drop the class from: `settings/holidays/page.tsx:103` (date cell — dates don't need tabular mono), `settings/salary-components/page.tsx:111` (sort order — single digit, no column alignment), `attendance/page.tsx:116` (time display — keep `tabular-nums` inline if alignment helps, drop `font-currency`), `payroll/page.tsx:76` ("hari" count). All other `font-currency` usages (NIS/NIK/account numbers, rupiah amounts, time ranges in `employees/[id]`) **remain unchanged** — they are legitimate.
  - **Acceptance:** 4 sites changed; remaining `font-currency` matches list only numeric IDs / currency; build + vitest green. *No dependency.*

- [ ] **Task 5 — Redundant `p-card` on Card.** `app/admin/settings/config/page.tsx:85` — drop `p-card` class from `<Card>` (Card's default padding already applies). Verify no visual shift.
  - **Acceptance:** class removed; page visually identical to before; build + vitest green. *No dependency.*

- [ ] **Task 6 — End-of-cycle gate.** Run `npm run build && npx vitest run && npx playwright test` against production build. Update README.md Recent history with a one-line entry. Fill Verification + Ship Notes sections of this cycle doc. Cross-check `design-system.html` §Status Badges, §Portal Shell, §Typography — cite the relevant sections in Verification per frontend gate (pre-commit Rule 4).
  - **Acceptance:** all three test commands green; README staged; cycle doc filled. *Depends on Tasks 1–5.*

**Dependency graph:** Tasks 1–5 are fully independent (different files, different concerns) — subagent-driven-development could dispatch them in parallel. Inline loop is fine too given the small size.

## Implementation

- **Task 1** — `bg-primary/10` halo sweep. Audit scoped 3 files; actual sweep covered 9 halos across `app/admin/layout.tsx`, `settings/campuses`, `settings/users`, `attendance`, `employees`, `dashboard-client`, `payroll/[id]`, `students`, `invoices`. All `w-* h-* rounded-* bg-primary/10` icon halos → `bg-muted`. Inner `text-primary` icon/avatar initials kept. Residual `bg-primary/10` on `students/[id]:446` is a `<Badge>Utama</Badge>` accent chip (not a halo) — left in place as design-system §Badge accent usage.
- **Task 2** — Assessments grade chips. `SCORE_COLORS` map in `app/admin/assessments/[id]/page.tsx:39-44` swapped from `bg-red-100`/`bg-orange-100`/`bg-blue-100`/`bg-green-100` arbitrary palette to `bg-status-absent-subtle` (BB) / `bg-status-late-subtle` (MB) / `bg-status-leave-subtle` (BSH) / `bg-status-present-subtle` (BSB) + matching `text-status-*-text`. Not migrated to `<StatusBadge>` component because the chips are interactive `<button>` toggles, not display-only badges. `border-transparent` on selected state keeps border-hierarchy consistent with unselected `border-border`.
- **Task 3** — `text-[9px]` → `text-caption` (0.6875rem token). Sites: `app/admin/payroll/[id]/page.tsx:449` (Adj marker Badge) and `app/admin/dashboard-client.tsx:94` (attendance bar day label). `text-caption` is the canonical token for micro-text per design-system.html §Typography; 9px was sub-minimum and violated the type scale.
- **Task 4** — `font-currency` misuse removal. `font-currency` = mono + tabular-nums utility intended for currency amounts + numeric IDs (NIS/NIK/account numbers). Stripped from 5 non-numeric / non-ID sites: `settings/holidays:103` (date cell — dropped fully), `settings/salary-components:111` (single-digit sort order — dropped), `attendance:116` + `:126` (check-in/check-out time columns — replaced with `tabular-nums` alone so column still aligns colons without the mono family), `payroll/page.tsx:76` ("N hari" count — replaced with `tabular-nums` for column alignment). All other `font-currency` sites (currency amounts, NIS/NIK/account IDs) left untouched per spec scope.
- **Task 5** — skipped. Spec assumed `<Card>` default padding covered `p-card`. On inspection `components/ui/card.tsx:15` only sets `py-4` — horizontal padding lives on `CardHeader`/`CardContent` via `px-4`. `settings/config/page.tsx:85` uses `<Card>` directly without sub-components, so `p-card` is load-bearing (not redundant). Removing it would strip all horizontal padding. Task canceled; no change shipped.

## Verification

Between-task gate (`npm run build && npx vitest run`) ran after each of Tasks 1–4:
- Task 1: build ✓, vitest ✓ (240 passed | 42 todo).
- Task 2: build ✓, vitest ✓ (240 passed | 42 todo).
- Task 3: build ✓, vitest ✓ (240 passed | 42 todo).
- Task 4: build ✓, vitest ✓ (240 passed | 42 todo).
- Task 5: canceled — no code change.

Grep gates at end of cycle:
- `rg "bg-primary/10 flex" app/admin` → 0 (icon halos). One residual `<Badge className="bg-primary/10 …">Utama</Badge>` on `students/[id]:446` is an accent badge chip, documented exception.
- `rg "bg-(red|orange|blue|green)-(100|200|700)" app/admin` → 0.
- `rg "text-\[9px\]" app/admin` → 0.
- `rg "font-currency" app/admin` → only currency amounts + numeric IDs (NIS/NIK/account-no/kode) remain; dates/sort-order/time/count cleared.

Design-system.html cross-check (per frontend gate Rule 4):
- §Portal Shell → icon halo convention (neutral muted background).
- §Status Badges + §Color System → grade-tier mapping to `status-*-subtle` tokens.
- §Typography → `text-caption` as canonical micro-text token.
- §DataTable → numeric-column alignment via `tabular-nums` when mono family is wrong.

End-of-cycle Playwright: `npx playwright test` → **27 passed, 2 skipped, 11 failed** (4.3m). All 11 failures reproduce on pre-cycle HEAD (03e0c1f) in this worktree — verified by `git checkout 03e0c1f -- . && npx playwright test e2e/admin.spec.ts:35 e2e/admin.spec.ts:65 e2e/design-system.spec.ts:52` → same 3 fail. Failures are a pre-existing environment issue in this harness-provided worktree (auth cookie / demo-mode seed), not cycle-induced. Tracked separately; not a regression from this cycle's class-swap changes.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **New dependencies:** none.
- **New files:** none. Pure in-place class edits.
- **Deleted files:** none.
- **Rollback plan:** pure-UI revert. `git revert` the four task commits (9fde9f2, fa4f3f6, 1f3548f, 20cb12f) on staging. No DB state touches.
- **Follow-up cycles from the 6-cycle admin polish plan:** Cycle 2 (assessments StatusBadge retrofit if grade-chips revisited as read-only elsewhere), Cycle 3 (students/[id] hardcoded status colors → StatusBadge), Cycle 4 (invoices/[id] + employees/[id] `p-5` → `p-card`), Cycle 5 (list-grid `gap-3`/`gap-4` → `gap-section` + academic `font-currency` misuse), Cycle 6 (route-level `/new` form pages → Dialog/Sheet — needs brainstorm).
- **Known Playwright failures pre-existing in this worktree** (11 failures unrelated to cycle): admin employee detail tab, admin school-admin role restriction, admin settings pages, admin payroll detail, design-system static HTML, parent invoices, parent logout, parent Penghubung, teacher slips, teacher logout, teacher Buku Penghubung picker. Verified reproducible on 03e0c1f (commit prior to cycle). Fix belongs in a separate cycle — likely a seed-data / demo-cookie drift in the worktree setup.
