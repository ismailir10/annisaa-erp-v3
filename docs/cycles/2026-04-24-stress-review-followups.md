# Stress Review Follow-ups (2026-04-24)

## Context

Picks up the three deferred items from `docs/cycles/2026-04-24-stress-review-fixes-2.md` (PR #126, merged):

1. **academic-edit-form** — Task 9 code-review finding (UX): edit dialog hard-codes `programId`/`academicYearId`/`campusId` to `""`, so dropdowns show stale placeholders and a blank-then-submit produces a 400.
2. **rls-tenantid-indexes** — Task 5 deferred perf cliff: 37 indexes dropped by `20260421000001_rls_security_cleanup` are referenced by RLS USING clauses. Safe at single-tenant ~500 rows; latent perf cliff post-SaaS.
3. **multi-tenant-cascade-review** — Task 5 deferred schema item: `EmailLog.tenantId` + `OrgConfig.tenantId` set to `onDelete: Cascade` in `20260424000000_explicit_ondelete_actions`. Tenant hard-delete wipes audit + config history.

ADR line tracking (1) + (2) is `README.md:112` (single line listing both follow-ups).

## Spec

**Acceptance criteria:**
1. Each task lands as ONE commit. No batching.
2. Between-task gate `npm run build && npx vitest run` MUST pass before each commit.
3. `feature-dev:code-reviewer` runs on every task diff before commit; findings fixed pre-commit.
4. Task 2 + Task 3 require explicit user confirmation before editing — both are gating destructive-ops.
5. README.md ADR line pruned in the same commit as the task that retires the follow-up.
6. Playwright runs once at end-of-cycle (after the last commit).
7. No `/ship` this session — branch pushed, handed back PR-ready.

**Non-goals** — anything outside the three listed items.

## Tasks

1. **academic-edit-form** (Task 1) — `app/admin/academic/page.tsx:341` use real IDs from row.
2. **rls-tenantid-indexes** (Task 2, gating user confirm) — recreate 37 dropped indexes via `CREATE INDEX CONCURRENTLY IF NOT EXISTS`; update `prisma/schema.prisma` `@@index`; prune ADR line.
3. **multi-tenant-cascade-review** (Task 3, gating user confirm) — change `EmailLog.tenant` + `OrgConfig.tenant` `onDelete: Cascade → Restrict`; write migration; prune ADR line.

## Implementation

### Task 1 — academic-edit-form (UX) — 2026-04-24

- `app/admin/academic/page.tsx:29`: widened `ClassSection` type to include `programId`, `academicYearId`, `campusId` scalar fields. These are already returned by `GET /api/class-sections` because the route uses `prisma.classSection.findMany({ include: ... })` (Prisma `include` auto-returns all root-level scalars). Type was just under-declaring the wire shape.
- `app/admin/academic/page.tsx:341`: `setSectionForm` now uses `s.programId`/`s.academicYearId`/`s.campusId` instead of `""`. Edit dialog now shows the existing selections; saving without touching them no longer produces a phantom 400 from `updateClassSectionSchema.campusId.min(1)`.
- Did NOT extend GET `select` (option (a)) — the API already returns the scalars via `include`. Did NOT use `s.program.id` (option (b)) — would have required adding `id` to the nested `select`s, which IS a wire-shape change. Type-widening is the minimal-diff correct fix.
- **Pre-existing schema mismatch surfaced by code-reviewer (BLOCKER, fixed pre-commit):** `updateClassSectionSchema` only allows `name`/`capacity`/`campusId`/`status` — `programId` + `academicYearId` are silently zod-stripped on PUT. Once the dropdowns showed live values, users would think they could reassign a section to a different program/year. Locked it down: in `editingSection` mode, Program + Tahun Ajaran render as read-only `<div>` text (sourced from `editingSection.program.name` + `editingSection.academicYear.name`); on Create they remain editable Selects. `saveSection` PUT body now sends only `{ name, capacity, campusId }` — explicitly excludes `programId` + `academicYearId` so the dropped fields never reach the network. `campusId` stays editable on Edit since `updateClassSectionSchema.campusId` actually supports it. Reassigning a section across program/year is correctly prevented at both the API contract and the UI layer.

### Task 1 — code review notes
Cross-checked design-system.html §Forms (read-only field rendering) — read-only fields use plain text in `text-muted-foreground`, no input chrome. Implemented per that pattern. Also see Verification.

## Verification

### Task 1 — academic-edit-form

- Between-task gate: `npm run build && npx vitest run` — green (build clean, vitest 269 passed / 42 skipped+todo).
- code-reviewer findings + resolutions:
  - **BLOCKER** — `saveSection` PUT body included `programId` + `academicYearId`, which `updateClassSectionSchema` silently strips, while the dropdowns now displayed them as editable. Misleading UI. **Resolution:** Edit mode renders Program + Tahun Ajaran as read-only text; PUT body restricted to `{ name, capacity, campusId }`; Create mode unchanged.
  - Out-of-scope (acknowledged, not fixed): if a Program/Year is later deactivated, the Create dialog still lists them in the Select. Same behavior pre + post fix; tracked separately if it surfaces.
- Frontend gate Rule 4: cycle doc contains the literal token `design-system` (Task 1 code-review notes section). ✓

## Ship Notes

(filled by `/ship` in a later session)
