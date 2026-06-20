# Fix reseed: ClassSection.classTrackId never set

## Context
`ClassSection.classTrackId` became a required column (no default) on 2026-05-20 — every section now belongs to a `ClassTrack`. But `scripts/reseed/org.ts` was never updated: `seedOrg` creates sections with no `classTrackId`, so `prisma.classSection.create()` fails Prisma validation and the whole `npm run reseed:staging` pipeline aborts at step 3/9. The destructive wipe (step 2) runs first, so a failed reseed leaves staging empty. This was caught while seeding staging on 2026-06-21 — the seed completed only after applying this fix locally. Outcome: `seedOrg` creates one `ClassTrack` per (campus, program) and links every section, so `reseed:staging` runs end-to-end again.

## Spec
- [ ] `seedOrg` creates a `ClassTrack` for each distinct (campus, program) pair, satisfying the `@@unique([tenantId, campusId, programId, name])` constraint.
- [ ] Every `ClassSection` is created with a valid `classTrackId` referencing the track for its (campus, program).
- [ ] Track name reuses the shared section name (identical across academic years for a given campus+program), so no duplicate-name collision.
- [ ] `npm run build && npx vitest run` pass.
- [ ] A pure-planner test documents the expected track count (7 = distinct campus×program pairs).

**Non-goals:**
- No schema change — `classTrackId` already exists; this only fixes the seed.
- No change to section counts, names, capacities, or ageGroup defaults.
- No change to the auth/Xendit guard paths in `reseed-staging.ts`.

**Assumptions:**
1. One `ClassTrack` per (campus, program) is the correct grain — tracks span academic years, sections are per-year instances within a track. (7 tracks: Aster has 4 programs, Metland 3.)
2. Reusing `sectionName` (e.g. `TKIT-A — Aster`) as the track name is acceptable; it is stable across years for a campus+program.

## Tasks
1. [x] **Create ClassTracks + link sections in `seedOrg`** — `scripts/reseed/org.ts`: before the section loop, build one `ClassTrack` per distinct (campus, program); set `classTrackId` on each `ClassSection.create`. Acceptance: `seedOrg` produces 7 tracks / 14 sections with valid FKs.
2. [x] **Add track-count invariant test** — `scripts/reseed/__tests__/org.test.ts`: assert distinct (campusCode, programCode) pairs from `buildClassSectionPlan()` = 7. Acceptance: `npx vitest run scripts/reseed/__tests__/org.test.ts` green.

## Implementation
- Subagent plan: both tasks sequential (same module `scripts/reseed/org.ts` + its test); executed inline.
- Task 1: `scripts/reseed/org.ts` — added a `classTrackIdByCampusProgram` map; loop over `buildClassSectionPlan()` creating one `ClassTrack` per distinct `(campusCode, programCode)` (track name = shared `sectionName`), then set `classTrackId` on each `ClassSection.create`.
- Task 2: `scripts/reseed/__tests__/org.test.ts` — added invariant test asserting `buildClassSectionPlan()` yields 7 distinct `(campus, program)` pairs (= one ClassTrack each).

## Verification
- Task 1: gates passed (`npm run build` green, `npx vitest run` 2061 passed / 0 failed). Empirically verified end-to-end against staging-sgp on 2026-06-21 — full `reseed` pipeline ran to completion: 7 tracks, 14 sections, 200 students, 2000 invoices.
- Task 2: `npx vitest run scripts/reseed/__tests__/org.test.ts` → 20 passed.
- Code review: mandated `feature-dev:code-reviewer` agent unavailable in this session (pinned to inaccessible model glm-5). Reviewed inline instead — track grouping satisfies `@@unique([tenantId,campusId,programId,name])`, FKs always populated, names collision-free. No defects.
- Playwright/preview-verify: N/A — change is reseed-script-only, touches no app route, component, or API surface. No browser-observable behavior.

## Ship Notes
