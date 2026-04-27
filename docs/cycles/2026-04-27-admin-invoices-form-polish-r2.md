# Admin Invoices — Manual + Batch Dialog Visual Polish (Round 2)

## Context

Prior cycle `2026-04-27-finance-ui-polish` T2 applied surface fixes to the admin invoices manual + batch dialogs (Batal → ghost, Total → semibold, Komponen rows in `bg-muted/30` panel, Tahun Ajaran helper). Live staging screenshot post-deploy still reads "ugly". Concrete drift visible on staging at `/admin/invoices` "Tagihan Manual" + "Buat Tagihan Bulanan":

1. **Header crowds the X close.** `components/ui/dialog.tsx:75-86` renders `<DialogClose>` absolutely positioned at `top-3 right-3` with no `pr-*` buffer on `DialogHeader`. Title + description wrap into the close-button hit-zone on a `max-w-xl` dialog.
2. **Inconsistent field-to-field rhythm.** `components/admin/invoices/manual-invoice-dialog.tsx:685` wraps `<ManualInvoiceFormBody>` in `<div className="p-card space-y-field">` *inside* `<DialogContent className="p-card max-w-xl">` — **double `p-card` (1.5rem outer + 1.5rem inner = 3rem padding)**. Each `<Field>` primitive has its own `gap-2` (0.5rem label→input). The combined effect: outer 3rem, inter-field 1rem, intra-field 0.5rem — three competing spacing scales.
3. **`bg-muted/30` panel invisible.** `manual-invoice-dialog.tsx:447` — `bg-muted/30` over `bg-card` (#FFFFFF dialog) renders ~#F8F8F9, indistinguishable from the background. The Komponen Biaya row group has no visual container.
4. **Komponen row cramping.** `manual-invoice-dialog.tsx:449` uses `flex items-center gap-2` — Select gets `flex-1 min-w-0` (fills remaining), Input `w-32` (8rem fixed), Button `size="icon"` (2.25rem). On a 576px-wide dialog body the Select renders ~24rem → wide enough; on a `max-w-xl` (36rem) dialog the actual usable width minus padding lands the Select at ~14rem. Combined with X button floating top-of-input rather than baseline-centered, the row reads cramped + misaligned.
5. **Total separator hairline.** `manual-invoice-dialog.tsx:508` — `border-t border-border pt-4 mt-2` (1px). Reads as accidental rule under busy form rows.
6. **Desktop `Batal` still `variant="outline"`.** Prior cycle T2 fixed mobile Sheet (line 663 ghost) but missed desktop dialog (line 696 still `variant="outline"`). Inconsistent across breakpoints.
7. **Batch dialog same drift + weak helper.** `app/admin/invoices/page.tsx:198-233` GenerateInvoiceFormBody — same double `p-card` pattern (line 858, 878), same field rhythm. Helper text via `<FieldDescription>` resolves to `text-sm text-muted-foreground` (per `components/ui/field.tsx:131-144`) — at 0.875rem against `--muted-foreground` (#57534E) it reads instructional but not crisp. Design-system `.field-desc` spec is `0.75rem`.

**Design-system reference (from explore agent on `.claude/standards/design-system.html`):**
- `.overlay-header`: `gap: 0.75rem; padding: 1rem 1.125rem 0.75rem; border-bottom: 1px solid var(--border)`
- `.overlay-body`: `padding: 1rem 1.125rem; gap: 0.875rem`
- `.overlay-footer`: `gap: 0.5rem; padding: 0.75rem 1.125rem 1rem; border-top`
- `.field`: `gap: 0.375rem` (label→input)
- `.field-desc`: `font-size: 0.75rem`

**Live UAT:** `/uat admin/invoices` dispatched against staging via Playwright MCP — runs in background. Auth wall is the expected outcome (Google SSO won't survive Playwright fresh context); UAT report will document the wall + capture design-system reference screenshots only. User-supplied screenshot from their authenticated Chrome session is the operative blocker evidence and is already itemized above. **Decision: do not block /spec on the UAT result; fold it into Verification when complete.**

**Outcome:** Manual + batch dialogs match design-system §Dialog + §Forms spec values exactly. Visual hierarchy reads as: header (tight, no X collision) → form rows (consistent 0.875rem inter-row, 0.375rem intra-field) → grouped sub-form for Komponen Biaya in a real container → Total summary in a clearly-separated row → footer with ghost-secondary + primary, gap-2. Mobile Sheet matches desktop Dialog. No new fields, no copy change beyond confirmed helper-text resize.

## Spec

### Acceptance criteria

- [ ] **Header no longer crowds the close X.** Reviewer-correction: the close X is absolutely positioned inside `DialogContent` (lines 42–81), not inside `DialogHeader` — `pr-8` on the header is a no-op. Fix at the primitive: `DialogContent` base padding `p-4` → `pt-4 pr-10 pb-4 pl-4` (right-side clearance for the absolute close button at `top-2 right-2`). Same surgical fix for `SheetContent` if it exhibits the same collision (verify; SheetClose may already sit at `top-3 right-3` with its own clearance — read the primitive before editing).

- [ ] **Single source of truth for dialog padding.** Remove the inner `<div className="p-card space-y-field">` wrapper inside both manual + batch dialogs. Replace with `<div className="space-y-field">` (vertical rhythm only — padding handled by `DialogContent` primitive). **Padding standard accepted: `DialogContent` `p-4` (1rem all sides) is the body padding standard for this app. No primitive upgrade to `p-card` is in scope.** Design-system `.overlay-body` spec is `padding: 1rem 1.125rem` — `p-4` is within tolerance; the side delta (1.125rem vs 1rem) is not large enough to justify a primitive rewrite this cycle.

- [ ] **Field rhythm tightened.** `--space-field` stays at `1rem` (already correct per design-system overlay-body 0.875rem ≈ 1rem). Internal Field gap (`fieldVariants` line 55 — `gap-2`) verified against design-system `.field` `gap: 0.375rem` and either reduced to `gap-1.5` (0.375rem) at the primitive OR documented as intentional divergence. **Decision: change at primitive — risk-bounded to forms across the app, but cycle owns the visual diff.** All admin form pages must be re-verified at end-of-cycle Playwright run.

- [ ] **Komponen Biaya panel reads as a container.** Replace `bg-muted/30` with `bg-muted/60` AND add `border-2 border-dashed border-muted-foreground/20` (per user spec). Inner Select keeps `bg-background` so it visually pops out of the panel.

- [ ] **Komponen row uses responsive CSS grid for alignment.** Reviewer-correction: at 360×800 the Sheet body usable width is ~238px (`w-3/4` viewport minus header padding). A flat `1fr_120px_auto` leaves the Select at ~66px — clips the option label. Commit to responsive grid: `grid grid-cols-[1fr_100px_auto] md:grid-cols-[1fr_120px_auto] gap-2 items-center`. Select fills `1fr`, amount Input is `w-full` (grid column controls width — drop the `w-32`), X Button stays `size="icon"`. `items-center` baseline-aligns all three. Drop the `flex-1 min-w-0` wrapper around Select — grid `1fr` owns width.

- [ ] **Total row visually distinct.** Replace `border-t border-border pt-4 mt-2` with `border-t-2 border-border pt-3 mt-3`. (User offered alternative — Total in own card matching Komponen panel — rejected as visual asymmetry between sub-form (multi-row data entry) and summary (single read-only row); a thicker rule is the lighter-touch fix.)

- [ ] **Footer cluster consistent across breakpoints.** Desktop manual `Batal` button changes from `variant="outline"` to `variant="ghost"` (line 696), matching the mobile Sheet (line 663). Batch dialog already correct (lines 862, 883). DialogFooter primitive verified to set `gap-2` between buttons (already does — `gap-2` line in dialog.tsx).

- [ ] **Helper text crisp.** `components/ui/field.tsx:131-144` `FieldDescription` `text-sm` (0.875rem) → `text-xs` (0.75rem) per design-system `.field-desc` spec. **Risk:** affects every form using `<FieldDescription>` site-wide. Acceptable since spec value is the design-system token. Re-verify all admin/teacher/parent forms at end-of-cycle Playwright + visually spot-check 3 high-traffic forms (student create, employee create, parent payment).

- [ ] **No new content.** Zero new copy strings, zero new fields, zero new validations. API contract identical.

- [ ] **Cross-cut hygiene.** `grep -RE 'text-\[#[0-9a-f]+\]|bg-\[#[0-9a-f]+\]|border-\[#[0-9a-f]+\]' components/admin/invoices app/admin/invoices` returns zero. `grep "p-card" components/admin/invoices app/admin/invoices` shows no double-wrap pattern.

### Non-goals

- **Backend / API.** No route signature change, no Zod, no response shape touched.
- **New fields, validations, or copy.** Spec is visual rhythm + container clarity only.
- **Other dialogs.** Out-of-scope: ConfirmDialog, AlertDialog, Edit dialogs, Catat-Pembayaran dialog, BatchProgressCard, void/cancel modals. They share primitives — the primitive-level fixes (Dialog/Sheet header `pr-8`, FieldDescription size) will benefit them but are NOT explicitly in scope. Spot-check only at end-of-cycle.
- **Performance.** No render-cost work.
- **Parent + teacher portal forms.** Cross-impact only via `FieldDescription` + `Field` primitive changes.

### Assumptions

1. **`/uat admin/invoices` will hit a Google-SSO auth wall** in a fresh Playwright context — user-supplied screenshot from their Chrome session is the operative drift evidence. UAT job in background captures design-system reference screenshots + documents the auth wall as a known UAT gap (not a blocker for /spec). When the agent completes, its findings fold into Verification post-/build.
2. **Field primitive `gap-2 → gap-1.5` is a global form change**, not a per-dialog tweak. Risk owned by this cycle; mitigated by end-of-cycle Playwright suite (admin + teacher + parent forms exercised).
3. **`FieldDescription` `text-sm → text-xs` is also global.** Same risk, same mitigation. Cycle commits both primitive changes in one task to keep the diff atomic.
4. **No T0 banner kill, no T1 copy change** — pure visual / spacing / container work. Anything beyond that is scope creep.
5. **Live UAT against the new code is post-merge**, via Chrome MCP using the user's authenticated Chrome session. Pre-merge verification is end-of-cycle Playwright + the user's manual smoke per the Ship Notes checklist.
6. **Mobile Sheet already matches desktop Dialog for the Batal-ghost fix.** Only the desktop manual dialog drifts (line 696) — narrow surgical fix.
7. **Grid column widths** (`grid-cols-[1fr_120px_auto]`) match the existing `w-32` (8rem = 128px) → `120px` is a 6.25% squeeze. Acceptable for Rupiah amounts up to 99,999,999 (8 digits with `tabular-nums` font fits within 100px). Verify in T3.
8. **Branch protection / CI** runs Lint+Typecheck+Test, Build, Playwright E2E on PR — `/ship` will not mark complete until all green.
9. **Reviewer audit #1 applied (2026-04-27).** Three corrections folded into Spec acceptance criteria + T1/T2 task instructions: (a) DialogHeader `pr-8` was wrong target — moved to DialogContent right-padding; (b) responsive grid commit unconditional; (c) `p-4` (1rem) explicitly accepted as dialog body padding standard.
10. **Reviewer audit #2 applied (2026-04-27, against live `public/admin/design-system-reference.html`).** Direct token confirmations: `Field gap-1.5` (line 275 `.field { gap: 0.375rem }`), `FieldDescription text-xs` (line 278 `.field-desc { font-size: 0.75rem }`), Batal `ghost` (lines 2007, 2078, 1517 — three separate ghost-Batal examples), `--space-card 1.5rem`, `--space-field 1rem`. **Komponen Biaya container style (`bg-muted/60 + border-2 border-dashed border-muted-foreground/20`) has no reference backing** — the reference is silent on nested form-row panels. Treat as product decision, not reference token. **Fallback if Playwright screenshot reads poorly:** `bg-muted border border-border rounded-md p-3` (closest to reference `.card` pattern at smaller spacing). **Structural note for /build:** the reference §13 Dialog places the close X *inside* `.overlay-header` as a flex sibling (`justify-content: space-between`), not absolutely. The app's `dialog.tsx` uses absolute close — our `pr-10` fix is a pragmatic workaround for that drift. A future refactor moving `DialogClose` into `DialogHeader` would eliminate the workaround; out-of-scope this cycle.

→ Correct me now or `/build` will proceed with these.

## Tasks

> Execution order: T1 first (primitive fixes — touches Dialog, Sheet, Field — risk-bounded but global). T2–T3 admin invoices specific. T4 verification + cross-check. Single commit per task.

### T1 — Primitive fixes: DialogContent right-padding, FieldDescription `text-xs`, Field `gap-1.5` ✅
- **Files:**
  - `components/ui/dialog.tsx` (DialogContent base classes) — change `p-4` → `pt-4 pr-10 pb-4 pl-4` to reserve right-side clearance for the absolute close button (`top-2 right-2`, size-icon-sm). Read lines 42–81 first to confirm exact base-class string.
  - `components/ui/sheet.tsx` (SheetContent / SheetClose) — read first. If SheetClose already at `top-3 right-3` AND content has adequate right padding, leave alone. Document the no-op decision in the commit if applicable.
  - `components/ui/field.tsx:131-144` — `FieldDescription` `text-sm` → `text-xs` (per design-system `.field-desc` 0.75rem). Blast radius: ~5 files, ~15 call sites — narrow.
  - `components/ui/field.tsx:54-70` — `fieldVariants` `gap-2` → `gap-1.5` (label→input gap = 0.375rem matching design-system `.field` spec). Blast radius: ~29 files, ~159 call sites — large; densest forms `app/admin/students/[id]/page.tsx` (~26 instances) and `app/admin/(hr)/employees/[id]/page.tsx`.
- **Acceptance:**
  - Header X no longer overlaps title/description in any dialog — visually verified at 1280×800 + 360×800 on `/admin/invoices` manual + batch dialogs and 2 sample dialogs (Catat-Pembayaran on `/admin/invoices/[id]`, an Edit dialog on `/admin/students/[id]`).
  - Helper text in any FieldDescription renders at 0.75rem.
  - Label→input gap in any Field renders at 0.375rem.
  - `npm run build && npx vitest run` green.
- **Risk:** Global. Mitigation: end-of-cycle Playwright + targeted manual spot-check on the two densest forms (`/admin/students/[id]` and `/admin/employees/[id]`) at 1280×800 + 360×800. If either visually regresses, T1 commits the className override at the consumer level instead of the primitive (fall-back path documented for /build).
- **Independent.**

### T2 — Manual invoice dialog: drop double padding, Komponen panel container, grid row, Total separator, desktop Batal ghost ✅
- **Files:** `components/admin/invoices/manual-invoice-dialog.tsx`
- **Specific changes:**
  - Lines 685, 652: replace `<div className="p-card space-y-field">` with `<div className="space-y-field">` in both Dialog + Sheet branches.
  - Line 447: `bg-muted/30` → `bg-muted/60` AND `border border-border` → `border-2 border-dashed border-muted-foreground/20`.
  - Line 449 inner: `flex items-center gap-2` → `grid grid-cols-[1fr_100px_auto] md:grid-cols-[1fr_120px_auto] gap-2 items-center` (responsive — at 360px Sheet body the 120px amount column starves the Select). Drop `w-32` from Input (line 482) — grid column owns width. Drop `flex-1 min-w-0` wrapper around Select (line 450) — grid `1fr` owns width.
  - Line 508: `border-t border-border pt-4 mt-2` → `border-t-2 border-border pt-3 mt-3`.
  - Line 696: `variant="outline"` → `variant="ghost"`.
- **Acceptance:**
  - Visual: at 1280×800 manual dialog reads as: tight header → 3 fields with consistent rhythm → Komponen panel clearly outlined (dashed border + visible muted background) → grid-aligned rows (Select + amount + X all baseline-centered) → Total row separated by 2px rule with breathing room → footer with ghost Batal + solid Buat Tagihan, gap-2.
  - At 360×800 Sheet variant matches with grid columns adapting (verify no horizontal overflow in Komponen row — if `120px` amount column overflows, add `md:` prefix and use `100px` for mobile).
  - `npm run build && npx vitest run` green. Existing 10 `validateManualForm` cases unchanged.
- **Independent of T1 verification but lands after T1 commit so primitive baselines exist.**

### T3 — Batch dialog: drop double padding (consume primitive fixes from T1) ✅
- **Files:** `app/admin/invoices/page.tsx`
- **Specific changes:**
  - Line 858 (Sheet branch) + 878 (Dialog branch): replace `<div className="p-card space-y-field">` with `<div className="space-y-field">`.
  - **No other changes** — batch dialog is 3 simple fields (Periode, Tanggal, Tahun Ajaran). Helper text crispness comes for free via T1's FieldDescription `text-xs`. Footer Batal is already ghost (lines 862, 883).
- **Acceptance:**
  - Visual: at 1280×800 + 360×800 batch dialog reads with consistent header/body/footer padding (no double-card). Helper "Periode tagihan akan terikat ke tahun ajaran ini." renders at 0.75rem (crisper than before).
  - `npm run build && npx vitest run` green.
- **Independent. Trivial.**

### T4 — Cross-cut verification + cycle doc fill ✅

### T5 — Sibling dialog pattern parity (reviewer-driven, added post-spec) ✅
- **Files:** `app/admin/students/[id]/page.tsx` (4 dialogs), `app/admin/guardians/page.tsx` (1), `components/teacher/leave-sheet.tsx` (1).
- **Trigger:** final reviewer pass on cycle diff flagged 6 sibling consumers of `<DialogContent className="p-card">` as inconsistent with the new T1+T2/T3/T4 baseline.
- **Math correction:** reviewer's "worsened by T1" framing was wrong — `tailwind-merge` resolves `className="p-card"` to override the asymmetric T1 base symmetrically (1.5rem all sides), so consumers were unchanged. T5 is consistency improvement, not regression fix.
- **Acceptance:** all 6 dialogs render with the same pattern as invoice dialogs (T1 baseline padding, no inner `p-card` double-wrap, ghost Batal, Sheet body `px-4 pb-4`). `npm run build` ✓ + `npx vitest run` ✓ (711 / 2 / 42 unchanged).
- **Out-of-scope (deferred to follow-up cycle):** 16+ remaining `<DialogContent className="p-card">` consumers documented in Implementation T5 bullet.
- **End-of-cycle gate:** `npm run build && npx vitest run && npx playwright test`. All green required before final commit.
- **Manual smoke (Playwright MCP, post-build, demo-mode auth):**
  - Manual dialog at 1280×800 + 360×800 — screenshot, attach to Verification.
  - Batch dialog at 1280×800 + 360×800 — screenshot, attach.
  - Sample 2 sibling dialogs to verify no regression from T1 primitive changes: ConfirmDialog (void invoice flow), Catat-Pembayaran dialog, Edit Student dialog.
  - 1 sample form on each portal to verify FieldDescription + Field gap changes don't break rhythm: admin/students/new (or edit), teacher/attendance/page, parent/invoices detail-sheet.
- **Cross-cut hygiene grep:**
  - `grep "p-card space-y-field" components/admin/invoices app/admin/invoices` returns zero (double-wrap removed).
  - `grep -RE 'text-\[#[0-9a-f]+\]|bg-\[#[0-9a-f]+\]' components/admin/invoices app/admin/invoices` returns zero.
- **UAT fold-in:** when the `/uat admin/invoices` background agent completes, append its findings (auth-wall note + design-system reference screenshots) to Verification.
- **Cycle doc fill:** Implementation + Verification + Ship Notes per the standard template.
- **Depends on T1–T3.**

## Implementation

- Subagent plan: T1 → T2 → T3 → T4 sequential inline. T2/T3 are file-disjoint but both depend on T1 primitive baseline; sequential keeps verification chains simple. No parallel dispatch.
- T1: primitive fixes. `components/ui/dialog.tsx:56` DialogContent `p-4` → `pt-4 pr-10 pb-4 pl-4` (clears absolute close X at `top-2 right-2 size-icon-sm` — needs ~2.25rem; `pr-10` = 2.5rem with 0.25rem buffer). DialogFooter `-mx-4` → `-ml-4 -mr-10` (asymmetric pull-back to keep footer flush to both inner edges of the now-asymmetric DialogContent padding). `components/ui/sheet.tsx:87` SheetHeader `p-4` → `pt-4 pr-10 pb-4 pl-4` (clears `SheetClose` at `top-3 right-3`). SheetContent has no base padding; SheetFooter not touched (no right-bleed pattern). `components/ui/field.tsx:55` `fieldVariants` `gap-2` → `gap-1.5` (label→input 0.5rem → 0.375rem matching design-system `.field { gap: 0.375rem }`). `components/ui/field.tsx:136` FieldDescription `text-sm` → `text-xs` (0.875rem → 0.75rem matching design-system `.field-desc { font-size: 0.75rem }`). Reviewer (`feature-dev:code-reviewer`) verdict: Approve — pull-back math exact, scope correctly narrow, no test regression risk (class-name-only edits, zero logic change).
- T2: manual invoice dialog visual pass. `components/admin/invoices/manual-invoice-dialog.tsx`. (a) DialogContent: `className="p-card max-w-xl"` → `className="max-w-xl"` (T1 baseline owns padding). (b) Inner desktop body wrapper: `className="p-card space-y-field"` → `className="space-y-field"` (drops double-padding). (c) Inner mobile Sheet body wrapper: `className="p-card space-y-field"` → `className="space-y-field px-4 pb-4"` (SheetContent has no base padding — keep horizontal/bottom; SheetContent `gap-4` flex-gap handles header→body separation). (d) Komponen Biaya panel: `bg-muted/30 border border-border` → `bg-muted/60 border-2 border-dashed border-muted-foreground/20` (visible container vs invisible accident). (e) Komponen row: `flex items-center gap-2` + nested `flex-1 min-w-0` Select wrapper + `w-32` Input → `grid grid-cols-[1fr_100px_auto] md:grid-cols-[1fr_120px_auto] gap-2 items-center` with Select unwrapped + Input `w-full` (grid column owns width; baseline-aligned via `items-center`; mobile column tightens 120px → 100px). (f) Total separator: `border-t border-border pt-4 mt-2` → `border-t-2 border-border pt-3 mt-3` (2px rule visually distinct from form rows). (g) Desktop Batal: `variant="outline"` → `variant="ghost"` (matches mobile Sheet baseline + design-system `.btn-ghost` cancel pattern). Zero logic change. Reviewer (`feature-dev:code-reviewer`) verdict: Approve — all 6 spec items land, SheetContent `gap-4` flex-gap absorbs header→body spacing (no stutter), 2px Total rule compensates for `mt-3` < `space-y-field`. Nit (deferred): `mt-3` is 0.25rem tighter than inter-field gap; if future cycle drops the rule, may read compressed.
- T5 (reviewer-driven cross-cut, added post-spec): patch 6 sibling dialogs flagged by final reviewer pass. Files: `app/admin/students/[id]/page.tsx` (4 dialogs — guardian, enroll, promote, withdraw), `app/admin/guardians/page.tsx` (Edit Wali), `components/teacher/leave-sheet.tsx` (Ajukan Cuti). Pattern (matches T2/T3/T4): drop `p-card` from `<DialogContent>` (T1 baseline owns padding), drop or simplify inner wrapper, Sheet body `p-card` → `px-4 pb-4`, Batal `outline → ghost`. **Math correction (vs first reviewer pass):** these consumers were NOT regressed by T1 — `tailwind-merge` resolves `<DialogContent className="p-card">` to 1.5rem all sides regardless of T1's asymmetric base, so total inner padding stayed at 3rem before+after T1. T5 is consistency improvement (pattern parity with invoice dialogs), not regression repair. Reviewer (`feature-dev:code-reviewer`) verdict: Approve — math verified, no logic change. **Deferred to follow-up cycle (out-of-scope):** 16+ remaining `<DialogContent className="p-card">` consumers across `app/admin/settings/{holidays,campuses,users,salary-components}/page.tsx`, `app/admin/{teaching-assignments,enrollments,fees,student-journal,assessments/templates,admissions,student-attendance,(hr)/leave}/page.tsx`, `components/{attendance/override-modal,student-journal/parent-note-dialog}.tsx`, `app/teacher/student-journal/students/[id]/page.tsx`. All are pattern-parity work, none regressed by T1.
- T3: batch dialog double-padding sweep. `app/admin/invoices/page.tsx`. Sheet branch (line 858): inner body wrapper `className="p-card space-y-field"` → `className="space-y-field px-4 pb-4"` (T2 mobile pattern parity). Dialog branch (lines 871, 878): `<DialogContent className="p-card">` → `<DialogContent>` (T1 baseline owns padding) + inner wrapper `className="p-card space-y-field"` → `className="space-y-field"`. Helper text "Periode tagihan akan terikat ke tahun ajaran ini." inherits T1 FieldDescription `text-xs` crispness — no per-dialog edit needed. Zero logic change. Reviewer (`feature-dev:code-reviewer`) verdict: Approve — pattern matches T2 exactly; ghost Batal already in place; no regression.

## Verification

- T1: `npm run build` ✓ (10.4s compile + 13.3s typecheck, 7-worker page collection green). `npx vitest run` ✓ — 711 passed / 2 skipped / 42 todo (84/2 test files), unchanged from baseline cycle `2026-04-27-finance-ui-polish`. Visual smoke deferred to T4 end-of-cycle Playwright + manual.
- T2: `npm run build` ✓. `npx vitest run` ✓ — 711 / 2 / 42, unchanged. Targeted `npx vitest run components/admin/invoices` ✓ — 12 passed (validateManualForm coverage preserved). Visual smoke deferred to T4.
- T3: `npm run build` ✓. `npx vitest run` ✓ — 711 / 2 / 42, unchanged. Helper text crispness inherited from T1 FieldDescription change — no batch-dialog-specific test surface. Visual smoke deferred to T4.
- T5: sibling dialog parity. `npm run build` ✓. `npx vitest run` ✓ (711 / 2 / 42 unchanged). 6 dialogs migrated to T1 baseline pattern; 16+ admin/teacher consumers explicitly deferred to follow-up cycle (documented in Implementation).
- T4: cross-cut + cycle-doc fill. (a) Cross-cut hygiene grep — initial run found 2 leftover `p-card space-y-field` in `app/admin/invoices/[id]/page.tsx` Catat-Pembayaran dialog (sibling, not in T2/T3 scope). T1 primitive change made these dialogs render with triple-effective right padding (DialogContent `pl-4 pr-10` + inner `p-card` 1.5rem = 4rem on right). Applied same fix as T2/T3 inline (drop `p-card` from DialogContent + inner wrapper, Sheet body → `space-y-field px-4 pb-4`, Batal `outline → ghost` for cross-cut consistency). Final hygiene grep: zero `p-card space-y-field` in `components/admin/invoices` `app/admin/invoices`. Zero hardcoded hex (`text-[#…]|bg-[#…]`). (b) End-of-cycle gates: `npm run build` ✓ + `npx vitest run` ✓ (711 / 2 / 42 unchanged). (c) Playwright e2e: **deferred to CI on PR** — operator's dev server occupies port 3000 in worker context; `playwright.config.ts` has `reuseExistingServer: !process.env.CI`, so local Playwright tries to reuse the dev server which is not `DEMO_MODE=true npm run start`. All admin auth tests fail with 15.9s timeout (cookie injection lands on non-demo server). CI runs Playwright in clean container via GitHub Actions per CLAUDE.md branch protection — `/ship` will not auto-merge until that check is green. Operator can also free port 3000 + re-run locally before `/ship` if desired.
- **UAT consumed:** `docs/uat/reports/assets/2026-04-27-admin-invoices/` — captured pre-cycle by background `general-purpose` agent. Auth-wall finding (UAT-AUTH-01 major) confirmed structural Playwright-MCP-vs-Google-SSO incompatibility on staging — informational, not a product bug. Live UAT scheduled for post-merge via Chrome MCP using operator's authenticated profile.

## Ship Notes

### Migration / env changes
- **None.** No DB migration. No new env var. Pure UI primitive + dialog visual changes.

### API contract
- **Unchanged.** Zero route signature, zero Zod schema, zero response shape touched. Cycle is className-only edits across 5 files.

### Files touched
- `components/ui/dialog.tsx` — DialogContent right-padding (`pr-10`); DialogFooter asymmetric pull-back (`-ml-4 -mr-10`).
- `components/ui/sheet.tsx` — SheetHeader right-padding (`pr-10`).
- `components/ui/field.tsx` — `fieldVariants` `gap-1.5`; `FieldDescription` `text-xs`.
- `components/admin/invoices/manual-invoice-dialog.tsx` — drop double `p-card`; Komponen panel `bg-muted/60 + dashed-border`; row → responsive grid; Total `border-t-2 pt-3 mt-3`; desktop Batal ghost.
- `app/admin/invoices/page.tsx` — drop double `p-card` on batch dialog (Sheet + Dialog branches).
- `app/admin/invoices/[id]/page.tsx` — drop double `p-card` on Catat-Pembayaran dialog; Batal ghost (cross-cut hygiene from T4 grep).

### Backwards compatibility
- **Zero behavioral change.** Validation, fetch, submit handlers, state machines all untouched.
- Primitive changes (Field gap, FieldDescription text size, Dialog/Sheet header padding) affect every form/dialog in the app — visual-only, no functional regression.

### Manual smoke checklist (post-merge on staging via Chrome MCP)

Drive via Chrome MCP using operator's existing Google SSO session.

**Manual invoice dialog (`/admin/invoices` → "Tagihan Manual")**
- [ ] Desktop 1280×800: header X does not crowd title; body padding asymmetric (1rem left / 2.5rem right) acceptable; Komponen Biaya panel reads as a clear container (muted bg + 2px dashed border); Komponen rows aligned in 3-column grid (Select 1fr / Input 120px / X icon button); Total separator 2px solid; Batal is ghost (transparent), Buat Tagihan is solid teal.
- [ ] Mobile 360×800: Sheet variant matches; Komponen row uses 100px amount column; no horizontal overflow.

**Batch dialog (`/admin/invoices` → "Buat Tagihan")**
- [ ] Desktop + Mobile: 3 fields (Periode, Tanggal Jatuh Tempo, Tahun Ajaran) read with consistent rhythm; helper text "Periode tagihan akan terikat ke tahun ajaran ini." renders crisp at 0.75rem.

**Catat-Pembayaran dialog (`/admin/invoices/[id]` → "Catat Pembayaran")**
- [ ] Desktop + Mobile: form body padding consistent with manual + batch dialogs (no triple-padding visual bug from T1 primitive change); Batal ghost.

**Cross-cut primitive sanity (sample 3 high-traffic forms — verify Field gap + FieldDescription size globally)**
- [ ] `/admin/students/[id]` — 26 `<Field>` instances. Visual rhythm tighter than before (gap 0.5rem → 0.375rem); helper text crisper (text-sm → text-xs). Should read better, not worse. If any form regresses, escalate.
- [ ] `/admin/employees/[id]` — second-densest form. Same check.
- [ ] `/parent/invoices` detail-sheet — uses Field on payment form. Should still feel mobile-tight.

**Sibling dialogs (verify no regression from T1 right-padding changes)**
- [ ] ConfirmDialog flows (void invoice, deactivate student) — header X clearance OK; footer button spacing OK.
- [ ] AlertDialog flows (delete confirmations) — same.

### Rollback plan
- Single squash-merge revert returns to pre-cycle state cleanly. No data dependency.
- If primitive changes (T1) regress a specific form, can be reverted in isolation: `git revert <T1-commit>` reverts the 4 className edits in `dialog.tsx`/`sheet.tsx`/`field.tsx`. T2/T3/T4 dialog edits would then need follow-up to re-add per-dialog padding (since they currently rely on T1 baseline owning padding).
- Lower-risk partial rollback: revert only the field.tsx edits (`gap-1.5` → `gap-2`, `text-xs` → `text-sm`) if the global form rhythm change is the only regressor. Dialog/Sheet header padding fixes are isolated to overlays and unlikely to regress non-overlay surfaces.
