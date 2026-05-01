# Architecture Decisions — Archive

ADRs older than 60 days OR whose constraint is now codified elsewhere (in `CLAUDE.md` operating manual or `.claude/standards/*.md`) live here. The active table in `README.md` keeps only decisions still actively constraining day-to-day work in the last 60 days. New cycles append to README; cycles that age out roll into this file chronologically.

Archive policy: when a row in `README.md`'s Architecture Decisions table is older than 60 days, OR when the decision it records has been absorbed into the operating manual / a standard file (so the table cell would just duplicate that source), move the row here verbatim — byte-equal to the README cell text. Do not edit during the move.

## Pre-2026 baseline

| Date | Decision | Why |
|---|---|---|
| 2025 | Next.js App Router + Server Components by default | Supabase SSR integration, streaming, and route-handler co-location |
| 2025 | Prisma over direct Supabase client for business logic | Type safety, migration history, easier local SQLite dev |
| 2025 | Soft-delete everywhere (`status=INACTIVE`) | Audit trail, undo, no data loss |
| 2025 | Shadcn-first UI (62 components installed) | Consistency, accessibility, avoids bespoke drift |

## Process-meta (now codified in CLAUDE.md)

| Date | Decision | Why |
|---|---|---|
| 2026-04-15 | 3-command workflow (`/spec`, `/build`, `/ship`) over upstream 7 | Lower friction for small cycles; every upstream skill is still mapped into one of the three |
| 2026-04-15 | One markdown file per cycle, enforced by pre-commit hook | Stop scratch-file proliferation from non-Opus sessions |
| 2026-04-15 | `prd.md` retired; README.md becomes single source of truth for status/roadmap/ADRs | Eliminate three-way doc drift |
| 2026-04-18 | Unified PR-based `/ship`: all roles open a PR to `staging` and merge manually when CI is green — no direct pushes to `staging` or `main` | GitHub free plan doesn't support branch protection / auto-merge; manual merge + pre-push hook + CTO discipline is the enforcement layer (supersedes 2026-04-15 role-gated push) |
