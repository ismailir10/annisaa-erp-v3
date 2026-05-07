# hotfix-spec-route-slug-english — backend English / labels Indonesian rule explicit in §10A

**Type:** docs
**Phase:** post-Phase-2-IA hotfix
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §10A + §4.4

## Context

`spec-rebuild-foundation-rethink` (PR #194, merged 2026-05-07) landed §10A IA tables with Indonesian page titles and group labels (Pendaftaran / Wali Murid / Keluarga / Akademik / Pengaturan / etc.). §4.4 already declares "Field naming: English camelCase always" but the rule was never extended to **URL slugs / route segments / code identifiers**. §10A intro example showed `/<portal>/pengaturan/<entity-slug>` — Indonesian segment in the route. Without an explicit rule, `p2-portal-shell-sidebar` and `p2-scaffold-pages` would mount routes ad-hoc — risk of mixed Indonesian/English route paths (e.g. `/admin/pengaturan/jam-kerja` vs `/admin/settings/work-hours`).

**Hotfix:** add explicit "backend English, labels Indonesian" contract to §10A intro + group-slug mapping table + entity-slug examples + label↔slug ownership rule (`lib/entities/<name>/entity.ts` owns both `label.id` Indonesian + `slug` English-kebab as single source of truth). Doc-only single-task cycle. No code, no schema, no migrations.

Cross-checked design-system.html: N/A (doc-only). UAT reports: N/A.

## Spec

### Acceptance criteria

- [x] §10A intro paragraph at line 726 of foundation md gains explicit "backend English, labels Indonesian" rule + rule-of-thumb.
- [x] Group slug mapping table inserted (8 groups: Beranda → `/`, Akademik → `/academic`, Penilaian → `/assessment`, Keuangan → `/finance`, HR → `/hr`, Berkas → `/files`, Audit → `/audit`, Pengaturan → `/settings`).
- [x] Entity-slug examples inline (label → slug) covering ~14 representative cases.
- [x] Canonical-source rule stated: when unsure of English term, use Prisma model name kebab-cased + pluralized.
- [x] Single source of truth declared: `lib/entities/<name>/entity.ts` owns both `label.id` (Indonesian) + `slug` (English-kebab).
- [x] No new entity, no schema change, no code change. Existing §10A tables untouched (page titles already Indonesian, entity backings already English Prisma names).
- [x] All gates green: `npm run lint` ✓, `npm run typecheck` ✓, `npm run build` ✓, `npx vitest run` ✓.
- [x] `verify-rls-coverage.sh`, `verify-api-auth.sh`, `verify-pii-annotations.sh`, `npm run scaffold:check` all ✓ (sanity-confirm; no schema/route change).
- [x] Playwright skipped (pure-docs).
- [x] Commit type `docs:` so README staging not required.

### Non-goals

- Renaming any existing route. None exist yet — `p2-portal-shell-sidebar` and `p2-scaffold-pages` are pending; rule applies forward.
- Renaming any entity / role / scope code. They're already English (`student`, `homeroom_teacher`, `OWN_CLASS`).
- Adding label↔slug mapping to every §10A table row. Examples in intro suffice; per-entity ownership is `entity.ts`.
- Adding a new `.claude/standards/portal-ia.md` standard. Foundation md §10A is the contract; standards doc lands when `p2-portal-shell-sidebar` ships.

### Assumptions

1. Foundation md is canonical — adding the rule there back-pressures every future cycle. No need to update CLAUDE.md or `voice.md` separately (they already say Indonesian copy + English code).
2. `entity.ts` `label.id` + `slug` field naming is forward-compat with existing 5 entity registries (which currently expose `label.id`; `slug` lands when `p2-portal-shell-sidebar` mounts navigation).

## Tasks

> Single task, one commit. Doc-only.

- [x] **T1 — Apply rule + group-slug table + entity-slug examples to foundation md §10A intro + write this cycle doc.** Acceptance: §10A intro at line 726 of `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` updated; cycle doc filled; gates green; one commit `docs(spec): backend English / labels Indonesian rule explicit in §10A`.

## Implementation

- T1: `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` + `docs/cycles/2026-05-07-hotfix-spec-route-slug-english.md`. §10A intro at line 726 updated — added "Backend English, labels Indonesian" paragraph above existing "Routing convention" paragraph; routing convention now includes 8-row group-slug mapping table + ~14 entity-slug examples + Prisma-model-as-canonical-source fallback rule + `entity.ts label.id + slug` single-source-of-truth declaration. No table rows in §10A.1/10A.2/10A.3 modified — only the intro contract. ~25 lines added to foundation md (1685 → ~1710 lines).

## Verification

- T1 gates green at 2026-05-07: `npm run lint` ✓ (1 pre-existing warning), `npm run typecheck` ✓, `npm run build` ✓, `npx vitest run` ✓ (931 pass / 4 skip baseline matches staging tip — no test changes), `verify-rls-coverage.sh` ✓ 32/32, `verify-api-auth.sh` ✓ 4/4, `verify-pii-annotations.sh` ✓ 5/5, `npm run scaffold:check` ✓ 5/5. Playwright deliberately skipped — pure-docs cycle.
- Cross-checked design-system.html: N/A (doc-only).

## Ship Notes

### Migrations applied

**None.** Doc-only cycle.

### New env vars

**None.**

### Manual smoke on Vercel preview

**None required** — no runtime change. Verify the spec doc renders correctly on GitHub when the PR loads (group-slug mapping table integrity).

### Rollback plan

`git revert <PR merge SHA>` undoes the §10A intro edit cleanly. No schema, no env var, no migration. Risk window zero.

### Forward implications

- `p2-portal-shell-sidebar` cycle now has the contract: route segments English, sidebar labels Indonesian. Drops one design decision off that cycle's plate.
- `p2-scaffold-pages` cycle inherits same contract. Pages mount at English routes (`/admin/academic/students`) regardless of the sidebar label (`Siswa`).
- Each future entity registry MUST declare `slug` (English kebab) alongside existing `label.id` (Indonesian) in `entity.ts`. Forward-compat work for the 5 already-shipped entity registries lands when the registry pattern next gets touched.
