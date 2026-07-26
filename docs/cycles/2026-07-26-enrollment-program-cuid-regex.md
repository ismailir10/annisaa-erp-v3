# Fix Program ID Validation Blocking Public Enrollment Forms

## Context

Prod smoke-test of `/pendaftaran/[token]` (the tokenized 6-step enrollment form) found that **no
submission can ever complete**: every parent who reaches the Program step and submits gets `422
Program tidak valid`, no matter which program they pick. Root cause, confirmed against prod DB
(`vxwywmvpxetdgnxejjgk`) via SQL: `Program.id` values in this tenant are prefixed strings —
`program_ab57fd0432e25d5b3013` (Kelompok Bermain, tenant_annisaa) — not Prisma's default
`cuid()` shape. But every place that validates a client-supplied `programId` hardcodes
`CUID_REGEX = /^c[a-z0-9]{24,}$/i`, which requires the string to start with `c`. `program_...`
fails that regex outright, so:

- **Draft autosave** (`app/api/enrollments/token/[token]/route.ts`) — the schema-level regex
  rejects the whole PATCH body (generic 400), so the field is never persisted. The client's local
  form state still shows the picked program on the review screen, giving false confidence.
- **Final submit** (`lib/enrollment/submit-validation.ts`) — same regex, now surfaced as the
  user-facing message `"Program tidak valid"` — reproduced end-to-end in Chrome against
  `https://talib.annisaasekolahku.com/pendaftaran/[token]`.
- The identical pattern is duplicated in **`lib/admission/submit-validation.ts`** (the `/daftar`
  public inquiry form) and **`app/api/enrollments/[id]/route.ts`** (admin-side enrollment edit) —
  both accept a `programId` and validate it the same broken way, so this blocks admin edits and
  the `/daftar` funnel's program field too, not just `/pendaftaran`.

`Program.id` in `prisma/schema.prisma` is declared `@default(cuid())`, but prod rows were
inserted by a seed/import script using a custom prefixed generator, so the schema default and the
actual data have diverged. The fix should stop re-deriving an id-shape assumption in four places
and instead trust the existing DB existence+tenant check (`programBelongsToTenant`) as the real
guard, the way `programId` validation already works for every other write path in this app.

## Spec

- [x] `PATCH /api/enrollments/token/[token]` persists a real prefixed `programId`
      (`program_...`) instead of silently dropping it
- [x] `POST /api/enrollments/token/[token]/submit` accepts a real prefixed `programId` and no
      longer returns `422 Program tidak valid` for a program that actually belongs to the
      application's tenant
- [x] `PATCH /api/enrollments/[id]` (admin edit) accepts a real prefixed `programId`
- [x] `lib/admission/submit-validation.ts` (`/daftar` public form) accepts a real prefixed
      `programId`
- [x] An invalid or cross-tenant `programId` is still rejected everywhere (no regression —
      `programBelongsToTenant` remains the authority, not a format regex). This now also covers
      `app/api/admission/submit/route.ts` (`/daftar`'s create path) — see Implementation note below;
      the two code-reviewer passes both flagged that this route never called
      `programBelongsToTenant` despite Task 1 saying to add it, so the call was added.
- [x] Regression tests: each of the now-5 call sites (4 original + `/daftar` create) has a test
      asserting a real-shaped `program_...` id passes validation and persists/submits successfully
- [ ] End-to-end manual smoke on the staging preview: complete `/pendaftaran/[token]` through
      final submit with a real program selected — pending PR/preview deployment (`/ship`)

**Non-goals:** reconciling why `Program.id` diverges from its Prisma schema default (`cuid()`)
— that's a separate seed/migration concern, out of scope here. Not touching any other
`CUID_REGEX` usage that validates a genuinely `cuid()`-generated id (e.g.
`scripts/reseed/invoices.ts`, `e2e/daftar-public.spec.ts`'s admission-id assertion) — those ids
really are shaped that way and the check there is correct.

**Assumptions I'm making:**
1. Removing the format regex and relying solely on `programBelongsToTenant()` (a real DB
   existence + tenant-scope check) is an acceptable, in-fact-stronger replacement for a
   client-side shape guard — it already exists and is already the actual security boundary
   (IDOR guard comment in `submit/route.ts:46`).
2. The four call sites should share one validator/helper instead of four independent copies of
   the same regex, to prevent this exact drift from recurring.
3. `test-login` accounts and my test `EnrollmentApplication` row (`Test Anak Pilot`,
   `q_nwWB0WE_QXaJ2P21GdIPBELalt77700EDHAzYB5A0`, status `INVITED`) plus the `Admission` inquiry
   row that spawned it stay in prod for now — cleanup deferred, not part of this cycle's scope.
→ Correct me now or `/build` will proceed with these.

## Tasks

1. [x] **Add a shared `isValidProgramId` (or similar) helper** — replace the format-regex
   `programId` checks in `lib/enrollment/submit-validation.ts`, `lib/admission/submit-validation.ts`,
   `app/api/enrollments/token/[token]/route.ts`, and `app/api/enrollments/[id]/route.ts` with a
   loose non-empty-string check at the schema layer, deferring real validation to
   `programBelongsToTenant()` (already called downstream in three of the four sites — add the
   call where missing). Acceptance: `grep -rn "CUID_REGEX" app/ lib/` shows zero remaining
   `programId`-related hits (the genuinely-cuid ones in `scripts/`/`e2e/` are untouched, unrelated
   ids).
2. [x] **Regression tests** — one test per call site (4 total, extending existing
   `__tests__` files) asserting a `program_<hex>`-shaped id round-trips successfully; keep/extend
   an existing invalid-id test to confirm rejection still works via `programBelongsToTenant`.
   Acceptance: `npx vitest run` green, new tests visibly cover the fixed paths.
3. [ ] **Manual staging smoke** — after the between-task gate passes, walk `/pendaftaran/[token]` on
   the Vercel preview end-to-end (reuse the same flow already proven in prod testing) confirming
   submit succeeds with a real program selected. Acceptance: submit returns `201`, no code
   changes needed after this — pure verification, folded into `/build`'s end-of-cycle step.

## Implementation

- Subagent plan: driver=claude-sonnet-5, dirty-work=none. Cycle scoped to 3 tightly-coupled tasks
  (shared helper + 4 call-site edits + matching tests) touching the same small surface area —
  fan-out would fragment reasoning about one shared validator across parallel agents for no
  token-efficiency win. Implemented inline, per the SKILL.md small-cycle exception.
- Task 1+2 (combined — helper design and its tests were written together):
  - Added `lib/validations/program-id.ts` — `programIdSchema = z.string().trim().min(1, ...)`,
    replacing the four hardcoded `CUID_REGEX = /^c[a-z0-9]{24,}$/i` copies. No format assumption;
    `programBelongsToTenant()` (unchanged) remains the real existence+tenant guard everywhere it
    already ran.
  - Edited: `lib/enrollment/submit-validation.ts`, `lib/admission/submit-validation.ts`,
    `app/api/enrollments/token/[token]/route.ts`, `app/api/enrollments/[id]/route.ts` — swapped
    `CUID_REGEX` regex checks for `programIdSchema`, removed the now-dead regex consts.
  - Added tests: `lib/validations/program-id.test.ts` (new), plus extensions to
    `lib/enrollment/submit-validation.test.ts`, `lib/admission/submit-validation.test.ts`,
    `app/api/enrollments/token/[token]/__tests__/route.test.ts`,
    `app/api/enrollments/token/[token]/submit/__tests__/route.test.ts`,
    `app/api/enrollments/[id]/__tests__/route.test.ts` — each proving a `program_`-prefixed id now
    round-trips, and (where a tenant check exists) that a foreign-tenant id is still rejected.
  - **Post-review addition**: two independent `superpowers:code-reviewer` passes both
    independently flagged that Task 1's own acceptance text ("add the call where missing")
    committed to adding a `programBelongsToTenant` check to `app/api/admission/submit/route.ts`
    (the `/daftar` create path), but the first implementation pass never added it — that route
    wrote `data.programId ?? null` straight into `prisma.admission.create()` with only the DB FK
    constraint (existence, not tenant) as a guard. Added the check: an invalid/foreign-tenant
    `programId` is now dropped to `null` (not hard-rejected — this is a one-shot optional field on
    an unauthenticated public form, same "drop, don't fail" pattern as the draft-autosave route).
    Added `app/api/admission/submit/__tests__/route.test.ts` (new — this route had no test file
    before) covering: prefixed-id-accepted, foreign-tenant-id-dropped, omitted-id-stays-null.
  - Reviewed by 2 parallel `superpowers:code-reviewer` passes (security-sensitive: `app/api/**`,
    tenant-scoping logic) — both cleared after the `/daftar` gap above was fixed; no other
    blocking findings. Minor suggestion (not applied — genuinely low-value): a max-length bound on
    `programIdSchema` for defense-in-depth; not exploitable today since the field only ever flows
    into parameterized Prisma queries, never raw SQL or unescaped output.

## Verification

- Task 1+2: `npm run build` — clean, no errors. `npx vitest run` (full suite) — 232 files passed
  (2 skipped), 2216 tests passed (42 todo), zero failures, zero regressions from baseline.
  `grep -rn "CUID_REGEX" app/ lib/` — zero hits (confirmed clean removal across all 4+1 sites; the
  two remaining `CUID_RE`/regex hits in `scripts/reseed/invoices.ts` and
  `e2e/daftar-public.spec.ts` validate genuinely `cuid()`-shaped ids for unrelated entities and
  were correctly left untouched, per the cycle's stated non-goals).
- Reproduced the original bug end-to-end in Chrome against prod
  (`https://talib.annisaasekolahku.com/pendaftaran/q_nwWB0WE_QXaJ2P21GdIPBELalt77700EDHAzYB5A0`)
  before the fix: filled all 6 steps, submit hard-failed with `422 Program tidak valid` every time
  despite a valid tenant-owned program selected. This is the exact failure this fix targets — not
  yet re-verified against a deployed build of this branch (Task 3, pending PR/preview).

## Ship Notes

- **No migrations, no new env vars.** Pure application-code fix — validation logic only, no
  schema change (`Program.id`'s divergence from its `@default(cuid())` declaration is pre-existing
  and explicitly out of scope; see Non-goals).
- **Playwright: local run blocked by design, deferred to CI.** `npx playwright test
  e2e/enrollment-application.spec.ts` refused to run — `playwright.config.ts`'s
  `assertLocalDatabaseForE2E` guard correctly detects this worktree's symlinked `DATABASE_URL`
  points at the real remote Supabase pooler (staging), not a local/ephemeral Postgres, and refuses
  to run mutation-heavy specs against it (would pollute staging data). This is the documented,
  expected deferral path — the
  required CI `Playwright E2E` check (which runs against the Vercel preview with its own
  disposable-safe setup) gates the merge; not a skipped step.
- **Manual smoke plan for `/ship`'s preview-verify:** reproduce the exact flow already proven
  against prod during initial diagnosis — open the Vercel preview's `/pendaftaran/[token]` for a
  test `EnrollmentApplication` (or seed one via the admin `/admin/admissions` → "Catat Pertanyaan"
  → "Kirim Formulir" flow, same as the original repro), fill all 6 steps, select a program, submit.
  Expect `201` and a thank-you state instead of the pre-fix `422 Program tidak valid`. Also spot-
  check `/daftar`'s program field for the `/daftar` fix (Task 1's post-review addition).
- **Rollback:** revert this single commit — no data migration, no forward-only state introduced.
  The only persisted-data side effect of *testing* this fix (not the fix itself) is the
  `Test Anak Pilot` inquiry (`Admission`) and `EnrollmentApplication` row
  (`q_nwWB0WE_QXaJ2P21GdIPBELalt77700EDHAzYB5A0`, still `INVITED`, never actually submitted since
  the bug blocked it) left in **prod** from the original diagnosis session — cleanup is deferred
  per this cycle's Assumption 3, not part of this PR.
