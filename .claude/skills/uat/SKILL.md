---
name: uat
description: Standalone heuristic UAT. Role-play as a fixed persona (Pak Budi, Bu Sari, or Ibu Nur) and drive scripted Jobs-to-be-Done through the app via Playwright MCP, measuring page/API/click-to-visible timings against strict thresholds. Produces a severity-gated report at docs/uat/reports/YYYY-MM-DD-<area>.md. Not part of the 3-step /spec → /build → /ship loop; run on demand when you want a synthetic first-pass on UX friction and performance in a specific area. Folds in browser-testing-with-devtools and performance-optimization from the upstream agent-skills plugin.
disable-model-invocation: true
---

# /uat — heuristic user-acceptance testing via persona role-play

You are running a synthetic UAT pass on the school ERP. You role-play a fixed persona, execute scripted Jobs-to-be-Done through Playwright MCP, measure real timings, and produce one report.

**This is heuristic, not real UAT.** An LLM persona cannot replicate thumb reach, sunlight glare, emotional distrust, or network conditions on a 4-year-old phone in Bekasi traffic. The report is a cheap first pass, not a substitute for putting the app in front of a real teacher or parent. Every report MUST include the heuristic disclaimer.

## Default target + accounts (staging mode)

**Default target (no flag needed):** `https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app`

Override only when the user explicitly asks (e.g. "run uat locally"). Running against staging exposes real Vercel cold-start, edge latency, and the real Supabase magic-link / Google OAuth flow — that is the honest proxy for production-user experience. A local `DEMO_MODE` build is the fallback, used only when staging is unreachable.

**Login accounts per role:**

| Role | Email | Default persona |
|---|---|---|
| Admin (`SUPER_ADMIN`) | `ismailir10@gmail.com` | Ibu Nur |
| Teacher (`TEACHER`) | `ismail10rabbanii@gmail.com` | Bu Sari |
| Parent (`GUARDIAN`) | `rightjet.hq@gmail.com` | Pak Budi |

All three must exist in the target DB with the correct role bindings. The three accounts are guaranteed by the baseline seeding flow owned separately; if a freshly-reset target is missing any of them, stop and surface the gap to the operator.

## Browser choice — Chrome MCP primary in staging mode

For staging runs use **Chrome MCP** (`mcp__Claude_in_Chrome__*`). It attaches to the operator's real Chrome profile and reuses the logged-in session for each account. The skill does not attempt programmatic login — Supabase magic link requires an email round-trip and Google OAuth requires interactive consent; expect the operator to be pre-signed-in in separate Chrome profiles (one per role).

Preflight the session: navigate to the portal root (`/admin`, `/teacher`, `/parent`) and use `read_page` / `get_page_text` to confirm the signed-in email matches the expected account for the area. Stop and ask the operator to switch profiles if it does not.

For local fallback runs (`DEMO_MODE=true npm run start`) Playwright MCP remains the runner — the demo-cookie pattern below still applies there.

## Invocation

```
/uat <area>
```

Where `<area>` is a portal or portal subroute:
- `/uat parent` — all parent jobs
- `/uat parent/invoices` — only parent invoice jobs
- `/uat teacher/class-attendance` — one specific area
- `/uat admin/payroll` — one specific area

### Admin area-group invocation

Admin has 17+ JTBDs across five navigation groups in `config/admin-nav.ts`. Running `/uat admin` alone would blow past the 6-job cap and silently drop two-thirds of coverage. Use the group sub-invocations to get full coverage across multiple runs:

| Invocation | Covers JTBDs in groups | Notes |
|---|---|---|
| `/uat admin/hr` | HR (employees, attendance, leave, payroll) | Run when touching HR flows; payroll/salary jobs require SUPER_ADMIN. |
| `/uat admin/academic` | Akademik (students, student-attendance, admissions, academic years, guardians, teaching-assignments) | Broadest group — may still cap at 6. |
| `/uat admin/finance` | Keuangan (invoices, fees) | Smallest group; pair with `/uat admin/hr` if you want finance + payroll together. |
| `/uat admin/penilaian` | Penilaian (assessments, templates, scores) | Low-frequency but high-stakes; run end-of-term. |
| `/uat admin/settings` | Pengaturan (holidays, users, campuses, roles, salary-components) | Run when touching config/infra. |

`/uat admin` (no group) is still valid but will cap at 6 jobs — prefer the group form when you want honest coverage.

## Preflight

Run these checks in order. If any fails, stop and surface the error.

1. **Session role set?** Read `.claude/session-role`. If missing or stale (>12h), use `AskUserQuestion` to ask the user, then write the file. Do not proceed until it exists.
2. **Hooks installed?** Check `.githooks/.installed`. If missing, tell the user to run `scripts/install-hooks.sh`.
3. **Demo DB seeded?** `POST /api/admin/seed` must have been run since the last DB reset. Without it, invoices/payments/admissions are absent and UAT findings may reflect seed gaps rather than product bugs.
   - Check by calling `GET /api/admin/seed-status` if it exists, OR look for sentinel data (e.g. `INV-2026-0001` in the invoices list). If uncertain, call `POST /api/admin/seed` now.
   - **Why this matters:** `prisma/seed.ts` (run by CI Playwright) creates only minimal academic data — no invoices, payments, or Xendit links. The richer admin seed (`POST /api/admin/seed`) is what UAT needs. Skipping this step caused INV-UAT-BLOCKER-01 on 2026-04-17 to be misclassified as a product bug when it was a seed artifact.
4. **Jobs file exists?** Resolve `<portal>` from `<area>` (e.g. `parent/invoices` → `parent`) and confirm `docs/uat/jobs/<portal>.md` exists. If not, tell the user to add it.
5. **Jobs file fresh?** Read the `> Last audited: YYYY-MM-DD` line at the top of the jobs file. If it is >60 days old, print a non-blocking warning before proceeding:
   > ⚠️  `docs/uat/jobs/<portal>.md` was last audited on YYYY-MM-DD (N days ago). The JTBD library may have drifted behind shipped capabilities. Consider running a docs-only enrichment cycle before trusting the run's coverage claim.

   This is a warning, not a blocker — the run continues. But it must appear in the final stdout summary too, so the user is reminded at the end.
6. **Port 3000 free?** Run `lsof -ti:3000 || echo free`. If a server is already listening, stop and ask the user whether to kill it or pick a different port. Do not silently run against a dev server — the timings would be wrong.
7. **Playwright MCP available?** Confirm `mcp__plugin_playwright_playwright__*` tools are loadable. If not, tell the user to install the plugin.
8. **Scenario prep?** Some areas need cross-role state staged before a single-persona run can exercise a JTBD end-to-end (e.g. parent cannot pay an invoice unless the invoice row has a Xendit URL, which only admin-side code produces). If the requested `<area>` matches the table below, call `POST /api/admin/uat-prep` with the scenario key **before** starting jobs. The endpoint is SUPER_ADMIN-only and idempotent — safe to call every run.

   | Area | Scenario key | What it stages |
   |---|---|---|
   | `parent`, `parent/invoices` | `parent-payment` | Backfills Xendit payment URLs on every SENT/PARTIALLY_PAID/OVERDUE invoice missing one, so the Bayar CTA renders. |

   New scenarios live in `lib/uat/scenarios.ts` — add a row here whenever a new key is registered. If a scenario returns `{ ok: false }` or throws, stop and surface the error as a preflight failure; the UAT findings would otherwise misattribute the state gap to a product bug.

## Step 1 — Select jobs

Read `docs/uat/jobs/<portal>.md`. Filter to jobs matching the requested area:
- `parent` → every job in the file
- `parent/invoices` → every job under `## Area: invoices`

**Cap: 6 jobs per run.** If more than 6 jobs match, pick the ones marked highest priority by the "Why this job matters" notes — drop the rest and record the skip in the report Summary.

### Role routing (admin jobs only)

Admin JTBDs declare a `Role:` field with one of three values:

| `Role:` value | Persona / seed user | Cookie value |
|---|---|---|
| `SUPER_ADMIN` | Ibu Nur (`.claude/personas/ibu-nur.md`) | existing super-admin demo cookie |
| `SCHOOL_ADMIN` | **Deferred to `role-split` cycle.** Bu Lina persona not yet created. | n/a |
| `either` | Run as Ibu Nur by default | existing super-admin demo cookie |

Rules:
- **`SUPER_ADMIN` or `either`** → run the job.
- **`SCHOOL_ADMIN`-only** → skip with note "deferred: Bu Lina persona pending role-split cycle" in the report Summary. Do not try to fake it by running as Ibu Nur — the access pattern is different and the finding would be misleading.
- **Missing `Role:` field** → treat as `SUPER_ADMIN` for now and flag the missing metadata as a minor finding.

### Negative-access grading rule

Some deferred admin JTBDs (explicitly tagged in the Appendix as "negative-access" — e.g. "Bu Lina MUST NOT see salary amounts") are testing the *absence* of a capability, not a timing. For these, performance thresholds do not apply. Grade as follows:

- **Expected 403 received** → job passes. Record as `completed: yes`, no severity.
- **Expected 403 but got 200 with data** → `completed: no`, severity **blocker** (security regression). Performance table omitted.
- **Expected 403 but got 500** → `completed: partial`, severity **major**. Note the stack trace location.

Do not put these jobs through the page-load / API-response / click-to-visible tables — those thresholds are meaningless for a route the persona should never reach.

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

**Per-job `Expected perf` takes precedence over the global threshold table.** If a JTBD declares e.g. `Expected perf: save click-to-confirm <800ms`, use that specific budget instead of the generic click-to-visible tier below. The global table in "Performance thresholds" remains the fallback for any action the job does not budget explicitly. When a per-job budget is breached, it is automatically at least **major** severity (use the magnitude — 2× over = blocker, 1.2× over = major, within 20% = minor).

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
[if staleness warning tripped at preflight step 5, repeat it here]
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
