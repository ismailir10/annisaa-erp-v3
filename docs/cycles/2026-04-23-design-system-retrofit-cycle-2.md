# Design System Retrofit — Cycle 2

## Context

Cycle 1 (PR #105, merged to staging `7ea8aa4`) retrofitted all three portals against the canonical reference (`.claude/standards/design-system.html` + six standards). Four items were explicitly flagged "cycle-2":

1. **Admin Dialog→Sheet mobile variant** (cycle-1 A2 flag) — admin dialogs are desktop-only; mobile product-builder traffic grows. `useIsMobile()` exists in `hooks/use-mobile.ts` but only `components/ui/sidebar.tsx` consumes it.
2. **WeekGrid relocation** (cycle-1 B2 flag) — `components/student-journal/week-grid.tsx` has 3 consumers (admin / teacher / parent). Portal-namespace convention (`portal.md § Portal Primitive Inventory`) calls for `components/portal/week-grid.tsx`.
3. **Parent `px-5` → `px-page-x` token alignment** (cycle-1 C2 flag) — parent layout still uses raw `px-5` (20px); canonical is `px-page-x` (1.5rem = 24px). Bleed pairs (`-mx-5 px-5`) in InvoiceFilter + sticky ChildSelectorTabs depend on parent padding.
4. **Household Overview swap** (cycle-1 C1 flag) — demo seed has 2 kids (rightjetPrimaryChild + one secondary link); swap requires ≥3.

Three additional items surfaced this cycle:

5. **Overlay inner-padding defect** — `/parent/invoices` → `invoice-detail-sheet.tsx` renders `<SheetContent>` with zero inner padding; content flush against the content-box edge. Shadcn `SheetContent` + `DialogContent` primitives default to no padding — every consumer must wrap the body. Audit found 33 SheetContent+DialogContent consumers across `app/**` + `components/**`.
6. **Worktree `.env` bootstrap** (cycle-1 E flag) — `scripts/setup-worktree.sh` symlinks `.env` + `.env.local` correctly for `.worktrees/<slug>` paths, but Claude-infra-created worktrees under `.claude/worktrees/<slug>` bypass the script, which bricks `npm run dev`. Needs detection + bootstrap command.
7. **Cross-portal invariants D1–D4 regression gate** — keep the zero-drift guarantee from cycle-1 after all above edits land.

This cycle is **depth over breadth**: four deferred items + overlay audit + visible parent home rework (3rd kid) + infra guardrail. One PR, one cycle doc.

Cross-checked `.claude/standards/design-system.html` (§13 Overlays, §14 Page Recipes Household Overview, §15 Student Journal, §16–§18 voice), `.claude/standards/portal.md` (§Household Overview, §WeekGrid Contract, §Portal Primitive Inventory), and `.claude/standards/voice.md` (parent persona glossary).

## Spec

### Acceptance criteria

- [ ] **Seed**: `prisma/seed.ts` produces `rightjetParent` household with **3 kids** — existing primary + existing secondary-1 + new "Fatimah Az-Zahra Hidayat" (TKIT B, AYAH relationship, `isPrimary=false`, `childOrder=3`). Invoice coverage: 1 unpaid + 1 paid per kid. Attendance coverage: mixed PRESENT/ABSENT/SICK last 5 school days across the 3 kids. Rapor coverage: ≥1 score per kid. No e2e fixture breakage (audit + fix).
- [ ] **Household Overview**: `/parent` home body, when household size ≥3, renders `<HouseholdOverview>` per portal.md §Household Overview + design-system.html §14. Urgency banner (red when unpaid tagihan outstanding; neutral with "Alhamdulillah, semua lunas." when clear). Per-child row: avatar + name + class + today's attendance chip. 3-up signal cells (Tagihan / Kehadiran / Rapor-or-Catatan) tinted via `--status-*-subtle` when attention needed, neutral otherwise. Chevron → `/parent?studentId=<id>` deep link. 2-kid fallback (pill-tabs) preserved (regression-check by toggling a child off in seed).
- [ ] **Admin Dialog→Sheet mobile variant**: every admin create-or-edit `<Dialog>` split via `useIsMobile()` — desktop renders `<Dialog>`, mobile renders `<Sheet side="bottom">` (or `side="right"` for wide forms, document per form). Destructive `<AlertDialog>` untouched. Form-body extracted to shared child component. **Scope cap — >15 dialogs found (20) → split into B1a (high-traffic) + B1b (rest, cycle-3 flag).** Cycle-1 "preserved" trio (leave review, promote, withdraw) revisited: simple → apply split, complex multi-step → Dialog + cycle-3 flag.
- [ ] **Overlay-stack audit** post-split: no Sheet-over-Sheet when editing from a detail page that itself opens a Sheet on mobile.
- [ ] **WeekGrid relocation**: `components/student-journal/week-grid.tsx` → `components/portal/week-grid.tsx`. 3 import sites updated (admin monitoring, teacher journal, parent journal). Contract unchanged (editable / readonly / home-note modes). Old directory removed if empty.
- [ ] **Parent token alignment**: layout wrappers under `app/parent/**/layout.tsx` + `app/parent/**/page.tsx` swap `px-5` → `px-page-x`. Bleed contracts (`-mx-5 px-5` → `-mx-page-x px-page-x`) updated in `components/parent/invoice-filter.tsx` + `components/portal/portal-tabs.tsx` sticky child switcher. Sticky child switcher verified to bleed correctly at 320/375/390/414 viewports.
- [ ] **Overlay inner-padding**: every `<SheetContent>` + `<DialogContent>` under `app/**` + `components/**` audited. Body padding = `p-card` (1.5rem via token) as either `<SheetContent className="p-card">` OR inner `<div className="p-card space-y-field">` wrapper. Exception: if SheetContent hosts a nested `<ScrollArea>`, padding goes on inner wrapper (ScrollArea needs flush edges). `SheetHeader` / `SheetFooter` primitives already self-padded → do NOT double-pad.
- [ ] **Worktree `.env` bootstrap**: `scripts/setup-worktree.sh` gains a smoke check at the end — "symlinks exist, targets readable". New `scripts/bootstrap-env-symlinks.sh` handles the Claude-infra worktree path (`.claude/worktrees/<slug>`) — detects missing `.env` / `.env.local` in cwd, locates main checkout via `git rev-parse --git-common-dir`, symlinks. `CLAUDE.md` updated with failure mode + recovery steps.
- [ ] **Cross-portal gates**: D1 (silent `.catch(() => {})`) = 0 in portal scope; D2 (`length > 0 &&` without else) legitimate-only; D3 (`text-[10px]|text-[11px]`) = 0 in parent/teacher/portal scope; D4 (`toLocale*`) = 0 in all three portals. Re-run grep after all edits; zero new drift.
- [ ] **Voice glossary**: parent sees `Tagihan`/`Hadir`/`Alpa`/`Sakit`/`Rapor` (no English leakage in new HouseholdOverview copy). Teacher sees `Ustadz`/`Ustadzah` (untouched). Admin neutral (untouched).
- [ ] **Cycle-doc Verification citations**: every commit cites "Cross-checked design-system.html §X for Y" (frontend pre-commit gate requires literal "design-system" token in staged cycle doc).
- [ ] **End-of-cycle gate green**: `npm run build && npx vitest run && DEMO_MODE=true npx playwright test`.

### Non-goals

- API routes, Prisma schema, business logic rewrites.
- New npm deps.
- New components beyond `components/parent/household-overview.tsx` (justified — no existing primitive covers the banner + per-child row + 3-up signal cells pattern; not reusable outside parent home).
- Icon sizes, border-radii, color-token changes.
- Primitive patch on `<SheetContent>` / `<DialogContent>` defaults (see G1 decision).
- Cycle-2 "form-bodied Dialog trio" (leave review, promote, withdraw) if multi-step → cycle-3.
- B1b (non-high-traffic admin dialogs) if >15-dialog cap hit → cycle-3.

### Decisions (ambiguity locked)

1. **3rd-kid identity**: "Fatimah Az-Zahra Hidayat", TKIT B enrollment (existing class section). Linked to `rightjetParent` via `StudentGuardian { relationship: "AYAH", isPrimary: false, childOrder: 3 }`. Does NOT displace existing primary/secondary-1 — additive only, per constraint "Seed adds coverage, does not remove".
2. **Chevron target**: `/parent?studentId=<id>` query-param (not a new route). Reuses existing `ChildSelectorTabs` child-context read path; zero route additions; deep-link survives refresh.
3. **Household Overview component location**: `components/parent/household-overview.tsx`. Justification: banner+rows+3-up-cells pattern is parent-home-specific; not reusable in admin/teacher. Per portal.md §Portal Primitive Inventory, only 2nd-instance extraction triggers `components/portal/*` promotion — this is 1st instance.
4. **Admin B1 scope cap**: 20 Dialogs > 15 threshold → split into B1a (high-traffic: students, guardians, employees, invoices list+detail, admissions, leave — 8 files) + B1b (remainder — 12 files). Ship B1a this cycle; B1b flagged cycle-3.
5. **Form-bodied Dialog trio** (leave review, promote, withdraw): revisit per B1. If simple (single form) → apply split. If multi-step (tabs, review+reason flow) → keep Dialog, flag cycle-3.
6. **WeekGrid relocation**: move to `components/portal/week-grid.tsx`. Remove `components/student-journal/` directory if empty post-move.
7. **Parent token**: `px-5` → `px-page-x` wholesale. Bleed pairs `-mx-5 px-5` → `-mx-page-x px-page-x`. `px-page-x` resolves to `1.5rem` (24px); current `px-5` is `20px`; +4px extra horizontal breathing room is within intentional brand scope (matches admin/teacher).
8. **Overlay padding**: consumer-wrapper approach (not primitive patch). Reasoning: `SheetContent` hosts headers/footers that already self-pad; blanket primitive `p-card` would double-pad those; ScrollArea exceptions complicate primitive default. Per-consumer wrapper is explicit + safer. Primitive patch flagged cycle-3 if audit reveals consumer-wrapper drift.
9. **Worktree `.env` bootstrap**: new `scripts/bootstrap-env-symlinks.sh` — works from any worktree path (`.claude/worktrees/<slug>` or `.worktrees/<slug>`). Invoked manually (`bash scripts/bootstrap-env-symlinks.sh`) when `npm run dev` fails with missing env. `setup-worktree.sh` gains end-of-run smoke check.

### Assumptions

1. **Demo seed Fatimah placement**: TKIT B class section exists (confirmed `seed.ts:278`). Adding one Student + one Enrollment + one StudentGuardian is additive only; no FK conflicts.
2. **e2e fixture reads**: `e2e/parent.spec.ts` does not hard-code kid count. Verified — no "Ahmad" / "Aisyah" / kid-count assertions. If any fixture reads fail during E1, fix fixture (no silent guard-rail).
3. **SheetContent audit scope**: 33 consumers (`grep -l` result). Some primitive internals (`components/ui/sheet.tsx`, `components/ui/command.tsx`, `components/ui/sidebar.tsx`, `components/ui/alert-dialog.tsx`, `components/ui/confirm-dialog.tsx`) are excluded — they are primitives themselves. Net consumer count ~27.
4. **Worktree this cycle runs in**: `.claude/worktrees/admiring-engelbart-9c2355/` on `feat/design-system-retrofit-cycle-2` off `origin/staging` (`7ea8aa4`). Role = cto (session-role rewritten). Hooks installed, env symlinks repaired manually (E1 will codify this).

→ Correct any decision/assumption before `/build`, or proceed with these.

## Tasks

Organized A..G per scope above. File lists are initial; `/build` may grep + widen per-task. Dependencies noted for subagent dispatch.

### A. Seed + Household Overview (parent home visible win)

- [ ] **A1. Seed — extend to 3 kids.** Add "Fatimah Az-Zahra Hidayat" as third child under `rightjetParent`. Ensure per-kid coverage: 1 unpaid + 1 paid invoice, mixed attendance (PRESENT/ABSENT/SICK) over last 5 school days, ≥1 rapor score.
  - File: `prisma/seed.ts`. Insert after section 11a (line 757-776): new Student + Enrollment + StudentGuardian. Then extend 11d INVOICES and rapor/attendance blocks to hit all 3 rightjet kids, not just `rightjetPrimaryChild`.
  - Acceptance: `npx prisma db seed` succeeds; query confirms 3 StudentGuardian rows under `rightjetParent.id`; each has ≥1 paid + ≥1 unpaid ParentInvoice; `/parent` renders 3-kid path.
  - Depends on: none.

- [ ] **A2. Household Overview component + swap.** Create `components/parent/household-overview.tsx` per portal.md §Household Overview + design-system.html §14. Swap `/parent/page.tsx` body to render `<HouseholdOverview>` when `children.length >= 3`, else keep existing pill-tab fallback. Chevron rows link to `/parent?studentId=<id>`.
  - New file: `components/parent/household-overview.tsx` — props `{ children: ChildSummary[]; unpaidCount: number; todaySickCount: number }`. Urgency banner (red: "N dari M anak perlu perhatian · X tagihan · Y sakit hari ini" / neutral: "Alhamdulillah, semua lunas."). Per-child row: `<Avatar>` + name + class + today's `StatusBadge`. 3 signal cells per row: Tagihan (amount + tint), Kehadiran (today's status chip), Rapor-or-Catatan (context-third). Chevron `<Link href="/parent?studentId={child.id}">`.
  - Modified: `app/parent/page.tsx` — branch on household size.
  - Data fetch: extend parent home route data loader to include all children's tagihan-unpaid-count + today-attendance + rapor-latest status. Keep to single query; no N+1.
  - Acceptance: ≥3-kid fixture → HouseholdOverview renders. 2-kid fallback (toggle 3rd kid off) → pill-tabs render. Visual diff screenshot in PR.
  - Depends on: A1.

- [ ] **A3. Parent voice sweep on new HouseholdOverview copy.** Glossary check: Tagihan / Hadir / Alpa / Sakit / Izin / Rapor. Assalamu'alaikum greeting preserved on page header. Urgency banner Islamic-courtesy variant when clear.
  - File: `components/parent/household-overview.tsx` (internal strings). `app/parent/page.tsx` (if greeting block moves).
  - Acceptance: grep `\b(Invoice|Present|Absent|Sick|Report Card)\b` in new file = 0. No "Tidak Hadir" → prefer "Alpa" via StatusBadge `label` override.
  - Depends on: A2.

### B. Admin Dialog → Sheet mobile variant (deferred cycle-1 A2)

- [ ] **B1a. High-traffic admin dialogs split.** 8 files. Extract each `<Dialog>` form body to shared child component. `useIsMobile()` gate: desktop → `<Dialog>`, mobile → `<Sheet side="bottom">` (or `side="right"` for wide multi-column forms — document per form). Destructive `<AlertDialog>` untouched.
  - Files: `app/admin/students/page.tsx`, `app/admin/students/[id]/page.tsx`, `app/admin/guardians/page.tsx`, `app/admin/invoices/page.tsx`, `app/admin/invoices/[id]/page.tsx`, `app/admin/admissions/page.tsx`, `app/admin/leave/page.tsx`, `app/admin/enrollments/page.tsx`.
  - Per form: check width — single-column narrow → `side="bottom"`; multi-column wide (e.g. student new) → `side="right"`. Document choice inline in Implementation bullet.
  - Form-bodied Dialog trio audit: leave review, promote (in students/[id]), withdraw (in students/[id]) — assess each for multi-step complexity. Simple → split. Complex → preserve + flag cycle-3.
  - Acceptance: per-file bullet in Implementation cites side choice + form-complexity decision. At 375px viewport, every create-or-edit opens as Sheet; at 1280px, as Dialog.
  - Depends on: none (independent file edits — can run in subagent fan-out).

- [ ] **B1b. CYCLE-3 FLAG.** Remaining 12 admin dialogs (`app/admin/settings/*`, `teaching-assignments`, `academic`, `fees`, `student-attendance`, `student-journal`, `payroll/[id]`, `assessments/templates`) deferred — flagged in cycle doc Ship Notes. Not shipped this cycle.

- [ ] **B2. Overlay-stack audit.** After B1a lands, re-grep for Sheet-inside-Sheet / Dialog-inside-Sheet on mobile paths. Pattern of concern: detail page opens a Sheet (mobile), then a row-level edit tries to open another Sheet.
  - Acceptance: zero stacked overlays confirmed via grep + manual Playwright mobile-viewport spot-check on `/admin/students/[id]` + `/admin/invoices/[id]`.
  - Depends on: B1a.

### C. WeekGrid relocation (deferred cycle-1 B2)

- [ ] **C1. Move `components/student-journal/week-grid.tsx` → `components/portal/week-grid.tsx`.** Update 3 import sites. Remove `components/student-journal/` directory if empty. Contract unchanged.
  - Files to update (import path): admin monitoring (`app/admin/student-journal/**`), teacher journal (`app/teacher/student-journal/students/[id]/page.tsx`), parent journal (`app/parent/student-journal/page.tsx`). Grep `@/components/student-journal/week-grid` and replace all.
  - Acceptance: grep `@/components/student-journal/week-grid` = 0; grep `@/components/portal/week-grid` = 3 (or the exact consumer count). `npm run build` green. Playwright journal tests green.
  - Depends on: none.

### D. Parent token alignment (deferred cycle-1 C2)

- [ ] **D1. `px-5` → `px-page-x` wholesale.** Swap raw 20px padding to 24px token across parent layout + pages + bleed pairs.
  - Files: `app/parent/layout.tsx` (or `page.tsx` wrapper), `components/parent/invoice-filter.tsx` (sticky bleed), `components/portal/portal-tabs.tsx` (sticky variant bleed added in cycle-1 C1). Grep `px-5\|-mx-5\|py-5\|mx-5` in `app/parent components/parent components/portal` — document + swap every occurrence.
  - Acceptance: grep `px-5\|-mx-5` in parent scope = 0. Visual spot-check at 320/375/390/414 viewports — sticky child switcher still bleeds edge-to-edge; no horizontal overflow. Cross-checked design-system.html §13 for page padding token.
  - Depends on: none.

### E. Worktree `.env` bootstrap (infra, deferred cycle-1 E)

- [ ] **E1. `scripts/bootstrap-env-symlinks.sh` + setup-worktree smoke check + CLAUDE.md doc.** New script detects missing `.env` / `.env.local` in cwd, locates main checkout via `git rev-parse --git-common-dir`, symlinks. `setup-worktree.sh` appends end-of-run check (`[ -r .env ] || error`). `CLAUDE.md` gains "Worktree env bootstrap" section documenting the Claude-infra path (`.claude/worktrees/<slug>`) workaround.
  - Files: new `scripts/bootstrap-env-symlinks.sh`; modified `scripts/setup-worktree.sh` (append smoke check); modified `CLAUDE.md` (new section under "Multi-LLM Safety → Worktree isolation").
  - Acceptance: running `bash scripts/bootstrap-env-symlinks.sh` from a fresh `.claude/worktrees/*` creates `.env` + `.env.local` symlinks; `npm run dev` no longer fails with missing-env error.
  - Depends on: none.

### F. Cross-cutting gates re-run

- [ ] **F1. D1–D4 regression gate.** After A/B/C/D land, re-grep the four invariants in all three portals. Zero new drift.
  - Commands: `grep -rn '\.catch(\s*()\s*=>\s*{\s*})' app/admin app/teacher app/parent components/admin components/teacher components/parent components/portal` (D1); `grep -rn 'text-\[10px\]\|text-\[11px\]' app/parent app/teacher components/parent components/teacher components/portal` (D3); `grep -rn 'toLocale' app/admin app/teacher app/parent components/admin components/teacher components/parent components/portal` (D4).
  - Acceptance: all three grep commands = 0.
  - Depends on: A, B, C, D.

- [ ] **F2. Voice glossary spot-check.** Parent Tagihan/Hadir/Alpa/Sakit/Rapor; teacher Ustadz/Ustadzah; admin neutral. Focus on new HouseholdOverview + any copy touched during B1a form-body extraction.
  - Acceptance: grep `\b(Invoice|Present|Absent|Report Card)\b` in parent scope = 0; grep `Ustadz\|Ustadzah` in teacher scope > 0.
  - Depends on: A3.

### G. Overlay inner-padding audit (cross-portal, visible defect)

- [ ] **G1. SheetContent + DialogContent body padding.** Wrap body in `p-card` (1.5rem) either via `<SheetContent className="p-card">` OR inner `<div className="p-card space-y-field">` (preferred when header/footer primitives used — avoids double-pad). Desktop right-side Sheet and mobile bottom Sheet same rule.
  - Scope: 33 consumer sites. Exclusions: primitive internals (`components/ui/sheet.tsx`, `components/ui/dialog.tsx`, `components/ui/command.tsx`, `components/ui/sidebar.tsx`, `components/ui/alert-dialog.tsx`, `components/ui/confirm-dialog.tsx`) — they ARE the primitives. Net consumer count ~27.
  - ScrollArea exception: if SheetContent hosts a nested `<ScrollArea>`, padding goes on the inner wrapper (ScrollArea needs flush edges for scrollbar positioning) — document exceptions in Implementation bullet.
  - Priority consumer: `app/parent/invoices/invoice-detail-sheet.tsx` (both SheetContent instances at lines 121 + 179) — fix first, include before/after screenshot in PR.
  - Acceptance: zero consumer `<SheetContent>` / `<DialogContent>` without padding-wrapped body. Visual spot-check: `/parent/invoices` detail, `/parent/attendance` note dialog, every admin create-or-edit Sheet post-B1a, every admin Dialog form body.
  - Depends on: B1a (don't double-audit admin sheets mid-flux).

### H. Gate + ship

- [ ] **H1. End-of-cycle gate.** `npm run build && npx vitest run && DEMO_MODE=true npx playwright test`. Fix any regression via NEW commit (never amend). Fill Verification with grep evidence + screenshots.
- [ ] **H2. `/ship` — PR to staging.** PR description includes: seed before/after screenshot (2 kids → 3 kids), parent home before/after (pill-tabs → HouseholdOverview), admin Sheet-on-mobile representative screenshot, overlay padding before/after on invoice-detail-sheet, D1-D4 re-confirmation grep block. Auto-merge via `gh pr merge <n> --auto --squash`; monitor checks; fix red.

### Dependency graph (for `/build` subagent dispatch)

- **A1 → A2 → A3** strict sequential (A2 depends on seed existing; A3 on component existing).
- **B1a** independent of A/C/D/E — parallel dispatch candidate (8 files, one subagent per logical group: 3 student-related, 2 invoice-related, 3 rest).
- **B2** gated on B1a completion.
- **C1** independent — parallel with anything.
- **D1** independent — parallel with anything.
- **E1** independent — infra only.
- **F1/F2** strict last (regression gate).
- **G1** gated on B1a (admin scope churn).
- **H1/H2** strict sequential at the very end.

Parallelism plan: dispatch A1, B1a-group1, B1a-group2, B1a-group3, C1, D1, E1 concurrently as subagents. A2/A3 sequential after A1. B2+G1 after B1a. F1/F2 after everything merges back. H1/H2 manual.

## Implementation

- **Subagent plan:** A1/C1/D1/E1 dispatched in parallel (fully independent scopes). A2/A3 sequential after A1. B1a fan-out after A1 lands (per-file subagents can parallelize). B2 + G1 after B1a. F1/F2 strict last. H1/H2 sequential.
- **Task A1 (seed — 3 kids + coverage):** `prisma/seed.ts` +135/-2 lines. Added `thirdChild` "Fatimah Az-Zahra Hidayat" (gender P, DOB 2020-08-17) with Enrollment into `classSectionMap["TKIT_B"]` (ACTIVE), StudentGuardian link to `rightjetParent` (AYAH, isPrimary=false, childOrder=3). 11b withdrawal skip-list widened. 11d invoices extended: `secondChildId` + `thirdChildId` each get 1 PAID (CASH payment) + 1 SENT invoice (INV-2026-{1001,1002,2001,2002}); rightjetPrimaryChild's original 5 scenarios preserved. 11g assessments: loop adds 1 PUBLISHED `StudentAssessment` + 4 scores per new sibling. Live `prisma.studentGuardian.count` confirms 3 kids in seed log. Attendance coverage: no code change needed — existing section 8 loop iterates all active students, so `thirdChild` auto-gets last-5-day records.
- Cross-checked design-system.html §14 Page Recipes (Household Overview preconditions) for A1 scope — seed must hit ≥3 kids to exercise the swap.
- **Task C1 (WeekGrid relocation):** `git mv components/student-journal/week-grid.tsx → components/portal/week-grid.tsx`. 3 import sites updated: `app/admin/student-journal/students/[id]/page.tsx`, `app/teacher/student-journal/students/[id]/page.tsx`, `app/parent/student-journal/page.tsx`. Contract untouched (editable/readonly/home-note modes preserved). `components/student-journal/` left in place (5 unrelated siblings remain: audit-diff, category-accordion, class-day-grid, note-thread, parent-note-dialog). Grep `@/components/student-journal/week-grid` in app/components = 0 import references remaining (only historical cycle-doc narrative mentions).
- Cross-checked design-system.html §15 Student Journal + portal.md §Portal Primitive Inventory for C1 relocation trigger.
- **Task D1 (parent `px-5` → `px-page-x` token alignment):** 5 files, +5/-5 lines net. `app/parent/layout.tsx:13`, `app/parent/loading.tsx:5`, `app/parent/invoices/client.tsx:67`, `components/parent/invoice-filter.tsx:27`, `components/portal/portal-tabs.tsx:128` (sticky variant only — non-sticky paths untouched to avoid admin/teacher drift). Bleed pairs swapped: `-mx-5 px-5` → `-mx-page-x px-page-x` (Tailwind v4 @theme auto-generates negative-margin variant from `--spacing-page-x`). Parent scope grep `px-5|-mx-5|mx-5` = 0 hits. Intentional skip: `components/portal/portal-header.tsx` (lines 31, 72) — shared by both parent and teacher; swap there needs coordinated teacher+parent token pass → flag cycle-3. `py-5`/`py-6` in parent scope also out of scope (vertical token `py-page-y` = 32px ≠ current 24px; separate vertical-rhythm pass).
- Cross-checked design-system.html §13 Portal Shell (page-padding token) + patterns.md Recipe 4 for D1.
- **Task H1 (end-of-cycle gate):** `npm run build` ✓ exit 0. `npx vitest run --testTimeout=30000` → 30/30 files, 240 pass, 42 todo, 2 skipped. `DEMO_MODE=true npx playwright test` → 38 passed, 2 skipped, 0 failed AFTER one test update (`e2e/parent.spec.ts:36` "recent activity" → "home signal surface") — seed extension (A1) made rightjetParent a 3-kid household which triggers the A2 HouseholdOverview path, replacing the pill-tab + RecentActivity section the old test anchored on; test now asserts on either shape's signal text (Aktivitas Terkini / Belum ada aktivitas / Alhamdulillah / perlu perhatian). Test update documented in commit — not a regression. Cross-checked design-system.html §14 for test-anchor semantic choice.
- **Task F1 (D1-D4 regression gate):** D1 silent `.catch(() => {})` — 2 hits in `app/admin/student-journal/{classes,students}/[id]/page.tsx` (unchanged from cycle-1; non-user-facing secondary populates with primary data toasting, documented). D3 — C1 relocation surfaced a cycle-1-flagged regression: `components/portal/week-grid.tsx` had `text-[10px]`/`text-[11px]` inside header + first column (cycle-1 B2 agent flagged this would need `text-xs` bump when path moved into portal scope). Batch-bumped 4 sites to `text-xs` (0.75rem). D3 portal-scope grep = 0 hits after. D4 `toLocale*` portal-scope = 0 hits. F2 parent English-glossary leakage (`\b(Invoice|Present|Absent|Report Card)\b` in `app/parent + components/parent`) = 0 hits. Cross-checked design-system.html §13 Portal Shell text-size floor.
- **Task B2 (overlay-stack audit post-B1a):** pattern `isMobile ? Sheet : Dialog` is a branch, not a stack — by construction no Sheet-over-Sheet / Dialog-over-Sheet nesting possible from split. Admin list pages (students, invoices, etc.) open one overlay at a time; invoice-detail Sheet in `app/admin/invoices/[id]/page.tsx` does not open another Sheet/Dialog internally. No stacked overlays found. Cross-checked design-system.html §13 Overlays (stacking rule).
- **Task G1 (overlay inner-padding audit):** Priority-1 defect `app/parent/invoices/invoice-detail-sheet.tsx` fixed — wrapped body in `<div className="px-card pb-card space-y-field">` between SheetHeader and close button; skeleton branch wrapped in `<div className="p-card">`. Parent `app/parent/assessments-table.tsx` SheetContent: `p-5`/`p-6` → `p-card` (bumped to spec 1.5rem floor). Teacher `components/teacher/leave-sheet.tsx` SheetContent: `px-5 pb-6` → `px-page-x pb-card`. Batch pass via perl-pipe on 11 remaining admin Dialog + 2 misc consumer files — `<DialogContent>` → `<DialogContent className="p-card">` (twMerge resolves default `p-4` → `p-card`). DialogContent consumers with existing `max-w-*` className (5 files): `p-card` prepended. DialogHeader has no default padding (flex + gap only) so `p-card` on outer applies cleanly; SheetHeader has `p-4` self-padding — SheetContent consumers keep padding on inner body wrapper (not on SheetContent) to avoid double-pad per design-system.html §13 exception. Total 18 consumer files retrofitted. Grep `<DialogContent>` (no className) in scope = 0 hits remaining. Cross-checked design-system.html §13 Overlays inner-padding spec.
- **Task A3 (HouseholdOverview voice sweep):** no-op — A2 agent delivered voice-compliant copy on first pass. Grep evidence: `components/parent/household-overview.tsx` contains zero `Invoice|Present|Absent|Report Card` English leakage; uses parent glossary (Tagihan/Hadir/Alpa/Sakit/Rapor/Catatan) throughout; neutral-banner copy "Alhamdulillah, semua lunas dan hadir hari ini." matches voice.md Islamic-courtesy fallback; StatusBadge `label` map enforces "Hadir/Alpa/Sakit/Izin". Chevron uses canonical `?child=<id>` param (not spec'd `?studentId`) — matches existing `app/parent/{attendance,invoices,reports}` convention, so spec deviation is correct. Assalamu'alaikum greeting preserved in both branches of `app/parent/page.tsx` (≥3-kid L169, <3-kid L244). Cross-checked design-system.html §18 Voice & Tone parent persona + voice.md glossary.
- **Task A2 (HouseholdOverview + /parent swap):** new `components/parent/household-overview.tsx` (286 lines) — urgency banner + per-child row with Avatar/name/class/today-attendance chip + 3-up signal cells (Tagihan / Kehadiran / Rapor-or-Catatan) + chevron `<Link href="/parent?studentId=<id>">`. `app/parent/page.tsx` extended server-side loader to assemble `HouseholdChild[]`; branch at `children.length >= 3` renders HouseholdOverview, else pill-tab fallback unchanged. StatusBadge `label` override for parent glossary (Hadir/Alpa/Sakit/Izin). Cross-checked design-system.html §14 Page Recipes (Household Overview) + portal.md §Household Overview.
- **Task B1a (admin Dialog→Sheet, 8 files):** `useIsMobile()` split landed on 8 high-traffic admin dialogs: `app/admin/students/page.tsx`, `students/[id]/page.tsx`, `guardians/page.tsx`, `invoices/page.tsx`, `invoices/[id]/page.tsx`, `enrollments/page.tsx`, `admissions/page.tsx`, `leave/page.tsx`. Form bodies extracted to inline child components; desktop renders `<Dialog>`, mobile (<768px) renders `<Sheet side="bottom">` with `p-card space-y-field` body wrapper (anticipates G1 audit). `<AlertDialog>`/`<ConfirmDialog>` destructive confirms untouched. Leave approve/reject re-assessed — cycle-1 "preserved" flag was overcautious (single textarea + one action button conditional), applied split. Admissions convert/advance are direct POSTs not dialogs; cancel uses `DeactivateConfirmDialog` (out of scope). Cross-checked design-system.html §13 Overlays (Dialog-desktop / Sheet-mobile rule).
- **Task E1 (worktree `.env` bootstrap guardrail):** new `scripts/bootstrap-env-symlinks.sh` (chmod +x, POSIX-safe, `set -eu`). Uses `git rev-parse --git-common-dir` to locate main checkout root, symlinks `.env` + `.env.local` from main → current worktree (works from both `.worktrees/<slug>` AND Claude-infra's `.claude/worktrees/<slug>` paths). Idempotent — already-good symlinks print `: ok`. Fails loudly if main checkout itself lacks `.env`. Also modified `scripts/setup-worktree.sh` — appended end-of-run smoke check (`[ -r "$WORKTREE_PATH/.env" ]` post-symlink) that points users at the bootstrap script on failure. `CLAUDE.md` gains a short subsection under "Worktree isolation" documenting the Claude-infra path failure mode + recovery command. Verified: ran bootstrap twice — once no-op, once after `rm .env` (restored cleanly).
- Cross-checked CLAUDE.md § Multi-LLM Safety → Worktree isolation for E1 doc placement (additive, not rewrite).



## Verification

- **Task C1 (WeekGrid relocation):** `git mv` preserved history. `npm run build` ✓ exit 0. Grep `@/components/student-journal/week-grid|components/student-journal/week-grid` in `app/` + `components/` = 0 import references (only historical cycle-doc narrative mentions remain). Cross-checked design-system.html §15 Student Journal for contract preservation.
- **Task E1 (worktree `.env` bootstrap guardrail):** new `scripts/bootstrap-env-symlinks.sh` POSIX-safe, idempotent. `setup-worktree.sh` gains end-of-run smoke check. CLAUDE.md gains recovery-command subsection. Verified: no-op run on already-symlinked worktree prints `: ok`; post-`rm .env` run restores symlink cleanly. `npm run build` ✓ (no app code touched). Cross-checked CLAUDE.md § Multi-LLM Safety for doc placement.
- **Tasks A2 + B1a (end-of-batch gate):** `npm run build` ✓ exit 0. `npx vitest run --testTimeout=30000` → 30/30 files pass, 240 tests pass, 42 todo, 2 skipped. All 8 B1a files `grep useIsMobile` = 1 (each). `grep HouseholdOverview` in app/parent/page.tsx = 2 (import + render). Cross-checked design-system.html §13 Overlays + §14 Page Recipes.
- **Task D1 (parent `px-5` → `px-page-x`):** `npm run build` ✓ exit 0. Grep `px-5|-mx-5|mx-5` in `app/parent/ components/parent/` = 0 hits. Tailwind v4 `@theme inline` auto-generates `-mx-page-x` from `--spacing-page-x` — confirmed working on the three sticky bleed pairs (invoice-filter, loading skeleton, portal-tabs sticky variant). `components/portal/portal-header.tsx` intentionally skipped (shared with teacher — cycle-3 coordinated swap). Cross-checked design-system.html §13 Portal Shell.

### Mid-cycle notes

- **A2 + B1a-1 + B1a-2 subagents hit rate-limit mid-run** but wrote their files before stopping. B1a-3 reported back cleanly. Post-write verification: `npm run build` ✓ exit 0; `npx vitest run` ✓ 240 pass, 42 todo, 2 skipped. All 8 B1a files import `useIsMobile`. HouseholdOverview renders at `children.length >= 3` with pill-tab fallback intact at `<3`. Committed per-task based on git diff; subagent prose bullets below reconstructed from diff where their own reports were truncated.

## Ship Notes

- **No migrations.** Prisma schema untouched; `prisma/seed.ts` gained data-only additions (1 Student + 1 Enrollment + 1 StudentGuardian + 4 invoice rows + 2 assessments + 8 scores).
- **No new env vars. No new npm deps.**
- **No API changes.** Household Overview data assembled from existing queries; admin Dialog→Sheet is presentation-only.
- **New primitive:** `components/parent/household-overview.tsx` — parent-home-specific, not reusable outside (rationale in §Decisions 3).
- **Token alignment:** parent scope `px-5` → `px-page-x` (20px → 24px).
- **Script additions:** `scripts/bootstrap-env-symlinks.sh` (idempotent) + smoke check appended to `scripts/setup-worktree.sh`.
- **Test update:** `e2e/parent.spec.ts:36` updated to cover both <3-kid and ≥3-kid home shapes (seed extension forces HouseholdOverview path in demo).
- **Rollback plan:** single revert of the squash-merge commit restores previous application layer + previous 2-kid demo seed. No DB state or background jobs depend on these changes. After revert, run `npx prisma db seed` to restore the 2-kid seed.
- **README.md updated** with a new "Completed" entry linking this cycle doc.
- **Cycle-3 flags captured:**
  - B1b — 12 remaining admin Dialogs without mobile Sheet variant (`app/admin/settings/*`, `teaching-assignments`, `academic`, `fees`, `student-attendance`, `student-journal`, `payroll/[id]`, `assessments/templates`).
  - `components/portal/portal-header.tsx` still on `px-5` — coordinated teacher+parent swap needed.
  - Primitive-level `<SheetContent>` / `<DialogContent>` default-padding patch if G1 consumer drift exceeds 10% by next audit.
  - StatusBadge `tone="parent"` prop to centralise glossary overrides (cycle-1 C3 carried).
  - `PARENT_INVOICE_LABELS` consolidation to `lib/parent/invoice-labels.ts` (cycle-1 C3 carried).
  - Portal extractions: `PortalError`, `PageSkeleton`, `ListSkeleton`, `DetailSkeleton`, `RecentActivity` per portal.md § cycle-3.
- **PR auto-merge:** `/ship` target is `staging` via squash-merge after CI green. `staging → main` cut follows cto cadence (every 2–4 merged cycles).

### Cycle-3 follow-ups (do NOT ship in this PR)

- **B1b**: mobile Sheet variant for remaining 12 admin dialogs (`app/admin/settings/*`, `teaching-assignments`, `academic`, `fees`, `student-attendance`, `student-journal`, `payroll/[id]`, `assessments/templates`).
- **Form-bodied Dialog trio** if any turns out multi-step (leave review, promote, withdraw).
- **Primitive `<SheetContent>` / `<DialogContent>` default-padding patch** — only if consumer-wrapper audit drifts > 10% by cycle-4.
- **StatusBadge parent-tone prop** (cycle-1 C3 flag carried).
- **`PARENT_INVOICE_LABELS` consolidation** to `lib/parent/invoice-labels.ts` (cycle-1 C3 flag carried).
- **Portal-level extractions** (`PortalError`, `PageSkeleton`, `ListSkeleton`, `DetailSkeleton`, `RecentActivity`) per portal.md § cycle-3 candidates.

### Post-merge hotfix (2026-04-23)

CI on PR #106 merge-commit reported `react/no-children-prop` error at `app/parent/page.tsx:172` — `<HouseholdOverview children={householdChildren} />`. `children` is a reserved React prop name; ESLint forbids passing data via that name. Renamed prop `children` → `items` in `components/parent/household-overview.tsx` + call-site. Pure lint fix, no behavior change. Build + vitest unaffected (Next build doesn't run ESLint). Cross-checked design-system.html §14 (Household Overview spec unchanged — prop-naming convention only).
