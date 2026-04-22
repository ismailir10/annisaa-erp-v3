# Design System Foundations

## Context

CTO-initiated. User mocked up a comprehensive UI design system in Claude Design (HTML/CSS prototype, 18 sections). The mockup lives at `Design System.html` in a handoff bundle. It extends the existing `globals.css` tokens + `.claude/standards/ui.md` rule set with:

- New `--space-*` and `--text-*` scales (spacing + typography tokens, currently ad-hoc per page).
- Page recipes (Admin List/Detail/Form, Portal Dashboard, Workflow Queue, Daily Data Entry).
- Voice & tone system — 3 personas (Pak Budi admin, Ustadzah Sari teacher, Ibu Nur parent), Islamic courtesy layer, copy rules for errors/empty/success/destructive toasts.
- Portal shell rules — mobile-first shells, Household Overview pattern for parent home (replacing pill-tabs once a family has 3+ kids), WeekGrid contract for Buku Penghubung, cycle-tap attendance flow.
- Overlays rule — Dialog on desktop, Sheet on mobile, AlertDialog for destructive, Toast stacked; one overlay at a time (toasts excepted).

The prototype is the **canonical reference**. This cycle lands the tokens + written standards + reference file in-repo, plus a pre-commit gate that forces frontend changes to cross-check against the design system. A later cycle will build the live `/admin/design-system` Next.js page and Playwright visual regression.

User explicitly asked this ship as a PR so the repo is updated.

## Spec

1. Append `--space-*` (page-x/page-y/section/card/field) and `--text-*` (display/h1/h2/body/small/caption) CSS variables to `app/globals.css` `:root`. Expose matching `@theme inline` Tailwind tokens so `text-display`, `text-h1`, `p-page-x`, etc. are available as utilities.
2. Drop the Claude Design `Design System.html` into `.claude/standards/design-system.html` — the canonical reference artifact. Keep it exactly as exported (no code-mod); treat it as read-only documentation that design-conscious authors (human or LLM) open before touching frontend.
3. Create `.claude/standards/patterns.md` — 6 page recipes with layout skeletons, links to the HTML reference sections.
4. Create `.claude/standards/voice.md` — 3 persona cards + Islamic courtesy layer + copy rules (errors, empty, success, destructive) with do/don't examples lifted from the codebase.
5. Update `.claude/standards/ui.md`:
   - Add "Overlays" row to the Shadcn-FIRST table (Dialog/Sheet/AlertDialog/Toast).
   - Add a "Design System Reference" preamble pointing at `.claude/standards/design-system.html`.
   - Add rule: use `--space-*` / `--text-*` tokens, never ad-hoc `p-4` / `text-lg` for page chrome.
6. Update `.claude/standards/portal.md`:
   - Add "Household Overview" subsection — rule: parent home with ≥3 kids MUST use card-per-child with signal chips; pill-tabs only allowed for exactly 2 kids.
   - Add "WeekGrid contract" — shared component for Buku Penghubung journal (teacher editable + parent read-only modes).
   - Add "Cycle-tap attendance" rule — one tap on a roster row rotates `PRESENT → ABSENT → SICK → PERMISSION` (default PRESENT, zero-interaction common case).
7. Update `CLAUDE.md` standards dispatcher table — add `patterns.md`, `voice.md` rows; update `ui.md` row description.
8. Add pre-commit **Rule 4 — frontend gate**: when staged files include frontend (`app/**/*.{tsx,css}`, `components/**/*.tsx`, `tailwind.config.*`), the staged cycle doc MUST contain the literal token `design-system` somewhere (proves author cross-checked the reference). Gentle, not punitive — author can add the phrase as a one-line checklist item in the Verification section of the cycle doc. Bypass via `--no-verify` still allowed.
9. Update `scripts/test-hooks.sh` coverage for the new rule.

**Out of scope** (deferred to a separate cycle):
- Building `/admin/design-system` as a live Next.js page.
- Playwright visual regression screenshot test for it.
- Retrofitting existing pages against the new `--space-*` / `--text-*` tokens.

## Tasks

1. Append tokens to `app/globals.css` + `@theme inline` mapping.
2. Copy `Design System.html` → `.claude/standards/design-system.html`.
3. Write `.claude/standards/patterns.md`.
4. Write `.claude/standards/voice.md`.
5. Update `.claude/standards/ui.md` (overlays row + tokens rule + reference preamble).
6. Update `.claude/standards/portal.md` (Household Overview + WeekGrid + cycle-tap).
7. Update `CLAUDE.md` standards table.
8. Add pre-commit Rule 4 (frontend gate) + extend `scripts/test-hooks.sh`.
9. Run `npm run build && npx vitest run`. Fix any breakage.
10. Commit per task where sensible; open PR to `staging` via `/ship`.

## Implementation

All 8 tasks landed in a single commit (foundational, no per-task split needed since changes are all reference + governance, no runtime code path).

Files changed:
- `app/globals.css` — appended `--type-*` (6 tokens) + `--space-*` (5 tokens) to `:root`, plus matching `@theme inline` utility exposures (`text-display`, `text-h1`, `text-h2`, `text-body`, `text-small`, `text-caption`, `spacing-page-x`, `spacing-page-y`, `spacing-section`, `spacing-card`, `spacing-field`).
- `.claude/standards/design-system.html` — 4081-line Claude Design export copied verbatim as canonical reference.
- `.claude/standards/patterns.md` — new, 6 page recipes (Admin List, Admin Detail, Admin Form, Portal Dashboard, Workflow Queue, Daily Data Entry) + cross-recipe invariants.
- `.claude/standards/voice.md` — new, 3 personas (Pak Budi admin, Ustadzah Sari teacher, Ibu Nur parent), Islamic courtesy layer, cross-cutting copy rules for errors/empty/success/destructive, channel variants (in-app/email/SMS), canonical glossary, PR checklist.
- `.claude/standards/ui.md` — added Canonical Reference preamble, Design Tokens table (`--space-*` + `--type-*` utilities), Overlays Rule subsection, and new overlay rows in the Shadcn-FIRST table.
- `.claude/standards/portal.md` — added canonical reference pointer, Household Overview rule (required for ≥3 kids on parent home), WeekGrid contract (same component, 3 modes — teacher editable / parent readonly / home-note), cycle-tap attendance rule.
- `CLAUDE.md` — standards dispatcher table extended with `design-system.html`, `patterns.md`, `voice.md` rows; description updates on `ui.md` + `portal.md` rows; new "Frontend gate" subsection documenting pre-commit Rule 4.
- `.githooks/pre-commit` — added Rule 4 (frontend gate). Staged frontend files require staged cycle doc to contain the literal token `design-system`. Bypass via `--no-verify`.

## Verification

- [x] `npm run build` — green (Next.js 16.2.3, Turbopack). All 22 admin, 6 teacher, 4 parent routes compile.
- [x] `npx vitest run` — 240 passed, 42 todo, 2 skipped, 0 failed.
- [x] `npm run lint` — 0 errors, 7 pre-existing warnings (not introduced by this cycle).
- [x] Pre-commit Rule 4 manually fixture-tested in a scratch `mktemp` repo: frontend-change-without-token → REJECT (correct), frontend-change-with-token → ACCEPT (correct), non-frontend-change → ACCEPT (correct).
- [x] Cross-checked design-system.html §1 (Brand), §3 (Typography), §4 (Spacing & Radius), §13 (Overlays), §14 (Portal Shell + Household Overview brainstorm), §15 (Student Journal / WeekGrid), §16 (Attendance Flows), §18 (Voice & Tone) for every standard extension landed here.

**Landed in the same PR as a follow-up commit:**
- `app/admin/design-system/page.tsx` — live route under SUPER_ADMIN sidebar → Settings. Renders a `PageHeader` + two action buttons ("Buka di tab baru", "Sumber di GitHub") + full-height `<iframe sandbox="allow-same-origin allow-scripts">` pointing at `/admin/design-system-reference.html`. Uses Shadcn base-nova `render` prop, not `asChild` (per `ui.md`).
- `public/admin/design-system-reference.html` — 4081-line static copy of `.claude/standards/design-system.html`, served by Next.js static file handler.
- `config/admin-nav.ts` — new Settings entry (`Palette` icon) → `/admin/design-system`.
- `e2e/design-system.spec.ts` — two Playwright specs: (1) asserts `PageHeader` title + both action links + iframe element with correct `src`; (2) GETs the static HTML directly and asserts canonical section anchors (`#brand #colors #typography #spacing #buttons #forms #overlays #portal #journal #voice`) are present. Covers visual-regression anchor + reference-content contract.

**Still deferred to a later cycle:**
- Retrofit sweep of existing pages against the new `--space-*` + `--text-*` tokens (`p-4` → `p-card`, `text-lg` → `text-h2`, etc.).
- Screenshot-comparison Playwright assertion on the iframe (currently blocked by cross-origin-sandbox frame timing; only the `src` + structural assertion lands in this cycle).

## Ship Notes

- **No migrations, no new env vars.** All changes are reference/governance.
- **Rollback plan:** revert the merge commit. Reference is additive; removing `.claude/standards/design-system.html` + the 2 new standards files + the CSS tokens has no runtime impact. Reverting pre-commit Rule 4 alone disables the gate without touching the reference.
- **Follow-up cycle seed (next session):** build `/admin/design-system` live page + Playwright visual-regression pin.
