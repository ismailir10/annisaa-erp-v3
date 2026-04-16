---
name: uat
description: Standalone heuristic UAT. Role-play as a fixed persona (Pak Budi, Bu Sari, or Ibu Nur) and drive scripted Jobs-to-be-Done through the app via Playwright MCP, measuring page/API/click-to-visible timings against strict thresholds. Produces a severity-gated report at docs/uat/reports/YYYY-MM-DD-<area>.md. Not part of the 3-step /spec → /build → /ship loop; run on demand when you want a synthetic first-pass on UX friction and performance in a specific area. Folds in browser-testing-with-devtools and performance-optimization from the upstream agent-skills plugin.
disable-model-invocation: true
---

# /uat — heuristic user-acceptance testing via persona role-play

You are running a synthetic UAT pass on the school ERP. You role-play a fixed persona, execute scripted Jobs-to-be-Done through Playwright MCP, measure real timings, and produce one report.

**This is heuristic, not real UAT.** An LLM persona cannot replicate thumb reach, sunlight glare, emotional distrust, or network conditions on a 4-year-old phone in Bekasi traffic. The report is a cheap first pass, not a substitute for putting the app in front of a real teacher or parent. Every report MUST include the heuristic disclaimer.

## Invocation

```
/uat <area>
```

Where `<area>` is a portal or portal subroute:
- `/uat parent` — all parent jobs
- `/uat parent/invoices` — only parent invoice jobs
- `/uat teacher/class-attendance` — one specific area
- `/uat admin/payroll` — one specific area

## Preflight

Run these checks in order. If any fails, stop and surface the error.

1. **Session role set?** Read `.claude/session-role`. If missing or stale (>12h), use `AskUserQuestion` to ask the user, then write the file. Do not proceed until it exists.
2. **Hooks installed?** Check `.githooks/.installed`. If missing, tell the user to run `scripts/install-hooks.sh`.
3. **Jobs file exists?** Resolve `<portal>` from `<area>` (e.g. `parent/invoices` → `parent`) and confirm `docs/uat/jobs/<portal>.md` exists. If not, tell the user to add it.
4. **Port 3000 free?** Run `lsof -ti:3000 || echo free`. If a server is already listening, stop and ask the user whether to kill it or pick a different port. Do not silently run against a dev server — the timings would be wrong.
5. **Playwright MCP available?** Confirm `mcp__plugin_playwright_playwright__*` tools are loadable. If not, tell the user to install the plugin.

## Step 1 — Select jobs

Read `docs/uat/jobs/<portal>.md`. Filter to jobs matching the requested area:
- `parent` → every job in the file
- `parent/invoices` → every job under `## Area: invoices`

**Cap: 6 jobs per run.** If more than 6 jobs match, pick the ones marked highest priority by the "Why this job matters" notes — drop the rest and record the skip in the report Summary.

## Step 2 — Load personas

For every persona referenced in the selected jobs, read `.claude/personas/<persona>.md` in full. Fold each persona file into your role-play context. When you execute a job, you ARE that persona — narrate what you see, feel, and notice in first person. Focus on the triggers in the persona's "What makes them give up" section.

## Step 3 — Spin up the server

```bash
DEMO_MODE=true npm run build
DEMO_MODE=true npm run start
```

Run in background. Wait up to 45 seconds for `curl -fs http://localhost:3000 > /dev/null` to return 0. If the wait times out, stop and report — do not proceed with a broken server.

## Step 4 — Run each job via Playwright MCP

For each selected job, in order:

### 4a. Inject the demo cookie
Reuse the cookie-injection pattern from `e2e/parent.spec.ts` or `e2e/teacher.spec.ts`. Example parent cookie via `browser_run_code`:
```js
async (page) => {
  await page.context().addCookies([{
    name: "school-erp-session",
    value: "u_rightjet",
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  }]);
}
```

### 4b. Role-play the job
- Read the job's "Steps (user intent, not UI clicks)".
- Execute each step via Playwright MCP (`browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, etc.).
- At every decision point, narrate in first person as the persona: "As Pak Budi, I see the home page but I don't immediately know where the invoices are. I'm looking for something red or the word 'overdue'. I don't see anything..."
- Take snapshots at each decision point.

### 4c. Measure timings

For every navigation, capture page timing via `browser_evaluate`:
```js
() => {
  const n = performance.getEntriesByType('navigation')[0];
  return {
    ttfb: n.responseStart - n.startTime,
    domContentLoaded: n.domContentLoadedEventEnd - n.startTime,
    fullLoad: n.loadEventEnd - n.startTime,
  };
}
```

For every data-loading action (list open, form submit), capture network requests via `browser_network_requests` and record the slowest relevant request duration.

For every click that should produce a visible result, measure wall clock from the click call to the moment the new state is visible via `browser_snapshot` polling.

### 4d. Score the job
Record: `completed` (yes/partial/no), severity of any friction (blocker/major/minor), observations, evidence.

### 4e. Promote timing breaches to findings
If any measured timing crosses the **major** or **blocker** threshold in the table below, it MUST appear as a finding in the main list with that severity — regardless of whether the persona "completed" the job. A page that loads in 5s is a blocker even if the button eventually works.

### 4f. Screenshots
Save screenshots under `docs/uat/reports/assets/<report-slug>/` only for findings at **blocker** or **major** severity. **Cap: 5 screenshots per report total.** Use `browser_take_screenshot` with explicit filename.

## Step 5 — Write the report

Path: `docs/uat/reports/$(date +%Y-%m-%d)-<area-slug>.md` (e.g. `2026-04-16-parent-invoices.md`). Reports are gitignored by default; a downstream `/spec` cycle that consumes this report is responsible for `git add -f` to stage it.

### Report schema (strict — skill prompt enforces this)

```markdown
# UAT Report — <area> — YYYY-MM-DD
> Persona(s): <persona names>
> Jobs run: N  •  Blockers: X  •  Majors: Y  •  Minors: Z
> Runtime: Mm Ss

## Summary
<3–5 honest sentences. No marketing language. If zero blockers and zero majors,
say "no significant issues" and stop. Do not pad.>

## Findings

### <JTBD-ID> — <Job title>
- **Persona:** <name>
- **Completed:** yes | partial | no
- **Severity:** blocker | major | minor
- **Observation:** <concrete first-person description of friction>
- **Evidence:** <assets/<slug>/<file>.png | console error | network request>
- **Suggestion:** <max 1 sentence for blocker/major; omit for minor>

**Performance**
| Action | Metric | Measured | Threshold | Verdict |
|---|---|---|---|---|
| <action> | <metric> | <value> | <tier> | <fine/minor/major/blocker> |

[repeat per job]

## Heuristic disclaimer
This is synthetic UAT. An LLM persona cannot replicate thumb reach, sunlight
glare, emotional distrust, or network conditions on a 4-year-old phone in
Bekasi traffic. Treat findings as a cheap first pass, not a substitute for
putting the app in front of a real teacher or parent.

## Suggested follow-up (include only if at least one blocker present)
Copy-paste to a new session to kick off a fix cycle:

/spec fix <one-line summary of the most severe blocker>

Context: UAT on <date> as <persona> surfaced a blocker on <JTBD-ID>.
<2-3 sentences of concrete observation copied from the finding>.
Full report: docs/uat/reports/<filename>.md

Constraints: <any constraint the finding implies, e.g. "must not increase
payment flow step count">
```

## Performance thresholds (non-negotiable)

| Metric | Fine | Minor | Major | Blocker |
|---|---|---|---|---|
| Page full load | <1.5s | 1.5–2.5s | 2.5–4s | >4s |
| API response (single request) | <500ms | 500ms–1s | 1–2s | >2s |
| Click-to-visible-result | <800ms | 800ms–1.5s | 1.5–3s | >3s |

These are strict for an Indonesian PAUD/TKIT context (mid-range Android + intermittent 4G). They intentionally overstate friction relative to desktop benchmarks because that is the actual deployment reality.

## Severity rules (non-negotiable)

- **blocker** — persona cannot complete the job at all, or a timing crossed the blocker threshold
- **major** — persona completes with real friction a reasonable user would complain about, or a timing crossed the major threshold
- **minor** — taste/polish; advisory only, **never flows to `/spec`**
- If a run finds zero blockers AND zero majors, write "no significant issues" in Summary and stop generating findings. **No padding.** Sycophancy is a failure mode here more than anywhere else.

## Step 6 — Stop the server

Kill the background server started in Step 3. Verify port 3000 is free.

## Step 7 — Print stdout summary

```
UAT: <area>
Jobs run: N (cap 6)
Blockers: X | Majors: Y | Minors: Z
Runtime: Mm Ss
Report: docs/uat/reports/YYYY-MM-DD-<area>.md
```

Do not print the report body to stdout — the user reads it from the file.

## Rules

- **Report is gitignored by default.** Do not `git add` it. A downstream `/spec` cycle that consumes this report is responsible for staging it via `git add -f` alongside its own cycle commit.
- **Cap 6 jobs per run, cap 5 screenshots per report.** If the run wants more, it is wrong. Stop and reconsider scope.
- **No padding.** If zero blockers + zero majors, the Findings section says "no significant issues" and nothing else.
- **Timing breaches are first-class findings.** Never bury a major/blocker timing in the Performance table alone.
- **Disclaimer is load-bearing.** Every report includes the heuristic disclaimer verbatim.
- **Never modify the app to make a job pass.** If a step fails, record it. Do not edit source.
- **Never touch the JTBD library from `/uat`.** Library updates are a `/build` responsibility, not a `/uat` side-effect.
