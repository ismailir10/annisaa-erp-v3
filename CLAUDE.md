# Talib (engineering id: `school-erp`) — Operating Manual

> **Read this file completely before making any changes.** Operating manual for AI development sessions on this repo. What this product is — modules, portals, ADRs, setup, environments — lives in [README.md](./README.md). This file is the *how*; README is the *what*.

---

## Development Workflow — The 3-Step Loop

Every development cycle uses exactly these three commands and exactly **one** markdown file (`docs/cycles/YYYY-MM-DD-<slug>.md`):

```
/spec   →   /build   →   /ship
```

The upstream `addyosmani/agent-skills` plugin remains installed and provides the underlying skills. Our three project-level commands fold every upstream skill into one of `/spec`, `/build`, or `/ship`; per-skill mapping lives in `.claude/skills/{spec,build,ship}/SKILL.md`. Where a `superpowers:*` skill is stronger than its `agent-skills:*` counterpart (brainstorming, writing-plans, subagent-driven-development, code-reviewer), our commands prefer the superpowers variant.

### Canonical entry points

Users should not have to think about worktrees, hooks, or role files. Always rebase from staging so the worktree branches off latest. Two entry sentences:

| Role | Entry sentence | What the assistant does automatically |
|------|----------------|----------------------------------------|
| Product builder | `you are product-builder, <request>` | Writes `.claude/session-role`, derives a slug, runs `setup-worktree.sh`, enters the worktree, then runs `/spec` on `<request>` |
| CTO | `you are cto, <request>` | Writes `.claude/session-role`; if user asks for a clean branch, sets up a worktree the same way; otherwise executes the request directly |

Invoke `/caveman` and `/using-superpowers` by default. The `SessionStart` hook (`scripts/check-role.sh`) plus `/spec` Step 0 enforce this end-to-end.

### Per-command responsibilities

**`/spec`** — define + plan. Creates the cycle doc with Context / Spec / Tasks. Surfaces assumptions before handing off to `/build`.

**`/build`** — loops over the cycle doc's Tasks, one at a time:
- Subagent-driven development where tasks are independent
- Implement the slice
- Run the **between-task gate**: `npm run build && npx vitest run` — must pass before the next task
- Review + simplify the diff (`feature-dev:code-reviewer` agent)
- Update the cycle doc's Implementation + Verification
- Commit (one commit per task, not per cycle)
- After the **last task**: run the **end-of-cycle gate** + request code review, then fill Ship Notes

**`/ship`** — preflight gates the run on `/audit-docs` (doc-staleness check, A-scope), then opens a PR from `feat/*` → `staging`. After the PR is open, `/ship` enters the **preview-verification loop**: waits for the Vercel preview ready (Vercel MCP `get_deployment`), uses Chrome MCP with the user's signed-in Google session to walk 2-4 cycle-derived flows (seeding fixtures via UI CRUD), classifies findings as blocker / minor, fix-commits + re-verifies until clean (no iteration cap; soft-escalate every 3 via `AskUserQuestion`). Only after a clean preview does `/ship` print the merge hand-off — the author watches CI (`gh pr checks <number> --watch`) and merges manually (`gh pr merge <number> --squash --delete-branch`) when all checks are green. **Both `cto` and `product-builder` use this — no direct pushes to `staging` or `main`.** `/ship --to-main` opens the staging → main PR (CTO-initiated, explicit ask only); skips preview-verify since the constituent feat → staging PRs already exercised it. Playwright must have passed (recorded in cycle doc Verification) before `/ship`.

### Testing gates

Three-tier — fast unit gate between every task, Playwright smoke once per cycle, preview-verify on the open PR before merge hand-off:

| Gate | Command / mechanism | When |
|------|---------|------|
| Between-task | `npm run build && npx vitest run` | Before every commit during `/build` |
| End-of-cycle | `npm run build && npx vitest run && npx playwright test` | After the last task, before the final commit |
| Preview-verify | `/ship` Step 3 — Chrome MCP walks the Vercel preview against the user's Google session, classifies findings, fix-commits + re-verifies until clean | After `/ship` opens the PR, before the merge hand-off |

**Why three tiers:** Playwright cold-spin is ~2 min; running it between tasks adds 10+ min to a 5-task cycle. End-of-cycle catches headless UI regressions but cannot reach Google-OAuth-gated staging — preview-verify covers that surface with the user's real authenticated session. **Pure-docs cycles may skip Playwright + preview-verify** — record each skip explicitly in Verification. Tests live in `e2e/`; demo-mode cookie auth; runs against production build (`DEMO_MODE=true npm run start`); Chromium-only, workers: 1.

### Standalone: `/uat` — heuristic user-acceptance testing

`/uat <area>` is **not** part of the 3-step loop. Run on demand for a synthetic first-pass on UX friction in a portal area (e.g. `/uat parent/invoices`).

The command role-plays a fixed persona (Pak Budi, Bu Sari, Ibu Nur) through scripted Jobs-to-be-Done via Playwright MCP, measures page/API/click-to-visible timings against strict thresholds (page load >4s = blocker, API >2s = blocker, click-to-visible >3s = blocker — strict for mid-range Android + intermittent 4G), and produces a severity-gated report at `docs/uat/reports/YYYY-MM-DD-<area>.md`.

Reports are committed alongside the cycle that produced or consumed them. `/spec` reads the latest relevant report (60-day staleness rule) and surfaces blocker/major findings into the cycle Context. `/build` updates `docs/uat/jobs/<portal>.md` after any task that changes user-facing capability. Heuristic, not real UAT — an LLM persona cannot replicate thumb reach, sunlight glare, or emotional distrust.

Personas: `.claude/personas/{pak-budi,bu-sari,ibu-nur}.md`. Skill: `.claude/skills/uat/SKILL.md`. Jobs library: [`docs/uat/jobs/{admin,teacher,parent}.md`](docs/uat/jobs/).

### Standalone: `/audit-docs` — doc-staleness sweep

`/audit-docs` is **not** part of the 3-step loop. Run on demand to catch long-tail drift the per-cycle pre-commit doc-sync gate cannot see: README route count, portal page counts, components count, e2e spec count, standards-table file existence, ADR 60d cutoff, File Structure paths, workflow refs.

`/ship` invokes it automatically as preflight check #6 — any `fail` finding blocks PR open. The standalone invocation is useful between cycles to surface accumulated drift.

Read-only against git. Output is appended to the active cycle doc's `## Verification` if one is open, else printed to stdout. Skill: `.claude/skills/audit-docs/SKILL.md`.

---

## Multi-LLM Safety

Other LLMs (Sonnet, Haiku, GLM, GPT) may work on this repo. Five mechanisms:

### Auto staging sync (`scripts/sync-staging.sh`)

Every `SessionStart` runs `scripts/sync-staging.sh` in the main checkout. If the session is on `staging`/`main` and lags `origin/<branch>`, the hook fast-forwards (main checkout only, linked worktrees skipped; ff only; dirty tree → warn no-op; offline → silent exit). **Preflight gate:** `/spec` and `/build` refuse to proceed if the current `feat/*` branch is >5 commits behind `origin/staging` — user must rebase first.

### Session role (`.claude/session-role`)

Every session declares its role on turn one:

```
role=cto              # cto or product-builder
model=claude-opus-4-7 # or claude-sonnet-4-6, glm-5.2, gpt-5, human — must match current assistant
```

If missing or stale (>12h), `SessionStart` (`scripts/check-role.sh`) prints an instruction telling the assistant to ask the user. The three slash commands refuse to run until the file is set. **No env var reads** — Claude Code doesn't reliably export `CLAUDE_MODEL` to subprocesses.

**Override on every session start:** if the user's first message declares a role ("you are cto", "act as product-builder", "cto mode", or equivalent), the assistant MUST immediately rewrite `.claude/session-role` with the declared role + own model ID before any other action — even if the file already exists and is fresh. No "already set" exception.

### Worktree isolation

**Every session works in its own git worktree** — one per cycle, created fresh, all roles. `check-role.sh` blocks `/spec`/`/build`/`/ship` until the session is inside a worktree. Worktrees prevent parallel sessions stomping on lockfiles + build artifacts and give each session a clean slate.

**The user never touches setup.** When a session starts in the main checkout, the AI derives a kebab-case slug, runs `bash scripts/setup-worktree.sh <slug>`, `EnterWorktree`s into `.worktrees/<slug>`, rewrites `.claude/session-role`, then proceeds.

`setup-worktree.sh` does: `git worktree add .worktrees/<slug> -b feat/<slug> origin/staging` (always latest), symlinks `.env`/`.env.local`/`node_modules` from main checkout, runs `install-hooks.sh`. If `package.json` deps change inside the worktree, run `npm install` to replace the symlink.

Recovery: claude-harness worktrees at `.claude/worktrees/<slug>` bypass setup-worktree and lack env symlinks → `bash scripts/bootstrap-env-symlinks.sh` (idempotent). Cleanup when merged: `bash scripts/cleanup-merged.sh` (default `--report`; `--yes` to remove). Auto-skips dirty/checked-out/un-pushed.

### Git hooks (`.githooks/`)

Installed via `scripts/install-hooks.sh` (sets `core.hooksPath=.githooks`, writes `.githooks/.installed` marker).

- **`pre-commit`** — markdown allowlist (one-file-per-cycle), doc-sync (code changes must stage cycle doc / README / CLAUDE.md), seed drift (`prisma/seed.ts` requires `lib/db.ts`), frontend gate (frontend diffs require cycle doc to mention `design-system`), ADR-cell-length (cells > 400 chars in README's ADR table rejected).
- **`prepare-commit-msg`** — auto-appends `Model-Trailer: <model>` and `Role: <role>` from `.claude/session-role`.
- **`commit-msg`** — narrow doc-sync: `^(feat|perf)` commit subject + staged `app/**` or `lib/**` requires README staged (cycle doc alone insufficient).
- **`pre-push`** — blocks direct pushes to `staging` / `main` for **all roles** including `cto`. Use `/ship`. Direct pushes to `feat/*` always allowed.

The exact rule table + every test scenario lives in `scripts/test-hooks.sh` — run it to see what the hook blocks or allows.

### GitHub branch protection (the real boundary)

Client hooks can be bypassed with `--no-verify`. **GitHub branch protection is the actual enforcement layer.** Branch protection rules became free for private repositories in February 2023 — no GitHub Pro upgrade needed. Required configuration:

- `staging` + `main`: require PR, no direct push for anyone (incl. owner), status checks must pass before merge
- Required CI checks (job names from `.github/workflows/ci.yml`): `Lint, Typecheck & Test`, `Build`, `Playwright E2E`

`/ship` opens the PR and stops; the author merges after CI is green. Branch protection on `main` and `staging` is enabled in the Talib production launch — Cycle B (Production Infrastructure). Until then the safety net is `pre-push` blocking direct pushes + CTO discipline. **staging → main cadence:** every 2-4 merged cycles (or on "ship to prod"), CTO runs `/ship --to-main`.

### Commit attribution

Every commit carries:
```
Model-Trailer: claude-opus-4-7
Role: cto
Co-Authored-By: Claude <noreply@anthropic.com>
```

Auto-appended by `prepare-commit-msg`. If the hook fails, the commit lands with `Model-Trailer: human` — surface this to the user.

---

## One-File-Per-Cycle Rule

**Allowed markdown files:**
- `README.md`, `CLAUDE.md`, `LICENSE.md`, `CHANGELOG.md`, `CONTRIBUTING.md` (root)
- `docs/**` (incl. `docs/cycles/YYYY-MM-DD-<slug>.md`, **one per cycle**)
- `.github/**`, `.claude/**`, `.agent-skills/**`, `.githooks/**`

Any other staged `.md` is rejected by `pre-commit`.

**Never create `SPEC.md`, `PLAN.md`, `TEST-REPORT.md`, `NOTES.md`, etc.** Everything for a cycle goes into the cycle doc's six sections.

```markdown
# <Cycle Title>
## Context        <!-- /spec: why -->
## Spec           <!-- /spec: acceptance criteria -->
## Tasks          <!-- /spec: ordered atomic tasks -->
## Implementation <!-- /build: per-task files + summary -->
## Verification   <!-- /build: gates + manual smoke -->
## Ship Notes     <!-- /ship: migrations, env vars, rollback -->
```

**`/ship` preflight:**
- [ ] `npm run build && npx vitest run && npx playwright test` all green (Playwright skip allowed for pure-docs cycles)
- [ ] Verification section filled
- [ ] **README.md updated** if cycle adds/changes modules, routes, or entities
- [ ] Ship Notes filled
- [ ] `/audit-docs` reports zero `fail` findings (A-scope doc-staleness gate — runs as `/ship` preflight check #6)

### Superpowers skill output redirect

The `superpowers:brainstorming` and `superpowers:writing-plans` skills default to writing artifacts at `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and `docs/superpowers/plans/...`. **The project rule overrides that default.** When invoked inside this repo, both skills must write their output into the **active cycle doc**:

- `superpowers:brainstorming` → `## Context` (problem framing) + `## Spec` (acceptance + non-goals + assumptions)
- `superpowers:writing-plans` → `## Tasks` (ordered atomic tasks)

Per the priority order in `superpowers:using-superpowers`, *"User's explicit instructions (CLAUDE.md, GEMINI.md, AGENTS.md, direct requests) — highest priority"* — this rule wins. Do not create `docs/superpowers/*` files in this repo. The legacy files that predate this rule are archived under `docs/archive/superpowers-legacy/`.

---

## Documentation Maintenance

Single-source-of-truth contract — every fact has exactly one owner; the other doc links if needed.

| Document | Owns | Update when |
|---|---|---|
| **README.md** | Product identity, tech stack, modules, portals, ADRs (last 60d), setup, environments | Modules/routes/entities change; new ADR; setup/env changes |
| **CLAUDE.md** | Workflow, multi-LLM safety, hooks, standards table, doc-maintenance, file structure, `/uat`, one-file-per-cycle rule | Workflow/safety/hooks/standards listing change |
| `.claude/standards/*.md` | Domain rules (UI / patterns / voice / CRUD / portal / API / security / colors) | When a standard needs correction |
| `docs/cycles/YYYY-MM-DD-<slug>.md` | Per-cycle history (one per cycle) | `/spec` creates, `/build`+`/ship` update |
| `docs/adrs/archive.md` | ADRs > 60d OR codified in CLAUDE.md/standards | When trimming README's active ADR table |
| `docs/runbooks/*.md` + `docs/uat/{jobs,reports}/*.md` + `.claude/personas/*.md` | Runbooks, UAT JTBD library, UAT reports (committed), fixed personas | When procedure / capability / persona changes |

**`prd.md` is retired.** All product/roadmap/ADR content lives in README.md.

**Two-layer doc-sync enforcement:**

1. **`pre-commit` (broad):** code changes (`app/**`, `components/**`, `lib/**`, `prisma/**`) must stage cycle doc / README / CLAUDE.md.
2. **`commit-msg` (narrow):** `^(feat|perf)` subject + staged `app/**` or `lib/**` requires README staged (cycle doc alone insufficient). `fix:`/`refactor:`/`chore:`/`docs:`/`test:`/`style:`/`build:`/`ci:`/`release:` covered only by the broad rule. `Merge`/`Revert`/`fixup!`/`squash!`/`amend!` bypass.

The exact table + test scenarios live in `scripts/test-hooks.sh`.

---

## Standards (loaded on demand by `/build`)

Domain standards live under `.claude/standards/` — loaded only when relevant files are staged. `/build` consults the dispatcher in `.claude/skills/build/SKILL.md` (Step 1 — Load context) and loads the **union** of matching standards per task.

| File | Covers | Loaded when |
|---|---|---|
| `design-system.html` | **Canonical visual reference** — brand, colors, typography, spacing, components, overlays, portal shells, voice & tone (4000-line Claude Design export) | Any frontend change. Enforced by frontend-gate (Rule 4). |
| `parent-portal-cycle4.html` | Scratch parent-portal snapshot | Reference only, scope-locked, do not extend |
| `ui.md` | Shadcn-FIRST, DataTable + action-column, spacing tokens, overlays | `components/**`, `app/*/page.tsx`, `lib/format.ts` |
| `patterns.md` | Page recipes — Admin List/Detail/Form, Portal Dashboard, Workflow Queue, Daily Data Entry | `app/*/page.tsx`, `app/**/client.tsx`, `components/{admin,teacher,parent,portal}/**` |
| `voice.md` | Voice & tone — 3 personas, Islamic courtesy layer, error/empty/success/destructive copy, glossary | Any user-facing copy diff under `app/**/*.tsx`, `components/**/*.tsx`, `lib/email/**`, `lib/**/messages.ts` |
| `crud.md` | ERPNext-inspired CRUD (Categories A/B/C), soft-delete, list/detail layouts, edit dialog | `app/admin/**` with `<Dialog`/`FormField`/`<Field`/create-or-edit form |
| `portal.md` | Portal nav, Empty State Contract, fetch error contract, Household Overview, WeekGrid, cycle-tap attendance | `app/teacher/**`, `app/parent/**`, `app/**/layout.tsx`, `components/{teacher,parent}/**`, `lib/format.ts` |
| `api.md` | GET list pagination, mutation shape | `app/api/**`, `lib/validations/**`, `proxy.ts` |
| `security.md` | API route checklist, data-access roles, new-route security | `app/api/**`, `lib/auth*`, `proxy.ts` |
| `colors.md` | Color tokens + brand | `app/globals.css`, `tailwind.config.*`, `bg-status-*`/`text-status-*` edits, files containing `text-[#…]`/`bg-[#…]`/`border-[#…]` |

**Frontend gate (pre-commit Rule 4):** frontend diffs (`app/**/*.{tsx,css}`, `components/**/*.tsx`, `tailwind.config.*`) require the staged cycle doc to contain the literal token `design-system`. A one-line Verification bullet ("Cross-checked design-system.html §N for Z") satisfies the gate. Keeps the reference alive against silent drift.

---

## File Structure

```
app/{admin,teacher,parent}/  37 / 11 / 6 portal pages
app/api/                     144 routes (organized by domain)
components/ui/               69 Shadcn components
lib/{api,validations,payroll,xendit,email}/  business logic, retry, integrations
prisma/                      schema + seed
proxy.ts                     Next.js 16 middleware entry (renamed from middleware.ts)
e2e/                         17 specs (admin, admin-dashboard, admin-dialogs, admin-hydration, admin-school-admin, branding, curriculum-admin, curriculum-promes-import, daftar-public, design-system, parent, parent-attendance-scoping, parent-signout-bfcache, payment, perf-budget, sibling-detect, teacher)
docs/{cycles,adrs,runbooks,uat}/  cycle docs, ADR archive, runbooks, UAT jobs+reports
.claude/{skills,standards,personas}/  slash commands, domain standards, fixed personas
.githooks/                   pre-commit, prepare-commit-msg, commit-msg, pre-push
scripts/                     setup-worktree, install-hooks, sync-staging, cleanup-merged, check-role, verify-rls-coverage, verify-api-auth, test-hooks, reseed-staging
```

Demo-mode auth means E2E + local dev need no live Supabase. Lint: `npm run lint`.
