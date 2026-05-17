# Superpowers Legacy Archive

**Cutoff:** 2026-05-13

These files were produced by the `superpowers:brainstorming` and `superpowers:writing-plans` skills before the project's harmony rule was added to `CLAUDE.md` (see `CLAUDE.md` → *One-File-Per-Cycle Rule* → *Superpowers skill output redirect*).

The skills default to writing artifacts under `docs/superpowers/{specs,plans}/`. That conflicts with the project's one-file-per-cycle rule. The current rule directs both skills to write their output **into the active cycle doc** (`docs/cycles/YYYY-MM-DD-<slug>.md`):

- brainstorming → cycle doc `## Context` + `## Spec`
- writing-plans → cycle doc `## Tasks`

Files in this archive are **read-only history**. Do not extend, edit, or add new files here. New design + plan content goes into the cycle doc.

## Mapping legacy file → covering cycle

If you need the design or plan history for a feature, find the corresponding cycle doc in `docs/cycles/`:

| Archive path | Covered by cycle |
|---|---|
| `specs/2026-04-21-admin-nav-bugs-design.md` | `docs/cycles/` — admin-nav-reorg / admin-nav-bugs cycles around 2026-04-21 |
| `specs/2026-05-02-talib-production-launch-design.md` | `docs/cycles/` — talib-production-launch & cycle-b-prod-infra cycles |
| `specs/2026-05-02-talib-cycle-b-prod-infra-design.md` | same as above |
| `specs/2026-05-03-dashboard-shadcn-rebuild-design.md` | `docs/cycles/2026-05-03-dashboard-shadcn-rebuild.md` |
| `specs/2026-05-12-curriculum-penilaian-raport-design.md` | upcoming curriculum + penilaian + raport cycle (initiative tracked in user auto-memory) |
| `plans/2026-05-02-rebrand-talib.md` | `docs/cycles/` — rebrand-talib cycle (use git log to locate) |
| `plans/2026-05-03-dashboard-shadcn-rebuild.md` | `docs/cycles/2026-05-03-dashboard-shadcn-rebuild.md` |

Use `git log -- <path>` on any archive file to find the commit that introduced it and the surrounding work.
