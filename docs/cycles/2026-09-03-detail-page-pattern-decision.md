# Admin Detail Page Pattern — Canonicalize the Dossier Shell, With a Trigger Rule

## Context

A cross-portal UI/UX review (7 parallel code audits against the shipped journal cycles A/B/C, the student-dossier increments 1-3, and the security-fix pass) named one finding as the largest single source of the admin portal's "feels inconsistent" impression: `/admin/students/[id]` was rebuilt across three increments into the "dossier" shell — `DetailPageHeader`, a sticky anchor nav, collapsible lazy `DossierSection`s, and a `DetailRail` with glanceable KPI tiles — while every other admin detail page (`guardians/[id]`, `invoices/[id]`, `payroll/[id]`, `classes/[id]`, `employees/[id]`, `raport-editor.tsx`) stayed on the older flat-Card + Tabs layout `patterns.md` Recipe 2 and `crud.md`'s Detail Page Layout Standard still describe.

The ambiguity is not accidental drift — it's undocumented intent. `components/admin/dossier-section.tsx` and `detail-rail.tsx` both carry doc comments saying they were built "entity-agnostic on purpose — the wali/household view is expected to reuse it" / "reuse these verbatim." The dossier was written to spread. Nothing ever decided *how far*, so `patterns.md` Recipe 2 and `crud.md` still describe the old shape as if the dossier never shipped, and the next person to build or audit a detail page has no doc to check.

This cycle resolves that ambiguity in writing. It does **not** retrofit any of the six other detail pages — that is real, separately-scoped work (sized below as a follow-up backlog) — it only decides which pattern a given detail page should use, and updates the two docs that own that answer.

## Spec

- [ ] `patterns.md` Recipe 2 describes **two** admin detail layouts, not one, with an explicit trigger rule for which applies to a given entity — not "dossier everywhere" and not "dossier nowhere else."
- [ ] `crud.md`'s Detail Page Layout Standard is updated to match (it currently only describes the flat Tabs shape, which is now Recipe 2a, not "the" detail layout).
- [ ] The decision names the shared components each recipe uses, so a builder knows what to import without re-deriving intent from `dossier-section.tsx`'s comments.
- [ ] A prioritized (not built) retrofit backlog exists for the pages the trigger rule says *should* move to the dossier shell, so the decision is actionable rather than purely descriptive.
- [ ] No application code changes in this cycle — docs only.

### The decision

**Both patterns stay. The dossier shell (Recipe 2b) is canonical for multi-concern, read-heavy entity overviews; the flat-Card shape (Recipe 2a) stays canonical for single-concern detail pages and stateful editors/workflow tools.** Forcing one shape everywhere was rejected in both directions:

- *Dossier everywhere* would put an anchor nav, a sticky rail and lazy-loaded sections on pages like an invoice or a payroll run, which have exactly one concern each. The dossier's entire value — jump-to-section, glanceable-while-scrolling rail, don't-pay-for-what-you-haven't-opened — has nothing to attach to on a single-concern page; it would just be chrome.
- *Flat-Card everywhere* (i.e. quietly scope-locking the dossier to students and pretending it's a one-off) throws away work the components were explicitly written to make reusable, and leaves `guardians/[id]` — the page those doc comments name by name — permanently behind a page that structurally cannot show a glanceable "how much does this family owe / how complete are their documents" view the way the student page now can for a child.

**Trigger rule — use Recipe 2b (dossier) when both hold:**
1. The page is primarily a **read/overview surface** for one entity, not a stateful editor or a workflow tool (an editor mid-save, or a queue-style approval flow, is never a dossier candidate — it follows its own recipe elsewhere in this file).
2. The entity has **3 or more independent concerns** worth their own section (e.g. a student has finance, academics, health, family, documents; a guardian has children, invoices, documents). Two or fewer concerns don't earn an anchor nav — Tabs remain legible at that size.

Otherwise, use Recipe 2a (flat Card + Tabs-if-needed) — the existing standard, renamed rather than replaced.

**Retrofit backlog this cycle produces but does not build**, ranked by how clearly the trigger rule fires:

| Page | Concerns today | Fits 2b? | Priority | Why |
|---|---|---|---|---|
| `app/admin/guardians/[id]/page.tsx` | Children roster, invoices/tagihan, documents, contact — 3+ | Yes | **High** | The exact page `dossier-section.tsx`/`detail-rail.tsx`'s own comments name as the intended second consumer; currently has no glanceable KPI tile at all (owed amount, doc completeness, # children) — the concrete UX gap Recipe 2b exists to close. |
| `app/admin/classes/[id]/client.tsx` | Roster, guru, kalender sesi, attendance health — 3+, growing | Yes | Medium | Already retrofitted the dossier's "not-loaded vs. real-zero" discipline for its health metrics but kept the flat scroll; flagged in the review as "will get painful once Roster + Guru + Kalender Sesi all have real data." Not urgent today. |
| `app/admin/(hr)/employees/[id]/page.tsx` | Personal info, salary, attendance, leave — 3+ | Yes | Medium | Same shape as guardian/student: one person, several independent domains of data about them. |
| `app/admin/invoices/[id]/page.tsx` | One invoice — 1 | No | — | Correctly Recipe 2a; one concern, dossier chrome would be pure overhead. |
| `app/admin/(hr)/payroll/[id]/page.tsx` | One payroll run — 1 | No | — | Same reasoning as invoices. |
| `app/admin/raport/raport-editor.tsx` | N/A — stateful editor, not an overview | No | — | Excluded by rule 1, not rule 2. An editor with in-flight autosave state is never a dossier candidate; it has its own recipe. |

Building any row in that table is separate, user-greenlit work — not scoped here.

### Non-goals

- No retrofit of `guardians/[id]` or any other page in this cycle.
- No change to `design-system.html` (it documents components, not this recipe-selection judgment call).
- No change to application code, tests, or routes.

### Assumptions

1. "3+ independent concerns" is judged the same way the dossier's own sections were chosen (finance / academics / health / family / documents) — a concern is something an admin would search for by name, not an implementation detail.
2. This decision does not retroactively make Recipe 2a "wrong" anywhere it's already used correctly (invoices, payroll) — it names when each recipe applies going forward and for the backlog above, not a mandate to touch working pages.

## Tasks

- [x] **T1 — Update `patterns.md` Recipe 2.** Split into 2a (flat Card, current content, renamed) and 2b (dossier — anchor nav + `DetailRail` + `DossierSection`, trigger rule, shared components named). *Acceptance:* both recipes documented, trigger rule stated once and referenced from crud.md rather than duplicated.
- [x] **T2 — Update `crud.md`'s Detail Page Layout Standard.** Point at the same 2a/2b split instead of describing only the flat shape. *Acceptance:* no contradiction between the two docs; `bash scripts/audit-docs.sh` passes (link + drift checks).

Single doc-editing task pair requiring one architectural judgment call, not parallelizable dirty work — no subagent fan-out for this cycle (see CLAUDE.md's exception for cycles where fan-out costs more than it saves). Handled directly by the driver, per CLAUDE.md's own table: architecture decisions are driver-only work.

## Implementation

- Subagent plan: none — single architectural decision + doc edit, driver-only per CLAUDE.md's own table (architecture decisions are never delegated). No fan-out.
- T1 — `.claude/standards/patterns.md`: Recipe 2 split into 2a (Simple Detail, the previous content renamed) and 2b (Dossier — `DetailPageHeader`/`DossierNav`/`DossierSection`/`DetailRail` and its sub-components named explicitly), with the trigger rule stated once in Recipe 2's intro and cross-linked from crud.md.
- T2 — `.claude/standards/crud.md`: Detail Page Layout Standard replaced with the same 2a/2b split (ASCII diagrams), pointing at `patterns.md`'s trigger rule instead of re-stating it.
- `CLAUDE.md`: generated counts block regenerated via `bash scripts/audit-docs.sh --write` (active cycle docs 34 → 35, this cycle's own doc).

## Verification

- `bash scripts/audit-docs.sh` — 10 ok, 1 warn (pre-existing ADR-archival warn, unrelated to this cycle), 0 fail.
- Docs-only cycle — no `app/**`/`components/**`/`lib/**` diff. `npm run build`, `npx vitest run`, and Playwright are not applicable; skipped per CLAUDE.md's "pure-docs cycles may skip Playwright + preview-verify" allowance. Preview-verify skipped for the same reason — no UI surface changed.
- Manual check: re-read both edited files end-to-end after editing; no contradiction between `patterns.md`'s trigger rule and `crud.md`'s restated version: both cap the "2 concerns" case as the Recipe 2a ceiling and name the same three-page backlog by cross-reference to this cycle doc (not duplicated inline, so they can't drift independently).

## Ship Notes

- **Migrations:** none. **Env vars:** none. **Routes:** none — docs only.
- **What this unblocks:** the retrofit backlog in this doc (`guardians/[id]` high priority, `classes/[id]` and `employees/[id]` medium) is scoped but **not built**. Each is separate, user-greenlit work sized as its own cycle.
- **Nothing to smoke-test on the preview** — no application code changed.
- **Rollback:** revert the commit. Nothing else depends on the new doc sections yet.
