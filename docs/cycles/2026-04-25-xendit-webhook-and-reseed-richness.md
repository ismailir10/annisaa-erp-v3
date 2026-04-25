# Xendit Session Webhook Hardening + Richer Reseed Data

## Context

UAT against the freshly reseeded staging environment surfaced two related defects:

1. **Reseeded Xendit payment links cannot be simulated end-to-end.** The reseed script seeds Xendit sandbox sessions with `reference_id = "staging-tagihan-{invoiceId}"`, but the webhook handler at `app/api/xendit/webhook/route.ts:33-44` looks up the invoice via `prisma.invoice.findUnique({ where: { id: data.reference_id } })`. The `staging-tagihan-` prefix means every webhook for a reseeded invoice 200s with `"Invoice not found"` and is silently dropped. UAT cannot validate the parent payment flow.
2. **Webhook handler degrades poorly off the happy path.** The current handler:
   - Has no audit trail — lost or duplicate webhooks are invisible.
   - Uses `Payment.findFirst({ reference })` for idempotency, which races and only catches dups when Xendit happens to send the same `payment_id`. It does not dedupe by Xendit's per-delivery webhook event id.
   - Treats `payment_session.expired` as a no-op log line — the invoice stays `SENT` with a dead Xendit URL the parent can still tap.
   - Silently `200`s every unknown event with `"Event ${event} acknowledged"`, so a future Xendit API change is invisible until someone reads truncated Vercel logs.

A separate but related complaint from operator-facing review: the seeded student/parent/employee dataset is sparse (most non-required schema fields are null) and synthetic names collide ~1–3 times across the 178 active students. Demos and UAT screenshots look obviously fake.

This cycle fixes the reference_id mismatch (the root cause of the webhook silent-drop), hardens the session webhook handler with an auditable `WebhookEvent` table + dedup by synthesized event id + a real expired-session transition, and enriches the seed planners to produce realistic full-field rows with guaranteed unique display names.

**Consulted:** none. Operational follow-up to PR #134 / #135 / #137.

## Spec

### Acceptance criteria

- [ ] `Invoice.id` (the bare CUID) is used as `referenceId` in every Xendit session created during reseed — both `scripts/reseed/invoices.ts` and `scripts/finish-xendit.ts`. Production helper at `lib/xendit/helpers.ts:35` already does this; reseed now matches.
- [ ] `seedInvoices` returns successfully only after a post-write smoke assert: pick a random ACTIVE student's most recent LIVE invoice, re-fetch from DB, assert `xenditPaymentUrl` is non-null and (defensively) the row's `id` is a CUID with no prefix. Throw if mismatched. This catches the "seed format diverges from runtime expectation" class of bug at seed time, not at webhook time.
- [ ] `lib/xendit/client.ts` defensively pulls the session id from `data.id ?? data.session_id ?? data.payment_session_id` so an undocumented response shape change cannot silently null `xenditSessionId`. One-time `console.log(JSON.stringify(data))` at first session creation per script run, gated by `process.env.XENDIT_DEBUG`. Stripped before merge unless the env flag is set.
- [ ] New Prisma model `WebhookEvent` with: `id String @id @default(cuid)`, `provider String` ("xendit"), `eventId String @unique`, `eventType String`, `payload Json`, `status String` (`RECEIVED|PROCESSED|IGNORED|FAILED`), `invoiceId String?`, `errorMessage String?`, `createdAt DateTime @default(now)`, `processedAt DateTime?`, `@@index([provider, createdAt])`, `@@index([invoiceId])`. Migration files committed.
- [ ] Webhook handler at `app/api/xendit/webhook/route.ts`:
  - Verifies `x-callback-token` (existing — unchanged).
  - Extracts `eventId` from `body.id ?? body.event_id`. If null, synthesizes stable id `${event}:${data.payment_session_id ?? data.id ?? data.reference_id}:${data.status}`. Never returns 400 for missing id.
  - Inserts `WebhookEvent` with `eventId`. On Prisma `P2002` (unique violation on `eventId`) → returns 200 `{ duplicate: true }` immediately. **DB-level dedup, race-free.**
  - Switches on event type with explicit allow-list:
    - `payment_session.completed` (and `data.status === "COMPLETED"`) → existing PAID flow (advisory lock, `Payment.create`, `totalPaid` recalc, `Invoice.status = PAID`). `WebhookEvent.status = PROCESSED` + `invoiceId` populated.
    - `payment_session.expired` → `Invoice.status = "CANCELLED"`, null out `xenditSessionId` + `xenditPaymentUrl` so the admin "Kirim Tagihan" button can re-issue the link. `WebhookEvent.status = PROCESSED`.
    - Any other `event` → `WebhookEvent.status = IGNORED`, `console.warn("[XENDIT WEBHOOK] Unhandled event", { event, eventId, payloadKeys: Object.keys(data) })`. Returns 200 — Xendit does not retry for handled-but-ignored events. **Per scope decision: only session.* events get business logic.**
  - Wraps body of switch in try/catch. On throw → `WebhookEvent.status = FAILED`, `errorMessage` stored, returns 500 so Xendit retries. The retry hits the same `eventId` → `P2002` → 200 `{ duplicate: true }` (because the FAILED row already holds the eventId). **This means a failed-once-then-fixed deploy will not auto-recover via retry. Trade-off accepted — `WebhookEvent` audit row makes manual replay possible.**
  - Updates `WebhookEvent.processedAt` at end of every code path.
- [ ] Vitest cases for the webhook handler covering: (1) happy path completed → PAID + Payment row + WebhookEvent PROCESSED, (2) duplicate eventId → second call returns `{ duplicate: true }` and only one Payment row exists, (3) expired session → Invoice CANCELLED + xendit fields null, (4) unknown event → 200 + WebhookEvent IGNORED + no Invoice mutation, (5) missing token → 401, (6) missing reference_id → WebhookEvent persisted with synthesized eventId, returns 200 with skip note, (7) handler throws mid-tx → WebhookEvent status FAILED + errorMessage stored.
- [ ] Seed planners enriched (no schema changes):
  - **Student fields filled:** `address`, `nis` (auto `${enrollYear}.${zeroPad(seq, 4)}`), `nisn` (10-digit synthetic), `nik` (16-digit synthetic, prefix `9` to mark non-real), `kkNumber` (16-digit synthetic), `birthPlace` (pool: Bekasi, Jakarta, Cikarang, Bandung, Surabaya), `livingWith` (90% `ORANG_TUA`, 8% `WALI`, 2% `LAINNYA`), `metadata` (JSON: `hobby`, `bloodType`, `allergies`). `photoUrl` left null (no real photo asset).
  - **Parent fields filled:** `whatsapp` (same as `phone`), `address`, `nik` (synthetic), `employer`, `employerAddress`, `employerCity`, `childrenTotal` (1–3 weighted).
  - **Employee fields filled:** `formalName`, `noHp`, `bankAccountNo` (10-digit), `bankName` (BSI 70% / BCA 25% / Mandiri 5%), `bpjsEnrolled` (90% true).
- [ ] Synthetic display names are guaranteed unique within their cohort:
  - `planStudents`: maintain `Set<string> seenNames` during synthetic generation; on collision retry up to 10 times with new random pick; if still colliding, append `" #{n}"` numeric suffix counter. Emit warn count of collisions encountered.
  - `planParents`: same pattern on `displayName`.
  - Preserved fixtures (Bilal Hakim, Ahmad Faris Abdullah, Ibu Nurul, Ibu Rina) are inserted first and reserved in the seen-set so synthetic names never collide with them.
- [ ] README "Reseeding staging" section updated with: (a) `XENDIT_WEBHOOK_TOKEN` reminder (must exist in Vercel preview env or all webhooks 401), (b) post-reseed smoke step "open one Apr-2026 invoice in parent portal and click the Xendit URL — should redirect to dev.xen.to checkout".
- [ ] Existing 88 vitest cases still pass. New webhook + dedup tests added. Build clean.

### Non-goals

- **No support for non-session Xendit events** (`payment.succeeded`, `payment.failed`, `payment.expired`, `payment_method.*`, `invoice.*` etc.). Per explicit scope decision: this app uses the Xendit Sessions API only; non-session events are logged + ignored, not implemented.
- **No re-implementation of `lib/xendit/helpers.ts`.** Production create-session path is unchanged.
- **No new Invoice status `EXPIRED`.** Schema currently allows `DRAFT|SENT|PARTIALLY_PAID|PAID|OVERDUE|CANCELLED`. Expired sessions reuse `CANCELLED` to avoid touching list filters + UI strings + admin status badges. `Invoice.notes` (free-form) gets a marker if needed.
- **No CI billing fix.** GitHub Actions billing failure is operator-side; out of scope.
- **No real photos.** `Student.photoUrl` stays null.

### Assumptions (correct now if wrong)

1. The Xendit Sessions API webhook payload always carries `event` and `data.reference_id`. (Verified by reading `app/api/xendit/webhook/route.ts` — current handler treats both as truthy.)
2. The webhook payload `body.id` is the per-delivery event id (Xendit standard). When absent, the synthesized fallback `${event}:${session_id}:${status}` produces a stable-enough key for dedup. (If a real Xendit delivery includes a separate header like `webhook-id`, it overrides.)
3. Production Xendit dashboard's webhook URL points at the staging domain when running staging UAT. Operator responsibility, not script-enforced.
4. `XENDIT_WEBHOOK_TOKEN` is set in Vercel preview env. Without it, all webhooks 401 — surfaced in Vercel logs but not auto-detected by reseed.
5. `prisma migrate deploy` runs on Vercel build (per existing `vercel-build.sh`); the new `WebhookEvent` table will exist on staging before the new webhook handler tries to write to it.
6. Synthetic NIK/NISN/KK numbers prefixed with `9` are obviously fake — no risk of being mistaken for real government ids during demos.

## Tasks

Sequential. Each independently committable; gates between every commit.

- [x] **T0 — Confirm Vercel build runs `prisma migrate deploy`.** Read `scripts/vercel-build.sh` and verify it includes `npx prisma migrate deploy` before `next build`. If not, T4's migration won't apply to staging when the PR merges and the new webhook handler will crash on first call. **Acceptance:** `vercel-build.sh` confirmed to run migrate; if absent, add it as a precursor commit before T4.

- [x] **T1 — Fix `referenceId` format in reseed.** Change `referenceId: \`staging-tagihan-${inv.id}\`` → `referenceId: inv.id` in `scripts/reseed/invoices.ts` and the matching path in `scripts/finish-xendit.ts`. Add a vitest assertion in `scripts/reseed/__tests__/invoices.test.ts` that the params object built for Xendit always carries `referenceId === invoice.id`. **Acceptance:** new vitest case passes; existing 88 still green; grep shows no `staging-tagihan-` prefix anywhere in the reseed module.

- [x] **T2 — Reseed-time smoke assert.** At the end of `seedInvoices`, after both historical PAID and live Xendit phases, run `prisma.invoice.findFirst({ where: { xenditPaymentUrl: { not: null } }, orderBy: { createdAt: "desc" } })`. If zero rows match, throw with descriptive error (means every Xendit call was rate-limited / failed — operator should re-run after Xendit cooldown). For the row found, assert `id` matches CUID shape `^c[a-z0-9]{20,}$` (defense vs accidental prefix). Throw with the offending invoice id and reference_id-vs-id mismatch detail. **Acceptance:** unit test that mocks `prisma.invoice.findFirst` to return null → throws zero-rows error; mocks to return a row with prefixed id → throws CUID-mismatch error.

- [ ] **T3 — Defensive Xendit response parsing.** Update `lib/xendit/client.ts` `createXenditSession` to read `id` from `data.id ?? data.session_id ?? data.payment_session_id`. Behind `process.env.XENDIT_DEBUG === "1"`, also `console.log("[XENDIT DEBUG] Session response:", JSON.stringify(data))`. Add a vitest mock of fetch that returns each shape and asserts the right id is selected. **Acceptance:** all three response shapes resolve to a non-null `id`.

- [ ] **T4 — Add `WebhookEvent` Prisma model + hand-written migration.** Edit `prisma/schema.prisma` to add the model per the Spec acceptance shape. **Do NOT run `prisma migrate dev`** — the worktree's `.env` is symlinked to the main checkout's `DATABASE_URL` which points at the live staging Supabase pooler; `migrate dev` would apply the migration to staging immediately. Instead: hand-write the migration SQL at `prisma/migrations/<YYYYMMDDhhmmss>_add_webhook_event_table/migration.sql` by reading `prisma/schema.prisma` for the model and translating to PostgreSQL DDL (CREATE TABLE + indexes + constraints). Cross-reference the SQL shape against an existing Prisma-generated migration in the repo (e.g. `prisma/migrations/20260415_*`) for style. Run `npx prisma generate` locally to ensure the client compiles against the new model. **Acceptance:** `npx prisma generate` succeeds; SQL passes a manual read-through (no destructive ALTERs, IF NOT EXISTS where appropriate, all schema-defined indexes present); staging build's `prisma migrate deploy` will apply cleanly on the next Vercel build.

- [ ] **T5 — Refactor webhook handler (session events only).** Rewrite `app/api/xendit/webhook/route.ts` per the Spec. Key shape:
  ```ts
  // 1. token check (unchanged) — 401 on mismatch
  // 2. JSON.parse body inside try → 400 on malformed
  // 3. synthesize eventId = body.id ?? body.event_id
  //    ?? `${event}:${data.payment_session_id ?? data.id ?? data.reference_id}:${data.status}`
  // 4. INSERT WebhookEvent (RECEIVED). On P2002 → return 200 { duplicate: true }.
  // 5. try {
  //      switch on event:
  //        - payment_session.completed + data.status==="COMPLETED" → existing PAID flow
  //          (advisory lock, payment row, totalPaid recalc); WebhookEvent.status = PROCESSED
  //        - payment_session.expired → Invoice.status = CANCELLED + null xendit fields;
  //          WebhookEvent.status = PROCESSED
  //        - data.reference_id resolves to no Invoice (any session event) → IGNORED + warn,
  //          status 200 (do NOT make Xendit retry)
  //        - default (any other event) → IGNORED + warn(event, eventId, payloadKeys); 200
  //    } catch (transientError) {
  //      // DB flake / unexpected throw — DELETE WebhookEvent so retry inserts cleanly.
  //      await prisma.webhookEvent.delete({ where: { eventId } });
  //      return 500;
  //    }
  // 6. WebhookEvent.processedAt = now
  ```
  Surface `WebhookEvent.eventId` in error responses for observability (not the full payload).
  **Concurrency note (acceptable, document inline):** if a duplicate webhook arrives within the original's in-flight tx window (~50–200ms between INSERT WebhookEvent and Invoice update commit), the dup hits P2002 and 200s before the original's mutation lands. Eventual state is consistent because the advisory lock serialises the Invoice mutation, but Xendit may receive `{ duplicate: true }` while the parent UI hasn't yet flipped to PAID. Acceptable trade-off vs. a queue/lock layer.
  **Acceptance:** TypeScript compiles; vitest cases (T6) pass; manual smoke against a curl'd test payload (documented in Verification) works for completed, expired, unknown, and invoice-not-found cases.

- [ ] **T6 — Webhook vitest cases.** Grep `lib/__tests__/` and any `app/**/__tests__` directories first to pick the existing convention; default to `lib/__tests__/xendit-webhook.test.ts` if no API-route test convention exists. Cover the seven cases listed in Acceptance. Mock `@/lib/db` (prisma) + verify side-effects + WebhookEvent row state in each. Add an extra case for the FAILED-then-DELETE retry path: simulate prisma throwing inside the tx → assert `webhookEvent.delete` was called with the same eventId. **Acceptance:** 8+ new cases passing; full vitest suite ≥ 95 cases green.

- [ ] **T7 — Enrich seed planners (full-field + dedup).** Update `scripts/reseed/people.ts`:
  - Extend `StudentPlan`, `ParentPlan`, `EmployeePlan` types with the new fields.
  - Add data pools: `BIRTH_PLACES`, `BANKS_WEIGHTED`, `BEKASI_ADDRESSES` (plausible street names + RT/RW), `EMPLOYERS`, `EMPLOYER_CITIES`, `HOBBIES`, `BLOOD_TYPES`, `ALLERGIES`.
  - `planStudents`: add Set-based name dedup with retry + numeric-suffix fallback. Generate full set of new fields per row. Include preserved children (Bilal Hakim, Ahmad Faris Abdullah) in the seen-set first.
  - `planParents`: same dedup pattern for `displayName`. Fill `whatsapp/address/nik/employer/employerAddress/employerCity/childrenTotal`.
  - `planEmployees`: fill `formalName/noHp/bankAccountNo/bankName/bpjsEnrolled`.
  - `seedPeople` writer: pass the new fields to `prisma.student.create`/`prisma.parent.create`/`prisma.employee.create`. **Acceptance:** vitest cases assert (a) Set of `student.name` has length 200 (no dups), (b) Set of `parent.displayName` has length matching parent count, (c) every Student plan has non-null address/nis/nisn/birthPlace/livingWith, (d) every Parent plan has non-null address/whatsapp/employer.

- [ ] **T8 — Operator docs + Ship Notes.** README "Reseeding staging" section: add `XENDIT_WEBHOOK_TOKEN` to the env-var checklist + add the post-reseed UAT smoke step ("open one Apr-2026 invoice in parent portal and click the Xendit URL; complete a sandbox payment; expect Invoice status to flip to PAID within 30s"). Cycle doc Ship Notes describes:
  - The new Prisma migration runs automatically on Vercel build via `vercel-build.sh` `prisma migrate deploy` (verified in T0).
  - The operator MUST re-run reseed (`STAGING_CONFIRM=yes npm run reseed:staging`) after merge — **clean reseed, full destructive wipe** — so the 540 stale Xendit sessions on staging (with the broken `staging-tagihan-` prefix) are replaced with new sessions whose `reference_id = invoice.id`.
  - Operator MUST verify the Xendit dashboard webhook URL points at `https://annisaa-erp-v3-git-staging-ismails-projects-196d40d3.vercel.app/api/xendit/webhook` and `XENDIT_WEBHOOK_TOKEN` is set in Vercel preview env.
  - Rollback path: revert the merge (Prisma migration auto-applies a noop on next deploy if the table already exists; manual SQL `DROP TABLE "WebhookEvent"` only if rollback is irreversible).

  **Acceptance:** README diff shows the additions; cycle doc Ship Notes filled with the four bullets above.

## Implementation

- Subagent plan: all 9 tasks sequential. T0 reads only; T1+T2+T3 share `scripts/reseed/invoices.ts` + `lib/xendit/client.ts` (sequential to avoid merge); T4 must precede T5 (model→handler); T5 must precede T6 (handler→tests); T7 touches separate seed planners. Inline execution; per-task `feature-dev:code-reviewer` dispatch + `superpowers:code-reviewer` for T4/T5 (security-sensitive: auth + DB + webhook).
- Task 0: Confirmed `scripts/vercel-build.sh` runs `npx prisma migrate deploy` on `staging` and `main` branches before `next build`. New `WebhookEvent` migration will apply automatically when this PR merges to staging. Feature/preview branches skip migrate deploy and use the staging DB directly — preview webhook calls before T4's migration lands on staging would crash, but Xendit doesn't route to preview URLs by default, so the risk window is closed.
- Task 2: Reseed-time smoke assert — `scripts/reseed/invoices.ts` exports new pure helper `assertXenditReferencingSmokeRow(row)` that throws on (a) null row (zero Xendit-linked invoices = full rate-limit failure), (b) id not matching `/^c[a-z0-9]{20,}$/` (catches reintroduced prefix), (c) null xenditPaymentUrl despite query filter (defense). Wired into `seedInvoices` after the Xendit `Promise.all`. 5 vitest cases. Reviewer flagged the smoke only validates one row + does not catch wrong-id-stored-on-row scenario; out-of-scope acceptable omission. Commit unblocked.
- Task 1: Fixed `referenceId` format in reseed — `scripts/reseed/invoices.ts` + `scripts/finish-xendit.ts` now pass `inv.id` directly (was `staging-tagihan-${inv.id}`). Added 2 static-source vitest cases to `scripts/reseed/__tests__/invoices.test.ts` blocking the prefix from returning via template literal OR string concat. Reviewer flagged regex too narrow → tightened to literal string + concat guards before commit.

## Verification

- Task 0: read-only verification of `scripts/vercel-build.sh`. No gates run.
- Task 1: `npx vitest run scripts/reseed/__tests__/invoices.test.ts` — 6/6 passing (+2 referenceId guards). `npm run build` — clean. Reviewer pass clean after regex tightening.
- Task 2: `npx vitest run scripts/reseed/__tests__/invoices.test.ts` — 11/11 passing (+5 smoke-assert cases). `npm run build` — clean. Reviewer pass clean.

## Ship Notes
