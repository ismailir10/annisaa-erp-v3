# Raport Kisi-Kisi — Shared Narrative Templates

## Context

Cycle 3 of the post-audit penilaian sequence (roadmap in [2026-07-31-penilaian-content-enablement.md](2026-07-31-penilaian-content-enablement.md)). Depends on cycle 1 — staging now carries real penilaian data to author against.

The whole point of the raport subsystem, per the locked master design §2.3, is that narratives are **authored once per cohort and assigned per student**:

> Per term, per age group, walas team co-authors 15 bucketed narratives (5 sections × 3 levels) + 3 closing templates (Penutup, Rencana Tindak Lanjut, Kegiatan Disarankan di Rumah). Stored in `ReportNarrativeTemplate` + `ReportClosingTemplate`. Reusable next academic year via clone.

The C8 admin-raport MVP (PR #319) shipped everything *except* that. It auto-suggests a level per section from `AssessmentEntry`, then hands the admin **eight empty textareas per student**. For ~180 students that is 1,440 free-typed paragraphs a term — the exact manual-compile pain the initiative exists to remove, just relocated from Word into a web form. It also guarantees drift: two children at the same level in the same class get differently-worded assessments depending on who typed faster.

This cycle adds the template layer and wires it into the existing editor. Nothing else about the raport flow changes.

## Spec

**Acceptance criteria**

- [x] **AC1.** `ReportNarrativeTemplate` (`@@unique [tenantId, termId, ageGroup, section, level]`) and `ReportClosingTemplate` (`@@unique [tenantId, termId, ageGroup, section]`) exist per the master design §4.3, tenant-scoped, soft-deletable, RLS-covered. Additive migration.
- [x] **AC2.** New permission `reportCard.template` (SUPER_ADMIN + SCHOOL_ADMIN). Separate from `reportCard.write` so cycle 4 can grant walas template authoring without granting per-student raport writes.
- [x] **AC3.** `GET /api/admin/raport/templates?termId&ageGroup` returns the full 18-slot grid (15 bucketed + 3 closing), filled or empty, plus a completeness count. `PUT` bulk-upserts a partial map. Both tenant-scoped, zod-validated, audited.
- [x] **AC4.** `POST /api/admin/raport/templates/clone` copies every template from a source term+ageGroup into a target term+ageGroup. Skips slots already filled in the target (never clobbers authored text); reports created/skipped counts. This is the "reusable next academic year" path.
- [x] **AC5.** Admin surface `/admin/raport/templates`: term + age-group selector, the 5 bucketed sections each showing 3 level tabs, the 3 closing sections, per-slot textarea, save-all, clone-from-term action, and a visible "N/18 terisi" progress indicator.
- [x] **AC6.** `GET /api/admin/raport/[studentId]/[termId]` additionally returns the student's `ageGroup` (resolved from the active enrolment's class section) and the matching template set.
- [x] **AC7.** The per-student editor pre-fills each narrative from the template matching (section, selected level, ageGroup, term) when the entry is unsaved and the field is empty, and offers an explicit **"Pakai kisi-kisi"** action per section to re-apply after a level change. Admin edits freely afterwards — templates are a starting point, never a lock.
- [x] **AC8.** Gate green: `npm run build && npx vitest run && npx tsc --noEmit && npm run lint` + `verify-api-auth.sh` + `verify-rls-coverage.sh`.
- [x] **AC9.** Frontend diffs cross-checked against `design-system.html`; recorded in Verification.

**Non-goals**

- Walas/teacher authoring of templates, `REVIEWED` status, kepala publish gate, `/teacher/raport` — all cycle 4. This cycle keeps authoring admin-only.
- docx output, parent comment/e-sign, structured hafalan — deferred per the owner's Q5.
- Changing the auto-suggest algorithm, the 3-level skala, or the PDF layout.
- Retro-filling narratives into already-published raports.

**Assumptions**

1. **INTRODUCTION is bucketed.** `lib/raport/labels.ts` already lists it in `BUCKETED_SECTIONS` (it carries a level; it just has no penilaian source to auto-suggest from, per `SECTION_HAS_SUGGESTION`). So the grid is a true 5 × 3 = 15 plus 3 closing = **18 slots**, exactly the design's count.
2. **Templates are keyed on `Term`, not `Semester`.** A triwulan is the raport unit; the same cohort gets different narratives in Triwulan 1 vs 2. Clone covers the reuse case.
3. **Prefill is client-side and non-destructive.** The server returns templates alongside the draft; the editor only writes into an empty field, and the explicit action requires a click. A saved raport is never silently rewritten by a later template edit.
4. **`ageGroup` comes from the student's active enrolment** → `classSection.ageGroup` (NOT NULL since the 2026-05-20 cycle). A student with no active enrolment returns `null` and the editor simply offers no templates.
5. **Clone skips rather than overwrites.** Cloning into a partially-authored term is the common case (someone starts typing, then remembers last term exists); silently replacing their text would be the worse failure.

## Tasks

- [x] **T1 — Schema + permission.** Two models + back-relations on `Tenant`/`Term`, additive migration with RLS policies, `reportCard.template` in `lib/permissions.ts`, permission unit test.
- [x] **T2 — Template grid lib + validations.** `lib/raport/templates.ts` (pure: build the 18-slot grid from rows, count filled, key helpers) + `lib/validations/raport-template.ts` (zod for bulk upsert + clone). Unit tests.
- [x] **T3 — Template API.** `GET`/`PUT /api/admin/raport/templates` + `POST .../clone`, `reportCard.template` gated, tenant-scoped, rate-limited, audited. Route tests incl. auth deny + cross-tenant + clone-skip.
- [x] **T4 — Authoring UI.** `/admin/raport/templates` page + client; nav item under Penilaian; cross-link from `/admin/raport`.
- [x] **T5 — Editor integration.** Student GET returns `ageGroup` + templates; `raport-editor.tsx` pre-fills empty narratives and adds per-section "Pakai kisi-kisi".
- [x] **T6 — Docs.** README `reportCard` row, CLAUDE.md counts, this doc.

## Implementation

- **T1** — `prisma/schema.prisma`: `ReportNarrativeTemplate` (`@@unique [tenantId, termId, ageGroup, section, level]`) + `ReportClosingTemplate` (`@@unique [tenantId, termId, ageGroup, section]`), both soft-deletable with `authoredById`; back-relations on `Tenant` + `Term` (`onDelete: Cascade` from Term — deleting a triwulan should not strand its kisi-kisi). Migration `20260731100000_add_raport_narrative_templates` is additive: 2 CREATE TABLE + indexes + FKs + service_role RLS policies. `lib/permissions.ts` gains `reportCard.template` (SUPER_ADMIN escape hatch + SCHOOL_ADMIN).
- **T2** — `lib/raport/templates.ts`: `TOTAL_TEMPLATE_SLOTS` (18), `bucketKey`, `buildTemplateGrid` (whitespace-only content counts as unfilled; rows with an unknown section/level are dropped rather than trusted), `templateFor` (returns null for "no template" so callers never clear a field), `planClone` (skips target slots that already carry text). `lib/validations/raport-template.ts`: bulk-upsert + clone schemas, 4 000-char cap, duplicate-slot refinements, same-cohort clone rejected.
- **T3** — `app/api/admin/raport/templates/{route.ts,_shared.ts,clone/route.ts}`. Empty `content` soft-deletes the slot; rewrite sets `deletedAt: null` because the unique key survives a soft-delete and a plain create would collide. Both routes resolve the Term through `resolveTerm(tenantId, …)` first — that lookup is the tenant gate for every row written.
- **T4** — `app/admin/raport/templates/page.tsx`: term + age-group selectors, 5 section cards × 3 level textareas, a closing card, live "N/18 terisi" badge, save-all, and a clone panel. Nav item "Kisi-kisi" under Penilaian (`reportCard.template`), cross-linked from the templates header back to `/admin/raport`.
- **T5** — `GET /api/admin/raport/[studentId]/[termId]` resolves the student's cohort from the active enrolment's `classSection.ageGroup` and returns `ageGroup` + the template grid. `raport-editor.tsx` seeds each narrative with `saved || template` (saved text always wins) and renders a per-section ghost button — "Pakai kisi-kisi" when empty, "Ganti dengan kisi-kisi" when the admin has typed something — shown only when applying would actually change the field.
- **T6** — README `reportCard` row, `CLAUDE.md` File Structure (routes 183 → 185, admin pages 40 → 41), this doc.

## Verification

**Full local gate (verbatim):**
- `npx vitest run` — `Test Files  256 passed | 2 skipped (258)` · `Tests  2532 passed | 42 todo (2574)`. New: templates grid 16, template routes 23, +2 permission cases; `config/__tests__/admin-nav.test.ts` updated for the third nav item.
- `npm run build` — `✓ Compiled successfully in 16.0s`, `/admin/raport/templates` emitted.
- `npx tsc --noEmit` — clean.
- `npm run lint` — `✖ 55 problems (0 errors, 55 warnings)`, all pre-existing.
- `bash scripts/verify-api-auth.sh` — `✓ API auth coverage OK: 185 / 185`.
- `bash scripts/verify-rls-coverage.sh` — `✓ RLS coverage OK: 39 / 39` (was 37 — the two new tenant-scoped tables carry ENABLE + policy).
- Playwright: deferred to the required CI `Playwright E2E` check — this worktree's `.env` points at the staging Supabase pooler and the harness refuses remote-DB runs.

**design-system cross-check (§card, §form-field, §badge):** the authoring page reuses `PageHeader`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Field`/`FieldLabel`, `Textarea`, `NativeSelect`, `Badge`, `Button`/`buttonVariants`, `Skeleton`, `EmptyState` — no new visual primitives, no new colour tokens. a11y: every textarea has an `htmlFor`-bound label carrying its level name, selects have explicit labels, the loading block is `aria-busy`. The editor's new action is a `variant="ghost"` `Button` matching the existing inline-action pattern on that screen.

## Ship Notes

**Migrations:** `20260731100000_add_raport_narrative_templates` — additive only (2 new tables + indexes + FKs + RLS). No ALTER on existing tables, no backfill. Applies at deploy via `prisma migrate deploy`.

**Permissions:** new `reportCard.template`, granted to SUPER_ADMIN (escape hatch) + SCHOOL_ADMIN. Tenants relying on persisted custom-role permission arrays will not auto-gain it — re-seed those arrays if a custom role needs template authoring.

**Env vars:** none.

**Behaviour changes:**
- Admin sidebar "Penilaian" group gains **Kisi-kisi** → `/admin/raport/templates`.
- Opening a student's raport now pre-fills empty narratives from the cohort's kisi-kisi for the selected level. A saved raport is never altered — the prefill only touches empty fields, and templates are copied at edit time rather than read at render time.

**Rollback:** revert the cycle commits and drop the two tables. `ReportCardEntry.sectionNarratives` holds real copied text, so nothing a user authored is lost by dropping templates.
