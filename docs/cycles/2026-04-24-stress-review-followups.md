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

### Task 2 — rls-tenantid-indexes (perf) — 2026-04-24

- **User confirmation obtained:** "yes" — recreate the still-missing indexes now.
- **Audit revealed 18 still-missing, not 37.** `20260421000001_rls_security_cleanup` dropped 37; `20260421000002_rls_fk_indexes` already restored 19 of them as plain single-column FK covers. The remaining 18 are composites (e.g. `Admission_tenantId_status_idx`), direct tenantId scan paths used by RLS USING clauses (e.g. `Program_tenantId_idx`, `AcademicYear_tenantId_idx`, `AssessmentTemplate_tenantId_idx`), or 3 legacy lowercase indexes that predate Prisma (`idx_attendance_status`, `idx_invoice_duedate`, `idx_invoice_status`).
- New migration: `prisma/migrations/20260424120000_recreate_rls_tenantid_indexes/migration.sql`. 18 statements, every one `CREATE INDEX IF NOT EXISTS` with the exact original name + column set + order from the 001 drop list (cross-verified against the schema's `@@index` declarations and against 002's restored set). Timestamp `20260424120000` chosen to land after every existing migration and to avoid the `YYYYMMDD000000` prefix collision called out at `README.md:113`.
- **CONCURRENTLY:** Prisma 7.6.0 wraps each migration file in a single transaction (no `--no-transaction` flag exposed) and `CREATE INDEX CONCURRENTLY` errors with SQLSTATE 25001 inside a transaction. Plain `CREATE INDEX` is the only Prisma-native option. Acceptable today: every target table is <1k rows on staging + prod, so `ACCESS EXCLUSIVE` lock is single-digit ms. Migration header comment documents this + the runbook for future scale (manual concurrent recreate outside Prisma before any schema migration touches these tables once row counts approach millions).
- `prisma/schema.prisma`: added `@@index([nis], map: "Student_nis_idx")` + `@@index([nisn], map: "Student_nisn_idx")` to the `Student` model (lines 462-463 after `prisma format`). The other 16 indexes already had matching `@@index` declarations — the 001 drops only removed the physical indexes, leaving the schema declarations untouched (DB-only drift).
- **Did NOT** run `npx prisma migrate dev --create-only` against any shared DB. Migration file is hand-authored; staging will pick it up via `vercel-build.sh` on next deploy. `npx prisma validate` confirms schema integrity.
- README prune: ADR line 112 — removed "(a) recreate 37 tenantId indexes…" follow-up; restated as "Follow-up tracked: review CASCADE on EmailLog.tenantId + OrgConfig.tenantId…" (Task 3 retires this remaining one). Added a sentence pointing to this cycle doc + the new migration name. Did not touch line 113 prefix-collision entry.

### Task 2 — Verification

- Between-task gate: `npm run build && npx vitest run` — green (build clean, vitest 269 passed / 42 skipped+todo).
- `npx prisma validate` — "schema is valid 🚀". `npx prisma format` — clean.
- code-reviewer findings + resolutions:
  - **MAJOR (downgraded to MINOR by reviewer)** — bare-vs-quoted `status` in composite indexes. No runtime impact (Postgres unquoted lowercase identifiers match the stored column name). Left as-is for consistency with the legacy lowercase indexes in the same file.
  - **MINOR** — README ADR line 112 not yet pruned. **Resolution:** pruned in this commit.
  - All other items (scope count, column sets, naming, CONCURRENTLY rationale, schema drift on Student, idempotency) verified clean by reviewer.
- Estimated post-deploy disk impact: ~10-15% additional index size on the affected tables (matches the pre-confirmation forecast). No app code changes; query planner picks up new indexes automatically.

## Ship Notes

(filled by `/ship` in a later session)
