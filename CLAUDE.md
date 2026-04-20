# School ERP — Operating Manual

> **Read this file completely before making any changes.** This is the operating manual for AI development sessions on this repo. For project status, modules, roadmap, and architecture decisions, see [README.md](./README.md). For domain standards (UI / CRUD / Portal / API / Security / Colors), see `.claude/standards/*.md` — loaded on demand by `/build`, not on every session.

## Project quick reference

**An Nisaa' School ERP** — school management system for An Nisaa' Sekolahku (Islamic PAUD/TKIT, Bekasi). 2 campuses, 40+ teachers, 500+ students. SaaS-ready single-tenant MVP.

**Production:** [annisaa-erp-v3.vercel.app](https://annisaa-erp-v3.vercel.app)
**Repo:** [github.com/ismailir10/annisaa-erp-v3](https://github.com/ismailir10/annisaa-erp-v3)

Tech stack, module list, CRUD status, roadmap, and architecture decisions all live in **README.md**. This file is the *how*; README is the *what*.

---

## Development Workflow — The 3-Step Loop

Every development cycle uses exactly these three commands and exactly **one** markdown file (`docs/cycles/YYYY-MM-DD-<slug>.md`):

```
/spec   →   /build   →   /ship
```

The upstream `agent-skills` plugin (addyosmani/agent-skills) remains installed — it still provides the underlying skills. Our three project-level commands wrap the plugin's skills and fold all 20 of them into the 3-step flow, so nothing from the upstream framework is lost.

### Coverage mapping — nothing is dropped

| Upstream skill | Folded into |
|---|---|
| `idea-refine` | `/spec` (when the request is vague) |
| `spec-driven-development` | `/spec` |
| `planning-and-task-breakdown` | `/spec` |
| `context-engineering` | `/spec` + `/build` |
| `source-driven-development` | `/build` |
| `incremental-implementation` | `/build` |
| `frontend-ui-engineering` | `/build` (auto on `components/`, `app/*/page.tsx`) |
| `api-and-interface-design` | `/build` (auto on `app/api/`) |
| `security-and-hardening` | `/build` (auto on `app/api/`, `lib/auth`, `middleware.ts`) |
| `test-driven-development` | `/build` |
| `browser-testing-with-devtools` | `/build` |
| `debugging-and-error-recovery` | `/build` |
| `code-review-and-quality` | `/build` |
| `code-simplification` | `/build` |
| `performance-optimization` | `/build` (when the spec mentions perf) |
| `git-workflow-and-versioning` | `/ship` |
| `ci-cd-and-automation` | `/ship` |
| `documentation-and-adrs` | `/ship` |
| `deprecation-and-migration` | `/ship` (only when the spec declares a deprecation) |
| `shipping-and-launch` | `/ship` |

### Per-command responsibilities

**`/spec`** — define + plan. Creates the cycle doc with Context / Spec / Tasks sections. Surface assumptions before handing off to `/build`.

**`/build`** — loops over the cycle doc's Tasks, one at a time:
- Implement the slice
- Run the **between-task gate**: `npm run build && npx vitest run` — must pass before moving on
- Review + simplify the diff
- Update the cycle doc's Implementation + Verification sections
- Commit (one commit per task, not per cycle)
- After the **last task**: run the **end-of-cycle gate** before committing (see below)
- Fill Ship Notes in the cycle doc

**`/ship`** — create a PR from the feature branch to `staging` and hand off a two-command merge instruction to the user. `/ship` opens the PR and stops; the user watches CI (`gh pr checks <number> --watch`) and merges manually (`gh pr merge <number> --squash --delete-branch`) when all four checks are green. **Both `cto` and `product-builder` use this same flow — no direct pushes to `staging` or `main` for anyone.**
- `/ship` → PR feat/* → staging, merged manually by the author when CI is green
- `/ship --to-main` → PR staging → main, merged manually by the CTO when CI is green (explicit ask only; CTO-initiated)

Playwright must have passed (recorded in the cycle doc Verification section) before running `/ship`.

### Testing gates

Two-tier system — fast unit gate between every task, Playwright smoke once per cycle:

| Gate | Command | When |
|------|---------|------|
| Between-task (fast) | `npm run build && npx vitest run` | Before every commit during `/build` |
| End-of-cycle (smoke) | `npm run build && npx vitest run && npx playwright test` | After the last task, before the final commit |

**Why two tiers:** Playwright spins up a dev server and runs ~20 browser tests (~2 min cold). Running it between every task adds 10+ min to a 5-task cycle. Running it once at the end catches UI regressions without slowing iteration.

**Playwright notes:**
- Tests live in `e2e/` — three portals: `admin.spec.ts`, `teacher.spec.ts`, `parent.spec.ts`
- Uses demo-mode auth (cookie-based, direct cookie injection — no login UI, no rate-limit exposure)
- Runs against the **production build** (`DEMO_MODE=true npm run start`) — not dev server. Requires `npm run build` first.
- `reuseExistingServer: !process.env.CI` — reuses a running server locally; forces a fresh server in CI
- Chromium only (no multi-browser), workers: 1 (demo mode is stateful)
- If a Playwright test fails at end-of-cycle, fix it before committing the last task

If you're committing manually outside `/build`, run at minimum:
```bash
npm run build && npx vitest run
```

### Standalone: `/uat` — heuristic user-acceptance testing

`/uat <area>` is **not** part of the 3-step loop. Run it on demand when you want a synthetic first-pass on UX friction and performance in a specific portal area — e.g. `/uat parent/invoices`, `/uat teacher/class-attendance`, `/uat admin/payroll`.

The command role-plays a fixed persona (Pak Budi, Bu Sari, or Ibu Nur) through scripted Jobs-to-be-Done via Playwright MCP, measures page/API/click-to-visible timings against strict thresholds, and produces a severity-gated report at `docs/uat/reports/YYYY-MM-DD-<area>.md`.

**Key points:**
- **Heuristic, not real UAT.** An LLM persona cannot replicate thumb reach, sunlight glare, or emotional distrust. The report is a cheap first pass, not a substitute for real users.
- **Reports are gitignored by default.** They only enter git when a `/spec` cycle consumes one (via `git add -f`).
- **`/spec` integration:** when starting a new cycle, `/spec` reads the latest relevant UAT report, applies a 60-day staleness rule, and surfaces blocker/major findings into the cycle doc's Context.
- **`/build` maintenance:** after each task that changes user-facing capability, update `docs/uat/jobs/<portal>.md` to keep the JTBD library current.
- **Performance thresholds** (page load >4s = blocker, API >2s = blocker, click-to-visible >3s = blocker) are strict for the Indonesian PAUD/TKIT deployment reality (mid-range Android + intermittent 4G).

Jobs library: `docs/uat/jobs/{admin,teacher,parent}.md`. Personas: `.claude/personas/{pak-budi,bu-sari,ibu-nur}.md`. Skill definition: `.claude/skills/uat/SKILL.md`.

---

## Multi-LLM Safety

Other LLMs (Sonnet, Haiku, GLM 5.2, GPT, etc.) may work on this repo. Three mechanisms keep this safe:

### 1. Session role (`.claude/session-role`)

Every session declares its role on turn one. File format:
```
role=cto              # cto or product-builder — both open PRs via /ship; no direct pushes to staging
model=claude-opus-4-7 # or claude-sonnet-4-6, glm-5.2, gpt-5, human — must match the current assistant's model ID
```

If the file is missing or stale (>12h), the `SessionStart` hook (`scripts/check-role.sh`) prints an instruction telling the assistant to ask the user. The three slash commands refuse to run until it's set.

**Role override on every session start (critical):** The file persists between sessions and can carry a stale role from a previous AI session. To prevent this, the `SessionStart` hook always prints a reminder. The assistant MUST follow this rule:

> **If the user's first message in a session declares a role — "you are cto", "act as product-builder", "i am cto", "cto mode", or any clear equivalent — the assistant MUST immediately rewrite `.claude/session-role` with the declared role and its own model ID before taking any other action, even if the file already exists and is fresh.**

This overrides whatever the file currently says. There is no "it's already set" exception.

**No env var reads.** Claude Code doesn't reliably export `CLAUDE_MODEL` to subprocesses and other CLIs use different variables. The file is the single source of truth.

### 2. Git hooks (`.githooks/`)

Installed via `scripts/install-hooks.sh` which sets `core.hooksPath=.githooks` and writes `.githooks/.installed` as a marker.

- **`pre-commit`** — enforces the markdown allowlist (one-file-per-cycle rule), doc-sync (code changes must stage cycle doc, README.md, or CLAUDE.md), and seed drift prevention (`prisma/seed.ts` cannot be committed without `lib/db.ts` also staged).
- **`prepare-commit-msg`** — appends `Model-Trailer: <model>` and `Role: <role>` from `.claude/session-role` to every commit that doesn't already have them.
- **`pre-push`** — blocks direct pushes to `staging` or `main` for **all roles** (including `cto`). Everyone uses `/ship` to open a PR instead. Direct pushes to feature branches (`feat/*`) are always allowed.

### 3. Worktree isolation (every session gets its own working tree)

**Every session works in its own dedicated git worktree — one worktree per cycle, created fresh at session start.** This applies to all roles (cto, product-builder, etc.).

**Why:** Worktrees prevent parallel sessions from stomping on each other's lockfiles and build artifacts. They also give each session a clean slate — no dirty state inherited from a crashed previous session.

**Rule:**
- **Every session — regardless of role — MUST work in a worktree.** No exceptions. `check-role.sh` enforces this for all roles.
- `role=cto` → worktree required. Uses `/ship` (PR model) like everyone else — no direct push to staging.
- `role=product-builder` → **every new session = new worktree, no exceptions.** `check-role.sh` blocks `/spec`, `/build`, and `/ship` until the session is inside a worktree.

**The user never touches worktree setup.** When the user opens a Claude Code session in the main checkout and types anything (e.g. `/spec build the crud sweep`), the AI detects it is in the main checkout via the `SessionStart` hook and does the setup automatically regardless of role:

1. Derives a kebab-case slug from the user's request
2. Runs `bash scripts/setup-worktree.sh <slug>` via the Bash tool
3. Uses `EnterWorktree` to move into `.worktrees/<slug>`
4. Rewrites `.claude/session-role` with its own model ID
5. Proceeds with the user's original request

`setup-worktree.sh` does everything in one step:
- `git worktree add .worktrees/<slug> -b feat/<slug> origin/staging` — always branches from latest `origin/staging`, never from a stale local HEAD
- Symlinks `.env` and `.env.local` from the main checkout (fixes "missing env" errors)
- Symlinks `node_modules` from the main checkout (no `npm install` needed)
- Runs `install-hooks.sh` inside the worktree

**`.env` / `node_modules` in worktrees:** Both are gitignored and absent from fresh worktrees. The setup script symlinks them so `npm run dev`, `npm run build`, and Prisma work immediately. If a branch changes `package.json` dependencies, run `npm install` inside the worktree to replace the `node_modules` symlink.

**Cleanup when the cycle is merged:**
```bash
git worktree remove .worktrees/<slug>
git branch -D feat/<slug>
```

### 4. GitHub branch protection (the real boundary)

Client hooks can be bypassed with `--no-verify`. **GitHub branch protection is the actual enforcement layer.** Required settings:

- **`staging`**: require PR, no direct push for anyone (including owner), status checks must pass before merge
- **`main`**: require PR from `staging` only, same status checks

**Required GitHub Actions CI checks on every PR to `staging` and `main`:**
```
build         # npm run build
typecheck     # tsc --noEmit
test          # npx vitest run
e2e           # npx playwright test (production server)
```

`/ship` opens the PR and stops — the author merges manually after confirming all four checks are green. (Note: branch protection, required status checks, and "Allow auto-merge" require GitHub Pro and are **not active** on this repo today. The settings above are the aspirational target for when the repo moves to Pro. On the free plan, the only real safety net is the `pre-push` hook blocking direct pushes to `staging`/`main` plus the CTO's discipline to wait for green CI before clicking merge.)

**staging → main cadence:** After every 2-4 merged cycles on staging (or when the user says "ship to prod"), CTO runs `/ship --to-main` to create the staging → main PR. CTO reviews and merges after CI passes.

If you are setting up a fresh clone or forking this repo, configure the Actions workflow and branch protection before running `/ship`.

### Commit attribution

Every commit carries:
```
Model-Trailer: claude-opus-4-7
Role: cto
Co-Authored-By: Claude <noreply@anthropic.com>
```

This is appended automatically by the `prepare-commit-msg` hook. `/build` also includes it in the commit HEREDOC as a belt-and-suspenders measure. If both fail, the commit still lands but with `Model-Trailer: human` — surface this to the user so they can investigate.

---

## One-File-Per-Cycle Rule

**Only these markdown files are allowed in the repo:**
- `README.md`, `CLAUDE.md`, `LICENSE.md`, `CHANGELOG.md`, `CONTRIBUTING.md` (root)
- `docs/**` (including `docs/cycles/YYYY-MM-DD-<slug>.md`, **one per cycle**)
- `.github/**`, `.claude/**`, `.agent-skills/**`, `.githooks/**`

Any other staged `.md` file is rejected by the `pre-commit` hook with an error pointing at this rule.

**Never create `SPEC.md`, `PLAN.md`, `TEST-REPORT.md`, `NOTES.md`, `PHASE1-VERIFY.md`, or similar scratch files.** Everything that belongs to a cycle goes into the cycle doc's six sections. If you feel the urge to drop a sibling file, resist — the hook will reject it anyway.

The cycle doc template:
```markdown
# <Cycle Title>
## Context       <!-- /spec: why we're doing this -->
## Spec          <!-- /spec: acceptance criteria -->
## Tasks         <!-- /spec: ordered atomic tasks -->
## Implementation <!-- /build: per-task files + summary -->
## Verification   <!-- /build: gates + manual smoke -->
## Ship Notes     <!-- /ship: migrations, env vars, rollback -->
```

**`/ship` preflight checklist** (must pass before opening PR):
- [ ] `npm run build && npx vitest run && npx playwright test` all green
- [ ] Verification section in cycle doc filled
- [ ] **README.md updated** — mandatory if cycle adds/changes modules, routes, CRUD status, or entities
- [ ] Ship Notes filled (migrations, new env vars, rollback plan)

---

## Documentation Maintenance

Two docs are kept current every cycle:

| Document | Role | Update when |
|---|---|---|
| **README.md** | Single source of truth — project map, modules, CRUD status, roadmap, ADRs, workflow, setup | Modules change, CRUD status changes, roadmap shifts, architecture decisions made, new user-facing features |
| **CLAUDE.md** | This file — operating manual for AI agents (workflow + safety rules) | Workflow process, safety mechanism, or one-file-per-cycle rule changes. Domain standards live in `.claude/standards/*.md` and update independently. |

**`prd.md` is retired.** All product/roadmap/ADR content lives in README.md. Do not recreate prd.md.

**The cycle doc** is where per-cycle history lives. Do not duplicate cycle details into README.md or CLAUDE.md — link to the cycle doc instead.

Two hooks enforce doc-sync, in layers:

1. **`pre-commit` (broad rule):** code changes (anything under `app/**`, `components/**`, `lib/**`, `prisma/**`) must stage at least one of the current cycle doc, README.md, or CLAUDE.md. Catches "code without any docs update".
2. **`commit-msg` (narrow rule, added 2026-04-20):** if the commit subject matches `^(feat|perf)(\([^)]+\))?!?:` AND staged files touch `app/**` or `lib/**`, **README.md must be staged** — cycle doc alone is insufficient. This is the stricter rule for user-visible-behavior commits. `fix:`/`refactor:`/`chore:`/`docs:`/`test:`/`style:`/`build:`/`ci:`/`release:` remain covered only by the broad rule. Merge/Revert/fixup!/squash!/amend! subjects always bypass.

Rationale: on 2026-04-20 PR #74 had to retroactively add five cycles to the README history that had merged weeks earlier — each `feat:`/`perf:` PR passed the broad rule by staging only its own cycle doc, and the README narrative drifted. See `docs/cycles/2026-04-20-doc-sync-hook-tighten.md`.

The exact rule table and all test scenarios live in `scripts/test-hooks.sh` — run it to see every case the hook blocks or allows.

---

## Standards (loaded on demand by `/build`)

Domain standards are no longer inlined here — they live under `.claude/standards/` and are loaded only when relevant files are staged. `/build` consults the dispatcher table in `.claude/skills/build/SKILL.md` (Step 1 — Load context) and loads the **union** of matching standards per task.

| File | Covers | Loaded when staged paths match |
|---|---|---|
| `.claude/standards/ui.md` | Shadcn-FIRST rule, DataTable + action-column standard | `components/**`, `app/*/page.tsx`, `lib/format.ts` |
| `.claude/standards/crud.md` | ERPNext-inspired CRUD (Categories A/B/C), soft-delete, list/detail layouts, form field, edit dialog, edit toggle | `app/admin/**` **with** `<Dialog` / `FormField` / `<Field` / create-or-edit form content |
| `.claude/standards/portal.md` | Portal consistency, portal navigation, Empty State Contract, fetch error-handling contract | `app/teacher/**`, `app/parent/**`, `app/**/layout.tsx`, `components/{teacher,parent}/**`, `lib/format.ts` |
| `.claude/standards/api.md` | GET list pagination contract, mutation shape | `app/api/**`, `lib/validations/**`, `middleware.ts` |
| `.claude/standards/security.md` | API route checklist, data-access roles table, new-route security checklist | `app/api/**`, `lib/auth*`, `middleware.ts` |
| `.claude/standards/colors.md` | Color Standard + Brand tokens | `app/globals.css`, `tailwind.config.*`, `bg-status-*` / `text-status-*` className edits, or files containing arbitrary-color classNames `text-[#…]` / `bg-[#…]` / `border-[#…]` |

The table above is the breadcrumb — former top-level sections (UI Standards, CRUD Standard, Portal Consistency Standard, API Standards, Security, Color Standard + Brand) now live in the listed files.

---

## File Structure

```
app/admin/          22 admin pages
app/teacher/        6 teacher pages
app/parent/         4 parent pages
app/api/            69 API routes (organized by domain)
components/ui/      62 Shadcn components (full library)
config/             Nav config, app constants
lib/                Business logic, utilities, API helpers
lib/api/            Shared pagination, validation, response
lib/validations/    Zod schemas per domain
lib/payroll/        Payroll calculation engine
lib/xendit/         Xendit API client
lib/email/          Resend integration
prisma/             Schema + seed data
docs/cycles/        One markdown file per development cycle
.claude/skills/     Project slash commands (spec/, build/, ship/ — each a SKILL.md)
.claude/standards/  Domain standards loaded on demand by /build
.githooks/          Pre-commit, prepare-commit-msg, pre-push hooks
scripts/            check-role.sh, install-hooks.sh
```

E2E specs: `e2e/admin.spec.ts` (9), `e2e/teacher.spec.ts` (5), `e2e/parent.spec.ts` (6). Demo-mode auth — no live Supabase or env vars needed locally. Lint: `npm run lint`.

## Key Documents

| Doc | Purpose | Updated |
|-----|---------|---------|
| `README.md` | Project map: modules, CRUD status, roadmap, ADRs, workflow, setup | Every cycle |
| `CLAUDE.md` | This file — AI operating manual (workflow + safety rules) | When workflow, safety, or one-file-per-cycle rules change |
| `.claude/standards/*.md` | On-demand reference loaded by `/build` (ui, crud, portal, api, security, colors) | When a standard itself needs correction |
| `docs/cycles/YYYY-MM-DD-<slug>.md` | One per cycle — Context / Spec / Tasks / Implementation / Verification / Ship Notes | Created by `/spec`, updated by `/build` and `/ship` |
| `.claude/personas/*.md` | Fixed UAT personas (Pak Budi, Bu Sari, Ibu Nur) — device, context, frustrations, give-up triggers | Rarely — personas are stable |
| `docs/uat/jobs/*.md` | Per-portal Jobs-to-be-Done library — maintained by `/build` when user-facing capability changes | Each cycle that touches portal UX |
| `docs/uat/reports/*.md` | UAT reports (gitignored) — produced by `/uat`, consumed by `/spec` | On demand |

**Last updated:** 2026-04-20 (standards split — domain reference moved to `.claude/standards/*.md`, loaded on demand by `/build`).
