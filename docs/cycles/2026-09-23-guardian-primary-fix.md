# Wali Utama — the first guardian, and the one who gets billed

## Context

Creating a student end-to-end on **production** on 2026-09-23 (the DOKU cutover test) produced a student whose only guardian was stored with `StudentGuardian.isPrimary = false`. The invoice raised for that student came out with `parentId: null`, and the DOKU Checkout session was created with `customerName = <student name>` and no `customerEmail` / `customerPhone` — the gateway had no way to reach the family. Both rows had to be patched by hand with SQL before the test could continue.

The server is not at fault. `POST /api/students/[id]/guardians` resolves `isPrimary ?? priorGuardianCount === 0` in both of its branches ([route.ts:110](../../app/api/students/[id]/guardians/route.ts), [route.ts:217](../../app/api/students/[id]/guardians/route.ts)) — FIND-010 from the [2026-05-14 UAT report](../uat/reports/2026-05-14-comprehensive-e2e.md) was fixed exactly as specified. The client defeats it: `EMPTY_GUARDIAN_FORM` sets `isPrimary: false` ([guardian-edit-dialog.tsx:79](../../components/admin/guardian-edit-dialog.tsx)) and `createNewParent()` spreads the whole form into the POST body ([page.tsx:720](../../app/admin/students/[id]/page.tsx)), so the nullish-coalescing default never fires. The sibling path in the same dialog — `linkExistingParent()` — omits `isPrimary` and *does* get the default, so the two halves of one dialog disagree with each other.

Tracing that bug surfaced a second, quieter one on the same invariant. Deactivating a guardian (`PATCH`, both guardian routes) writes `status` only and never clears `isPrimary`, so a student can hold an **INACTIVE primary** guardian. Four finance read paths — [invoices/route.ts:141](../../app/api/invoices/route.ts), [invoices/[id]/route.ts:15](../../app/api/invoices/[id]/route.ts), [payments/session.ts:61](../../lib/payments/session.ts), [materialize-billing-run.ts:94](../../lib/finance/materialize-billing-run.ts) — filter on `isPrimary: true` with no `status` filter. A deactivated parent therefore stays the billing contact and receives the payment link, while an active guardian standing right next to them is ignored. That is worse than the null we hit in production, because nothing anywhere reports it.

The list views already learned to live with missing primaries rather than fixing them: the students-list Wali column was changed in [2026-08-21-siswa-wali-linking](./2026-08-21-siswa-wali-linking.md) to order by `isPrimary desc` and `take: 1` precisely so a student with no primary still shows a name. The dossier does the same client-side (`activeGuardians.find(g => g.isPrimary) ?? activeGuardians[0]`). Billing never got that treatment, and billing is where it costs money.

UAT input: the newest report in `docs/uat/reports/` is 2026-06-04, 111 days old and older than the guardian rework in 2026-08-21 — **possibly stale, not treated as fact here**. Only FIND-010 from 2026-05-14 is cited, and only because its fix is the code under discussion.

## Spec

### Acceptance criteria

**The first guardian is primary**
- [ ] Adding the first guardian to a student through the dossier's **Tambah wali baru** (create-a-new-parent) path yields `isPrimary = true`, with no admin action.
- [ ] The client sends `isPrimary` only when the admin has explicitly switched it on. When the Wali Utama switch is off, the key is absent from the payload so the server default owns the decision. Both dialog paths (create-new and link-existing) behave identically.
- [ ] Turning the Wali Utama switch on while editing an existing guardian still promotes it and demotes the incumbent — unchanged behaviour, covered by the existing PUT tests.

**A deactivated guardian is never the billing contact**
- [ ] `PATCH` to `status: "INACTIVE"` on a guardian also clears `isPrimary` on that row, in one write. Applies to both guardian routes (`/api/students/[id]/guardians/[guardianId]` and `/api/guardians/[id]`).
- [ ] The four finance read paths additionally filter `status: "ACTIVE"` when resolving the billing parent: manual invoice create, invoice detail GET, payment-session creation, bulk billing-run materialisation.
- [ ] Deactivating the only primary guardian leaves the student with zero primaries (the documented "at most one" invariant, per [`e2e/admin-guardian-primary-invariant.spec.ts`](../../e2e/admin-guardian-primary-invariant.spec.ts)) — it does **not** auto-promote a sibling. Promotion stays an explicit admin act.

**Making someone primary takes one click**
- [ ] The guardian card on the student dossier exposes a **Jadikan wali utama** action on non-primary guardians, next to the existing edit and deactivate buttons. Today the only control is a Switch below the fold of a scrollable form behind the pencil icon.
- [ ] The action confirms before writing, naming the guardian who will be demoted, following the `ConfirmDialog` shape already used for Nonaktifkan/Aktifkan. Neutral styling, not destructive.
- [ ] Frontend diff follows `design-system`: reuses `Button size="icon-sm" variant="ghost"`, the existing card action cluster, and the "Utama" badge already rendered at [guardian-detail-card.tsx:92](../../components/admin/guardian-detail-card.tsx). No new component, no new spacing scale.

**Proof**
- [ ] Vitest covers: the create-a-new-parent branch auto-defaulting to primary (currently untested — only the link branch is), the client omitting `isPrimary` when the switch is off, `PATCH`-to-INACTIVE clearing `isPrimary`, and each finance read path's `status: "ACTIVE"` filter.
- [ ] A regression test asserts a manual invoice for a student whose only guardian came through the create path carries a non-null `parentId`.
- [ ] `npm run build && npx vitest run` green; `npx playwright test` green or explicitly deferred to the required CI check.

**Audit, report only**
- [ ] The count of students holding an ACTIVE guardian set with **no** primary row, and the count holding an **INACTIVE** primary, are measured on staging and on production and recorded in Verification. No rows are updated on either environment as part of this cycle.

### Non-goals

- **No consolidation of the three demote-then-write implementations.** `writeGuardianAsPrimarySafe` in the POST route and the two inline `runPrimaryTx` copies in the PUT routes stay as they are. They are correct today and each is covered by its own test; merging them is a refactor with its own risk budget and belongs in its own cycle.
- **No auto-promotion of a sibling** when the primary is deactivated or deleted. Zero-primary remains a legal state.
- **No schema change.** No Prisma migration.
- **No backfill.** The audit counts and reports; it does not write. Fixing historical rows is a separate, user-approved step once the numbers are known.
- **No change to `/parent/**` or the guardian-facing portals.**
- **No touching the seed/import paths** (`scripts/reseed/people.ts`'s unconditional `isPrimary: true`, `build-import-sql.ts`'s literal `true`). Noted as follow-ups, out of scope here.

### Assumptions

1. **Omitting the key is the right client fix**, not sending `isPrimary: false` and teaching the server to ignore it. The server default needs a DB count it already performs; the client has no business asserting a value the admin never chose.
2. **Clearing `isPrimary` on deactivation is safe** because every read path either tolerates zero primaries already or is being given a `status: "ACTIVE"` filter in this same cycle.
3. **Adding `status: "ACTIVE"` to the finance lookups cannot regress an existing bill**, since a student whose primary guardian is ACTIVE is unaffected, and one whose primary is INACTIVE is currently being billed to the wrong contact.
4. **The confirm dialog is worth the extra click** on the new action, because promoting silently demotes someone else and that side effect is invisible on the card.
5. The production test student *Testing Ismail Rabbani* and its hand-patched rows are deleted separately as part of the DOKU test cleanup and are **not** this cycle's concern; the audit numbers will be taken after that cleanup if it has happened, and the doc will say which.

## Tasks

- [x] **T1 — Client stops asserting `isPrimary: false`.** In `app/admin/students/[id]/page.tsx`, strip the key from the create payload unless the switch is on; keep `EMPTY_GUARDIAN_FORM.isPrimary = false` as the switch's *display* state. *Acceptance: adding the first guardian via Tambah wali baru returns a row with `isPrimary: true`, asserted by a new Vitest case on the create branch of the POST route.* No dependencies.

- [x] **T2 — Deactivation clears the primary flag.** Both `PATCH` handlers (`app/api/students/[id]/guardians/[guardianId]/route.ts`, `app/api/guardians/[id]/route.ts`) write `isPrimary: false` alongside `status: "INACTIVE"`; reactivation does not restore it. *Acceptance: Vitest asserts the update payload for each route, and that ACTIVE-toggling leaves `isPrimary` untouched.* Independent of T1.

- [x] **T3 — Finance reads ignore deactivated guardians.** Add `status: "ACTIVE"` to the primary-guardian lookup in `app/api/invoices/route.ts`, `app/api/invoices/[id]/route.ts`, `lib/payments/session.ts`, `lib/finance/materialize-billing-run.ts`. *Acceptance: one Vitest case per call site proving the where-clause shape; the payment-session test additionally proves `customerEmail` comes from an ACTIVE primary only.* Independent of T1/T2, but review together with T2.

- [ ] **T4 — "Jadikan wali utama" on the guardian card.** Add an optional `onSetPrimary` prop to `components/admin/guardian-detail-card.tsx`, rendered only when `!isPrimary`; wire it in the dossier to `PUT /api/students/[id]/guardians/[guardianId]` with `{ isPrimary: true }` behind a `ConfirmDialog` that names the current primary, then toast + refetch, matching `deactivateGuardian()`. *Acceptance: component test renders the action only for non-primary guardians; the dossier test asserts the PUT body and the confirm copy.* Depends on nothing in code, but land after T1 so the tests describe the fixed default.

- [ ] **T5 — Billing regression test.** A manual invoice created for a student whose only guardian came through the create-new path carries a non-null `parentId`, and the gateway session receives that parent's email. *Acceptance: one Vitest spec spanning `POST /api/students/[id]/guardians` → `POST /api/invoices` → `createPaymentSessionForInvoice` with the gateway mocked.* Depends on T1.

- [ ] **T6 — Audit, report only.** Run the two counting queries against staging (`udbivhchbizpxoryejgz`) and production (`vxwywmvpxetdgnxejjgk`) via the Supabase MCP and record the numbers, per environment, in Verification. *Acceptance: four numbers in the doc plus a one-line read of what they imply; zero rows written.* Last task; no code change.

## Implementation

- Subagent plan: driver=claude-opus-5-5, dirty-work=claude-sonnet-5; tasks [T1, T2, T3] parallel (disjoint files: dossier page, the two PATCH handlers, the four finance reads); tasks [T4, T5] parallel after T1 (T4 shares `app/admin/students/[id]/page.tsx` with T1, T5 asserts T1's fixed default); T6 inline by the driver (four read-only SQL counts via the Supabase MCP — no code, fan-out would cost more than it saves). Subagents implement + test and run targeted Vitest only; the driver runs the full between-task gate, reviews, and makes one commit per task, because concurrent `npm run build` in one worktree fights over `.next/`.
- Task T1: Client stops asserting `isPrimary: false` — `components/admin/guardian-edit-dialog.tsx`, `app/admin/students/[id]/page.tsx`, `components/admin/__tests__/guardian-edit-dialog.test.tsx`, `app/api/students/[id]/guardians/__tests__/route.test.ts` — new exported `guardianCreatePayload(form)` drops the `isPrimary` key unless it is `true`; both POST call sites (`saveGuardian()`'s create branch and `createNewParent()`) use it, the PUT edit path still sends the Switch value as-is. `EMPTY_GUARDIAN_FORM.isPrimary` stays `false` as display state. Review (`feature-dev:code-reviewer`): clean; considered dropping the redundant spread around the helper in `saveGuardian()` and kept it for symmetry with the edit branch on the adjacent line.
- Task T2: Deactivation clears the primary flag — `app/api/students/[id]/guardians/[guardianId]/route.ts`, `app/api/guardians/[id]/route.ts` + their `__tests__` — both `PATCH` handlers write `{ status, isPrimary: false }` on INACTIVE and `{ status }` alone on ACTIVE, in the same single `update`. No sibling promotion. Reviews: `feature-dev:code-reviewer` clean — swept every `status: "INACTIVE"` write in `app/` + `lib/`; these two handlers are the only ones on `StudentGuardian`. `superpowers:code-reviewer` clean — tenant ownership is proven before the write in both handlers, and `toggleGuardianStatusSchema` accepts only `status`, so `isPrimary` cannot be smuggled through it. No e2e asserts the old behaviour (`admin-guardian-primary-invariant.spec.ts` uses PUT only).
- Task T3: Finance reads ignore deactivated guardians — `app/api/invoices/route.ts`, `app/api/invoices/[id]/route.ts`, `lib/payments/session.ts`, `lib/finance/materialize-billing-run.ts` + tests in `invoices-manual-create`, `invoices-detail`, `xendit-helpers`, `billing-runs-rebuild` — `status: "ACTIVE"` added beside `isPrimary: true` in all four where-clauses; nothing else moved. `StudentGuardian.status` is a `String` (`prisma/schema.prisma:610`), stored values `ACTIVE | INACTIVE`. Reviews: `superpowers:code-reviewer` clean — the filter only narrows, every consumer was already null-safe (`guardians[0]?.parent`, `parentByStudent.get(id) ?? null`, `guardian?.parentId ?? null`). `feature-dev:code-reviewer` clean on the four sites; flagged one same-class read outside the spec: **`app/api/students/export/route.ts:85`** (CSV export's guardian name/phone, `where: { isPrimary: true }`). Left out of scope deliberately — not a finance path, unreachable for new data after T2, and T6 measured 0 INACTIVE primaries on both environments. Recorded as a follow-up in Ship Notes.

## Verification

- Baseline before any edit: `npx vitest run` → `Test Files 338 passed | 2 skipped (340)`, `Tests 3282 passed | 42 todo (3324)`.
- Wave-1 gate (T1+T2+T3 together — disjoint files, so one gate run covers all three commits): first `npm run build` **failed typecheck** on T3's new test (`lib/__tests__/xendit-helpers.test.ts(250,12): error TS18049: 'call.include' is possibly 'null' or 'undefined'`), masked as exit 0 by a `| tail` pipe. Fixed by asserting via `toMatchObject` on the whole call argument. Re-run with `set -o pipefail`: `npm run build` → `build exit: 0`; `npx vitest run` → `Test Files 338 passed | 2 skipped (340)`, `Tests 3295 passed | 42 todo (3337)` — exactly baseline + 13 new tests (T1 5, T2 4, T3 4), 0 failed.
- Task T1: gates passed (build + vitest run). New tests: `guardianCreatePayload (FIND-010)` › omits isPrimary from the CREATE payload when the Switch is off / sends isPrimary: true when the admin switched it on / passes every other field through unchanged; `POST guardians — isPrimary default on the create-new-parent branch` › auto-flags the first guardian as primary / does not auto-flag primary when the student already has one. `design-system`: no visual change in T1 — logic only in the dialog module and the dossier page.
- Task T2: gates passed (wave-1 run above). New tests: `PATCH {status:"INACTIVE"} writes status: "INACTIVE", isPrimary: false` / `PATCH {status:"ACTIVE"} writes status: "ACTIVE" with no isPrimary key` (nested route); `writes status: "INACTIVE", isPrimary: false when deactivating` / `writes status: "ACTIVE" with no isPrimary key when reactivating` (standalone route).
- Task T3: gates passed (wave-1 run above, after the typecheck fix). New tests: `POST /api/invoices — guardian lookup` › excludes an INACTIVE primary guardian from the billing-parent lookup; `only resolves an ACTIVE primary guardian as the billing contact` (invoice detail); `queries only ACTIVE primary guardians, and customerEmail comes from that ACTIVE row` (payment session); `only resolves ACTIVE primary guardians as the billing parent` (billing-run rebuild → `materializeBillingRun`).

## Ship Notes
