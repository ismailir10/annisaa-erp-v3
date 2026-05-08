# P2 Admission Funnel — Schema + State Machine + Minimal List

## Type
schema (per foundation §18.2 cycle types) — Prisma migration + `lib/*` only, no UI beyond a single 4-line scaffold list page. Playwright skip permitted; vitest covers state-machine transition table exhaustively.

## Context

Phase 2 entity backbone advances to admission. With Address (Migration 10, #208) shipped, the admission packet now has a place to land its applicant address; with Household / Student / Guardian (#191, #192) shipped, the ACCEPTED transition has people-tier targets to write into in a future cycle. This cycle delivers the **schema half** of `p2-admission-funnel`:

1. **Migration 11** — Admission, InitialAssessment, MplsCohort, MplsMember, MplsAttendance + 3 enums (AdmissionStatus, AdmissionSource, MplsCohortStatus). Tenant-scoped, composite-PK + composite-FK per §6.4, RLS folded inline, soft-delete on Admission + MplsCohort, partition-aware audit columns, 5 new `/// @PII` annotations.
2. **State-machine library** — `lib/admission/state-machine.ts` exports `ADMISSION_TRANSITIONS: Record<AdmissionStatus, ReadonlyArray<AdmissionStatus>>` + `assertTransition(from, to)` + `canTransition(from, to)` helpers. Vitest covers every legal cell + a sample of illegal cells (~25 cases). The library has no DB or session dependency — pure transition algebra. Future server-action layer (UI cycle) wraps this with `assertScope` + `writeAuditLog` + `emitTimelineEvent`.
3. **Admission entity registry** — `lib/entities/admission/{schema,entity,policy}.ts` per scaffold.md conventions. Wires into `lib/entities/_registry.ts` (was 5 → 6 entities). Read-only list this cycle: `formSections` empty, `detailTabs` deferred placeholders, `detailActions` empty (state-transition actions are UI-cycle territory because they require the side-effect bundle on ACCEPTED). Single scaffold list page mounts at `app/admin/akademik/penerimaan/page.tsx` (4-line recipe).
4. **PII gate update** — `verify-pii-annotations.sh` TRIPLES grows from 5 → 10 (Admission applicantNik, fatherNik, motherNik all `redact`; fatherPhone, motherPhone `mask:last4`).
5. **§18A ledger row + §18.1 prose split note** — prepend `p2-admission-funnel-schema` row at `next`; record the 2-cycle split decision in §18.1 prose (single `p2-admission-funnel` line splits to `-schema` + `-ui`).

**Why split into schema + ui.** The full admission feature in the user's prompt requires ≈30 staged files (5-table migration + 1 entity registry + state-machine lib + public `/daftar` form + admin review screen + 4-table MPLS UI + 3 email templates + 2 Playwright specs + cycle doc + `§18A`/README/§18.1 sync). Foundation §18.2 caps cycles at ≤25 staged files. Pre-emptively splitting at /spec time per CLAUDE.md "Pre-emptive split decision" rule beats hitting the cap mid-/build and rebasing under partial state. Schema half lands the migration + state-machine algebra + entity registry; UI half (`p2-admission-funnel-ui`) lands `/daftar`, sibling auto-detect, admin review screen + ACCEPTED side-effect bundle, MPLS UI, email templates, Playwright. The two cycles ship as a **logical pair** but each independently respects the §18.2 cap.

## Spec

### Acceptance criteria

- **AC1 — Migration 11 lands all 5 tables clean.** `Admission` + `InitialAssessment` + `MplsCohort` + `MplsMember` + `MplsAttendance` each carry: composite PK `(id, tenantId)`, audit columns (`createdAt`/`createdById`/`updatedAt`/`updatedById`), composite FKs to Tenant + (per-table) Program/AcademicYear/Address/Household/Student/Employee per §6.4 column-list syntax. Soft-delete (`deletedAt`/`deletedById`) on `Admission` + `MplsCohort` only — `InitialAssessment` (linked to admission, cascades), `MplsMember` (junction), `MplsAttendance` (operational fact) carry no soft-delete columns, mirroring the §16 ExportJob/EmailLog/WebhookEvent precedent. RLS policies (ENABLE + tenant_isolation_select + no_writes_via_postgrest deny) folded inline. CHECK constraints on enum-shaped string columns where the enum is single-purpose (`MplsAttendance.cohortDay BETWEEN 1 AND 30`). `npx prisma migrate dev --name 11_admission` clean. `prisma/migration-tests/11_admission.test.ts` post-condition asserts (parses committed `migration.sql` — no live DB) covering: 5 ENABLE RLS + 10 policies + 5 PII annotation grammar + composite-FK column-list `("addressId","tenantId")` syntax for Address.

- **AC2 — Enums declared.** `AdmissionStatus` (8 values: `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `INTERVIEW_SCHEDULED`, `OFFER_EXTENDED`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`); `AdmissionSource` (3 values: `ONLINE`, `WALK_IN`, `REFERRAL`); `MplsCohortStatus` (3 values: `PLANNED`, `ACTIVE`, `COMPLETED`). All declared via `CREATE TYPE` in migration + Prisma enum in schema. Default for `Admission.status` = `DRAFT`; default for `Admission.source` = `ONLINE`; default for `MplsCohort.status` = `PLANNED`.

- **AC3 — PII annotations land.** 5 new `/// @PII` schema annotations: `Admission.applicantNik` `redact`, `Admission.fatherNik` `redact`, `Admission.motherNik` `redact`, `Admission.fatherPhone` `mask:last4`, `Admission.motherPhone` `mask:last4`. `verify-pii-annotations.sh` TRIPLES array grows 5 → 10. `bash scripts/verify-pii-annotations.sh` reports `10 / 10 known-PII fields annotated`. `npx tsx scripts/generate-audit-redactor.ts` regenerates `lib/audit/redactor.ts` deterministically (committed) with the 5 new fields.

- **AC4 — RLS coverage gate green.** All 5 new tables tenant-scoped → `bash scripts/verify-rls-coverage.sh` reports `38 / 38 tenant-scoped models have ENABLE + policy.` (was 33 / 33 post-`p2-addresses-idn-chain` Address; +5 this cycle).

- **AC5 — State-machine library** — `lib/admission/state-machine.ts` exports:
  - `export const ADMISSION_TRANSITIONS: Readonly<Record<AdmissionStatus, ReadonlyArray<AdmissionStatus>>>` — exact transition graph (see §State Transitions below).
  - `export function canTransition(from: AdmissionStatus, to: AdmissionStatus): boolean` — pure predicate.
  - `export function assertTransition(from: AdmissionStatus, to: AdmissionStatus): void` — throws `Error("INVALID_TRANSITION: <from> → <to>")` on illegal transition. Returns void on legal.
  - No DB / session / Prisma imports — pure transition algebra. Server-action wrapping happens in the UI cycle.

- **AC6 — State-machine vitest.** `lib/admission/state-machine.test.ts` covers:
  - Every cell in `ADMISSION_TRANSITIONS` legal-transitions list returns `canTransition === true` (exactly 12 cases — the legal edges enumerated below in State Transitions).
  - At least one illegal transition per source state returns `canTransition === false` (≈8 cases — one illegal per non-terminal source, plus terminal states).
  - `assertTransition` throws on illegal with the documented error message shape (`/INVALID_TRANSITION:/` regex).
  - Terminal states (`ACCEPTED`, `REJECTED`, `WITHDRAWN`) reject ALL outbound transitions including self-loop.
  - `DRAFT → DRAFT` (self) is illegal (no-op transitions disallowed at the algebra layer).

- **AC7 — Admission entity registry.** `lib/entities/admission/schema.ts` exports `admissionSchema` covering admin-input fields (NOT server-managed: `tenantId`/audit/`status`/`siblingDetectedFromHouseholdId`/`acceptedStudentId`/timestamps are excluded). `entity.ts` exports `EntityDef<AdmissionRow>` with `searchFields: ["applicantFullName", "applicantNickname"]` (PII fields excluded), `listColumns` covering `applicantFullName` (TEXT) + `status` (ENUM render via `AdmissionStatus`) + `source` (ENUM) + `submittedAt` (DATETIME) + `programId` (RELATION → Program.name), `filters` covering search + status + source + programId + academicYearId, smart `views` per `AdmissionStatus` clusters (`view=draft`, `view=submitted`, `view=in_review`, `view=offered`, `view=decided`). **View names diverge from §10A.4 line 852** (`calon/review/approved/paid/portal/drop`) deliberately — §10A.4's view labels reference the 13-state finance-coupled taxonomy that this cycle scope-locks out via Assumption 1. Reconciliation between the 8-state and 13-state taxonomies happens in P3 finance cycles when the additional status values land; until then this cycle's 5-view names are the canonical surface for admin admission browsing. Soft-delete-aware dataFetcher per scaffold convention (clauses 1–7). `formSections` = empty (deferred to UI cycle). `detailTabs` = three deferred placeholders (`ringkasan`, `assessment`, `aktivitas`). `detailActions` = empty (state transitions ship as transition buttons in UI cycle, gated by `state-machine.ts`).

- **AC8 — Policy + registry wiring.** `lib/entities/admission/policy.ts` exports `admissionPolicy: EntityPolicy` per scaffold.md conventions: `softDelete: true`, `auditActions: [CREATE, UPDATE, SOFT_DELETE, RESTORE]`, scopes mirror §10.7.1 row 919 (`A/P/KD/AO/FO: ALL` read; `PR: OWN_STUDENT` read; `HT/ST: —`). Write scopes per §10.7.2 (`A/P/KD/AO: ALL` create/update; `A/P: ALL` soft_delete/restore; `delete: []`). W-scope (`OWN_CLASS`) deferral documented in policy comment — homeroom teachers gain access via class-assignment join only after `p2-classes-management` lands ClassSection. `lib/entities/_registry.ts` registers admission (now 6 keys: household, student, guardian, student-identifier, guardian-invitation, **admission**). `npm run scaffold:check` reports `6 / 6 entities` (was 5).

- **AC9 — Single scaffold list page mounts.** `app/admin/akademik/penerimaan/page.tsx` follows the spec §5.2 4-line recipe (mirror `app/admin/akademik/keluarga/page.tsx`). Page renders empty list (no Admission rows seeded this cycle) without errors. Sidebar group `Akademik` already includes the `Pendaftaran` entry from `p2-portal-shell-sidebar` (#204) so no nav edit needed; verify the slug match. **Frontend gate compliance:** the Verification section MUST contain the literal token `design-system` (one-line bullet citing the design-system reference for `<ScaffoldListPage>` consistency with sibling pages).

- **AC10 — §18A row prepend + §18.1 prose update (DONE at /spec time).** Both edits land at /spec time before /build begins, satisfied via this cycle doc's drafting commit: §18A grew by 1 row at `next` for `p2-admission-funnel-schema`; §18.1 Phase 2 cycle list split the single `p2-admission-funnel` line into `-schema` + `-ui` lines + cycle order line updated. **No T-task work needed** — verify in T1's pre-commit that the staged foundation md diff is the /spec-time edit only (no further re-edits). /ship Step 3 will flip the §18A row to `shipped` post-merge in a separate chore PR.

- **AC11 — All gates green.** `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npx vitest run` (state-machine test added), `npx prisma generate`, `bash scripts/verify-rls-coverage.sh` (37/37), `bash scripts/verify-pii-annotations.sh` (10/10), `bash scripts/verify-api-auth.sh` (≥14/14 — no API routes added so unchanged), `npm run scaffold:check` (6/6). Playwright skip permitted (type=schema cycle, no user-facing flow shipped) — record skip explicitly in Verification.

### Non-goals

- Public `/daftar` form, sibling auto-detect, admin review screen, ACCEPTED side-effect bundle (Household + Student + Guardian creation tx) — all `p2-admission-funnel-ui`.
- MPLS admin UI (cohort list / detail with attendance grid / bulk attendance action) — `p2-admission-funnel-ui`.
- Email templates (admission-submitted / admission-accepted / admission-rejected) — `p2-admission-funnel-ui`.
- Playwright specs — `p2-admission-funnel-ui` (canary admin flow + canary public flow).
- Detailed rubric structure on `InitialAssessment` — defer to a P5/P6 assessment cycle. This cycle ships InitialAssessment with `score Int?` + `notes Text` placeholder shape; richer rubric extends additively.
- Finance integration of admission funnel (the §10A.4 13-state taxonomy `INVOICE_SENT → PAID → PROMOTED → AWAITING_MPLS → PORTAL_ACTIVE`) — defer to P3 finance cycles. This cycle's 8-state machine covers the inquiry-through-decision arc only.
- Entity registries for `InitialAssessment` / `MplsCohort` / `MplsMember` / `MplsAttendance`. They land in the schema as DB tables but no scaffold page surface this cycle. UI cycle introduces bespoke MPLS pages (not generic scaffold) per spec §10A.4 detail-tab pattern.

### Assumptions

1. **State-machine taxonomy locked at 8 states.** User prompt specifies `DRAFT / SUBMITTED / UNDER_REVIEW / INTERVIEW_SCHEDULED / OFFER_EXTENDED / ACCEPTED / REJECTED / WITHDRAWN`. Foundation §10A.4 line 852 sketches a 13-state taxonomy that includes finance-coupled states (`INVOICE_SENT / PAID / PROMOTED`) + post-acceptance lifecycle (`AWAITING_MPLS / PORTAL_ACTIVE` / `DROPPED / AUTO_DROPPED`). Honor user prompt as scope-locked baseline; record the §10A.4 13-state taxonomy as a P3-finance + post-acceptance extension. Migration adds the 8-state enum; future migrations extend additively (`ALTER TYPE ... ADD VALUE`). Consequence: `Admission.status = ACCEPTED` is the terminal happy-path in this cycle's algebra; finance-coupled lifecycle (invoice → paid → promoted) lives in subsequent cycles via their own status surfaces (Invoice.status / EnrollmentStatus / etc.) rather than reusing AdmissionStatus.
2. **Source enum precedence.** `Admission.source` is admin-/submitter-set (`ONLINE` for `/daftar` submissions, `WALK_IN` for buku-tamu intake, `REFERRAL` for sibling/employee referrals). Sibling auto-detect (UI cycle) populates `Admission.siblingDetectedFromHouseholdId` orthogonally — even when source is explicitly `ONLINE` from `/daftar`. The two facts coexist: source is *channel*, sibling-detected is *evidence of family connection*. Admin review screen (UI cycle) surfaces both.
3. **Composite FK shape.** Per §6.4: every cross-table FK on tenant-scoped tables is composite `(<fk_col>, tenantId) → Target(id, tenantId)`. Prisma schema declares the composite relation directly (no Guardian/User issue #25061 dodge needed here — none of these FKs are nullable + ON DELETE SET NULL). On `Admission.acceptedStudentId` (nullable, set on ACCEPTED) ON DELETE SET NULL via column-list `("acceptedStudentId")` syntax — preserves §6.4 tenant alignment when Student is hard-deleted. Same for `Admission.siblingDetectedFromHouseholdId`.
4. **Address FK shape on Admission.** `Admission.addressId` is a composite FK to `Address(id, tenantId)` per §6.4. NOT NULL (every admission carries a captured address). ON DELETE RESTRICT — addresses are reusable across rows and should not vanish out from under an admission record.
5. **Soft-delete policy per table.** `Admission` YES (admin can archive abandoned admissions), `MplsCohort` YES (admin archives past waves). `InitialAssessment` NO (cascades from Admission soft-delete via app-layer; if Admission un-archived, assessments persist by virtue of the FK). `MplsMember` NO (junction between MplsCohort + Admission — its parent's soft-delete drives lifecycle). `MplsAttendance` NO (operational fact). This mirrors §16_scaffold's soft-delete asymmetry on FileAsset/OrgConfig/Holiday (YES) vs ExportJob/EmailLog/WebhookEvent (NO). **Deferred concern (UI cycle):** `Admission.detailTab.assessment` rendering MUST filter by `admission.deletedAt IS NULL` — a soft-deleted Admission's InitialAssessment rows still exist in the DB and are FK-bound; the UI cycle's dataFetcher for the assessment tab is responsible for that filter. Recorded here so it doesn't slip.
6. **Partial-unique guards.** `MplsMember` carries a UNIQUE INDEX on `(cohortId, admissionId)` — one membership per (cohort, admission). `MplsAttendance` carries UNIQUE on `(memberId, cohortDay)` — one attendance fact per member per day. Standard `@@unique`, not partial — these tables don't soft-delete so no `WHERE "deletedAt" IS NULL` needed.
7. **Denormalized parent fields on Admission.** Father/mother snapshot fields (`fatherName`, `fatherNik` PII, `fatherPhone` PII, `fatherOccupation`, `fatherMonthlyIncome` Int?, `motherName`, `motherNik` PII, `motherPhone` PII, `motherOccupation`, `motherMonthlyIncome` Int?) are **denormalized snapshots captured at submission time** — they do NOT FK to Guardian. Rationale: at submission time the parent is not yet a Guardian record; ACCEPTED transition (UI cycle) creates Guardian rows from these snapshots. Snapshot history preserves what the family declared even if their later Guardian record drifts.
8. **InitialAssessment shape minimal.** `id` + `tenantId` + `admissionId` (composite FK) + `assessorEmployeeId` (composite FK) + `assessmentDate` (Date) + `score` (Int?, optional, 0–100 placeholder) + `notes` (Text) + audit columns. No structured rubric this cycle — defer to a P5/P6 assessment cycle that introduces per-domain rubric tables.
9. **Permission seed for Admission resource.** Foundation §6.2 + `prisma/seed/06-permissions.ts` hold the canonical permission seed. This cycle does NOT update `06-permissions.ts` to add Admission rows — seed update lands in the UI cycle alongside the server actions that consume those permissions. Side effect: until the UI cycle ships, `assertScope` calls against Admission will FORBIDDEN even from admin if a session-runtime permission lookup is added; mitigated by the fact that the schema cycle's only route is the read-only scaffold list (which uses the policy.ts scope tuple directly, not the seed). Document this as the explicit deferral.
10. **The MplsCohort.academicYearId composite FK** uses standard CASCADE on academic year hard-delete — tenancy doesn't hard-delete academic years per §1, so this is dead-letter. Soft-delete-aware filtering at app-layer (UI cycle).

### State Transitions (locked here as the canonical source for `lib/admission/state-machine.ts`)

```
DRAFT                 → SUBMITTED, WITHDRAWN
SUBMITTED             → UNDER_REVIEW, REJECTED, WITHDRAWN
UNDER_REVIEW          → INTERVIEW_SCHEDULED, OFFER_EXTENDED, REJECTED, WITHDRAWN
INTERVIEW_SCHEDULED   → OFFER_EXTENDED, REJECTED, WITHDRAWN
OFFER_EXTENDED        → ACCEPTED, REJECTED, WITHDRAWN
ACCEPTED              → (terminal — no outbound)
REJECTED              → (terminal — no outbound)
WITHDRAWN             → (terminal — no outbound)
```

12 legal edges. Self-loops illegal. Skip-ahead transitions illegal (e.g., `DRAFT → ACCEPTED` rejected). UNDER_REVIEW can fast-track to OFFER_EXTENDED (skipping INTERVIEW_SCHEDULED) — this is a deliberate edge for admins who waive interview for known referrals.

## Tasks

> Marathon mode (foundation §18.12) — references foundation spec by section, skips full brainstorm. Each task ends in a passing `npm run build && npx vitest run` between-task gate before commit. End-of-cycle Playwright skip permitted (type=schema cycle).

- [ ] **T1 — Migration 11 (Admission + InitialAssessment + MplsCohort + MplsMember + MplsAttendance) + schema.prisma update** *(independent of T2/T3/T4)*
  - Hand-authored files: `prisma/schema.prisma` (add 5 models + 3 enums + relation back-links on Tenant/Program/AcademicYear/Address/Household/Student/Employee), `prisma/migrations/11_admission/migration.sql` (full DDL — `CREATE TYPE` for 3 enums + 5 `CREATE TABLE` + composite-FK column-list ALTER TABLE per §6.4 + RLS ENABLE + tenant_isolation_select + no_writes_via_postgrest deny per `08_guardians` precedent + CHECK constraints + UNIQUE indexes + 5 `/// @PII` annotations), `prisma/migration-tests/11_admission.test.ts` (post-condition assertions parsing committed `migration.sql` — RLS coverage 5 ENABLE + 10 policies + composite-FK column-list syntax for both `Admission.acceptedStudentId` and `Admission.siblingDetectedFromHouseholdId` SET NULL + 5 PII annotation grammar), `scripts/verify-pii-annotations.sh` (TRIPLES grow 5 → 10).
  - Generated file (committed alongside per cycle convention): `lib/audit/redactor.ts` (regenerated deterministically by `npx tsx scripts/generate-audit-redactor.ts`).
  - Doc-sync also staged in this commit (already drafted at /spec time): `docs/cycles/2026-05-09-p2-admission-funnel-schema.md` + `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` (§18A row + §18.1 prose split note).
  - Acceptance: `npx prisma migrate dev --name 11_admission` clean (or `migrate diff` parity for production path); `npx prisma generate` clean; `bash scripts/verify-rls-coverage.sh` reports 37 / 37; `bash scripts/verify-pii-annotations.sh` reports 10 / 10; migration-tests vitest passes (parses migration.sql, no live DB); between-task gate `npm run build && npx vitest run` green.

- [ ] **T2 — State-machine library + vitest** *(depends on T1 — needs `npx prisma generate` output for the `AdmissionStatus` enum import from `@/lib/generated/prisma/client`)*
  - Files: `lib/admission/state-machine.ts` (`ADMISSION_TRANSITIONS` const map + `canTransition` + `assertTransition`), `lib/admission/state-machine.test.ts` (vitest covering ≈25 cases — all legal edges + illegal samples + terminal-state outbound rejection + self-loop rejection + error-message shape).
  - Acceptance: `npx vitest run lib/admission/state-machine` green with ≥25 cases; type imports resolve cleanly from `@/lib/generated/prisma/client`; no DB / session imports in `state-machine.ts` (verify via `grep -E "(prisma|getSession|fetch)" lib/admission/state-machine.ts` returns nothing); between-task gate green.

- [ ] **T3 — Admission entity registry + policy + registry wiring** *(depends on T1 — needs Prisma `Admission` model type)*
  - Files: `lib/entities/admission/schema.ts` (`admissionSchema = z.object({...})` covering admin-input fields only — applicant identity + parent snapshot + addressId + programId + academicYearId; excludes `tenantId`/audit/`status`/server-set FKs/timestamps), `lib/entities/admission/entity.ts` (`EntityDef<AdmissionRow>` per scaffold conventions + dataFetcher clauses 1–7 + `searchFields` excluding PII + `listColumns` 4–5 fields + smart `views` per status cluster + deferred placeholder `detailTabs` + empty `detailActions` + empty `formSections` w/ comment pointing to UI cycle), `lib/entities/admission/policy.ts` (`admissionPolicy: EntityPolicy` per §10.7.1 row 919 + §10.7.2 + scaffold.md conventions), `lib/entities/_registry.ts` (register admission key, count grows 5 → 6).
  - Acceptance: `npm run scaffold:check` reports 6 / 6 entities (was 5); `npx tsc --noEmit` clean; between-task gate green.

- [ ] **T4 — Admin list page mount** *(depends on T3 — needs entity export)*
  - Files: `app/admin/akademik/penerimaan/page.tsx` (4-line `ScaffoldListPage` recipe per `app/admin/akademik/keluarga/page.tsx` precedent).
  - Optional: `README.md` (entity-count ADR row only if an existing row referenced an entity count — verify before editing; skip the edit if no such row exists in the active ADR table).
  - Acceptance: `npm run build` reports the new route mounting clean (Next-15 routes 200 status simulated via build-time route inspection); design-system reference noted in Verification per frontend gate; between-task gate green; end-of-cycle gate `npm run build && npx vitest run` green; Playwright skip recorded (cycle type=schema, no UI flow shipped beyond a read-only scaffold list with no Admission rows yet).

## Implementation
<!-- /build fills per task -->

## Verification
<!-- /build fills with gate output + design-system reference -->

## Ship Notes
<!-- /ship fills with PR url, migrations note, rollback -->
