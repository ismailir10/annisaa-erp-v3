# Staging Sweep Cycle 1 — Three Majors

## Context

End-to-end sweep on staging on 2026-05-13 surfaced 18 findings, 0 blockers and 3 majors. This cycle closes the three majors before the next staging → main promotion. Findings doc: `docs/findings/2026-05-13-staging-e2e-sweep.md` (committed alongside).

The three majors share no code paths but share urgency:

- **F-4 — TKIT B over-enrolled (21/20).** A real class on staging is over capacity. The 2026-04-24 `SELECT … FOR UPDATE OF cs` capacity guard inside `$transaction` was supposed to prevent this. Either the guard regressed at `POST /api/enrollments`, or capacity was reduced *after* enrollments existed and the capacity-edit path lacks a back-check, or a direct-DB seed bypassed both.
- **F-7 — Parent.email blank for all 200 wali rows.** The backend model is `Parent` (UI label "Wali Murid" / "Guardian"). `Parent.email` is `String?` and is `NULL` for every row on staging, including the live test parent `Siti Nurhaliza Hidayat` whose linked `User.email` is `rightjet.hq@gmail.com`. Login works because auth resolves via `User.email`; any feature that pulls `Parent.email` for outbound (invoice notifications, reminders) is silently broken. `User` joins to `Parent` via `User.parentId`.
- **F-10 — Employee with Bank set but no Rekening.** `Ismail Teacher Test` (ITT29) has `Bank = "Bank BSI"` and `No. Rekening = NULL`. List page flags this with a `Belum diisi` badge — data layer knows — but the Tambah/Edit form let it save anyway. Next payroll run that includes this employee will emit an invalid BSI bulk-export row.

Standards consulted: `.claude/standards/design-system.html` for the employee form layout fix (one-line bullet appears in Verification). All three are SUPER_ADMIN-only flows; no parent/teacher surface affected.

## Spec

**Acceptance criteria**

- [ ] Creating an enrollment against a class section already at capacity is rejected at `POST /api/enrollments` with a clear 400 + Indonesian copy. Existing `FOR UPDATE OF cs` guard verified by a vitest concurrency test that fires two writes simultaneously.
- [ ] `PATCH /api/class-sections/[id]` rejects a capacity edit that would put `new_capacity < count(active enrollments)`, with a 400 + copy "Kapasitas tidak boleh kurang dari jumlah siswa aktif (<count>)".
- [ ] A one-shot remediation script `scripts/fix-tkit-b-overflow.ts` (idempotent, dry-run default) prints the over-capacity class(es) and either: (a) bumps TKIT B capacity to 21 with an audit-log entry, or (b) lists the override option for the user to run with `--apply`. CTO chooses (a) for TKIT B during execution.
- [ ] `Parent.email` is backfilled from `User.email` for every parent that has a linked user. Implemented as a Prisma migration `data` script (executes at deploy time, idempotent — only writes when `Parent.email IS NULL` and `User.email IS NOT NULL`).
- [ ] New OAuth login hook in `lib/auth.ts` writes `Parent.email = User.email` when the linked parent's email is NULL — so future logins self-heal without re-running the migration.
- [ ] Tambah/Edit Karyawan form makes No. Rekening required when Bank is selected (client-side via zod `superRefine`, server-side via the same schema in `lib/validations/employee.ts`). Empty Rekening with Bank selected returns a 422 with field-level error "No. Rekening wajib diisi jika bank dipilih".
- [ ] `POST /api/payroll` refuses to include an employee in a new payroll run if `bank IS NOT NULL AND rekening IS NULL`, with a 422 listing the offending employees + their codes. UI surfaces this as an inline alert above the Buat Penggajian dialog.
- [ ] No regressions: `npm run build && npx vitest run && npx playwright test` all green at end-of-cycle.

**Non-goals**

- Page-header loading-state bundle (F-1, F-8, F-9, F-11, F-14, F-16, F-18). Deferred to next cycle.
- Stale E2E artifact scrub (F-5, F-13). Deferred — separate ops task, not code.
- Parent-portal display-name unification (F-19). Deferred to a UX-polish cycle.
- All other nits (F-2, F-3, F-6, F-12, F-15). Deferred.
- Curriculum tema/subtema/pekan work — out of scope; mid-build per memory note.

**Assumptions** *(flag if wrong)*

- TKIT B's correct capacity going forward is **21**, not "evict one student to get back to 20". CTO confirmed during sweep that bumping capacity is preferred.
- Every `Parent` row on staging where at least one `User` row points at it via `User.parentId` has a non-NULL `User.email` — therefore the migration in T3 covers 100% of currently broken rows that can be repaired. Parents that have no linked User stay NULL and surface in the next sweep (acceptable).
- "Bank set but Rekening missing" is treated as an authoring error, not partial-state to preserve. The new validation applies to writes only; existing rows are left alone, and T6 surfaces them as payroll-run pre-flight errors so admin manually fixes the offenders. No silent `bank` clearing.
- T1's regression test extends the existing `app/api/__tests__/promote-capacity-race.test.ts` rather than creating a parallel file — promote and create share the same `$transaction` + `FOR UPDATE OF cs` code path, so one suite per code path is enough.

## Tasks

> Order optimized so `/build` can dispatch independent subagents on T1, T3, T5 in parallel. T2 depends on T1, T4 depends on T3, T6 depends on T5. T7 is sequential at the end.

- [x] **T1 — Fix F-4 root cause in `prisma/seed.ts` + add post-seed invariant.**
  Investigation found all three API enrollment paths (`/api/students/[id]/enroll`, `/api/students/[id]/promote`, `/api/promotions`) already carry the `$transaction + SELECT … FOR UPDATE OF cs` guard, and `PATCH /api/class-sections/[id]` already rejects shrinking capacity below the active count. Root cause: `prisma/seed.ts` line ~912 inserts `Fatimah Az-Zahra Hidayat` into `TKIT_B` (capacity 20) via a nested `prisma.student.create({ enrollments: { create: … } })`, bypassing the API entirely. The base seed already fills 20 TKIT_B seats, so Fatimah pushes it to 21/20.
  Acceptance:
    1. `prisma/seed.ts` TKIT_B capacity bumped 20 → 21 with an inline comment naming Fatimah + the 2026-05-13 sweep.
    2. End of `prisma/seed.ts` adds an invariant pass: `findMany` every class section with `_count.enrollments` (where `status=ACTIVE`) and throws if any `_count > capacity`. Future similar regressions fail the seed loudly.
    3. Verified via `npx prisma db push --force-reset && npx prisma db seed` succeeding locally without the invariant throw (executed in T7's gate).
  Files: `prisma/seed.ts`.
  Independent of T3, T5.

- [x] **T2 — Over-capacity remediation script.**
  Acceptance: `scripts/fix-overcapacity-classes.ts` (default = dry-run) lists every section where `_count(active enrollments) > capacity`. With `--apply --bump`, bumps each offending section's `capacity` up to the active count inside a `$transaction` and writes an `AuditLog` row tagged `class.capacity.bump` carrying before/after JSON. Actor resolves to the first ACTIVE `SUPER_ADMIN` of the tenant when `--actor` is omitted; fails loudly if none. Unit tests in `scripts/__tests__/fix-overcapacity-classes.test.ts` cover: no-offenders, dry-run reports without mutating, apply+bump writes capacity + audit, missing-actor throws, --actor override skips the User lookup. Runs against staging in `/ship` Phase 5, not during `/build`.
  Files: `scripts/fix-overcapacity-classes.ts`, `scripts/__tests__/fix-overcapacity-classes.test.ts`.
  Independent of T1, T3, T5.

- [x] **T3 — Parent.email backfill migration.**
  Acceptance: Prisma migration `20260513000000_backfill_parent_email_from_user/migration.sql` runs the SQL `UPDATE "Parent" SET email = u.email FROM "User" u WHERE u."parentId" = "Parent".id AND "Parent".email IS NULL AND u.email IS NOT NULL;`. Idempotent — re-running is a no-op because the WHERE clause requires `email IS NULL`. SQL verified by inspection; local `prisma migrate dev` deliberately not run because the dev `.env` `DATABASE_URL` points at the staging Supabase pooler, and running migrate against staging belongs to `/ship`, not `/build`. Spec assumption to add a seed fixture is dropped: migrations run before seed in `prisma migrate dev`, so a seed fixture can never exercise the migration anyway.
  Files: `prisma/migrations/20260513000000_backfill_parent_email_from_user/migration.sql`.
  Independent of T1, T5.

- [x] **T4 — OAuth login hook: self-heal Parent.email.**
  Acceptance: extracted `selfHealParentEmail(parentId, userEmail)` from `lib/auth.ts` (`getSession` flow) — calls `prisma.parent.updateMany({ where: { id: parentId, email: null }, data: { email: userEmail } })` so already-healed rows are no-ops via `count=0` and never overwrite a non-NULL email. Helper swallows prisma errors and logs `[AUTH] Parent.email self-heal failed` — a failed heal must never break session resolution. Called once per GUARDIAN session resolve when `parentId && user.email` both set; the cheaper non-GUARDIAN paths skip it entirely. Tests in `lib/__tests__/auth-parent-email-heal.test.ts` cover write, no-op, throw-swallow.
  Files: `lib/auth.ts`, `lib/__tests__/auth-parent-email-heal.test.ts`.
  Depends on T3 (column behaviour relies on the migration having run).

- [x] **T5 — Karyawan form: Rekening required when Bank set, both layers.**
  Acceptance: `lib/validations/employee.ts` extracts a `refineBankAccountPair` helper and applies `.superRefine()` to both `createEmployeeSchema` and `updateEmployeeSchema.partial()`. The check is symmetric: Bank without Rekening rejects with `bankAccountNo` field error "No. Rekening wajib diisi jika bank dipilih"; Rekening without Bank rejects with `bankName` field error "Bank wajib dipilih jika No. Rekening diisi". Whitespace-only strings count as empty. Partial updates that touch neither field pass through. The form pages (`app/admin/(hr)/employees/page.tsx`, `app/admin/(hr)/employees/[id]/page.tsx`) now surface the first field-level message from `validateBody`'s `errors` array instead of the generic "Validasi gagal" wrapper — the existing toast pattern was kept to minimise surface area for this cycle; inline-under-field error is deferred to a UX-polish pass. The Indonesian copy was cross-checked against `.claude/standards/design-system.html` form-field guidance.
  Files: `lib/validations/employee.ts`, `lib/validations/__tests__/employee.test.ts`, `app/admin/(hr)/employees/page.tsx`, `app/admin/(hr)/employees/[id]/page.tsx`.
  Independent of T1, T3.

- [x] **T6 — Payroll-run pre-flight refuses bank-no-rekening employees.**
  Acceptance: `POST /api/payroll/generate` adds a pre-flight scan after the parallel data fetch: any ACTIVE employee with `bankName` non-empty and `bankAccountNo` blank (including whitespace-only) triggers a 422 with `{ error, employees: [{ id, kode, nama, reason: "rekening missing" }] }`. The guard runs BEFORE `calculatePayroll` and before the `$transaction`, so no half-state is written. UI (`app/admin/(hr)/payroll/page.tsx`) reads the 422 + `employees` array and surfaces a long-duration toast listing the offenders by `kode` and `nama`. Vitest in `app/api/__tests__/payroll-generate-rekening-guard.test.ts` covers: offender rejection with `$transaction` never called; whitespace-only as empty; clean roster passes the guard (downstream branches are out of scope of this test).
  Files: `app/api/payroll/generate/route.ts`, `app/admin/(hr)/payroll/page.tsx`, `app/api/__tests__/payroll-generate-rekening-guard.test.ts`.
  Depends on T5 (same invariant, enforced on a different code path).

- [ ] **T7 — End-of-cycle gate + report.**
  Acceptance: `npm run build && npx vitest run && npx playwright test` all green. Append per-task summary to `## Implementation`. Cross-checked `.claude/standards/design-system.html` §Form-Field for T5 (note in Verification — frontend-gate token). Manual staging smoke after deploy (in `/ship` Phase): re-open `/admin/academic-years` Kelas table → TKIT B reads ≤ capacity after T2 runs; re-open `/admin/guardians` → Siti Nurhaliza Hidayat has email populated; re-open `/admin/employees` Ismail Teacher Test edit form → Rekening field rejects empty save when Bank is set.

## Implementation

*Filled by `/build`.*

## Verification

*Filled by `/build` after the end-of-cycle gate. Must include: cross-checked design-system.html §Form-Field for T5 (frontend-gate token).*

## Ship Notes

*Filled by `/ship`. Will include: migration runs at deploy (no manual step), no env-var changes, no Resend/Xendit surface change. Staging rollback = `prisma migrate resolve --rolled-back`; production rollback identical. AuditLog entry from T2 is append-only — not reversible by code, document the manual scrub if needed.*
