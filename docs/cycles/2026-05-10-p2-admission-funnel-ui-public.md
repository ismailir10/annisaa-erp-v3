# P2 Admission Funnel UI — Public Half (`/daftar` + Real-Admin OAuth Seed)

## Context

`p2-admission-funnel-schema` (PR [#211](https://github.com/ismailir10/school-erp/pull/211), commit `50bedfe`, §18A flipped via [#212](https://github.com/ismailir10/school-erp/pull/212) `c0e2963`) shipped Migration 11 + 5 Prisma models (`Admission` / `InitialAssessment` / `MplsCohort` / `MplsMember` / `MplsAttendance`) + 8-state state-machine library at `lib/admission/state-machine.ts` + `Admission` entity registry + read-only scaffold list page at `/admin/akademik/penerimaan`. Per foundation §18.1 Phase 2 cycle order, `p2-admission-funnel-ui` is the next sequential cycle.

**§18.2 cap fires.** Full-scope file estimate ≈ 28 files (multi-step `/daftar` + sibling auto-detect + 4 transition action groups + admin review screen + MPLS minimal UI + 3 email templates + 2 Playwright specs + email-infra stub + permission seed + real-admin OAuth seed) > 25-file cap. Pre-emptive split per cycle prompt §18.2 cap risk:

- **This cycle (`p2-admission-funnel-ui-public`)** — real-admin OAuth seed + public `/daftar` form + sibling auto-detect + admission-submitted email stub + permission seed update + 1 Playwright spec (public flow). The OAuth seed lands here so the user can smoke-test as soon as this half ships.
- **Follow-up (`p2-admission-funnel-ui-review`)** — state-transition server actions for review/accept/reject/withdraw + admin review screen + ACCEPTED side-effect bundle (Household + Student + Guardian creation in single `prisma.$transaction`) + admission-accepted/rejected email templates + MPLS minimal admin UI + 2nd Playwright spec (admin walk-through).

This cycle delivers the public-facing trajectory: a parent visits `/daftar?tenant=demo`, fills a multi-step form, submits, the system creates an `Admission` row in `DRAFT` and atomically transitions it to `SUBMITTED`, runs sibling auto-detect against existing Households, sends a confirmation email (stubbed via `EmailLog` row writes pending real Resend integration), and shows a tracking-code confirmation page. In parallel, `ismailir10@gmail.com` is seeded as a real admin User + UserRole inside the demo tenant so the user can sign in with their actual Google account on the staging preview and validate trajectory live — not behind demo cookies.

## Spec

### Acceptance criteria

- [ ] **AC1 — Real-admin OAuth seed.** New seed `prisma/seed/11-real-admin.ts` upserts one `User` row (`email = "ismailir10@gmail.com"`, `name = "Ismail"`, `tenantId = <demo tenant>`) and one `UserRole` row binding to the seeded `admin` system role. Idempotent — second run is no-op (no duplicate rows). Registered in `prisma/seed/index.ts` after `08-demo-users.ts`. Ship Notes documents the exact preview URL + Google sign-in flow.
- [ ] **AC2 — Public `/daftar` route.** `app/daftar/page.tsx` (no auth — public) renders multi-step form: applicant info → parent info → address chain (reuses `<AddressChainField>`) → program/year selection → submit. Tenant resolved from subdomain or `?tenant=<slug>` query param; fail-closed on missing/invalid tenant. Indonesian copy in Bu Sari voice per `.claude/standards/voice.md`. Cross-checked against `design-system.html` — uses standard form shell + step indicator pattern.
- [ ] **AC3 — Public submit endpoint.** `POST /api/admission/submit` (public, rate-limited) accepts validated payload, creates `Admission` row in `DRAFT` and transitions to `SUBMITTED` via `assertTransition` from `lib/admission/state-machine.ts` — both writes inside one `prisma.$transaction`. Returns `{ ok: true, trackingCode }`. `verify-api-auth` allowlist gets `/api/admission/submit` as `@public` (rate-limited).
- [ ] **AC4 — Sibling auto-detect.** New helper `lib/admission/sibling-detect.ts` queries `Household`-via-`Guardian` by parent NIK exact match OR parent phone last4 mask-aware match. Populates `Admission.siblingDetectedFromHouseholdId` on submit when a unique match exists. Vitest covers: match (NIK only), match (phone only), match (both), no-match, multi-match (returns null + flag).
- [ ] **AC5 — Submit transition server action.** `lib/admission/transitions/submit.ts` wraps `assertTransition(DRAFT, SUBMITTED)` + `writeAuditLog` + `emitTimelineEvent("admission.status_changed")`. Vitest covers happy path + rejected illegal transition + audit row written + timeline event emitted.
- [ ] **AC6 — `admission.status_changed` TimelineEvent kind.** Registered in `lib/timeline/events.ts` with `subjectKind: "Admission"`, `defaultVisibility: INTERNAL`, payload `z.object({ from: AdmissionStatus, to: AdmissionStatus, reason: z.string().optional() }).strict()`. Existing `lib/timeline/__tests__/events.test.ts` extended for the new kind.
- [ ] **AC7 — Admission permission seed.** `prisma/seed/06-permissions.ts` extended to seed `Admission` resource permissions derived from `lib/entities/admission/policy.ts` scopes. Closes #211 Spec Assumption 9. Idempotent (existing seed pattern).
- [ ] **AC8 — Email stub + admission-submitted template.** `lib/email/send.ts` writes `EmailLog` row with `status = "QUEUED"` (no real SMTP/Resend wired this cycle — deferred to dedicated email-infra cycle). `lib/email/templates/admission-submitted.tsx` renders Indonesian copy in Bu Sari voice with tracking code. Submit transition action enqueues the template via `sendEmail`.
- [ ] **AC9 — Playwright canary.** `e2e/admission-public.spec.ts` visits `/daftar?tenant=demo`, fills the multi-step form end-to-end, submits, asserts redirect to confirmation page with visible tracking code.
- [ ] **AC10 — All gates green.** `npm run build` + `npx vitest run` + `npx playwright test` + `verify-rls` (38/38 unchanged) + `verify-pii` (10/10 unchanged) + `verify-api-auth` (+1 for `/api/admission/submit` `@public` allowlist).
- [ ] **AC11 — Foundation §18A row.** Prepended at /spec time as `next` for `p2-admission-funnel-ui-public`. /ship Step 3 flips to `shipped` via chore PR.
- [ ] **AC12 — Frontend gate compliance.** Cycle Verification mentions `design-system` token (Rule 4 of pre-commit frontend-gate).

### Non-goals

- State-transition actions for review/accept/reject/withdraw — follow-up cycle (`-review`).
- Admin review screen at `app/admin/akademik/penerimaan/[id]` — follow-up.
- ACCEPTED side-effect bundle (Household + Student + Guardian creation tx) — follow-up.
- MPLS admin UI (cohort list, attendance grid, bulk save action) — follow-up.
- `admission-accepted.tsx` + `admission-rejected.tsx` email templates — follow-up.
- Real Resend / SMTP integration — separate `p2-email-infra` cycle. This cycle stubs via `EmailLog` row writes only.
- Free-text rejection reason on `REJECTED` transition — out of scope (admin can edit `notes` field).
- Captcha / bot-protection on `/daftar` — out of scope (rate-limit only).
- Multi-tenant subdomain DNS wiring — out of scope (relies on existing `?tenant=<slug>` query param resolver).

### Assumptions (correct now or `/build` proceeds)

1. **Split-1 vs split-2 sequencing.** Real-admin OAuth seed lands in this cycle (split-1) so the user can smoke-test trajectory immediately after merge. State-transition actions + admin review screen ship in `p2-admission-funnel-ui-review` after this merges. If user wants the full UI shipped in one PR, override now and accept the >25-file PR.
2. **Real-admin seed lives in own file.** `prisma/seed/11-real-admin.ts` (new file) preserves the `08-demo-users.ts` `@demo.local` convention. Registered in `prisma/seed/index.ts` after demo users so it can reference the seeded `admin` role + demo tenant. Alternative: extend `08-demo-users.ts` and append a `REAL_ADMINS` array — propose if user prefers single-file approach.
3. **Email sending is stubbed.** No `lib/email/` module exists today. This cycle creates `lib/email/send.ts` that writes an `EmailLog` row with `status = "QUEUED"` and the rendered subject/template name; actual SMTP/Resend integration ships in a dedicated `p2-email-infra` cycle. Templates are React Email JSX (or plain `.tsx` rendering string) so the future infra can pick them up unchanged.
4. **Tenant resolution prefers subdomain → `?tenant=<slug>`.** If neither resolves to a valid tenant, the page renders a 404 with Indonesian copy (`Penerimaan tidak tersedia di tenant ini`). No fallback to "default tenant".
5. **Sibling detection uses Guardian as the join.** `Household` has no direct `nik` / `phone` columns — match is against `Guardian.nik` (exact) and `Guardian.phone` (last4 mask-aware) where the Guardian's StudentGuardian links to a non-soft-deleted Student in a non-soft-deleted Household. Multi-match returns `null` and flags the admin to review manually (admission row submitted without `siblingDetectedFromHouseholdId`). Source = `REFERRAL` does not affect detection (orthogonal).
6. **`admission.status_changed` is INTERNAL by default.** Parents see admission status via the public `/lacak-pendaftaran/<trackingCode>` page in a future cycle (out of scope here). No portal write-widening for parents in this cycle.
7. **Tracking code = `Admission.id` first 8 chars uppercased.** Sufficient for Phase 2; collisions across tenants are theoretical (8 hex chars × tenant scope = effectively unique). No new column. Future cycle may add a dedicated `Admission.trackingCode` column with HASH unique per tenant.
8. **Rate limit on `/api/admission/submit`.** Reuses existing `lib/security/rate-limit.ts` (or equivalent) at 5 submits / IP / hour. If no existing helper, ships with a TODO comment + cycle Ship Notes flags as follow-up.
9. **Address chain reuse.** `<AddressChainField>` from #208 is consumed verbatim. The `onSave` callback returns `{ addressId }` synchronously; the multi-step form holds the addressId in step state and POSTs it with the final submit payload (no separate Address create step server-side — `<AddressChainField>` already creates).
10. **§18A row uses slug `p2-admission-funnel-ui-public`.** Branch name `feat/p2-admission-funnel-ui` keeps as-is (already created); the cycle slug + PR title use `-public` suffix to match the doc + §18A row.

## Tasks

Each task is independently committable. Build runs the between-task gate (`npm run build && npx vitest run`) before the next task starts.

- [x] **T1 — §18A row + cycle doc skeleton.** Prepend `| 2 | admission-funnel-ui-public | p2-admission-funnel-ui-public | <today> | next | next | next |` to the §18A Phase Status table at `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md`. AC: §18A row appears as `next`; pre-commit doc-sync allows the staged cycle doc.
- [ ] **T2 — Real-admin OAuth seed.** Create `prisma/seed/11-real-admin.ts` (idempotent upsert of User + UserRole for `ismailir10@gmail.com` → admin within demo tenant). Register in `prisma/seed/index.ts`. AC: `npm run prisma:seed` runs twice without duplicate rows; psql query `SELECT u.email, sr.code FROM "User" u JOIN "UserRole" ur ON ur."userId"=u.id JOIN "SystemRole" sr ON sr.id=ur."systemRoleId" WHERE u.email='ismailir10@gmail.com'` returns exactly one row.
- [ ] **T3 — Admission permission seed.** Extend `prisma/seed/06-permissions.ts` to derive `Admission` permissions from `policy.ts` scopes (CREATE/READ/UPDATE/SOFT_DELETE/RESTORE × ALL/SELF/OWN_STUDENT). Idempotent. AC: closes #211 Spec Assumption 9; psql shows expected RolePermission rows for Admission.
- [ ] **T4 — `admission.status_changed` TimelineEvent kind.** Add to `lib/timeline/events.ts` registry. Extend `lib/timeline/__tests__/events.test.ts` for the new kind (payload validation passes, registry entry present). AC: vitest green; `subjectKind` = `"Admission"`; `defaultVisibility` = `INTERNAL`.
- [ ] **T5 — Email stub + `admission-submitted` template.** Create `lib/email/send.ts` (writes `EmailLog` row with `status = "QUEUED"`) + `lib/email/templates/admission-submitted.tsx` (Indonesian Bu Sari voice + tracking code variable). Vitest covers `sendEmail` writes the row + does not throw on success. AC: vitest green.
- [ ] **T6 — Sibling auto-detect helper.** Create `lib/admission/sibling-detect.ts` + `lib/admission/__tests__/sibling-detect.test.ts`. Cases: NIK match, phone-last4 match, both, no-match, multi-match (returns `null`). AC: vitest +5 cases green.
- [ ] **T7 — Submit transition server action.** Create `lib/admission/transitions/submit.ts` — wraps `assertTransition(DRAFT, SUBMITTED)` + `writeAuditLog` + `emitTimelineEvent("admission.status_changed")` + calls sibling-detect. `lib/admission/transitions/__tests__/submit.test.ts` covers happy path + illegal transition rejected + audit + timeline + sibling FK populated. AC: vitest green.
- [ ] **T8 — Public submit endpoint.** Create `app/api/admission/submit/route.ts` (POST, `@public` annotation for `verify-api-auth` allowlist) + `lib/validations/admission/submit.ts` (Zod payload). Single `prisma.$transaction` wraps Address-id consumption + Admission DRAFT insert + submit transition action. Rate-limited (5/IP/hour) via existing helper if available, else TODO + Ship Note. AC: route returns `{ ok: true, trackingCode }` on valid payload; `verify-api-auth` passes (+1 public route).
- [ ] **T9 — Public `/daftar` page + multi-step client.** `app/daftar/page.tsx` (server component, resolves tenant) + `app/daftar/client.tsx` (multi-step form: applicant → parent → address → program → review/submit). Reuses `<AddressChainField>`. Bu Sari voice. Cross-checked against `design-system.html` admin form shell. Confirmation page on success shows tracking code. AC: page renders, multi-step navigation works in dev, frontend-gate satisfied (Verification mentions `design-system`).
- [ ] **T10 — Playwright canary `admission-public.spec.ts`.** New spec: visits `/daftar?tenant=demo`, fills multi-step form end-to-end with deterministic test data, submits, asserts confirmation page renders with visible tracking code prefix. AC: spec passes locally + in CI Playwright job.
- [ ] **T11 — End-of-cycle gates + Verification + Ship Notes.** `npm run build && npx vitest run && npx playwright test`; verify-rls/pii/api-auth; fill Verification + Ship Notes (including end-to-end Google sign-in URL the user can paste into Chrome). AC: all gates green; doc-sync passes.

### Dependencies

- T1 standalone.
- T2 standalone (depends on existing `08-demo-users.ts` + system role seed).
- T3 standalone (independent of T2).
- T4 standalone.
- T5 depends on T4 (template references kind for timeline ref) — but template can ship without timeline coupling. Independent.
- T6 standalone.
- T7 depends on T4 (timeline kind), T6 (sibling-detect call).
- T8 depends on T7 (submit action), T9 not required (route is form-API, page is separate).
- T9 depends on T8 (POST endpoint exists for the form to submit to). Can scaffold UI first against a typed stub.
- T10 depends on T8 + T9.
- T11 depends on all.

**Parallelizable groups:** {T1, T2, T3, T4, T6} (5 independent) → {T5, T7} (T7 needs T4+T6) → {T8} → {T9} → {T10} → {T11}. `/build` may dispatch the first group via `superpowers:subagent-driven-development`.

## Implementation

- Subagent plan: all tasks executed inline-sequential. T1–T6 are file-level independent but small; per-task code review keeps the diff scoped.
- Task 1: §18A row + cycle doc skeleton — `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` (row prepended), `docs/cycles/2026-05-10-p2-admission-funnel-ui-public.md` (created).

## Verification

- Task 1: doc-only commit; pre-commit allowlist (cycle doc + spec md) passes.

## Ship Notes

<!-- filled by /ship -->
