# README Staleness Sweep

## Context

On-demand README cleanup — remove outdated, false, and stale claims. Audited every
section against actual repo state (Prisma datasource, package versions, CI jobs, module
status, ADR ages). Pure-docs cycle.

## Spec

README.md (and `docs/adrs/archive.md`) carry only true, current claims:
1. No SQLite references — the Prisma datasource is `postgresql`-only; local dev uses a
   Postgres `DATABASE_URL` (confirmed: `prisma/schema.prisma` provider, `.env.example`).
2. Module count matches the table (9 rows, not "seven").
3. `curriculum` + `reportCard` module cells reflect shipped state, not a frozen mid-cycle
   snapshot ("C3 (this cycle)", "AssessmentEntry is C4" while C4–C8 shipped).
4. `learning` cell flags the BB/MB/BSH/BSB `AssessmentTemplate` system as legacy / being
   retired by the cutover (no longer read by any parent surface).
5. ADR table holds only rows ≤ 60 days old (cutoff 2026-06-17 → 2026-04-18); older rows
   move verbatim to `docs/adrs/archive.md` per the table's own stated policy.

**Non-goals:** no content changes outside README + ADR archive; no code.

## Tasks

1. Fix SQLite → Postgres in Tech Stack, env-var table, Environments table, setup comment.
2. Module count "Seven" → "Nine"; rewrite `curriculum` + `reportCard` cells to shipped
   state; mark `learning` BB/MB/BSH/BSB legacy.
3. Trim ADR rows older than 2026-04-18 (17 rows: 2025-04 + 2026-04-xx) into
   `docs/adrs/archive.md` verbatim, chronologically ordered.

## Implementation

- **SQLite removed (3 spots + setup):** Tech Stack DB row, env-var table `DATABASE_URL`
  Local, Environments table Local row, and the `npm run dev` comment — all corrected to a
  local Postgres `DATABASE_URL`; clarified DEMO_MODE bypasses Google auth, not the DB.
  Grounded in `prisma/schema.prisma` (`provider = "postgresql"`) + `.env.example`.
- **Modules:** "Seven domain modules" → "Nine … seven stable, plus `curriculum`/
  `reportCard` mid-cutover". `curriculum` cell rewritten to list shipped capability (PROMES
  spine, admin CRUD, xlsx import, Objective/IKTP CRUD, AssessmentEntry weekly + sentra
  write paths with `voidedAt`, admin Penilaian monitor, parent perkembangan; 3-level
  skala; permission set incl. `assessments.read`/`.void`) — dropped the frozen "C3 (this
  cycle)/C4 future" framing. `reportCard` tag → "admin authoring + parent read shipped".
  `learning` cell marks `AssessmentTemplate`/BB-MB-BSH-BSB as legacy, no longer parent-read.
- **ADR 60-day trim:** removed 17 rows dated ≤ 2026-04-28 from README's active table;
  appended them verbatim to `docs/adrs/archive.md` under a new "Aged out of README's
  60-day window (moved 2026-06-17)" section, chronologically ordered. README's active
  table now spans 2026-05-02 → 2026-06-05.

## Verification

- `grep -niE 'sqlite|dev\.db' README.md` → none.
- README ADR table: oldest row now `2026-05-02` (≥ the 2026-04-18 cutoff); all 17 removed
  rows present verbatim in `docs/adrs/archive.md`.
- Pure-docs cycle: no `app/**`/`lib/**`/`components/**`/`prisma/**` changes → `npm run
  build`/`vitest`/Playwright/preview-verify N/A (no code surface). `/audit-docs` route
  (175), portal (42/14/8), component (69), e2e-spec (31) counts unchanged by this cycle;
  ADR-cutoff check now clean.

## Ship Notes

- **Migrations / env / deps:** none. Docs-only.
- **Rollback:** revert the PR.
- **No Playwright / preview-verify:** pure-docs cycle, no UI surface.
