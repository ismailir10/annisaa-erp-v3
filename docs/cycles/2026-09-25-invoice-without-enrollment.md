# Manual invoice without a class — billing SPMB applicants

## Context

On 2026-09-24 Bu Shanti (admin) tried to bill a new SPMB 2027/28 applicant through DOKU. She converted the applicant into a Student and created a manual invoice. The server rejected it with "Siswa tidak terdaftar aktif".

`POST /api/invoices` required the student to have an ACTIVE `StudentEnrollment` in a tenant class ([route.ts](../../app/api/invoices/route.ts)). A child registering for next year has no class yet. Her admission form is still the paper one, and in her words the 2027/28 year is still "Rencana" and its classes are not usable.

Nothing downstream needs the enrollment:
- The DOKU payment session reads only the invoice, the student and the primary guardian ([session.ts](../../lib/payments/session.ts)).
- The invoice list, the parent portal and resend/retry never join through enrollment.

The check existed only to scope the tenant, and `Student.tenantId` is a non-null column that scopes the tenant equally well.

Outcome: an admin can raise a manual invoice (biaya daftar, uang pangkal) for any ACTIVE student of the tenant, whether or not the student has a class.

The proper pre-student registration fee, billing on the `EnrollmentApplication` itself (the unbuilt "Cycle B" of [2026-06-23-enrollment-application](./archive/2026-06-23-enrollment-application.md)), stays out of scope. The user chose the small gate relaxation.

UAT input: no UAT report covers manual invoicing. The newest report (2026-06-04) is older than 60 days, so none is consumed.

## Spec

### Acceptance criteria

- [x] `POST /api/invoices` accepts an ACTIVE student of the caller's tenant who has **no** class enrollment, and returns 201. The payment session reaches the primary guardian as before.
- [x] It returns 400 with "Siswa tidak ditemukan atau tidak aktif" when the student does not exist, belongs to another tenant, or is not ACTIVE (INACTIVE, GRADUATED, WITHDRAWN). It stops before the fee-component lookup.
- [x] Tenant scoping stays in the query (`where: { id, tenantId, status: "ACTIVE" }`).
- [x] Vitest covers: no-enrollment → 201 through the real guardian → invoice → payment-session chain; not-ACTIVE → 400; other tenant → 400; the exact where-clause.
- [x] `npm run build && npx vitest run` is green. Playwright is deferred to the required CI check.

### Non-goals

- No change to bulk billing runs (`lib/finance/*`). They stay class-scoped by design.
- No change to the payment session, resend or retry routes, or any UI. The dialog's student picker already requests `status=ACTIVE`, and the server error reaches the existing toast.
- No registration-fee billing on `Admission` / `EnrollmentApplication`, no new Student status (e.g. "calon siswa"), no schema change.
- No fix for the unrelated `/admin/academic-years` Deactivate action, which sends `status: "INACTIVE"` and is rejected by zod. That is noted as a follow-up.

### Assumptions

1. **Student.status = ACTIVE is the right guard.** It matches what the picker lists. A withdrawn or graduated child should not get new manual invoices, which was effectively true before as well.
2. **A converted applicant counting as an ACTIVE student is acceptable** until a proper applicant status exists. This was already true of every converted applicant, with or without this cycle.
3. **Class-less invoices are harmless downstream.** Invoice reads key on `studentId` + `tenantId`, not on enrollment (verified for the list, the detail, the parent portal and the payment session).

## Tasks

- [x] **T1 — Relax the manual-invoice guard.** Replace the enrollment lookup in `POST /api/invoices` with a tenant + ACTIVE Student lookup, and update the docblock and comment. Update the three invoice test suites and add the no-enrollment chain cases.
  *Accept:* the new chain tests fail on the old route and pass on the new one, and the gate is green.

## Implementation

- **T1**
  - `app/api/invoices/route.ts`: the enrollment `findFirst` is replaced by `prisma.student.findFirst({ where: { id, tenantId, status: "ACTIVE" } })`. The new error copy is "Siswa tidak ditemukan atau tidak aktif". The flow docblock step 1 now names the SPMB use case.
  - `app/api/__tests__/invoices-manual-create.test.ts`: the mocks moved to `student.findFirst`. The 400 case now also asserts the where-clause.
  - `app/api/__tests__/invoices-manual-p2002-race.test.ts`: the mocks moved to `student.findFirst`.
  - `app/api/__tests__/guardian-primary-billing-chain.test.ts`: the fake student rows now carry `status`. A new describe block covers:
    - no enrollment → 201, billed to the primary guardian, gateway given their email;
    - WITHDRAWN → 400;
    - other tenant → 400.

## Verification

- Red/green: with the new tests in place and the old route restored, the 3 new chain cases fail. With the new route, all 22 tests in the three invoice suites pass.
- Between-task gate `npm run build && npx vitest run`: both green.
  - Build: the first attempt failed only on the missing `DATABASE_URL` in this container. Re-run with CI's env (`DEMO_MODE=true`, the placeholder `DATABASE_URL` from `ci.yml`), it exits 0.
  - Vitest: 3311 passed, 42 todo.
- `npx eslint` on the changed files is clean. `bash scripts/audit-docs.sh` exits 0 after `--write` regenerated the counts block for the new cycle doc. The only warning is the pre-existing ADR 60-day row.
- Playwright: **deferred** to the required CI `Playwright E2E` check. This harness has no local `.env` or Supabase.
- `design-system`: not applicable. The change is API-only with no frontend diff.

## Ship Notes

- No migrations, no env vars.
- Admin copy change: a failed manual invoice now reads "Siswa tidak ditemukan atau tidak aktif" instead of "Siswa tidak terdaftar aktif".
- Reaches production only on the next `/ship --to-main`, which the user types. After that, reply to Bu Shanti:
  - Manual invoices no longer need a class.
  - The parent (with an email address) must be linked as guardian so the DOKU VA email goes out and the invoice shows in the parent app.
  - Future applicants can use the Talib form: `/daftar` → Kirim Formulir → `/pendaftaran/…` → Konversi ke Siswa.
- Rollback: revert the squash commit. It is a pure logic change with no data written.
