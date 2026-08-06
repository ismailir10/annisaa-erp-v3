# Salary-Slip Email Removal + Env-Correct Email Links

## Context

This cycle came out of a full mailing-template review (all 8 Talib outbound emails: 3 custom Resend templates + 5 Supabase Auth templates). Two decisions came out of that review:

1. **Salary-slip email is redundant.** `POST /api/payroll/[id]/send-slips` renders a PDF and emails it per employee via Resend. But `GET /api/slips/my` already gates teacher visibility on `payrollRun.status IN (APPROVED, EXPORTED, SLIPS_SENT)` — teachers can already see and download their slip from `/teacher/slips` as soon as a run is `APPROVED`, with no dependency on the email having been sent. The email is pure overhead: extra Resend spend, extra failure surface (per-employee send loop, rate-limit throttling, retry/idempotency bookkeeping), extra `EmailLog` volume, for a link the teacher didn't need. Cutting it makes outbound email usage more deliberate (fewer sends = lower cost, less noise, less to audit).

2. **Email links can silently point to the wrong environment.** `lib/email/enrollment-invite.ts`, `lib/email/admission-submitted.ts`, and their route callers build links via `process.env.NEXT_PUBLIC_APP_URL || "https://talib.annisaasekolahku.com"`. Vercel's Preview (staging) scope has no `NEXT_PUBLIC_APP_URL` set (confirmed prior finding, see memory `reference_staging_email_override_dead`), so this silently falls back to the **production** URL. Worst case: `app/api/enrollments/invite/route.ts:135` builds the parent-facing tokenized form link (`formUrl`) this way — a staging invite email would send a parent a link to `talib.annisaasekolahku.com/pendaftaran/<token>`, which 404s or resolves against the wrong (prod) database entirely. The codebase already has the correct pattern for this — `resolveAppOrigin(requestOrigin)` in `lib/payments/session.ts`, used by payment return URLs so preview/staging/prod each get their own host — but the email code paths never adopted it. This cycle wires the two email-triggering routes to pass `new URL(req.url).origin` through, the same way payment sessions already do.

Non-goals for this cycle, explicitly deferred: PDF-generation routes (`app/api/slips/[payrollItemId]/pdf/route.ts`, `app/api/guardian/invoices/[id]/pdf/route.ts`) have the identical hardcoded-fallback bug but are not emails — out of scope for a mailing-template cycle, flagged separately. The 5 Supabase Auth `.html` templates hardcode `talib.annisaasekolahku.com/logo.png` for the logo *image* only (not the functional `{{ .ConfirmationURL }}` link, which Supabase substitutes per-project) — this is documented as intentional in `docs/runbooks/supabase-email-templates.md` and is not touched here.

## Spec

**Acceptance criteria:**
- [ ] "Kirim Slip" button removed from `app/admin/(hr)/payroll/[id]/page.tsx`
- [ ] `POST /api/payroll/[id]/send-slips` route deleted
- [ ] `lib/email/send-slip.ts` and `lib/email/templates/salary-slip.ts` deleted
- [ ] `app/api/payroll/stats/route.ts` no longer reports a `slipsSent` count sourced from a route that no longer runs (either drop the stat or repoint it — see assumption 2)
- [ ] No Prisma migration: `PayrollItem.emailSent`, `PayrollRun.status = SLIPS_SENT`, `PayrollRun.slipsSentAt` stay in the schema untouched, unreferenced by new code, harmless for existing rows (per explicit user decision — minimal blast radius, no prod payroll table migration)
- [ ] `app/api/enrollments/invite/route.ts` builds `formUrl` from `resolveAppOrigin(new URL(req.url).origin)` instead of `process.env.NEXT_PUBLIC_APP_URL || "https://talib.annisaasekolahku.com"`
- [ ] `app/api/admission/submit/route.ts` passes the same request-derived origin into `sendAdmissionSubmittedEmail` for the logo `appUrl`
- [ ] `lib/email/enrollment-invite.ts` and `lib/email/admission-submitted.ts` (sender wrappers) accept the resolved origin as a parameter instead of resolving it internally with the hardcoded fallback
- [ ] `npm run build && npx vitest run` passes

**Non-goals:**
- No change to PDF-generation routes' `appUrl` fallback (same bug, different surface — flag as follow-up, don't fix here)
- No change to the 5 Supabase Auth `.html` templates
- No Prisma migration / schema change
- No change to `STAGING_EMAIL_OVERRIDE` (documented-but-dead recipient-redirect var — separate problem from link-host correctness, not this cycle)
- No Vercel env var changes (setting `NEXT_PUBLIC_APP_URL` on Preview would still be good defense-in-depth now that request-origin is the primary source, but that's infra config outside this code cycle)

**Assumptions:**
1. `resolveAppOrigin` throws if it gets neither a request origin nor the env var. In both call sites, `new URL(req.url).origin` is always present in a Next.js route handler, so the throw path is effectively unreachable — but it's still the right primitive to reuse rather than re-deriving similar logic inline.
2. `app/api/payroll/stats/route.ts`'s `slipsSent` stat: keep it reading the existing `SLIPS_SENT` enum value (historical runs already in that state keep counting) but note in the admin UI copy nothing implies new runs will reach it. Not repurposing the label — just leaving the stat as a historical/legacy counter. If the admin payroll list still filters by `SLIPS_SENT` status (`app/admin/(hr)/payroll/page.tsx:284`), leave that filter option in place too (harmless, just won't gain new members going forward).
3. Deleting the "Kirim Slip" button leaves `app/admin/(hr)/payroll/[id]/page.tsx`'s approved-run action row with whatever action(s) remain (e.g. export). No replacement CTA needed — nothing to click to "publish", visibility is automatic on `APPROVED`.

→ Correct me now or `/build` will proceed with these.

## Tasks

Tasks 1 and 2 are independent (disjoint files). Task 3 depends on nothing but touches the same two email sender files as background reading only, no conflict.

- [x] **Task 1 — Remove salary-slip email send path.**
  Delete `app/api/payroll/[id]/send-slips/route.ts`, `lib/email/send-slip.ts`, `lib/email/templates/salary-slip.ts`. Remove the "Kirim Slip" button and its handler/fetch call from `app/admin/(hr)/payroll/[id]/page.tsx`. Leave `PayrollItem.emailSent`, `PayrollRun.status` enum (`SLIPS_SENT` stays a valid value), `PayrollRun.slipsSentAt`, and the `SLIPS_SENT` filter option in `app/admin/(hr)/payroll/page.tsx:284` untouched. Leave `app/api/payroll/stats/route.ts`'s `slipsSent` counter reading the existing enum value.
  *Acceptance:* grep for `send-slips`, `sendSalarySlipEmail`, `salarySlipEmailHtml` returns zero hits outside this cycle's own doc and any `__tests__` files that also get deleted/updated; build + vitest run green; `/teacher/slips` unaffected (still reads `APPROVED`/`EXPORTED`/`SLIPS_SENT`, no code path removed there).
  *Standards:* loads `design-system.html` (removing a button — frontend gate) + `patterns.md` (admin detail page action row).

- [x] **Task 2 — Wire request-origin into enrollment-invite and admission-submitted email links.**
  In `app/api/enrollments/invite/route.ts`: import `resolveAppOrigin` from `@/lib/payments/session`, replace line 135's `process.env.NEXT_PUBLIC_APP_URL || "https://talib.annisaasekolahku.com"` with `resolveAppOrigin(new URL(req.url).origin)`, keep `formUrl` construction as-is downstream. In `app/api/admission/submit/route.ts`: same import, resolve origin once near the top, pass it into `sendAdmissionSubmittedEmail` as a new param. Update `lib/email/enrollment-invite.ts` (`sendEnrollmentInviteEmail`) and `lib/email/admission-submitted.ts` (`sendAdmissionSubmittedEmail`) to accept `appUrl`/`appOrigin` as a required param from the caller instead of resolving `process.env.NEXT_PUBLIC_APP_URL` internally — the route is now the single place origin gets resolved.
  *Acceptance:* grep for `NEXT_PUBLIC_APP_URL || "https://talib.annisaasekolahku.com"` inside `lib/email/enrollment-invite.ts` and `lib/email/admission-submitted.ts` returns zero hits; both files' exported functions require the origin as a param (type error if omitted); build + vitest run green; existing tests in `lib/email/__tests__/` updated to pass an explicit origin.
  *Standards:* none (no UI surface).

## Implementation

- Subagent plan: driver=claude-sonnet-5 (only tier available this session), dirty-work=n/a. Tasks 1+2 small, file-disjoint, mechanical — fan-out overhead exceeds savings; proceeding inline per SKILL.md small-cycle exception.
- Task 1: deleted `app/api/payroll/[id]/send-slips/route.ts`, `lib/email/send-slip.ts`, `lib/email/templates/salary-slip.ts`. Edited `app/admin/(hr)/payroll/[id]/page.tsx` (removed "Kirim Slip" button, AlertDialog confirm modal, `handleSendSlips`, `sendModal`/`sending` state, unused `Send` icon import), `lib/email/__tests__/escape.test.ts` (removed `salarySlipEmailHtml` XSS block + import), `app/api/payroll/[id]/approve/route.ts` + `app/api/xendit/create-session/route.ts` (comment-only, trimmed dangling references to the deleted flow). Code-reviewer pass surfaced one additional orphan not in the original task list: `lib/permissions.ts:29` still defined `"payroll.send_slips": "Kirim slip gaji"`, a dead checkbox in the admin role-management UI with nothing left to gate — removed. Schema (`PayrollItem.emailSent`, `PayrollRun.status = SLIPS_SENT`, `slipsSentAt`) and the list-page `SLIPS_SENT` filter option left untouched per spec.

- Task 2: `lib/email/enrollment-invite.ts` + `lib/email/admission-submitted.ts` — `appUrl` is now a required param on `sendEnrollmentInviteEmail`/`sendAdmissionSubmittedEmail`, resolved internally no more. `app/api/enrollments/invite/route.ts` + `app/api/admission/submit/route.ts` — import `resolveAppOrigin` from `@/lib/payments/session` (the same function payment return URLs already use for this exact problem), call `resolveAppOrigin(new URL(req.url).origin)` once per request, pass the result down as `appUrl`. Code-reviewer pass flagged one cosmetic issue: `resolveAppOrigin`'s throw message in `lib/payments/session.ts` was hardcoded `"[XENDIT] No origin available..."`, misleading now that email code also calls it — reworded to `"No app origin available..."`, updated the one test (`lib/__tests__/xendit-helpers.test.ts`) asserting on that string.

## Verification

- Task 1: gates passed (`npm run build && npx vitest run` — 3 pre-existing timeout flakes in unrelated files `app/admin/students/__tests__/page.test.tsx`, `components/teacher/__tests__/leave-sheet.test.tsx`, `app/admin/raport/__tests__/raport-editor.test.tsx`; confirmed pre-existing by re-running those 3 files in isolation — all pass in <4s outside full-suite parallel load, diff touches none of them). `superpowers:code-reviewer` clean after fixing the `lib/permissions.ts` orphan it found; re-ran build + targeted vitest after that fix, both green.
- Task 2: gates passed (`npm run build && npx vitest run` — 2672 passed, 0 failed, all 3 Task 1 flakes passed clean this run too). `superpowers:code-reviewer` verified: `new URL(req.url).origin` always truthy in a Next.js route handler (throw path unreachable in practice); `resolveAppOrigin` call site in `admission/submit/route.ts` confirmed inside the existing best-effort try/catch (public route, no unhandled crash risk); `enrollments/invite/route.ts` call site sits at the same risk level as the rest of that handler's unguarded DB/token calls (no regression); re-grepped both sender function names, only the two route files call them for real, both `__tests__/route.test.ts` files mock the functions entirely so no compile break. One cosmetic finding (error message) fixed, gates re-run green.
- End-of-cycle: `npm run build && npx vitest run` green (2672 passed, 0 failed, final run). Checked `e2e/teacher.spec.ts` for "Kirim Slip"/"Slip Gaji"/send-slips references — all matches are the teacher-facing `/teacher/slips` view/download page (`Slip Gaji` heading, nav link), a separate unaffected feature; nothing asserts on the removed admin "Kirim Slip" button. No payroll-admin e2e spec exists in `e2e/` (not in the 33-spec inventory), so nothing to update there.
- Playwright: local run deferred to CI (`.env` `DATABASE_URL` points at the real staging Supabase project — memory `reference_e2e_writes_to_staging_db` documents that Playwright runs mutate real staging data; running it interactively from this session risks unnecessary staging writes for a cycle with no Playwright-covered surface changed). Required CI check `Playwright E2E` gates the merge; CTO will not merge on red.

## Ship Notes

**Migrations:** none. `PayrollItem.emailSent`, `PayrollRun.status = SLIPS_SENT`, `PayrollRun.slipsSentAt` all stay in the schema, unreferenced by new code, harmless for existing/historical rows.

**Env vars:** none new. `NEXT_PUBLIC_APP_URL` is no longer relied on as the primary source for enrollment-invite/admission-submitted email links — `resolveAppOrigin` now prefers the request's own origin, falling back to `NEXT_PUBLIC_APP_URL` only when no request origin is available (never true from a route handler in practice). Setting `NEXT_PUBLIC_APP_URL` on Vercel Preview is still recommended as defense-in-depth (covers any future non-request-scoped caller) but is no longer required for this cycle's fix to work.

**Manual smoke on preview URL:**
1. Open an APPROVED payroll run in `/admin/payroll/[id]`. Confirm the "Kirim Slip" button is gone and no console error on load.
2. Confirm `/teacher/slips` still shows the slip for an APPROVED run (unaffected — this was the whole point, visibility never depended on the email).
3. Trigger the enrollment-invite flow ("Kirim Formulir" on a qualifying Admission) on the **preview deployment** and confirm the returned `formUrl` (and, if `RESEND_API_KEY` is set on preview, the actual received email link) points at the **preview's own host**, not `talib.annisaasekolahku.com`.
4. Submit `/daftar` with a `parentEmail` on preview; if a real send goes out, confirm the email's logo image loads from the preview host, not prod.

**Rollback plan:** revert this branch's merge commit. Both commits are subtractive/behavior-preserving-elsewhere (removed a redundant send path; changed which URL an existing send path uses) — no data migration to undo. `EmailLog` rows already written under `template="salary_slip"` remain valid historical records if reverted.

**Risk:** low. Task 1 removes a feature with a confirmed-redundant visibility dependency (`/teacher/slips` never needed `SLIPS_SENT`). Task 2 changes only which URL two best-effort emails link to — worst case of a regression here is a wrong-host link, the same failure mode this cycle fixes, not a new class of failure.
