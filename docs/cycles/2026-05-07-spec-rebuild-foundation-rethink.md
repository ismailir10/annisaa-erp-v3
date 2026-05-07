# spec-rebuild-foundation-rethink — surface IA + scope matrix + Phase 2 reconciliation gaps in foundation md

**Type:** docs
**Phase:** post-Phase-1 / pre-Phase-2-pages bookkeeping
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §4.1 + §10 + §15 + §18.1

## Context

Foundation spec drafted 2026-05-04. 14 rebuild cycles shipped since: 1 P0 + 10 P1 (after `p1-audit-timeline-files` + `p1-scaffold-engine-skeleton` split mid-cycle per §18.2 cap) + 3 P2 (`p2-students-guardians-household`, `p2-guardians`, `p2-scaffold-registries`) + spec-sync reconciliation (PR #189). Reality has drifted from spec in four areas surfaced when `p2-scaffold-pages` was about to ship 20 admin pages with no IA placement contract:

1. **§10 Per-Actor Journey is task-level only — no Information Architecture per portal.** Spec lists "Walas marks digital, admin exports" but does not enumerate sidebar groups, per-page entity backing, or per-page minimum read scope. Symptom: scaffold pages would mount under `/admin/<entity>` with no group spec to reference; sidebar nav has no canonical source.
2. **§4.1 entity inventory is undercounted + missing settings entities.** Spec says "~50 models" but full per-domain expansion is ~75. `RolePermission` (shipped in `02_identity`) absent from §4.1. User-flagged `Pengaturan > Jam Kerja` page has no entity statement (covered by `OrgConfig` work-fields per v1 audit §2.3, but spec is silent on the page placement). Yayasan reporting / event mgmt / referral status need explicit MVP-vs-v1.1 calls.
3. **§18.1 Phase 2 cycle list pre-dates the actual P2 split.** `p2-students-guardians-household` shipped `Student/Household/StudentIdentifier` only; `p2-guardians` shipped `Guardian/StudentGuardian/GuardianInvitation` as a separate cycle (split per §18.2 cap, same pattern as Phase 1). `p2-scaffold-registries` is new (lib/entities/* ratchet) — not in spec §18.1. `p2-scaffold-pages` is paused mid-/spec waiting on IA.
4. **§10.x role × entity scope matrix is implicit only.** Each `lib/entities/*/policy.ts` declares scope tuples but spec doesn't have a canonical role × entity table, so `p2-scaffold-registries` had to invent "finance_officer reads Household for sibling discounts" without spec back-pressure. First entity to ship without back-pressure that conflicts with the matrix becomes a drift report against either the spec or policy.ts.

This cycle is doc-only. Output: foundation md updated in-place with new §10A (IA per portal), §10.7 (role × entity scope matrix), §4.1 reconciliation note, §15 v1.1 refresh, §18.1 Phase 2 refresh. Plus this cycle doc. Marathon mode (foundation §18.12) — context block above is the brief; brainstorming skipped.

Cross-checked design-system.html: N/A (doc-only, no frontend diff). UAT reports: N/A.

## Spec

### Acceptance criteria

- [ ] **§10A Information Architecture per portal** inserted (cleanest placement: directly after §10.6 Coverage stats, before §11 Sprint Plan). Covers admin / teacher / parent portals. Kepsek folded into admin (per §10.4 — same sidebar, role-filtered scope). Each portal: sidebar groups → pages under each group → entity backing per page → minimum read scope per role per page. Format: one table per portal, ≤ 60 rows. Settings (Pengaturan) grouping mandatory and explicit — admin-editable catalog tables (`AcademicYear`, `AcademicTerm`, `Holiday`, `Campus`, `Program`, `OrgConfig`, `Role`, `Permission`, `User`, `Sentra`, `ScoringScale`, `CurriculumIndicator`, `HafalanItem`, `RaportSectionTemplate`, `FeeComponentDef`, `ProgramFeeStructure`, `FeeInstallmentScheme`, `SiblingDiscountRule`, `SalaryComponentDef`) and invitation tables (`GuardianInvitation`) all surface here. **Jam Kerja page** explicit: backed by `OrgConfig` work-time fields (no new entity).
- [ ] **§10.7 Role × Entity scope matrix** inserted as new sub-section after §10A. Rows: ~25 entities most consequential to MVP (Student / Guardian / Household / StudentIdentifier / GuardianInvitation / Employee / EmployeeCampusAssignment / ClassSection / ClassSession / SessionTeacher / Sentra / TeachingDefault / SentraRotation / StudentEnrollment / StudentAttendance / Admission / MplsCohort / MplsMember / Invoice / Payment / FeeComponentDef / ProgramFeeStructure / Raport / RaportComment / PenilaianHarian / HafalanProgress / TimelineEvent / FileAsset / AuditLog / OrgConfig / Holiday / User / Role / Permission / GuardianInvitation). Columns: 8 roles per `06-permissions.ts` seed (`admin / principal / kadiv / homeroom_teacher / sentra_teacher / admission_officer / finance_officer / parent`). Cells: scope code per the canonical scope vocabulary. Vocabulary explicit at top of matrix: `ALL / OWN_CAMPUS / OWN_PROGRAM / OWN_CLASS / OWN_SESSION / OWN_STUDENT / OWN_HOUSEHOLD / SELF / —`. Default action = read; write-action deltas captured inline below the matrix as small follow-on table (admin/principal create/update; soft_delete/restore admin+principal-only by convention; teacher writes constrained to `OWN_CLASS` for attendance + assessment). Matrix is the **canonical source for every future `lib/entities/*/policy.ts`** — drift between matrix and policy = bug in one or the other, surfaced at PR review.
- [ ] **§4.1 entity inventory reconciliation** inline-edited:
  - Identity row gains `RolePermission` (shipped in `02_identity` migration; spec §4.1 missed it).
  - Header note added: "Per-domain expansion is ~75 models; the §4.1 grouping is the canonical source — `~50` summary in §3.1 is rough order-of-magnitude only."
  - **Pengaturan > Jam Kerja** decision footnote: covered by `OrgConfig` work-time fields (`workStartTime / workEndTime / gracePeriodMinutes` per v1 baseline + v1 audit §2.3 — values 07:30/17:00/N corrected from v1's 07:00/16:00/15min defaults). No new entity. Page placement under Pengaturan group declared in §10A.
  - **Yayasan reporting / event mgmt / referral** decisions footnote — explicit re-confirmation that §15 v1.1 owns them (no MVP entity); §10.1 admin "Yayasan reporting" row stays "CSV export by date range" (no dashboard entity MVP).
- [ ] **§18.1 Phase 2 refresh** inline-edited following the `spec-sync-phase-1-actual` precedent (PR #189):
  - Phase 2 header: `~5 cycles` → `~9 cycles` (`p2-students-guardians-household` split + `p2-scaffold-registries` + this rethink + `p2-scaffold-canary` + `p2-portal-shell-sidebar` + `p2-scaffold-pages` added).
  - Cycle list reformatted to match Phase 1 style (`[x]`/`[ ]` checkboxes + ship dates + per-split rationale + Status footer). Cycles to list: `p2-students-guardians-household` (shipped 2026-05-06), `p2-guardians` (shipped 2026-05-06; split from p2-students-guardians-household per §18.2), `p2-scaffold-registries` (shipped 2026-05-06; new entry not in original §18.1), `spec-rebuild-foundation-rethink` (this cycle, 2026-05-07), `p2-scaffold-canary` (pending; canary-test scaffold output on 1 entity end-to-end before bulk pages), `p2-portal-shell-sidebar` (pending; sidebar nav + active-state per §10A IA — separate cycle from page mounts), `p2-addresses-idn-chain` (pending), `p2-admission-funnel` (pending), `p2-classes-management` (pending; absorbs original `p2-mpls-placement` via MplsCohort detail tab + drag-drop modal), `p2-scaffold-pages` (pending; bulk-mount admin entity pages under §10A groups).
  - **Sidebar nav cycle scoping decision** stated inline: sidebar nav is its own follow-up cycle (`p2-portal-shell-sidebar`, owned by §10A IA contract). `p2-scaffold-pages` mounts entity pages under expected groups; the nav routing/active-state lands separately to avoid file-count blowout in the pages cycle. Cycle order: `p2-scaffold-canary` → `p2-portal-shell-sidebar` → `p2-scaffold-pages` (canary validates renderer; sidebar validates IA; pages bulk-mount).
  - Phase 1 totals already reconciled in PR #189 — Phase 1 list untouched here.
- [ ] **§15 v1.1 refresh** — append note that Pengaturan > Jam Kerja MVP is `OrgConfig` fields, dedicated UI page; admin-extensible per-staff schedule (e.g. shift rotation, per-day override, holiday calendar integration) deferred to v1.1 alongside Yayasan dashboard / Events / Referral. Single-line additions, no restructure.
- [ ] All gates green: `npm run build` ✓, `npx vitest run` ✓ (no test changes; should match staging baseline). `npm run lint` ✓. `npm run typecheck` ✓.
- [ ] `verify-rls-coverage.sh`, `verify-api-auth.sh`, `verify-pii-annotations.sh`, `npm run scaffold:check` all ✓ (no schema/route change, sanity-confirm).
- [ ] Playwright skipped (pure-docs cycle per CLAUDE.md two-tier gate rule); record skip in Verification.
- [ ] Commit type `docs:` so README staging not required (per CLAUDE.md commit-msg narrow rule).

### Non-goals

- **Schema changes.** ANY new entity flagged by the rethink (Jam Kerja, yayasan reporting source, event mgmt, referral) gets its own schema cycle, not this one. This cycle only edits foundation md.
- **Code changes.** Zero `lib/`, `app/`, `components/` edits. The rethink may flag "p2-scaffold-pages should ship sidebar nav" as a finding — that becomes a new cycle, not this one's work. Confirmed: `p2-portal-shell-sidebar` is its own cycle.
- **Migration changes.** None.
- **Standards docs.** If gaps surface that need a new standard (e.g. `.claude/standards/portal-ia.md`), spec it, defer to a follow-up cycle. This one only touches the foundation md + this cycle doc.
- **Phase 3-7 §18.1 audit.** Drift surfaced is Phase-2-specific; Phase 3+ reconciles organically as those cycles ship. Same precedent as `spec-sync-phase-1-actual`.
- **policy.ts edits to match the new matrix.** Drift between matrix and 5 already-shipped policy files is surfaced in code review (assumption #4) but **not fixed here**. If drift is real and small (e.g. `finance_officer` should also read `Student.firstName/lastName` for invoice context), the fix lands in the next entity cycle that touches those files.

### Assumptions

1. **Single new IA section ≤ 1 page of foundation md is acceptable** — spec is already ~1408 lines. New §10A + §10.7 budgeted at ~120-150 lines combined (3 IA tables + 1 scope matrix + ~20 lines prose). Foundation md grows to ~1550 lines. If the reviewer flags length, the matrix can be moved to its own `docs/superpowers/specs/2026-05-07-portal-ia-reference.md` referenced from §10A — but default is inline.
2. **Kepsek = admin portal w/ `principal` role**, not a separate portal shell. Matches §10.4. Same sidebar, scope-filtered. Confirmed by reading `lib/entities/*/policy.ts` — `principal` always co-listed with `admin` in the read tuples.
3. **`p2-scaffold-canary` is a real planned cycle** that validates 1 entity end-to-end before `p2-scaffold-pages` bulk-mounts. Naming derived from "canary" pattern. If the next session prefers a different name (e.g. `p2-scaffold-canary-student`), it surfaces at the resume point — this cycle just declares the slot.
4. **Drift between this cycle's role × entity scope matrix and the 5 already-shipped policy.ts files is inevitable and expected.** Specifically: `finance_officer` is missing from `Student.read` and `Guardian.read` in current policy (only on `Household.read`); `parent` is on `GuardianInvitation.read OWN_STUDENT` which feels too broad post-activation. Both flagged in code review. Fix lands in next entity cycle that touches those policy files (e.g. `p3-fee-foundation` for finance_officer scope; future audit cleanup for invitation post-activation).
5. **The 5 user-flagged gap items resolve as:** `Jam Kerja` → MVP via OrgConfig + UI page (Pengaturan group); `yayasan reporting` → v1.1 (CSV export covers MVP); `event mgmt` → v1.1; `referral` → v1.1; `RolePermission` → already shipped, just spec drift to fix in §4.1.
6. **Sidebar nav is its own cycle** — `p2-portal-shell-sidebar`. `p2-scaffold-pages` mounts pages but does not own the active-state shell. This decision is locked in §18.1 here and preserved across the resume hand-off.

## Tasks

> Single task, one commit. Doc-only — end-of-cycle gate inline (lint + typecheck + build + vitest + verify scripts). Playwright skipped.

- [x] **T1 — Apply 5 inline edits to foundation md + write this cycle doc.** Acceptance:
  - Foundation md edits land in this order (top → bottom of file): §3.1 stack count footnote (`~50 models` → `~75 per per-domain expansion; §3.1 rough order-of-magnitude` — single sentence), §4.1 Identity row gains `RolePermission`, §4.1 Jam Kerja + Yayasan/Events/Referral footnotes, §10A inserted after §10.6, §10.7 inserted after §10A, §15 v1.1 Jam Kerja note appended, §18.1 Phase 2 refresh.
  - Cycle doc Implementation/Verification/Ship Notes filled.
  - Single commit: `docs(spec): foundation IA + role-entity scope matrix + Phase 2 §18.1 refresh`.
  - End-of-cycle gates green; Playwright skip recorded.

## Implementation

- T1: `docs/superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md` + `docs/cycles/2026-05-07-spec-rebuild-foundation-rethink.md`. Edits applied top → bottom of foundation md:
  - **§3.1 stack diagram** — model count `~50` → `~75`, enum count `~31` → `~34`, footnote pointer to §4.1 as canonical inventory.
  - **§4.1 entity inventory** — `RolePermission` added to Identity row; reconciliation footnote covering `RolePermission` (shipped in `02_identity` per `p1-identity-rls`), Pengaturan > Jam Kerja decision (no new entity — wires `OrgConfig` work-time fields, page placement in §10A.1; v1 baseline 07:00/16:00/15min wrong, An Nisaa runs 07:30/17:00/N), Yayasan/Events/Referral re-confirmed as v1.1 (§15) with no MVP entities, §9.3 NEVER list unchanged.
  - **NEW §10A Information Architecture per portal** inserted after §10.6, before §11. Three lifecycle-ordered tables (admin / teacher / parent — kepsek = admin w/ `principal` role per §10.4). Pengaturan strict = system config; domain catalogs (Tahun Akademik / Program / Sentra / ScoringScale / CurriculumIndicator / HafalanItem / RaportSectionTemplate / FeeComponentDef / ProgramFeeStructure / FeeInstallmentScheme / SiblingDiscountRule / SalaryComponentDef / EmployeeSalaryValue) live inside their owning modules. Payroll subgroup hidden from `principal`. `Akun Saya` pattern at top of HR group for any role w/ Employee record. Single Pendaftaran page w/ smart views per Admission state — `Admission.source ∈ {ONLINE / WALK_IN / REFERRAL}` covers `/daftar` + buku-tamu + referral channels; no separate "Calon Siswa" sidebar entry. Detail-tab pattern (§5.4) absorbs workflow children — GuardianInvitation / InitialAssessment / SentraRotation / TeachingDefault / ClassSession / SessionTeacher / RolePermission / UserRole / AcademicTerm / RaportComment / MplsAttendance / StudentIdentifier / StudentGuardian / EmployeeCampusAssignment / PayrollItem / PayrollItemLine / ParentMeetingAttendance all inline-only. §10A.4 IA notes explain Pengaturan-as-system-config rule, lifecycle ordering, Kepsek lockdown, Akun Saya pattern, Pendaftaran smart-view pattern, FO cross-domain reads, `PR: OWN_HOUSEHOLD` dashboard-aggregation note.
  - **NEW §10.7 Role × Entity scope matrix** inserted after §10A. Canonical scope vocab block (`ALL / OWN_CAMPUS / OWN_PROGRAM / OWN_CLASS / OWN_SESSION / OWN_STUDENT / OWN_HOUSEHOLD / SELF / —`), 8-role columns (`A/P/KD/HT/ST/AO/FO/PR`), ~50 entity rows grouped by domain (Tenancy/Settings · Identity · People · HR · Classes/Sessions · Admission/MPLS · Enrollment/Attendance · Curriculum catalogs · Assessment/Hafalan · Raport · Finance · Payroll · Operational · Foundation · Regions). Payroll rows reflect kepsek lockdown — `P` drops to `—` on PayrollRun + SalaryComponentDef and to SELF on PayrollItem + PayrollItemLine + EmployeeSalaryValue. §10.7.2 write-action delta table (catalog writes admin-only; AuditLog never user-writable; TimelineEvent middleware-only; FileAsset upload-route-driven). §10.7.3 drift inventory vs 5 already-shipped policy.ts files — drift #1 `Student.read` missing `finance_officer: ALL` (fix in `p3-fee-foundation`); drift #2 `Guardian.read` missing `finance_officer: ALL` (same cycle); drift #3 `GuardianInvitation.read` over-broad on parent (next audit cycle); drift #4 `Guardian.read` matrix had `HT: OWN_CLASS` but policy.ts omits — matrix corrected in this cycle (HT cell dropped to `—`).
  - **§15 v1.1 footnote** — Pengaturan > Jam Kerja v1.1 extension (per-staff schedule, holiday integration); reaffirms Yayasan dashboard / Events / Referral as v1.1 with no MVP entities.
  - **§18.1 Phase 2 refresh** — header `~5 cycles` → `~9 cycles`; cycle list reformatted to match Phase 1 spec-sync style (`[x]/[ ]` checkboxes + ship dates + per-split rationale + Status footer). Captures 3 shipped (`p2-students-guardians-household`, `p2-guardians`, `p2-scaffold-registries`) + this rethink + 5 pending (`p2-scaffold-canary`, `p2-portal-shell-sidebar`, `p2-addresses-idn-chain`, `p2-admission-funnel`, `p2-classes-management`, `p2-scaffold-pages`). Cycle order locked: canary → sidebar → addresses (parallel-safe) → admission funnel → classes → bulk pages.
- Cycle doc Spec acceptance criterion line for Phase 2 header bumped from `~7 cycles` to `~9 cycles` per code-reviewer flag (cycle doc was stale before sidebar + this rethink were folded into Phase 2 count).

## Verification

- T1 gates green at 2026-05-07 07:31:
  - `npm run lint` ✓ (1 pre-existing warning in `lib/students/__tests__/nis-allocator.test.ts:52` `_args` unused — not introduced by this cycle, no errors).
  - `npm run typecheck` ✓ (Prisma client regenerated cleanly).
  - `npm run build` ✓ (Next.js 16 production build, all routes compiled).
  - `npx vitest run` ✓ — **931 passed | 4 skipped (935 total)**, baseline matches staging tip (no test changes; doc-only cycle).
  - `verify-rls-coverage.sh` ✓ **32 / 32** tenant-scoped models with ENABLE + policy.
  - `verify-api-auth.sh` ✓ 4 / 4 routes with session helper or `@public` sentinel.
  - `verify-pii-annotations.sh` ✓ 5 / 5 known-PII fields annotated.
  - `npm run scaffold:check` ✓ 5 entities validated (guardian / guardian-invitation / household / student / student-identifier).
  - **Playwright deliberately skipped** — pure-docs cycle per CLAUDE.md two-tier gate rule. No UI surface mounted, no E2E to exercise.
- **feature-dev:code-reviewer** pass surfaced 1 must-fix (cycle doc `~7 cycles` mismatch with spec `~9 cycles`) + 1 should-fix (drift #4 — Guardian HT scope mismatch between matrix + policy.ts) + 1 nice-to-have (Household OWN_HOUSEHOLD note for parent dashboard aggregation). All three applied; reviewer confirmed drift #1-#3 against the actual policy.ts source files; no false positives. No additional drift surfaced beyond #4.
- Cross-checked design-system.html: N/A (doc-only, no frontend diff).
- Foundation md final length: **1685 lines** (1408 pre-edit + 277 added). Within ~1700 budget; no section split needed.

## Ship Notes

### Migrations applied

**None.** Doc-only cycle — no schema change, no migration files touched.

### New env vars

**None.**

### Manual smoke on Vercel preview

**None required** — no runtime change. Verify the spec doc renders correctly on GitHub when the PR loads (markdown table integrity, especially the wide §10.7.1 8-column scope matrix; checkbox rendering on §18.1 Phase 2 list).

### Rollback plan

`git revert <PR merge SHA>` undoes the spec edits cleanly. No schema, no env var, no migration. Risk window zero — doc edit only.

### Phase 2 status (post-merge)

- [x] 4/9 Phase 2 cycles shipped (`p2-students-guardians-household`, `p2-guardians`, `p2-scaffold-registries`, this rethink).
- [ ] Next 5 cycles per §18.1 locked order: `p2-scaffold-canary` → `p2-portal-shell-sidebar` → `p2-addresses-idn-chain` (parallel-safe with sidebar) → `p2-admission-funnel` → `p2-classes-management` → `p2-scaffold-pages`.
- After this cycle merges to staging, the next session resumes `p2-scaffold-pages` planning with §10A IA + §10.7 scope matrix as authoritative input. The pre-drafted spec context for `p2-scaffold-pages` is preserved in the user's prior chat history; user hands it back to the next session manually. The `.worktrees/p2-scaffold-pages` worktree at `feat/p2-scaffold-pages` (paused mid-/spec) becomes valid to resume only after this cycle merges — until then it is referencing pre-rethink IA assumptions and should not be touched.
- 4 drift items locked in §10.7.3 — drift #1 + #2 fix in `p3-fee-foundation`, drift #3 fix in next entity audit cycle (low priority), drift #4 already corrected matrix-side in this cycle.

### Lessons surfaced this cycle

- **IA contract is its own design step** — without §10A explicit before scaffold pages mount, `p2-scaffold-pages` would have produced 20 pages with no sidebar grouping spec and no role-gated visibility rule (e.g. payroll subgroup hidden from `principal`). Pausing the pages cycle to land the IA was the right call. Same pattern likely repeats at `p3-fee-foundation` (per-program fee structure UI needs IA + scope locked first) — surface as marathon-mode discipline going forward.
- **Pengaturan-as-system-config rule** is non-obvious — initial draft stuffed Tahun Akademik / Program / Sentra into Pengaturan because they're "configuration". User feedback corrected to: domain catalogs live in their domain modules; Pengaturan retains only system config (profile / work-time / location / calendar / RBAC / region master). Rule documented in §10A.4. Lifecycle-ordered groups (`— Konfigurasi —` subgroup at bottom of Akademik / Penilaian / Keuangan) emerged from the same feedback loop.
- **Lifecycle ordering as the canonical sidebar pattern** — top of group = where work starts; bottom = setup admin touches once per year. Applied uniformly across admin / teacher / parent. Surface as portal-shell standard when `p2-portal-shell-sidebar` ships its standards doc (deferred follow-up).
- **Detail-tab pattern absorbs workflow children** — GuardianInvitation / InitialAssessment / TeachingDefault / SentraRotation / ClassSession / SessionTeacher / etc. all fold into parent detail per §5.4 anatomy. Reduces admin sidebar from ~55 → ~46 entries. Applied via §10A.4 contract; future cycles cite this pattern instead of re-inventing.
- **Drift inventory format** (§10.7.3) is the canonical way to surface matrix↔policy.ts disagreements. Future entity cycles MUST update this table in the same PR if either side changes — drift in either direction is a bug. Drift #4 (matrix-too-broad case) demonstrates the spec-side fix path; drifts #1-#3 (policy-too-narrow case) demonstrate the next-cycle fix path.
