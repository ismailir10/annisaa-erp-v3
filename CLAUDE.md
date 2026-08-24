# Talib (engineering id: `school-erp`) — Operating Manual

> Operating manual for AI development sessions. This file is the *how*; [README.md](./README.md) is the *what*. `AGENTS.md` is a **symlink to this file** — Codex and opencode read it, so one edit reaches every harness. Never edit `AGENTS.md` directly.
>
> **Rule of thumb for editing this file:** never hand-write a fact the code owns. Counts live in one generated block (bottom); `bash scripts/audit-docs.sh` fails CI if any doc drifts.

---

## The 3-Step Loop

One cycle = three commands and exactly **one** markdown file, `docs/cycles/YYYY-MM-DD-<slug>.md`:

```
/spec   →   /build   →   /ship
```

| Command | Owns | Full procedure |
|---|---|---|
| `/spec` | Creates the cycle doc: Context / Spec / Tasks. Surfaces assumptions before any code. | [`.claude/skills/spec/SKILL.md`](.claude/skills/spec/SKILL.md) |
| `/build` | Loops the Tasks one at a time: implement → between-task gate → review + simplify → update cycle doc → commit. One commit per task. After the last task: end-of-cycle gate, code review, Ship Notes. | [`.claude/skills/build/SKILL.md`](.claude/skills/build/SKILL.md) |
| `/ship` | `/audit-docs` preflight → PR `feat/*` → `staging` → preview-verify loop → merge (CTO) or hand off (product-builder). `--to-main` promotes staging → main. | [`.claude/skills/ship/SKILL.md`](.claude/skills/ship/SKILL.md) |

The skills are the source of truth for procedure. Below are only the rules that bind **outside** them.

**Non-negotiable ship rules:**
- **No direct pushes to `staging` or `main`, any role.** Use `/ship`.
- A CTO self-merges only when all four required checks are green **and** preview-verify is clean — never on red or pending.
- A product-builder never merges: its PR is labeled `needs-cto-review`.
- `/ship --to-main` merges with **`gh pr merge <n> --merge`**. A promotion must be a merge commit — a squash makes staging stop being an ancestor of main and the branches diverge permanently. This has cost us two reconciliations (#381, #465).
- Playwright status must be recorded in the cycle doc's Verification before `/ship`: a local pass, or an explicit deferral to the required CI `Playwright E2E` check.

### Canonical entry points

The user should never have to think about worktrees, hooks, or role files.

| Role | Entry sentence | What the assistant does automatically |
|------|----------------|----------------------------------------|
| Product builder | `you are product-builder, <request>` | Writes `.claude/session-role`, derives a slug, runs `setup-worktree.sh`, enters the worktree, runs `/spec` |
| CTO | `you are cto, <request>` | Writes `.claude/session-role`; sets up a worktree if a clean branch is wanted, else executes directly |

Invoke `/caveman` and `/using-superpowers` by default.

### Testing gates

| Gate | Command / mechanism | When |
|------|---------|------|
| Between-task | `npm run build && npx vitest run` | Before every commit during `/build` |
| End-of-cycle | the above **+** `npx playwright test` (local best-effort; harnesses that cannot run it defer to the required CI check) | After the last task |
| Preview-verify | `/ship` Step 3 — Chrome MCP walks the Vercel preview signed into the role-scoped Google account per portal | After the PR opens, before the merge |

**Why three tiers.** Playwright cold-spin is ~2 min, so running it between tasks adds 10+ min to a 5-task cycle. Keep the e2e suite lean and cross-module (auth shell, admin dashboard, students, invoices/payment, attendance, teacher daily, parent invoice/report, tenant boundaries) — prefer Vitest for business logic, permissions and validation. Preview-verify catches what CI cannot: OAuth, staging config, Vercel, layout. It complements the required check, never replaces it. **Pure-docs cycles may skip Playwright + preview-verify** — record each skip in Verification.

E2E runs against a production build (`DEMO_MODE=true npm run start`), Chromium-only, workers: 1.

**Vitest runs two projects.** `*.test.ts` → `node`, `*.test.tsx` → `jsdom` (a `.ts` suite that renders is named in `DOM_TS_SUITES` in `vitest.config.ts`). 224 of 287 suites never touch the DOM and jsdom construction cost ~2.8s each, which made the runner contend with itself and turned wall-clock ceilings into dice. Config owns the ceilings — `testTimeout` 30s, testing-library `asyncUtilTimeout` 5s — so **never add a per-test or per-suite `{ timeout: … }`**; if one is genuinely needed the global is wrong.

**A green run proves nothing about flakiness.** `bash scripts/flake-hunt.sh [runs] [cpu-hogs] [paths…]` re-runs the suite under deliberate oversubscription, which is what CI's 4 vCPUs do to three vitest forks. Reach for it whenever a test fails in CI and passes locally.

### Standalone commands

Neither is part of the loop; run on demand.

- **`/uat <area>`** — heuristic UAT. Role-plays a fixed persona through scripted Jobs-to-be-Done via Playwright MCP against strict mobile thresholds (page >4s, API >2s, click-to-visible >3s = blocker), writing `docs/uat/reports/YYYY-MM-DD-<area>.md`. `/spec` reads the latest relevant report (60-day staleness rule) into cycle Context. Heuristic, not real UAT — an LLM cannot replicate thumb reach or sunlight glare. Personas: `.claude/personas/`. Skill: [`.claude/skills/uat/SKILL.md`](.claude/skills/uat/SKILL.md).
- **`/audit-docs`** — thin wrapper over `bash scripts/audit-docs.sh`. See [Documentation Maintenance](#documentation-maintenance).

---

## Harness Roster & Model Tiering

Three harnesses work this repo in parallel, each in its own worktree, sharing one manual, one `scripts/` set, one `.githooks/` set, one branch-protection boundary. No harness has private rules.

| Harness | Default role | Driver (reasoning tier) | Dirty-work tier | Can down-tier? |
|---|---|---|---|---|
| **Claude** | cto | Opus 5 | Sonnet 5, Haiku 4.5 (trivial) | Yes — `Agent` tool with `model` override |
| **Codex** | cto | gpt-5.5 high reasoning | gpt-5.5 low / minimal | Yes — subagents at lower effort |
| **opencode** | product-builder | glm-5.2 | glm-5.2 (no cheaper tier) | No |

**opencode has never shipped a commit.** As of 2026-08-20 the last 220 commits are all `Role: cto` (`claude-opus-5` ×159, `gpt-5.5` ×42, `claude-sonnet-5` ×19). The product-builder path — `needs-cto-review`, the `/ship` hand-off, the PB entry row — is **specified but unexercised**. Treat it as untested; if opencode is still idle at the next roster review, delete the path rather than keep maintaining it.

### The expensive-driver rule

**The reasoning-tier driver never does cheap work, and never runs a cycle in a single context.** It decomposes, fans out one subagent per independent unit, then reasons only over the distilled findings.

| Driver does it itself | Driver MUST delegate |
|---|---|
| Architecture / ADR decisions | File reads, grep/glob sweeps, exploration |
| PR review + final sign-off | Per-module audits (one subagent each) |
| Spec synthesis + task decomposition | Mechanical edits, boilerplate, codemods |
| Resolving conflicts between subagent outputs | Test fixtures, doc-staleness scans |
| Anything where being wrong is expensive | Implementing a single pre-specced slice |

*Worked example — "audit UI across every module":* driver lists the modules, spawns one dirty-tier subagent per module in parallel, each returns findings, driver dedups and writes the fix spec. The driver read zero module files. That is the win. `/build`'s Planning step enforces it. opencode cannot down-tier, so it keeps cycles small and is gated by mandatory CTO review instead.

### Parallel harmony

- **Isolation:** every session gets its own worktree and its own gitignored `.claude/session-role`. No shared mutable state.
- **One canonical skill set:** edit `.claude/skills/*`. `scripts/link-agent-skills.sh` symlinks `.agents/skills/* → .claude/skills/*` so Codex reads the same file. Never hand-edit `.agents/skills/*`.
- **Symlinks point one way only: `.agents/skills/* → .claude/skills/*`.** Never commit a link in the other direction — 35 such links (`nextjs`, `vercel-cli`, `shadcn`, …) were committed in `6c8f892e` and dangled on every clone because `.agents/` is gitignored. Removed 2026-08-20. A skill not vendored into `.claude/skills/` belongs in `~/.claude`, not this repo.
- **CTOs (Claude, Codex)** own architecture, PR review, and `/ship --to-main`. opencode never makes architecture decisions and never self-approves.
- `sync-staging.sh` plus the >5-commits-behind preflight keep parallel branches close to `origin/staging`.

---

## Multi-LLM Safety

Other LLMs may work on this repo. Seven mechanisms:

**1. Supabase MCP defaults to staging.** `.claude/settings.json` pins the MCP server to `udbivhchbizpxoryejgz`. It pointed at production until 2026-08-20, making every unqualified `execute_sql` a prod write — one distracted session from repeating the 2026-07-25 data wipe. Production work is now deliberate: name the prod ref explicitly and say so in the cycle doc. Campus names differ per environment ("Taman Aster" vs "An Nisaa' Sekolahku Taman Aster"), so match campuses by `ILIKE`, never equality.

**2. Auto staging sync.** `scripts/sync-staging.sh` runs at `SessionStart`; fast-forwards the main checkout when it lags `origin/<branch>` (ff only; dirty tree → warn no-op; offline → silent). `/spec` and `/build` refuse to run if the `feat/*` branch is >5 commits behind `origin/staging`.

**3. Session role.** Every session declares itself on turn one in `.claude/session-role`:

```
role=cto             # cto or product-builder
model=claude-opus-5  # or gpt-5.5, glm-5.2, claude-sonnet-5, human — must match the current assistant
```

`scripts/check-role.sh` (both Claude's and Codex's `SessionStart` hook) reads and writes exactly this file — every harness uses it; the legacy `.codex/session-role` is a symlink to it. If missing or stale (>12h) the hook tells the assistant to ask. The three commands refuse to run until it is set. **No env var reads** — `CLAUDE_MODEL` is not reliably exported to subprocesses. **If the user's first message declares a role, rewrite the file immediately** with that role and your own model ID, even if it looks fresh. No "already set" exception.

**4. Worktree isolation.** Every session works in its own worktree; `check-role.sh` blocks the three commands until it is inside one. `setup-worktree.sh <slug>` does `git worktree add .worktrees/<slug> -b feat/<slug> origin/staging`, symlinks `.env`/`.env.local`/`node_modules`, and runs `install-hooks.sh`. Change deps inside a worktree → remove the `node_modules` symlink first, then `npm install`, then `npx prisma generate`. Recovery for `.claude/worktrees/<slug>` (which bypasses setup): `bash scripts/bootstrap-env-symlinks.sh`. Cleanup: `bash scripts/cleanup-merged.sh` (`--report` default, `--yes` to remove).

**5. Git hooks** (`scripts/install-hooks.sh` sets `core.hooksPath=.githooks`):

| Hook | Enforces |
|---|---|
| `pre-commit` | markdown allowlist; doc-sync (code change must stage a cycle doc / README / CLAUDE.md); seed drift; frontend gate (frontend diff needs `design-system` in the cycle doc); ADR cells ≤ 400 chars |
| `prepare-commit-msg` | appends `Model-Trailer:` + `Role:` from `.claude/session-role` |
| `commit-msg` | `^(feat\|perf)` + staged `app/**` or `lib/**` requires README staged (cycle doc alone insufficient) |
| `pre-push` | blocks direct pushes to `staging`/`main` for **all** roles including cto |

`scripts/test-hooks.sh` is the exact rule table and every test scenario — run it.

**6. GitHub branch protection — the real boundary.** Hooks can be bypassed with `--no-verify`; branch protection cannot. `staging` and `main` require a PR, allow no direct push (including the owner), and require four checks: `Docs sync`, `Lint, Typecheck & Test`, `Build`, `Playwright E2E`. **staging → main cadence:** every 2-4 merged cycles.

**7. Commit attribution.** Every commit carries `Model-Trailer:`, `Role:` and `Co-Authored-By:`, auto-appended by `prepare-commit-msg`. A commit that lands as `Model-Trailer: human` means the hook failed — surface it to the user.

### Dependency cadence

Branch protection also requires an **up-to-date head**, which interacts badly with dependabot: merging one bump re-stales every other open PR, so a queue of *n* needs *n* serial rebase + full-CI rounds. Eleven PRs sat frozen for a week over exactly this. Do not merge them one by one.

- **Minors + patches** — batch them. All versions in one branch, `npm install`, one end-of-cycle gate, PR as `chore(deps)`. Dependabot closes its own as superseded.
- **Majors** — one per cycle, never batched. Read the dependabot PR's CI first: red `Build` means real breakage, not a version string.
- **Cadence** — drain at each `/ship --to-main`, so nothing sits longer than 2-4 cycles.
- Security alerts are separate: `gh api repos/:owner/:repo/dependabot/alerts`.

---

## One-File-Per-Cycle Rule

Allowed markdown: root (`README.md`, `CLAUDE.md`, `AGENTS.md`, `LICENSE.md`, `CHANGELOG.md`, `CONTRIBUTING.md`), `docs/**`, `.github/**`, `.claude/**`, `.githooks/**`. Any other staged `.md` is rejected by `pre-commit`.

**Never create `SPEC.md`, `PLAN.md`, `TEST-REPORT.md`, `NOTES.md`.** Everything goes in the cycle doc's six sections:

```markdown
# <Cycle Title>
## Context        <!-- /spec: why -->
## Spec           <!-- /spec: acceptance criteria -->
## Tasks          <!-- /spec: ordered atomic tasks -->
## Implementation <!-- /build: per-task files + summary -->
## Verification   <!-- /build: gates + manual smoke -->
## Ship Notes     <!-- /ship: migrations, env vars, rollback -->
```

**`/ship` preflight:** gates green (or Playwright deferred/skipped with a recorded reason) · Verification filled · README updated if modules/routes/entities changed · Ship Notes filled · `bash scripts/audit-docs.sh` exits 0.

**Superpowers output redirect.** `superpowers:brainstorming` and `superpowers:writing-plans` default to writing `docs/superpowers/*`. The project rule overrides that — brainstorming goes to `## Context` + `## Spec`, writing-plans to `## Tasks`. Per that skill's own priority order, user instructions in CLAUDE.md win. Legacy files live in `docs/archive/superpowers-legacy/`.

---

## Documentation Maintenance

Every fact has exactly one owner; the other docs link.

| Document | Owns |
|---|---|
| **README.md** | **Public front page.** Product identity, stack, module one-liners, portals, setup. Budgeted: ≤ 120 lines, no line > 600 chars, enforced by `audit-docs.sh` |
| **CLAUDE.md** | Workflow, roster + tiering, safety, hooks, standards dispatch, doc maintenance, file structure |
| `.claude/standards/*.md` | Domain rules (UI / patterns / voice / CRUD / portal / API / security / colors) |
| `docs/cycles/*.md` | Per-cycle history, **current + previous month only** |
| `docs/cycles/archive/` | Every cycle doc older than that |
| `docs/adrs/archive.md` | ADRs > 60d or codified into CLAUDE.md / a standard |
| `docs/runbooks/*.md` | Operational procedure — reseed, prod incident, payments, email templates |
| `docs/uat/{jobs,reports}/` | UAT JTBD library and committed reports |
| `docs/archive/` | Retired docs of any shape |

**`docs/` holds exactly those five directories.** Anything else is drift: `docs/{findings,plans,proposals,qa,reports,reviews}/` each accumulated one to three files nobody owned and now live under `docs/archive/legacy-doc-dirs/`. A one-off write-up belongs in the cycle doc that produced it, not a new top-level directory. `audit-docs.sh` fails on a stray directory.

**Cycle archive rule.** Keep only the current and previous month at the top level; sweep the rest into `docs/cycles/archive/`. When you move one, fix every inbound reference — README, runbooks, and a surprising number of `lib/`, `app/api/` and `e2e/` comments cite cycle docs by path:

```bash
grep -rlE 'docs/cycles/2026-0X-' README.md docs scripts lib app e2e | grep -v node_modules
```

An archived doc is frozen: fix inbound links, never edit the body.

### How the docs stay true

Three layers, weakest to strongest:

1. **`pre-commit` + the `Docs sync` CI check (presence).** A code change must touch a cycle doc / README / CLAUDE.md. This proves *something* was written, not that it is correct — README and CLAUDE.md can rot while every PR is green. That is exactly how the drift of 2026-08-20 happened.
2. **`commit-msg` (narrow).** `^(feat|perf)` + staged `app/**` or `lib/**` requires README staged. `fix|refactor|chore|docs|test|style|build|ci|release` fall under layer 1 only; `Merge|Revert|fixup!|squash!|amend!` bypass.
3. **`bash scripts/audit-docs.sh` (truth).** Runs inside the required `Docs sync` check, so it gates the merge. Verifies: the generated counts block matches the tree; every standards file and `better-*` skill named here exists; every relative link in README + CLAUDE resolves; `docs/` has no stray directory; no tracked path is missing on disk; no `.env*` or `verify-accounts.json` is tracked; README stays inside its size budget. Warns (does not fail) on ADR rows past the 60-day window, since trimming is judgement.

`bash scripts/audit-docs.sh --write` regenerates the counts block. **Never hand-edit a number inside the generated markers** — the check compares against a fresh generation and fails on any difference.

---

## Standards (loaded on demand by `/build`)

`/build` Step 1 loads the **union** of every standard and `better-*` skill matching the task's files.

| File | Covers | Loaded when |
|---|---|---|
| `design-system.html` | **Canonical visual reference** — brand, colors, type, spacing, components, overlays, portal shells, voice | Any frontend change. Enforced by the frontend gate. |
| `parent-portal-cycle4.html` | Scratch parent-portal snapshot | Reference only, scope-locked, do not extend |
| `ui.md` | Shadcn-FIRST, DataTable + action column, spacing tokens, overlays | `components/**`, `app/*/page.tsx`, `lib/format.ts` |
| `patterns.md` | Page recipes — Admin List/Detail/Form, Portal Dashboard, Workflow Queue, Daily Data Entry | `app/*/page.tsx`, `app/**/client.tsx`, `components/{admin,teacher,parent,portal}/**` |
| `voice.md` | Voice & tone — 3 personas, Islamic courtesy layer, error/empty/success/destructive copy, glossary | Any user-facing copy diff |
| `crud.md` | ERPNext-inspired CRUD (Categories A/B/C), soft-delete, list/detail layouts, edit dialog | `app/admin/**` with a create-or-edit form |
| `portal.md` | Portal nav, Empty State Contract, fetch error contract, Household Overview, WeekGrid, cycle-tap attendance | `app/teacher/**`, `app/parent/**`, `components/{teacher,parent}/**` |
| `api.md` | GET list pagination, mutation shape | `app/api/**`, `lib/validations/**`, `proxy.ts` |
| `security.md` | API route checklist, data-access roles, new-route security | `app/api/**`, `lib/auth*`, `proxy.ts` |
| `colors.md` | Color tokens + brand | `app/globals.css`, `tailwind.config.*`, `bg-status-*` edits, arbitrary `#hex` classNames |

**Frontend gate (pre-commit).** Frontend diffs (`app/**/*.{tsx,css}`, `components/**/*.tsx`, `tailwind.config.*`) require the staged cycle doc to contain the literal token `design-system`. One Verification bullet satisfies it. Keeps the reference alive against silent drift.

### Interface-craft skills (vendored)

The standards above cover **this product**. General interface craft — focus rings, motion easing, OKLCH gamut, text wrapping, hit areas — comes from the vendored [`interfaces`](https://github.com/jakubkrehel/skills) collection (MIT; upstream sha in `.claude/skills/VENDORED.md`), checked in under `.claude/skills/better-*`.

| Skill | Covers | Load on |
|---|---|---|
| `better-ui` | Radius, shadows, borders, optical alignment, icons, motion restraint | `components/**`, any hover/focus/active/loading/empty state or motion diff |
| `better-typography` | Font loading, variable fonts, type scale, heading hierarchy, tabular numerals, `text-wrap`, truncation, iOS input zoom | Any text-styling diff; font config; table/number cells |
| `better-colors` | OKLCH, palettes, contrast, gamut/display-p3, semantic tokens, theming | `app/globals.css`, `tailwind.config.*` — **paired with `colors.md`** |
| `better-accessibility` | Focus + keyboard, focus traps, ARIA, form errors, screen readers, hit areas, `prefers-reduced-motion` | `components/ui/**`, any Dialog/Sheet/Popover/Menu, every form diff |
| `better-layout` | Grouping, alignment, negative space, reading order, progressive disclosure, breakpoints, safe area | `app/*/page.tsx`, `app/**/client.tsx`, `app/**/layout.tsx` — **paired with `patterns.md`** |
| `better-writing` | Button + link labels, error messages, empty states, placeholders, capitalization | Any user-facing copy diff — **paired with `voice.md`** |
| `better-interface` | Orchestrator only — cross-discipline review. User-invoked. | On demand; not auto-loaded |

**Precedence — the project standard wins.** These are craft *defaults*. On conflict: `.claude/standards/*` + `design-system.html` first, then the `better-*` principle. Shadcn-FIRST beats a hand-rolled component; Talib's brand tokens beat a generated OKLCH palette; `voice.md`'s Indonesian personas beat `better-writing`'s English examples. Reach for a `better-*` rule where the project standard is **silent**, never to contradict it. Do not hand-edit these — re-vendor from upstream.

---

## File Structure

```
app/{admin,teacher,parent}/   portal pages
app/api/                      route handlers, organised by domain
components/ui/                Shadcn components (+ __tests__)
lib/{api,validations,payroll,email}/   business logic, retry, integrations
lib/payments/                 PaymentGateway port + registry, with xendit/ and doku/ adapters
                              behind it; lib/xendit/* are thin re-export shims kept for
                              import-path compatibility
prisma/                       schema + seed
proxy.ts                      Next.js 16 middleware entry (renamed from middleware.ts)
e2e/                          Playwright specs
docs/{adrs,archive,cycles,runbooks,uat}/
.claude/{skills,standards,personas}/   project skills + vendored better-*, standards, personas
.githooks/                    pre-commit, prepare-commit-msg, commit-msg, pre-push
scripts/                      audit-docs, setup-worktree, install-hooks, link-agent-skills,
                              sync-staging, cleanup-merged, check-role, test-hooks, reseed-staging,
                              flake-hunt, verify-{rls-coverage,api-auth,curriculum-readiness}
```

<!-- generated:counts — regenerate with `bash scripts/audit-docs.sh --write` -->
| Surface | Count |
|---|---|
| `app/api/**/route.ts` | 194 |
| `app/admin` pages | 41 |
| `app/teacher` pages | 13 |
| `app/parent` pages | 8 |
| `components/ui/*.tsx` | 65 |
| `e2e/*.spec.ts` | 34 |
| `.claude/standards/*` | 10 |
| `docs/cycles` active / archived | 30 / 233 |
<!-- /generated:counts -->

Demo-mode auth means E2E and local dev need no live Supabase. Lint: `npm run lint`.
