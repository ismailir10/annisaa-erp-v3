# Data integrity — Zod-4 defaults in partials, employee email, admission merge, re-enroll, raport attendance, predictable 500s

## Context
The full E2E review (`docs/uat/reports/2026-09-29-full-e2e.md`) found a cluster of silent data-corruption and server-500 bugs. Finding ids: **CORE-1 / X-2** (admission status change resets `source` to WALK_IN), **DRV-1** (journal category/indicator toggle resets `order` to 0), **HR-7** (employee PUT wipes bank/BPJS/formalName/noHp), **HR-5** (employee email not unique; POST overwrote an existing user's role), **X-1** (admission convert "Gabungkan dengan wali" ignores `detectedParentId` and creates a duplicate Parent), **CORE-2** (reactivated student cannot be re-enrolled — leftover WITHDRAWN row), **ACAD-1** (raport attendance accepts sick days > school days), and predictable-input 500s **CORE-5** (duplicate academic-year name), **FIN-3** (duplicate fee component code), **FIN-4** (component code accepts spaces/punctuation), **FIN-5** (huge tarif overflows `numeric(15,2)`), **HR-9** (out-of-range latitude/longitude), **HR-10** (salary component code not validated), plus **FIN-2** (stale duplicate-lines error).

Root cause of the first family: Zod 4.3.x applies `.default()` inside `.partial()`, so an update schema derived with `createSchema.partial()` invents keys the client never sent.

## Spec
- [x] Update schemas derived from create schemas never introduce default keys (shared helper `partialWithoutDefaults` in `lib/validations/zod-helpers.ts`); a sweep test covers every exported `update*Schema` / `*UpdateSchema`.
- [x] Status-only PUT on an admission keeps `source`; status-only PUT on journal category/indicator keeps `order`; partial employee PUT only writes keys present.
- [x] Employee create/update rejects an email another Employee in the tenant already has (case-insensitive) with 409 + field error `email`; create never modifies an existing User linked to another employee or holding a different role (409 explaining).
- [x] Admission convert with `mergeWithDetected` links the new Student to `detectedParentId` (tenant-checked); falls back to email upsert only when there is no detected parent.
- [ ] Re-enrolling a student with a WITHDRAWN enrollment row in the same class succeeds (row reactivated) without a migration.
- [ ] Report-card attendance: each count and their sum are non-negative and <= schoolDays (server schema refine + admin raport form field error).
- [ ] Duplicate academic-year name, duplicate fee component code, and salary component code, out-of-range coordinates, oversized tarif return 400/409 with Indonesian field errors instead of 500; fee/salary component codes restricted to `A-Z0-9_ -`... normalised; dialogs show the returned field error.

### Non-goals
- No schema migration (a DB unique index on `Employee(tenantId, lower(email))` is recorded as a recommendation in Ship Notes).
- No UX redesign; nothing in auth/session code.

### Assumptions
1. Employee PUT does not sync `User.email` (identity change belongs to a deliberate flow); only conflicts are rejected.
2. "Same rule as other codes in the repo" for FIN-4/HR-10 is resolved in the task that implements it.

## Tasks
- [x] **T1 — Defaults-free update schemas.** Helper, admission/journal/employee/student schemas, employee PUT writes only present keys, vitest (schemas + routes).
- [x] **T2 — HR-5 employee email uniqueness.** POST/PUT guards, 409s, vitest.
- [x] **T3 — X-1 convert merges into detected parent.** Route + vitest.
- [ ] **T4 — CORE-2 re-enroll WITHDRAWN rows.** Route + vitest.
- [ ] **T5 — ACAD-1 raport attendance bounds.** Schema refine + form field error + vitest.
- [ ] **T6 — CORE-5 / FIN-3 / FIN-4 / FIN-5 finance + academic-year 500s.** Routes, schemas, dialog errors, vitest.
- [ ] **T7 — HR-9 / HR-10 / FIN-2 coordinates, salary code, stale error.** Routes, schemas, dialogs, vitest.

## Implementation
- Subagent plan: driver=claude-sonnet-5-5, dirty-work=none (sonnet is the harness tier; no cheaper tier used). All tasks sequential and inline: the tasks share validation helpers and each needs the previous task's route/test patterns; the brief runs each cycle in a single build agent.
- T1: new `partialWithoutDefaults(schema)` in `lib/validations/zod-helpers.ts` (strips top-level `ZodDefault` then `.partial()`); used by `updateAdmissionSchema`, `updateCategorySchema`, `updateIndicatorSchema`, `updateEmployeeSchema`, `employeeEditFormSchema` and `updateStudentSchema`. Grepped all of `lib/validations/**` and `app/api/**` for `.default(` + `.partial()`: those four files were the only `.partial()` users; every other update schema (program, class, fee-component, guardian, curriculum ...) is a hand-written optional object with no defaults. `PUT /api/employees/[id]` now passes `undefined` (Prisma skips) for omitted formalName/noHp/bank*/bpjsEnrolled instead of `|| null` / `?? false`; explicit blank/null still clears. Tests: `lib/validations/__tests__/partial-update-defaults.test.ts` (helper, per-schema, and a glob sweep of every `update*Schema`), `app/api/__tests__/update-routes-partial-body.test.ts` (admission/category/indicator/employee PUT).
- Env note: the worktree's `node_modules` symlink makes Turbopack panic ("points out of the filesystem root"), so it was replaced with a real copy (untracked, gitignored).
- T2: new `lib/api/field-errors.ts` (`fieldErrorResponse(field, message, status=409)` in the `validateBody` envelope so `applyServerErrors` lands it on the field; `isUniqueViolation` for P2002). `POST /api/employees` now checks, inside the existing tenant advisory lock, for (a) another Employee with the email (case-insensitive) and (b) an existing User with the email that is linked to another employee or holds a different role -> 409 on `email`; an unlinked same-role User is only linked (`employeeId`), never rewritten (the `user.upsert` that rewrote role/name is gone). `PUT /api/employees/[id]` rejects an email another employee holds (skipped when unchanged so legacy duplicate rows stay editable). Tests: `app/api/__tests__/employees-email-uniqueness.test.ts`.
- T3: `POST /api/admissions/[id]/convert` looks up `admission.detectedParentId` (tenant-scoped `findFirst`) when `mergeWithDetected` (the default) and links the new Student's guardian row to that Parent, leaving the existing Parent record untouched; a stale/cross-tenant id falls back to the email upsert; `mergeWithDetected=false` still creates a fresh Parent. Tests added to `app/api/admissions/[id]/convert/__tests__/convert.test.ts` (different email, no email, default body, stale id, no-merge).

## Verification
- T1: schema tests fail on the pre-fix schemas (10 failures) and pass after. `npm run build` exit 0; `npx vitest run` 424 files passed / 2 skipped, 4005 tests passed.
- T2: tsc clean; `npm run build` exit 0; `npx vitest run` 425 files passed / 2 skipped, 4013 tests passed.
- T3: tsc clean; `npm run build` exit 0; `npx vitest run` 425 files passed / 2 skipped, 4018 tests passed.

## Ship Notes
