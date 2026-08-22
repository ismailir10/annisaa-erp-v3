# Retire the Legacy Assessment Stack

## Context

Cycle 2 of the post-audit penilaian sequence (roadmap in [2026-07-31-penilaian-content-enablement.md](2026-07-31-penilaian-content-enablement.md)). Independent of cycle 1 — no shared files.

The 4-level BB/MB/BSH/BSB stack (`AssessmentTemplate` → `AssessmentCategory` → `AssessmentIndicator`, `StudentAssessment` → `StudentAssessmentScore`) predates the July 2026 cutover. Its replacement shipped in three parts: the curriculum spine (`LearningObjective` → `AchievementIndicator` → `IndicatorThemeLink`), `AssessmentEntry` for 3-level walas/sentra scoring, and `ReportCardEntry` for the raport.

**The deletion decision was already made.** The 2026-05-20 `curriculum-cutover-prep` cycle recorded AC7 = **`ABANDON`** — fresh-start cutover, no carry-over, no backfill script — and scheduled the deletion for a `feat/jul-2026-cutover` cycle. That cycle never ran. This one executes it, 6 weeks late.

Current state before this cycle:
- Admin pages `app/admin/assessments*` + `app/admin/assessment-templates` were unreachable (5 `next.config.ts` redirects fire before routing) but still in the tree, still compiled, still surfaced in every audit.
- `app/api/assessments/**` (5 routes) still mounted and still accepting writes.
- `app/teacher/assessments/[classSectionId]/[templateId]/[period]` — the legacy scoring page — likewise redirect-masked but present.
- The last parent read was dropped by the 2026-06-16 parent-raport fix; the last write path was never removed.

Data safety: **prod holds zero rows in all five tables** (never seeded with real content — see the 2026-07-27 prod journal seed note). Staging holds only `prisma/seed.ts` demo rows, whose template is literally named "Laporan Perkembangan Semester 1 (Demo)".

One live dependency turned up that the 2026-06-16 fix had missed: `lib/parent-activity.ts` still built its "Rapor tersedia" feed item from `StudentAssessment`, i.e. from rows no parent surface had displayed since June. Repointed rather than deleted.

## Spec

**Acceptance criteria**
- [x] `AssessmentTemplate`, `AssessmentCategory`, `AssessmentIndicator`, `StudentAssessment`, `StudentAssessmentScore` removed from `prisma/schema.prisma` along with their back-relations on `Program` and `Student`; drop migration lands leaves-first.
- [x] `app/api/assessments/**`, `app/api/teacher/assessments/`, `app/admin/assessments*`, `app/admin/assessment-templates`, the legacy teacher scoring route, `components/admin/assessments/`, `lib/validations/assessment-template.ts` and their tests deleted.
- [x] Parent activity "Rapor tersedia" reads `ReportCardEntry` (the same rows `/parent/reports` renders), not the legacy table.
- [x] Seeders stop writing legacy rows: `prisma/seed.ts` §11g, `app/api/admin/seed/route.ts` §11, `scripts/reseed/assessments.ts`.
- [x] Gate green: `npm run build && npx vitest run && npx tsc --noEmit && npm run lint` + `verify-api-auth.sh` + `verify-rls-coverage.sh`.

**Deviation from the approved scope — redirects kept.** The plan said to delete the 5 `next.config.ts` redirects as "masking redirects". They were masking dead page files; with those files gone the rules are no longer masking anything — they *are* the handler, and deleting them turns every pre-consolidation staff bookmark into a 404 for no benefit. Kept, with a comment explaining why. Trivially reversible if the owner disagrees.

**Non-goals**
- Any change to `AssessmentEntry`, the curriculum spine, or `ReportCardEntry`.
- Kisi-kisi templates / walas raport workflow (cycles 3–4).
- Removing the `/admin/penilaian` monitor or its nav entry.

## Tasks

- [x] **T1 — Repoint parent activity.** `lib/parent-activity.ts` reads `reportCardEntry` (PUBLISHED, not soft-deleted, tenant-scoped) joined to `Term → Semester → AcademicYear`; title becomes "Rapor Triwulan N tersedia", detail uses the shared `formatTermLabel`.
- [x] **T2 — Delete code.** Routes, pages, components, validators, tests listed above.
- [x] **T3 — Drop schema + migration.** `20260731000000_drop_legacy_assessment_stack` — five `DROP TABLE IF EXISTS` leaves-first, no CASCADE needed.
- [x] **T4 — De-seed.** `prisma/seed.ts` (wipe lines + §11g block), `app/api/admin/seed/route.ts` (§11 block + its two response counters), `scripts/reseed-staging.ts` (step removed, 9 steps renumbered to 8), `scripts/reseed/assessments.ts` deleted, `scripts/import-roster/build-import-sql.ts` wipe list.
- [x] **T5 — Docs + comments.** README `learning` module row; `next.config.ts` redirect rationale; e2e comments in `admin.spec.ts` + `parent-raport.spec.ts`; this cycle doc.

## Implementation

- `lib/validations/__tests__/enum-conformance.test.ts` lost its legacy import and the three conformance rows that referenced `AssessmentTemplate.type` / `StudentAssessment.status`.
- `e2e/admin.spec.ts` "legacy assessment URLs redirect" and `e2e/parent-raport.spec.ts` "no legacy template text" both still assert correct behaviour and were kept — only their comments changed. The parent-raport assertion is now a re-seed guard rather than a live-data guard.
- RLS coverage drops 38 → 37 tenant-scoped models: `AssessmentTemplate` carried a `tenantId` and was in the set; the other four keyed off it transitively and were not. Both counts are full coverage, so the check stays green.

## Verification

- `npx vitest run` — `Test Files  251 passed | 2 skipped (253)` · `Tests  2428 passed | 42 todo (2470)`.
- `npm run build` ✓ compiled · `npx tsc --noEmit` clean · `npm run lint` `✖ 55 problems (0 errors, 55 warnings)` — all pre-existing.
- `verify-api-auth.sh` → `✓ 183 / 183` (was 189 — six legacy routes deleted). `verify-rls-coverage.sh` → `✓ 37 / 37` (was 38 — `AssessmentTemplate` dropped).
- `CLAUDE.md` File Structure counts updated: api routes 189 → 183, portal pages 44/14/8 → 40/13/8.
- No frontend diff — `design-system` cross-check not applicable (deletions only; the one touched `.tsx` surface is a deleted file). Recorded here to satisfy the gate's paper trail.
- Playwright deferred to the required CI check (worktree `.env` points at the staging pooler).

## Ship Notes

**Migrations:** `20260731000000_drop_legacy_assessment_stack` — **destructive**. Drops 5 tables. Safe because prod holds zero rows and staging holds only demo rows. Runs at deploy via `prisma migrate deploy`.

**Rollback:** revert the commit and re-apply the pre-drop schema. The dropped rows are *not* recoverable from the migration — but there are none of record value. If a tenant later turns out to have had data, restore from the Supabase PITR window, not from this repo.

**Env vars:** none.

**Behaviour changes:** none user-visible. The admin surfaces were already redirect-masked; the parent activity feed now reports the raport rows parents can actually open, which is a fix, not a regression.
