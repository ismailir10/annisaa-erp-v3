# Parent Portal UX Polish — Cycle 1 (visual defects + shared primitives)

## Context

CTO-led UI/UX review started 2026-04-21. First-pass code audit (parent portal, all 7 routes + `components/parent/**`) plus live staging screenshots surfaced a cluster of mobile-fit defects at 375px viewport — the target device for Pak Budi (mid-range Android + 4G, PAUD/TKIT parent). Known fixes from 2026-04-17 / 2026-04-18 (invoice payment backfill, attendance week strip, reports query perf) are preserved; this cycle tackles the visible polish debt those cycles did not cover:

1. `text-[10px]` epidemic — 12+ occurrences across nav, tables, quick-links. Fails readability at 375px. Violates no standard today because portal.md has no text-size floor.
2. Child-selector tabs truncate mid-word ("Aisyah Putri Rama…") and invoice filter tabs truncate ("Dibayar Sebagia…"). No shared tab primitive — each site rolls its own flex-overflow.
3. Rapor detail sheet renders as desktop side-drawer on mobile; blurred list behind wastes 60 % of screen.
4. Student-journal child pills force horizontal scroll with no scroll affordance.
5. Invoices loading skeleton shape mismatches real layout → reflow pushes bottom-nav on cold loads.
6. Assessments detail sheet fetches client-side with no Suspense → 2-3s blank on 4G.
7. Quick-link Tagihan card shows a large red rupiah amount with no label — ambiguous (unpaid? total? paid?).
8. Icon-only buttons (logout, Eye "Lihat", ExternalLink "Bayar", ChevronLeft/Right) lack `aria-label` — screen readers announce them as unlabelled.

User also asked that parent and teacher portals converge on the same style. This cycle extracts **one** shared primitive (`PortalTabs`) and adds a text-size floor to `portal.md` so cycle 2 can make teacher adopt both without new decisions.

## Spec

**Acceptance criteria:**
- [ ] No `text-[10px]` or `text-[11px]` class remains in `app/parent/**` or `components/parent/**`. Minimum text size is `text-xs` (12 px). Grep returns zero matches.
- [ ] `components/portal/portal-tabs.tsx` exists: horizontal-scroll tab bar with edge fade, keyboard focus, and `scrollIntoView({block:'nearest', inline:'center'})` on mount for the active tab. Exported as `<PortalTabs items={…} activeId={…} onSelect={…} />`.
- [ ] `child-selector-tabs`, `invoice-filter`, and student-journal child pills all render via `PortalTabs`. No mid-word truncation at 375 px (full child names, full status labels).
- [ ] Rapor detail sheet renders fullscreen on viewports <`md` (Tailwind `md` = 768 px): `Sheet side="bottom"` with `h-[95dvh]` + rounded top. Desktop behaviour unchanged.
- [ ] Dashboard Tagihan quick-link card shows the label "Sisa" above the rupiah amount. Color stays `text-destructive` only when `totalUnpaid > 0`.
- [ ] Assessments detail sheet content is wrapped in `<Suspense fallback={<AssessmentDetailSkeleton/>}>`. Skeleton matches real layout: title row, semester row, 6 domain sections with 2-row ratings each.
- [ ] Invoices loading skeleton renders: 1 filter-tabs row (3 pills) + 1 table header + 5 table rows with action slot. No layout shift >5 px when real data lands (verified manually via Playwright + dev tools).
- [ ] Every icon-only button in `app/parent/**` + `components/parent/**` has `aria-label` in Indonesian. Grep: `<[A-Z]\w*\s+size=` with no surrounding `aria-label=` returns zero matches inside `<button>` / `<Link>` containers.
- [ ] `.claude/standards/portal.md` adds two sections: "Portal text-size scale" (min `text-xs`, no `text-[10px]`/`text-[11px]`) and "PortalTabs primitive" (when to use, props, example).
- [ ] `npm run build && npx vitest run` green between each task; `npx playwright test e2e/parent.spec.ts` green after last task.

**Non-goals (do NOT touch this cycle):**
- Teacher portal code. Teacher adoption of `PortalTabs` and text-size sweep is cycle 2.
- Admin portal anything.
- API / backend changes. Assessments Suspense is pure client wrapping — no endpoint change.
- New Xendit / invoice logic. Payment flow stays as-is.
- Bottom-nav structural change (nav tabs remain 5). Only text-size inside nav.
- Friction-tier findings (dead-end "Lihat" CTA, vague "sedang disiapkan" copy, assessment grader metadata, retry affordance) — cycle 2 or later.
- Admin-portal standards update.

**Assumptions:**
1. `Sheet` component from `components/ui/sheet.tsx` supports `side="bottom"` with a custom height via `className` (standard Radix API — to verify on task 7).
2. Text-size sweep is safe: `text-xs` is 12 px vs `text-[10px]` 10 px — 20 % growth. Bottom-nav at 5 tabs × (icon 20 + label text-xs 12) still fits on 360 px minimum width (iPhone SE). Verify during task 5.
3. Child-selector, invoice-filter, and journal pills all have the same API shape (id + label + optional secondary label), so a single `PortalTabs` covers all three without variants.
4. Assessments detail endpoint response is fast enough that a Suspense skeleton (not a persistent spinner) is the right pattern. If the endpoint is >2 s p95, defer to cycle 2 and just ship the skeleton without Suspense.
5. `/build` will use `superpowers:subagent-driven-development` as already mandated in `.claude/skills/build/SKILL.md:20`. Independent tasks below are flagged explicitly so dispatch is unambiguous.

→ Correct any assumption now or `/build` proceeds with them.

## Tasks

Ordered, atomic, each committable on its own. Dependencies marked so `/build` can dispatch independent tasks in parallel via subagents.

### Group A — foundation (sequential, must land first)

- [x] **T1 — Extract `PortalTabs` primitive.**
  - File: `components/portal/portal-tabs.tsx` (new).
  - Props: `items: { id: string; label: string; secondary?: string; count?: number }[]`, `activeId: string`, `onSelect: (id: string) => void`, `variant?: 'pills' | 'underline'` (default `pills`).
  - Behaviour: horizontal scroll container with `overflow-x-auto scrollbar-none`, edge fade via gradient mask-image, active pill scrolls into view on mount + on `activeId` change, keyboard arrow-left/right nav, `role="tablist"`, each item `role="tab"` with `aria-selected`.
  - Acceptance: import + render with 5 long-label items in a 375 px container — no mid-word truncation, full labels visible via horizontal scroll, active item auto-centred.

### Group B — parallelisable (dispatch via subagents after T1 lands)

- [x] **T2 — Refactor `child-selector-tabs` onto `PortalTabs`. Dep: T1.**
  - File: `components/parent/child-selector-tabs.tsx`.
  - Drop custom flex markup; pass items. Remove `text-[10px]` for secondary label — use `text-xs text-muted-foreground`.
  - Acceptance: dashboard with 3 children at 375 px — all 3 child names fully readable, active tab scrolled into view on navigation.

- [x] **T3 — Refactor `invoice-filter` onto `PortalTabs`. Dep: T1.**
  - File: `components/parent/invoice-filter.tsx`.
  - Keep counts. Use `PortalTabs` pills variant.
  - Acceptance: "Dibayar Sebagian" label fully visible (no ellipsis) at 375 px.

- [x] **T4 — Refactor student-journal child pills onto `PortalTabs`. Dep: T1.**
  - File: `app/parent/student-journal/page.tsx` (pills block only).
  - Replace inline flex pills with `PortalTabs`.
  - Acceptance: 3 children render without forced horizontal scroll; scroll affordance visible when list wider than viewport.

- [ ] **T5 — Text-size sweep (non-tab sites). Independent.**
  - Files: `app/parent/page.tsx`, `components/parent/bottom-nav.tsx`, `components/parent/invoice-card.tsx`, `app/parent/unpaid-invoices-table.tsx`, `app/parent/assessments-table.tsx`.
  - Replace every `text-[10px]` → `text-xs`; replace every `text-[11px]` → `text-xs`.
  - Grep `text-\[10px\]\|text-\[11px\]` in `app/parent` + `components/parent` must return zero.
  - Verify bottom-nav still fits on 360 px via Playwright snapshot.

- [ ] **T6 — Dashboard Tagihan quick-link label. Independent.**
  - File: `app/parent/page.tsx` (Tagihan Card block around line 113–120).
  - Add `<span className="text-xs text-muted-foreground">Sisa</span>` above the rupiah amount. Hide label when `totalUnpaid === 0`.
  - Acceptance: screenshot shows "Sisa · Rp 3.000.000" pair, amount colour unchanged.

- [ ] **T7 — Rapor detail sheet mobile fullscreen. Independent.**
  - File: `app/parent/assessments-table.tsx` (Sheet block).
  - Use `<Sheet><SheetContent side="bottom" className="h-[95dvh] rounded-t-2xl md:h-auto md:max-w-xl md:rounded-xl">`. Keep desktop side="right" behaviour via `md:` reset or conditional.
  - Acceptance: at 375 px the sheet covers 95 % of screen from bottom, no blurred list leak; at 1024 px the sheet renders as existing right-side drawer.

- [ ] **T8 — Assessments detail Suspense + skeleton. Independent.**
  - File: `app/parent/assessments-table.tsx`.
  - Extract detail body into `AssessmentDetailBody`; wrap with `<Suspense fallback={<AssessmentDetailSkeleton />}>`. Build `AssessmentDetailSkeleton` with header row + 6 domain section skeletons (each 2 rating rows).
  - If the detail fetch is server-actionised later, keep the Suspense — still correct.
  - Acceptance: opening a sheet on throttled 4G shows the skeleton within 100 ms, not a blank background.

- [ ] **T9 — Invoices loading skeleton layout-match. Independent.**
  - File: `app/parent/invoices/client.tsx` (loading branch around line 59–70).
  - Render: filter-tabs skeleton (3 pills), DataTable header row, 5 skeleton rows with action-cell slot. Height matches post-load layout within ±5 px.
  - Acceptance: Lighthouse / DevTools CLS <0.05 on `/parent/invoices` cold navigation.

- [ ] **T10 — ARIA sweep (icon-only buttons). Independent.**
  - Files: `components/parent/header.tsx` (logout button), `app/parent/unpaid-invoices-table.tsx` ("Bayar" ExternalLink icon), `app/parent/assessments-table.tsx` ("Lihat" Eye icon), `app/parent/invoices/client.tsx` (eye/external icons), chevron buttons in `app/parent/student-journal/page.tsx`.
  - Add `aria-label` in Indonesian to each `<button>` / `<Link>` that renders only an icon. Examples: `aria-label="Keluar"`, `aria-label="Bayar tagihan"`, `aria-label="Lihat detail rapor"`, `aria-label="Minggu sebelumnya"`, `aria-label="Minggu berikutnya"`.
  - Acceptance: `grep -rn 'size={[0-9]' app/parent components/parent` — every match either already has `aria-label=` on the parent button or is inside a `<button>` with visible text.

### Group C — closes the loop (sequential after Group B)

- [ ] **T11 — Update `.claude/standards/portal.md`. Dep: T1–T10.**
  - Add section **"Portal text-size scale"** — minimum `text-xs` (12 px); banned: `text-[10px]`, `text-[11px]`; rationale (375 px Android + 4G readability).
  - Add section **"PortalTabs primitive"** — when to use (>2 horizontal options that may overflow); props table; example snippet; cross-link to `components/portal/portal-tabs.tsx`.
  - Note cycle 2 scope: teacher portal adopts `PortalTabs` + text-size rule.

### Dispatch plan (for `/build`)

- Sequential: T1 → (Group B in parallel) → T11.
- Subagent plan: T1 solo. Then dispatch T2–T10 as 9 parallel subagents. Then T11 consumes all outputs for the doc update.
- Between-task gate (`npm run build && npx vitest run`) runs after every task before commit. End-of-cycle gate adds `npx playwright test e2e/parent.spec.ts` before T11's commit.

## Implementation

- Subagent plan: T1 implementer (foundation) first; T2-T10 each dispatched as independent implementer subagents sequentially (same-tree, no parallel write conflicts); T11 (standards doc) last. Per-task feature-dev:code-reviewer pass on staged diff before commit. Controller orchestrates, never writes code inline except for cycle-doc edits + gates.
- T1: `components/portal/portal-tabs.tsx` + `components/portal/__tests__/portal-tabs.test.tsx` — controlled horizontal tab bar with roving tabindex, edge-fade mask, auto-scroll-into-view, pills + underline variants, badge count, secondary label. Code review flagged redundant `setFocusId` in onClick, mask clipping first-tab focus ring, and missing Home/End + ArrowLeft-wrap + badge tests; all three fixed before commit.
- T2: `components/parent/child-selector-tabs.tsx` — swapped bespoke Link pill row for `PortalTabs`; nav via `useRouter().push()` preserves `?child=` + other params. Known trade-off: avatar circle with initial letter removed (PortalTabs has no leading-slot API this cycle); secondary class-name now `text-xs` via PortalTabs (was `text-[10px]`). Avatar restoration → cycle 2 if needed.
- T3: `components/parent/invoice-filter.tsx` + `app/parent/invoices/__tests__/client.test.tsx` + `vitest.setup.ts`. Filter refactored to PortalTabs (pills variant, count badges); sticky wrapper preserved. "Dibayar Sebagian" no longer truncates at 375 px. Test selectors migrated from button+aria-label to role=tab+aria-selected to match new a11y contract. Global `scrollIntoView` stub added to vitest setup so any PortalTabs consumer test runs without local stub.
- T4: `app/parent/student-journal/page.tsx` — child-selector pills replaced with PortalTabs; horizontal scroll + edge fade replace previous `flex-wrap`. `childId ?? ""` guard for nullable activeId (render still gated by `children.length > 1`).

## Verification

- T1: `npm run build` green; `npx vitest run components/portal` → 7 passed / 7 total. Manual check: component file holds no `text-[10px]`/`text-[11px]`; controlled API only (no internal `activeId`); edge-fade mask preserves focus ring clearance.
- T2: `npm run build` green; `npx vitest run` → 222 passed / 42 todo / 2 skipped (264 total). Manual check: `grep -n 'text-\[10px\]' components/parent/child-selector-tabs.tsx` → no matches.
- T3: `npm run build` green; `npx vitest run` → 222 passed / 42 todo / 2 skipped (264 total). Test selectors updated to tab role; scrollIntoView global stub keeps jsdom-based tests clean for all PortalTabs consumers.
- T4: `npm run build` green; `npx vitest run` → 222 passed / 42 todo / 2 skipped (264 total).

## Ship Notes
<!-- filled by /ship -->
