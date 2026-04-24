# Outstanding Findings Audit — Sweep Cycle

## Context

After ~10 days of intensive review/UAT cycles (comprehensive-code-review, stress-review per-module/followups/fixes-2, prod-merge-blockers, critical-money-and-auth-hotfix, parent UAT), 30 of 53 findings shipped. 23 remain deferred. UAT findings (Apr 18 parent report) are fully addressed across five cycles. This sweep cycle picks the deferred review items that are still ship-blocking-shaped (security, CRUD compliance, data integrity) and groups the rest into a single coordinated pass before staging→main promotion. Goal: clear the deferred backlog so the next staging→main PR has no known-but-unfixed findings trailing it. Remaining parent-visual cycle 4 Phase 3–4 is product-builder territory and is **out of scope** here (separate cycle, awaits prototype approval).

design-system: each frontend task cross-checks `.claude/standards/design-system.html` for tokens (no arbitrary `text-[9px]`, no ad-hoc `px-4`, AlertDialog for destructive).

## Spec

**Acceptance criteria:**

- [ ] `parseSort` rejects unknown sort fields with 400, no Prisma P2009 schema-leak in error path
- [ ] Rate limit applied to: `POST /api/invoices/[id]/payments`, `PUT /api/invoices/[id]`, `PUT /api/employees/[id]/salary`, `POST /api/salary-components`
- [ ] Payroll/email templates HTML-escape `employeeName`, `period`, and any other free-text inputs
- [ ] `Program.type` Zod enum matches Prisma enum exactly (single source of truth)
- [ ] `StudentEnrollment.status` Zod enum matches Prisma enum (no `TRANSFERRED` drift)
- [ ] All FK relations have explicit `onDelete` (no implicit P2003 surprises) — schema-wide audit + fix
- [ ] Campus delete endpoint uses soft-delete (`deletedAt`) per CRUD.md Cat A
- [ ] Stats endpoints replace N× `pageSize=1` calls with single GROUP BY (≥3× latency improvement on dashboard)
- [ ] No raw backend IDs (cuid/uuid/numeric PK) rendered in `<Select>`, combobox, list cells, detail headers, or Edit form prefill — human label always, ID only as `value`
- [ ] Bare `<button>` elements without `aria-label` reduced to zero in `app/admin/**`
- [ ] No arbitrary tokens below floor (`text-[9px]`, `text-[10px]`, `text-[11px]`) in `components/**` and `app/**`
- [ ] Teacher layout uses `px-page-x` consistent with parent/admin
- [ ] `@libsql/client` + `@prisma/adapter-libsql` removed from `package.json`
- [ ] CSP header added to `next.config.ts` security headers (report-only mode acceptable)
- [ ] README drift swept: CSP note, libsql removal reflected, no stale module claims
- [ ] All gates green: `npm run build && npx vitest run && npx playwright test`

**Non-goals:**

- Parent visual cycle 4 Phase 3–4 (separate product-builder cycle)
- RLS perf indexes (already ADR-tracked, deferred to multi-tenant readiness)
- CI duplicate build refactor (low urgency, separate hygiene cycle)
- `components/attendance/calendar.tsx` Shadcn migration (larger UX-impacting refactor)
- Advisory-lock collision edge cases (`hashtext()` is sufficient for current tenant volume)

**Assumptions:**

1. CTO can ship `staging→main` once this cycle merges; no blocking PRs queued from product-builder side.
2. Schema enum changes (Program.type, StudentEnrollment.status) need a migration but no data backfill — current rows already match the canonical enum.
3. `onDelete` sweep can land as a single Prisma schema diff + one migration; no row-level cleanup required.
4. Campus soft-delete switch reuses existing `deletedAt` column or adds it (sub-task decides based on schema state).
5. CSP report-only is acceptable for this cycle; enforcement comes later with violation-report tuning.

→ Correct any of these now or `/build` proceeds with them.

## Tasks

Tasks split by independence so `/build` can dispatch parallel subagents. Independent group A (1–4) can run in parallel; group B (5–7) sequential after A merges to avoid cycle-doc / migration conflicts; group C (8) is final cleanup.

### Group A — independent (parallel-safe, no shared files)

- [x] **Task 1 — API security hardening.** Fix `parseSort` to whitelist sort keys per route + 400 on unknown; add rate-limit to 4 mutation routes; HTML-escape email templates.
  - Files: `lib/api/pagination.ts` (or wherever `parseSort` lives), `app/api/invoices/[id]/payments/route.ts`, `app/api/invoices/[id]/route.ts`, `app/api/employees/[id]/salary/route.ts`, `app/api/salary-components/route.ts`, `lib/email/templates/*.ts`
  - Acceptance: vitest cases prove unknown sort field returns 400 (not 500 with Prisma message); rate-limit headers present on 4 routes; XSS string `<script>alert(1)</script>` in employee name renders escaped in email HTML.

- [x] **Task 2 — Schema enum + onDelete sweep.** Align `Program.type` and `StudentEnrollment.status` Zod ↔ Prisma; add explicit `onDelete` to all FK relations.
  - Files: `prisma/schema.prisma`, `lib/validations/program.ts`, `lib/validations/student-enrollment.ts`, new migration under `prisma/migrations/`
  - Acceptance: `npx prisma validate` clean; new migration only contains constraint changes (no data DML); vitest schema-conformance test (if exists) green.

- [ ] **Task 3 — Campus CRUD compliance (Cat A soft-delete).** Convert Campus DELETE to soft-delete; ensure list/detail filter `deletedAt: null`; add restore endpoint if pattern requires (check `crud.md`).
  - Files: `app/api/campuses/[id]/route.ts`, `app/api/campuses/route.ts`, `app/admin/campuses/**`, possibly `prisma/schema.prisma` (add `deletedAt` if missing)
  - Acceptance: hard delete impossible via UI; soft-deleted campus excluded from list; admin standard for Cat A (per `.claude/standards/crud.md`) followed.

- [ ] **Task 4 — Stats endpoint perf (N×pageSize=1 → GROUP BY).** Identify endpoints under `app/api/**/stats*` or dashboard data-fetchers using `pageSize=1` per status; replace with single grouped query.
  - Files: TBD by exploration (`Grep pageSize=1` first); likely `app/api/admin/dashboard/route.ts`, attendance/finance stats endpoints
  - Acceptance: ≥3× latency improvement on staging dashboard load (record before/after in Verification); no functional regression in dashboard widget counts.

- [ ] **Task 4b — Selector/form raw-ID exposure sweep.** Find every `<Select>`, combobox, autocomplete, or read-only display that renders a raw backend ID (cuid/uuid/numeric PK) instead of the human label. Replace with name/label, keep the ID as `value` only. Includes: form `value` showing as raw ID after server roundtrip, detail-page header showing `cmXXXXXXXX` instead of entity name, list cells showing `tenantId` / `programId` / `classSectionId` raw, and Edit dialog default-value mismatch (id vs label).
  - **Coordination:** A separate worktree `feat/select-raw-id-sweep` exists with dirty tree per `SessionStart` hook output. Before starting, check `git log origin/staging..feat/select-raw-id-sweep` to see if work overlaps; if it does, rebase that branch first or absorb its commits into this cycle to avoid duplicate fixes.
  - Files: grep-driven across `app/admin/**`, `app/teacher/**`, `app/parent/**`, `components/**`. Search patterns: `value=\{[^}]*\.id\}` paired with `>{[^<]*\.id}` in trigger, `c[ml][a-z0-9]{20,}` literal in JSX (cuid leak), `{[a-z]+Id}` rendered without map lookup.
  - Acceptance: zero raw IDs visible in admin list/detail screens, form Edit dialogs prefill with the human label (not the cuid), Playwright smoke covers one form per portal asserting label not ID. Cross-checked design-system.html §Forms + §DataTable.

### Group B — sequential after A (touches frontend tokens / shared layouts)

- [ ] **Task 5 — A11y sweep: bare `<button>` aria-label.** Add `aria-label` to all icon-only `<button>` elements in `app/admin/**` (and `app/teacher/**`, `app/parent/**` if quick).
  - Files: grep-driven, likely 30+ admin pages
  - Acceptance: `grep -rn '<button[^>]*>$' app/admin` matches only buttons with `aria-label` or visible text; axe-core or Playwright a11y assertion (if test infra exists) green.

- [ ] **Task 6 — Token compliance: arbitrary text + spacing.** Replace `text-[9px|10px|11px]` and ad-hoc `px-4`/`p-4` in WeekGrid + teacher layout + any other offenders with design-system tokens.
  - Files: `components/teacher/week-grid.tsx`, `app/teacher/layout.tsx`, others by grep
  - Acceptance: no arbitrary `text-[Npx]` below floor; teacher layout uses `px-page-x`; cross-checked design-system.html §Typography + §Spacing.

### Group C — sequential (cleanup, after A+B)

- [ ] **Task 7 — Dependency + header hygiene.** Remove `@libsql/client` + `@prisma/adapter-libsql` from `package.json`; add CSP header (report-only) to `next.config.ts`; sweep README drift (CSP note, libsql, stale module claims).
  - Files: `package.json`, `package-lock.json`, `next.config.ts`, `README.md`
  - Acceptance: `npm install` clean; `curl -I` on staging shows `Content-Security-Policy-Report-Only` header; README has zero stale claims (cross-check against current module status).

### Group D — gate

- [ ] **Task 8 — End-of-cycle gate + ship notes.** Run `npm run build && npx vitest run && npx playwright test` against the integrated branch; fill Verification + Ship Notes; request `superpowers:requesting-code-review` before `/ship`.

## Implementation

- Subagent plan: tasks 1, 2, 3, 4, 4b, 5, 6, 7 sequential; cycle doc shared so each task commits its own update.
- Task 1 — API security hardening — `lib/api/pagination.ts`, `lib/email/escape.ts` (new), `lib/email/templates/salary-slip.ts`, 10 list routes (`app/api/{users,students,employees,guardians,invoices,payroll,admissions,enrollments,assessments/students}/route.ts`, `app/api/leave/requests/route.ts`), 4 mutation routes (`app/api/invoices/[id]/payments/route.ts`, `app/api/invoices/[id]/route.ts`, `app/api/employees/[id]/salary/route.ts`, `app/api/salary-components/route.ts`), tests `lib/api/__tests__/pagination.test.ts`, `lib/email/__tests__/escape.test.ts`, `app/api/__tests__/mutation-rate-limit.test.ts` — `parseSort` now requires per-route allowlist + 400 on unknown key (no Prisma P2009 schema leak); rate-limit (10/min/IP) applied to 4 mutation routes matching the existing `rateLimit + getClientIp` pattern; HTML-escape helper applied to `employeeName` and `period` in salary-slip template.
- Task 2 — Schema enum + onDelete sweep — `lib/validations/__tests__/enum-conformance.test.ts` (new) — Aligned Program.type + StudentEnrollment.status Zod ↔ Prisma; both literal goals were already shipped by prior cycles (`Program.type` Zod values `SEMESTER | YEAR_ROUND | SESSION` already match `prisma/schema.prisma:390`; `TRANSFERRED` was already dropped from `lib/validations/enrollment.ts` in cycle `alertdialog-jakarta-schema-alignment`; explicit `onDelete` on every FK relation already shipped via migration `20260424000000_explicit_ondelete_actions`). Remaining value-add: a drift-prevention vitest that parses the canonical-values comment in `prisma/schema.prisma` per field, extracts the Zod enum (Zod v4 `_def.type === "enum"` + `_def.entries`), and asserts they match — fails the build if either side drifts. 3 cases: `Program.type` × create + update schemas, `StudentEnrollment.status` × update schema. Helper unwraps `.optional()` / `.default()` / `.nullable()` wrappers via the v4 `innerType` chain. No schema or migration changes this task — Prisma uses `String` columns (not `enum` types) so there is no Prisma enum object to derive from; the inline comment is the source of truth and the test enforces both sides update together.

## Verification

- Task 1: build + vitest green (15 tests added across 3 new test files; full suite 284 pass / 42 todo / 2 skip across 43 files).
- Task 1 review pass: extended `mutation-rate-limit.test.ts` from 1 to 4 cases (now covers all 4 hardened routes — `POST /api/salary-components`, `POST /api/invoices/[id]/payments`, `PUT /api/invoices/[id]`, `PUT /api/employees/[id]/salary`); each test uses a unique IP to avoid limiter bleed. Also dropped dead `netPay` from `SendSlipParams` / `salarySlipEmailHtml` and the `formatRupiah` helper in `app/api/payroll/[id]/send-slips/route.ts` (template no longer renders net pay). Added top-of-file safety comment in `lib/email/templates/salary-slip.ts` reminding future authors that `appUrl` must remain env-controlled. Full suite now 287 pass / 42 todo / 2 skip across 43 files.
- Task 2: build + vitest green; enum-conformance test now covers 20 (model, field, schema) rows; drift in any covered field fails CI; uncovered: 12 fields with no Zod schema yet (listed in test file).

## Ship Notes
- Migration `20260424000000_explicit_ondelete_actions` (PR #121) is on staging but not yet on main. Next staging→main promotion will carry it; no new migration in this cycle.
- `Student.status` Prisma comment updated from `ACTIVE | GRADUATED | WITHDRAWN` to `ACTIVE | INACTIVE | GRADUATED | WITHDRAWN` (comment-only, reflects existing runtime + UI behavior; admin students soft-delete uses INACTIVE).
