# UAT command + Jobs-to-be-Done library + /spec integration

## Context

Our existing gates (`vitest`, Playwright functional smoke) prove the app works — they don't tell us whether it *feels* right. A parent trying to pay an invoice on a 4-year-old Android phone may complete the flow and still hate every second of it, and we get zero signal today. We also have no living product artifact that answers "what can a user actually do in the system right now?" — that knowledge is scattered across 18 cycle docs. And initial user feedback says the app "feels slow even at low user counts", which nothing in our current gates catches.

This cycle introduces three linked pieces plus a small workflow fix:

1. **A Jobs-to-be-Done library** (`docs/uat/jobs/`) — per-portal catalog of user tasks, maintained each cycle when user-facing capability changes.
2. **A standalone `/uat <area>` command** — runs a fixed persona through scripted jobs via Playwright MCP, measures page/API/click-to-visible timings against strict thresholds, produces a severity-gated report.
3. **`/spec` integration** — spec skill reads the latest relevant UAT report and surfaces blocker/major findings into the cycle doc's Context, with a 60-day staleness rule.
4. **Branch hygiene preflight in `/spec`** — root-cause fix for a conflict we just hit: the main checkout was left with uncommitted work on `staging` from a parallel session. `/spec` will refuse to start a cycle while on `staging`/`main` with a dirty tree, and auto-create `feat/<slug>` from `origin/staging` when the tree is clean.

Full design rationale (including all locked decisions on runner choice, commit policy, staleness rule, performance thresholds, auto-drafted follow-up prompts, and deferred salary-403 personas) lives in `/Users/ismailrabbanii/.claude/plans/lovely-knitting-sloth.md` — treat that plan as the source of truth for anything not explicit here.

## Spec

### Acceptance criteria

- [ ] `docs/uat/jobs/{admin,teacher,parent}.md` exist, each in the strict JTBD format, seeded with 12 jobs total (3 parent, 3 teacher, 6 admin including one payroll job tagged `persona: ibu-nur`)
- [ ] `.claude/personas/{bu-sari,pak-budi,ibu-nur}.md` exist, each under 40 lines, each defining device/context/goals/frustrations/give-up triggers
- [ ] `.claude/skills/uat/SKILL.md` exists and implements all 8 steps from the plan (preflight → select → load personas → spin up server → run via Playwright MCP with timing capture → write report → stop server → stdout summary)
- [ ] `/uat <area>` can be invoked and produces `docs/uat/reports/YYYY-MM-DD-<area>.md` matching the schema (Findings with severity, Performance table with measured numbers, heuristic disclaimer, auto-drafted `/spec` follow-up prompt if any blockers)
- [ ] Performance thresholds are enforced: page full load >4s = blocker, API >2s = blocker, click-to-visible >3s = blocker (with minor/major tiers per the plan)
- [ ] Reports are gitignored by default (`docs/uat/reports/` in `.gitignore`); personas and jobs library stay tracked
- [ ] `.claude/skills/spec/SKILL.md` preflight refuses to start a cycle when current branch is `staging` or `main` with a dirty working tree; when clean, it auto-creates `feat/<slug>` from `origin/staging`
- [ ] `.claude/skills/spec/SKILL.md` step 2 reads `docs/uat/reports/`, applies the 60-day staleness rule, and surfaces blocker/major findings into the new cycle's Context
- [ ] `.claude/skills/build/SKILL.md` has a JTBD-maintenance bullet in the after-each-task checklist
- [ ] `.claude/skills/ship/SKILL.md` has a JTBD-freshness checkbox in the preflight list
- [ ] `CLAUDE.md` has a new "Standalone: `/uat`" subsection, Key Documents table rows for personas/jobs/reports, and a bumped "Last updated" footer
- [ ] `README.md` mentions `/uat` in one line
- [ ] Between-task gate (`npm run build && npx vitest run`) passes before every commit; end-of-cycle gate adds Playwright
- [ ] Smoke run: `/uat parent/invoices` produces a real report with a populated Performance table containing at least one actual timing breach (if zero breaches, the measurement is broken — investigate)
- [ ] `/spec` integration smoke: running `/spec 'improve parent invoice flow'` after the smoke run surfaces the report's blocker/major findings into the new cycle's Context and stages the report via `git add -f`

### Non-goals

- No CI integration of `/uat` — on-demand only
- No multi-browser coverage — Chromium only
- No automated JTBD linting (discipline only, no hook enforcement)
- No 4th admin persona (Bu Lina / regular SCHOOL_ADMIN) or salary-403 variant jobs — deferred until the parallel `role-split` cycle merges and we can wire against real roles
- No seed data enrichment — if seed is too thin for a job, note it in the first report as a follow-up
- No mobile network throttling via CDP — blunt localhost canary first, throttling later if the numbers don't tell us enough
- No alignment work on the upstream `agent-skills:spec-driven-development` skill (the SPEC.md trap) — handled by discipline, revisit only if it bites us again

### Assumptions I'm making

1. **Playwright MCP is installed and working.** The plan assumes `mcp__plugin_playwright_playwright__*` tools are available at runtime. Haven't verified in this session. If the MCP isn't ready, Task 2 blocks on installing it.
2. **Demo seed has enough data for 3 parent jobs + 3 teacher jobs + 6 admin jobs.** Specifically: ≥1 unpaid parent invoice, ≥1 class the seed teacher owns, ≥1 employee to deactivate, ≥1 leave request to approve. If not, the first report documents the gap as minor findings and we enrich seed in a follow-up.
3. **`DEMO_MODE=true npm run build && npm run start` is the right invocation** and doesn't clash with a dev server the user may have running. Skill will check port 3000 first and refuse if already occupied.
4. **Branch hygiene fix does not need to apply to `/build` or `/ship`** — the conflict only surfaces at cycle start, so preflight on `/spec` is enough.
5. **CTO sessions can create local feat branches without approval** — no interactive confirmation for the auto-branch step, just a stdout line telling the user what happened.

→ Correct me now or `/build` will proceed with these.

## Tasks

Each task is commit-sized. Between-task gate (`npm run build && npx vitest run`) must pass before committing. Order matters: Task 1 is pure data, Task 2 is the big skill definition, Task 3 wires the workflow fix, Task 4 wires integration, Task 5 is doc sync, Task 6 is the end-to-end smoke.

- [x] **Task 1 — JTBD library + personas + gitignore**
  - Create `.claude/personas/{bu-sari,pak-budi,ibu-nur}.md` (under 40 lines each, device/context/goals/frustrations/give-up triggers)
  - Create `docs/uat/jobs/{admin,teacher,parent}.md` with the strict JTBD template, seeded with 12 jobs per plan (3 parent + 3 teacher + 6 admin, one payroll job tagged for Ibu Nur with a follow-up note referencing the future Bu Lina persona)
  - Add `docs/uat/reports/` to `.gitignore`
  - **Acceptance:** all 6 new markdown files exist, gitignore entry in place, `git status` shows personas + jobs tracked but reports ignored; `npm run build && npx vitest run` green.

- [x] **Task 2 — `/uat` skill definition**
  - Create `.claude/skills/uat/SKILL.md` (~120 lines) implementing the 8 steps from the plan
  - Embed the full report schema, performance thresholds table, severity rules, and auto-drafted `/spec` follow-up template
  - Preflight must reuse `scripts/check-role.sh` pattern and check port 3000 before spinning up the server
  - Skill prompt must be explicit that major/blocker timing breaches are promoted to Findings regardless of job completion status
  - **Acceptance:** file exists, all 8 steps and the 3 report sub-sections (Findings/Performance/Follow-up) are present, severity rules and thresholds table are embedded verbatim from the plan; `npm run build && npx vitest run` green.

- [x] **Task 3 — `/spec` branch hygiene preflight (workflow fix)**
  - Edit `.claude/skills/spec/SKILL.md` preflight to add a new check: detect current branch via `git branch --show-current`, and working tree state via `git status --porcelain`
  - Refuse to proceed if on `staging` or `main` with a dirty tree (print a clear error with instructions to stash or resolve)
  - When on `staging`/`main` with a clean tree, auto-run `git fetch origin staging && git checkout -b feat/<slug> origin/staging` and confirm to the user via stdout
  - When already on `feat/*`, proceed silently
  - **Acceptance:** preflight section in spec SKILL.md has the new check documented; `npm run build && npx vitest run` green.

- [ ] **Task 4 — `/spec` UAT integration + `/build` maintenance + `/ship` preflight**
  - Edit `.claude/skills/spec/SKILL.md` step 2 to add the UAT-report read step with the 60-day staleness rule (and `git add -f` when staging a consumed report)
  - Edit `.claude/skills/build/SKILL.md` after-each-task checklist to add the JTBD maintenance bullet
  - Edit `.claude/skills/ship/SKILL.md` preflight to add the JTBD freshness checkbox
  - **Acceptance:** all three skill files updated, each diff is <15 lines; `npm run build && npx vitest run` green.

- [ ] **Task 5 — `CLAUDE.md` + `README.md` doc sync**
  - `CLAUDE.md`: new "Standalone: `/uat`" subsection under Development Workflow, Key Documents table rows for `.claude/personas/*`, `docs/uat/jobs/*`, `docs/uat/reports/*`, bump "Last updated" footer
  - `README.md`: one-line mention of `/uat` under workflow section
  - **Acceptance:** both files touched, CLAUDE.md subsection explicitly frames `/uat` as heuristic (not a substitute for real UAT), pre-commit doc-sync rule passes; `npm run build && npx vitest run` green.

- [ ] **Task 6 — End-to-cycle gates + smoke run + Implementation/Verification sections**
  - Run end-of-cycle gate: `npm run build && npx vitest run && npx playwright test`
  - Smoke-run `/uat parent/invoices` end-to-end, verify: schema matches, Performance table has real numbers, at least one finding (expected given user feedback on load times), disclaimer present, auto-drafted follow-up prompt present if blockers
  - `git status` confirms the report is gitignored
  - Smoke-run `/spec 'improve parent invoice flow'` end-to-end, verify: new cycle doc references the report in Context, report gets staged via `git add -f` alongside the new cycle doc — then **abort that spec cycle** (delete the scratch cycle doc + unstage) so we don't leave a half-spec hanging
  - Fill `## Implementation` (per-task files touched + one-line summary) and `## Verification` (gate output, smoke results, screenshot refs if any) in this cycle doc
  - **Acceptance:** end-of-cycle gate green, smoke outputs captured in Verification section, both Implementation and Verification sections filled; ready for `/ship`.

## Implementation

**Task 1 — JTBD library + personas + gitignore** (commit `529ce32`)
- `.claude/personas/{pak-budi,bu-sari,ibu-nur}.md` — three fixed personas under 40 lines each
- `docs/uat/jobs/{parent,teacher,admin}.md` — 12 JTBDs seeded (3+3+6); payroll job tagged `persona: ibu-nur` with follow-up note for future Bu Lina variant
- `.gitignore` — added `docs/uat/reports/` so reports stay untracked until a consuming cycle does `git add -f`
- Recovery note: this commit survived two parallel-session branch stomps on the main checkout; final resolution moved this branch into an isolated worktree at `.worktrees/uat` so no further races are possible

**Task 2 — `/uat` skill definition** (this commit)
- `.claude/skills/uat/SKILL.md` — 201-line skill implementing all 7 steps: preflight (role/hooks/jobs/port/MCP), job selection with 6-cap, persona load, demo-mode server spin-up, per-job Playwright MCP role-play with timing capture (`browser_evaluate` navigation timing, `browser_network_requests` API duration, snapshot-poll click-to-visible), report write, server stop, stdout summary
- Embeds report schema, performance thresholds table (page load/API/click-to-visible across fine/minor/major/blocker), severity rules, and the auto-drafted `/spec` follow-up template verbatim from the plan
- `disable-model-invocation: true` so the skill only fires on explicit `/uat` invocation, never model-autoinvoked
- Rules section locks: no-padding, timing breaches are first-class findings, disclaimer is load-bearing, never modify app to make a job pass, never touch the JTBD library from `/uat`

**Task 3 — `/spec` branch hygiene preflight** (this commit)
- `.claude/skills/spec/SKILL.md` — added preflight check #4 (branch hygiene): refuse to start a cycle on `staging`/`main` with dirty tree, auto-create `feat/<slug>` from `origin/staging` when clean, pass silently on `feat/*`, warn on other branches
- Root-cause fix for the parallel-session conflict that stomped this branch twice in the main checkout

## Verification

<filled by /build>

## Ship Notes

<filled by /ship>
