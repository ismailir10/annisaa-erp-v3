# v1 Incremental Evolution Plan — Selectively Adopt v2 Features

**Status:** Active (user-confirmed phase order + Phase 0 scope on 2026-05-10)
**Date:** 2026-05-10
**Author:** cto (claude-opus-4-7)
**Branch:** staging at `21b9110` (PR #177 base + 2 trigger commits)

> **Provenance note:** This file is a re-persistence of the plan produced in a prior session that ended without committing it. Re-persisted in cycle `phase0-admin-hydration-and-bfcache` so the §6 cycle deep-dive is reachable from `docs/plans/`. User-confirmed answers to §7 open questions are inlined in §7 below.

---

## 1. Context

Staging was force-rolled-back from a 6-day v2 rebuild (PRs #178–#221) to PR #177 (sha `433a3bd`). Production (`main`) was never touched. v2 commits survive in tag `v1-final-2026-05-04`, in closed PRs #178–#221, and in git reflog — recoverable but inert.

**The rollback was right.** v2 attempted to replace working v1 surface area with a scaffold engine that gated every entity behind `EntityDef` + policy registries. The cost (rewriting all admin CRUD pages, new permission resolver, new migrations) outweighed the value at this stage.

**But several v2 FEATURES are still wanted** — most notably the admission funnel (public `/daftar` form + 8-state machine + auto-conversion to Student/Guardian on ACCEPTED). The plan below identifies what to port, in what order, and what to skip.

**Constraints:**
- No scaffold engine port. v1's hand-rolled CRUD pattern stays.
- Each cycle ≤ 25 staged files (§18.2 cap from CLAUDE.md).
- Each prisma migration additive + reversible.
- Existing v1 workflow (`/spec → /build → /ship`) stays.

---

## 2. v1 Has More Than We Remembered

**Surprise from re-inventory:** v1 already ships:

- `Admission` model + admin CRM (`/admin/admissions`) with status machine (`INQUIRY → VISIT_SCHEDULED → VISITED → ADMITTED → REGISTERED | CANCELLED`)
- `convert-to-student` server action that materializes Admission → Student + StudentGuardian + StudentEnrollment in one transaction
- `AuditLog` model (append-only, before/after JSON, May 2 ADR)
- `EmailLog` model + Resend integration + MJML templates
- `WebhookEvent` model + Xendit dedup
- 38 prisma migrations + 2,202 vitest files
- 9 Playwright specs
- Existing `.claude/standards/` table (crud, api, patterns, portal, security, voice, ui, colors, design-system.html)

**v1 does NOT have:**
1. Public-facing admission form (`/daftar`) — admin must enter every applicant
2. Address normalization (free-text only on Campus/Student/Parent)
3. Indonesian region chain (province→regency→district→village)
4. Sibling auto-detect (matching new applicant to existing Household by NIK/phone)
5. Multi-state admission funnel (current 6-state is functional but lacks INTERVIEW_SCHEDULED + OFFER_EXTENDED + WITHDRAWN nuance + per-transition audit + ACCEPTED side-effect bundle with NIK-dedup)
6. Per-portal sidebar IA registry (current navbar is hand-coded per route)
7. Timeline event registry (audit logs exist but no domain-level event taxonomy)

---

## 3. UAT Reality Check — Real Users Hit Walls

10 UAT reports (Apr 18 – May 3) flag these still-open BLOCKERS that no rollback or v2 work has resolved:

| # | Finding | Severity | Days open | Fix type |
|---|---|---|---|---|
| U1 | Admin hydration failure — all admin routes blank | BLOCKER | 8 | Next.js streaming regression |
| U2 | Finance backlog — 364/544 invoices stuck PENDING_PAYMENT_LINK | BLOCKER | 9 | Auth/Xendit config |
| U3 | Teacher home blank ~15s on load | BLOCKER | 9 | Server Component perf |
| U4 | Salary slip PDF not mobile-fit; no in-app detail | BLOCKER | 7 | Feature gap |
| U5 | Teacher profile photo upload missing | BLOCKER | 7 | Feature gap |
| U6 | Sign-out bfcache leak (privacy: browser-back shows auth data) | BLOCKER | 7 | Cache-Control header |
| U7 | Parent home TTFB 2.1s | MAJOR | 7 | Perf (N+1 likely) |
| U8 | Teacher calendar nav 3.1–4s | MAJOR | 7 | UX polish + perf |
| U9 | `/parent/reports` sheet open 5.1s | BLOCKER | 7 | Perf |
| U10 | Parent attendance scoping wrong query (broken parent-teacher link) | BLOCKER | 7 | Data access |

**Insight:** the rollback solved a strategic problem (don't rewrite). It did NOT solve a single one of these tactical fires. **Phase 0 must address the BLOCKERS before any v2 feature port.**

> **Provenance caveat:** UAT measurements above were captured on the pre-rollback build (some on a v2 partial). Rollback to PR #177 may have already healed some BLOCKERS that originated in v2-rebuild work (e.g., U1 may not reproduce on current staging — every cycle's Task 1 reproduces against the live preview before assuming a fix is needed).

---

## 4. Feature Gap Matrix

| v2 feature | v1 status | UAT pain? | User value | Cost (v1) | Verdict |
|---|---|---|---|---|---|
| Public `/daftar` admission form | absent | indirect (admin overload) | HIGH | M | **PHASE 1** |
| 8-state admission machine | partial (6-state CRM) | no (admin works) | MED | M | **PHASE 2** |
| ACCEPTED side-effect bundle (auto Household+Student+Guardian) | partial (`convert-to-student` exists) | no | MED | S | **PHASE 2** (refactor existing) |
| Sibling auto-detect | absent | no | MED | S | **PHASE 1** (with /daftar) |
| Address model + region chain | absent (free-text) | no (KB visit not flagged) | MED | L (migration heavy) | **SKIP** (per user §7 q2) |
| Indonesian region GET routes | absent | no | LOW (only useful with Address) | S | **SKIP** (depends on Phase 3) |
| Timeline event registry | absent (raw AuditLog only) | no | LOW | S | SKIP (defer) |
| Email template registry | partial (Resend exists, no slug typing) | no | LOW | S | SKIP (defer) |
| Portal shell + sidebar IA | absent (hand-coded navbar) | partial (cross-portal nav clunky) | LOW-MED | M | SKIP (defer) |
| Scaffold engine | n/a | n/a | NEG | XL | **NEVER** |
| Permission resolver (materialized scope sets) | partial (hasPermission helper) | no | LOW | M | SKIP (defer) |
| Audit/timeline foundation | partial (AuditLog exists) | no | LOW | S | SKIP (already covered) |
| MPLS cohort attendance | absent | no (not in current academic year) | LOW | M | SKIP (build when needed) |
| Profile photo upload | absent | YES (U5) | HIGH | S | **PHASE 4** (per user §7 q5) |
| Salary slip mobile/in-app detail | partial (landscape PDF only) | YES (U4) | HIGH | M | **PHASE 4** (per user §7 q5) |
| Admin hydration fix | n/a | YES (U1) | HIGH | S | **PHASE 0.1** |
| Finance backlog drain | n/a | YES (U2) | HIGH | S-M | **PHASE 0.2** |
| Sign-out bfcache fix | n/a | YES (U6) | HIGH | S | **PHASE 0.1** |

**Cost legend:** S = ≤8 files, M = 8–16 files, L = 16–25 files, XL = > 25 files (split required)

---

## 5. Phased Roadmap

```
Phase 0 — Stop Bleeding (UAT blockers)        ~3 cycles, 1 week
       ↓
Phase 1 — Public Admission Entry              ~2 cycles, 1 week
       ↓
Phase 2 — Admission State Machine + Audit     ~2 cycles, 1 week
       ↓
Phase 3 — Address Normalization               SKIPPED (per user §7 q2)
       ↓
Phase 4 — Polish + Promote to Production      ~1 cycle + staging→main /ship
```

**`/ship --to-main` cadence (per user §7 q7):** accumulate Phase 0 + Phase 1 (~5 cycles) before first production promotion since rollback. Phase 0 alone too small.

### Phase 0 — Stop Bleeding

Goal: every UAT BLOCKER closed. No new features. Pure firefighting + perf.

Cycles:
- **0.1 — phase0-admin-hydration-and-bfcache** (~5–8 files). Diagnose + fix admin hydration regression. Add `Cache-Control: no-store` on auth-protected portal trees + logout route. Closes U1 + U6. (See §6 deep-dive.)
- **0.2 — phase0-finance-backlog-drain + parent-attendance-scoping** (~10 files). One-off script `scripts/drain-pending-payment-links.ts` that re-issues Xendit link for the 364 stuck invoices. Fix parent-teacher link query (U10). Diagnose Xendit config to prevent recurrence. Closes U2 + U10.
- **0.3 — phase0-perf-sweep** (~8 files). Profile slow Server Components, parallelize queries, add streaming Suspense boundaries. Closes U3 + U7 + U9 + U8.

Phase 0 verdict gate: re-run all 10 UAT scenarios via `/uat`; expect 0 BLOCKER findings.

### Phase 1 — Public Admission Entry

Goal: families can apply to the school without admin manually creating a row.

Cycles:
- **1.1 — daftar-public-form** (~12 files). Add `/daftar` route (multi-step form: applicant → parents → contact). POST `/api/admission/submit` (rate-limited, no auth). Inserts Admission row in `INQUIRY` status (uses existing v1 schema). Sends `admission-submitted` email via existing live Resend (per user §7 q4 — no queued-email stub). Lift v2's `app/daftar/{page,client}.tsx` shape (drop scaffold dependency).
- **1.2 — sibling-auto-detect** (~5 files). Add `lib/admission/sibling-detect.ts` (lift from v2 verbatim — pure library, no scaffold). Wire into `/daftar` POST: when NIK matches existing Parent or phone matches existing Guardian, surface the existing Household for the admin to merge into during conversion. Adds `Admission.detectedHouseholdId` nullable FK (additive migration). **Sibling UX surface (per user §7 q6):** admin-only — "Detected sibling" badge on Admission detail page; NO applicant-facing message on /daftar.

Phase 1 verdict gate: real-admin smoke test on staging — submit `/daftar` with a NIK that matches a seeded parent; verify admin sees "Detected sibling" badge on the Admission detail.

### Phase 2 — Admission State Machine + Audit

Goal: tighten the v1 admission CRM with per-transition audit + cleaner side-effect bundle on the "school accepts" transition. **Original draft called for a v2 8-state machine lift; revisited 2026-05-12 from first principles and rejected as overcomplicated for the real Indonesian school workflow.** Walk-in/WhatsApp inquiry → school visit → admin yes/no → family registers → enrolment is 4 transitions; v2's 8 states (DRAFT/SUBMITTED/UNDER_REVIEW/INTERVIEW_SCHEDULED/OFFER_EXTENDED/ACCEPTED/REJECTED/WITHDRAWN) is state-machine theatre at this scale. Cycle 2.1 audited v1's existing 6-state in code + demo DB and trimmed exactly one redundant state.

Cycles:
- **2.1 — admission-lifecycle-simplification** (13 files, landed 2026-05-12 — see [cycle](../cycles/2026-05-12-admission-lifecycle-simplification.md)). First-principles audit; drop `REGISTERED`. Final 5-state vocab: `INQUIRY|VISIT_SCHEDULED|VISITED|ADMITTED|CANCELLED`. The "converted to student" signal moves to the existing nullable `Admission.studentId` FK (single source of truth). Convert flow keeps `status="ADMITTED"` gate; the post-success update no longer flips status, only writes `studentId`. Backfill `UPDATE "Admission" SET status='ADMITTED' WHERE status='REGISTERED'` migrates 1 demo row, 0 prod rows. **NO new `lib/admission/state-machine.ts` lib** — the existing inline `VALID_TRANSITIONS` map in `app/api/admissions/[id]/route.ts` is adequate for vocab cleanup; the lib extracts in cycle 2.2 when the audit/email/side-effect work justifies the abstraction (per CLAUDE.md "no premature abstractions").
- **2.2 — admission-transitions-audit-bundle** (~12 files, est.). 4 transition server actions (`scheduleVisit`, `markVisited`, `accept`, `cancel`) — each wraps a hoisted-to-lib `assertTransition` against the 5-state vocab + writes an `AuditLog` row + sends email (visit-scheduled / accepted / cancelled templates). Refactor `convert-to-student` into the `accept` transition's side-effect (Student + Parent + StudentGuardian creation in the existing atomic txn at `app/api/admissions/[id]/convert/route.ts`); the gate stays `status="ADMITTED"` + `studentId IS NULL`. Admin list page gets state-aware action buttons via the existing `NEXT_STATUS` + row-action surface (already in place from cycle 2.1; cycle 2.2 wires the audit-log side-effect without changing the UX shape). Extract the inline `VALID_TRANSITIONS` map into `lib/admission/state-machine.ts` (pure algebra, no DB, vitest covers every legal/illegal transition). Optional richer "converted vs not-yet-converted" surface in the admin dashboard (filter `?status=ADMITTED&hasStudent=true|false`) — out of scope unless user asks. **Permission scope (per user §7 q3):** admin + principal only; no `admission_officer` role exists in v1, defer if needed later.

Phase 2 verdict gate: Playwright spec walks INQUIRY → VISIT_SCHEDULED → VISITED → ADMITTED → convert end-to-end against the 5-state vocab; verifies the convert side-effect creates exactly one Student + one StudentGuardian atomically + the admission row stays at `status="ADMITTED" + studentId=<id>` (NOT a separate REGISTERED state).

### Phase 3 — Address Normalization

**SKIPPED** per user §7 q2 (2026-05-10): not worth the 22-file migration cost given no UAT pain. May be revisited if catchment policy lands.

### Phase 4 — Polish + Promote

Goal: catch UAT minors that bubbled up during Phases 0–2, plus pull in U4 (salary slip mobile + in-app detail) and U5 (profile photo upload) per user §7 q5 (deferred from Phase 0). Then `/ship --to-main` to promote staging → production for the first time since rebuild.

Cycles:
- **4.1 — salary-slip-mobile-detail + profile-photo-upload** (~12 files). Closes U4 + U5.
- **4.2 — promote-staging-to-main** (chore PR, no code changes; `gh pr create --base main --head staging`). Includes accumulated cycle docs in PR body. CTO-initiated.

---

## 6. Phase 0.1 Deep-Dive (next concrete cycle)

**Slug:** `phase0-admin-hydration-and-bfcache`
**Cycle doc:** `docs/cycles/2026-05-10-phase0-admin-hydration-and-bfcache.md`

### Files this cycle changes

```
proxy.ts                                  # Cache-Control on /admin, /parent, /teacher trees
lib/security/headers.ts                   # add applyNoStoreToPortals helper
app/api/auth/logout/route.ts              # explicit no-store + no-cache headers on response
e2e/admin-hydration.spec.ts               # NEW — assert /admin/* renders content within 2s
e2e/parent-signout-bfcache.spec.ts        # NEW — back-button after logout shows /login
README.md                                 # ADR row
docs/cycles/2026-05-10-phase0-admin-hydration-and-bfcache.md  # cycle doc
docs/plans/2026-05-10-v1-incremental-evolution.md  # this file (re-persistence)
```

> **Scope adjustment from earlier draft:** Layout files (`app/{admin,parent,teacher}/layout.tsx`) are React Server Components and CANNOT directly set HTTP `Cache-Control` headers. The fix moves to `proxy.ts` (already runs `applySecurityHeaders` on every response), which is the natural choke point for response headers across the portal tree.

### What does NOT change

- prisma/schema.prisma (no schema changes)
- Any business logic
- Any of the 134 API routes (only the logout one)
- Any of the 53 page.tsx files
- vitest suite (no new unit tests; e2e covers the shape)

### Acceptance criteria

- [ ] **AC1:** Visiting `/admin` (signed-in admin, demo or real OAuth) on the Vercel preview renders content within 2s — `<main>` innerText > 0, no `<div hidden id="S:*">` left visible after settle. Closes UAT U1 (or documents that rollback already healed it).
- [ ] **AC2:** After signing out from `/parent/home`, browser-back does NOT render the cached parent home page; instead redirects to `/login`. Closes UAT U6.
- [ ] **AC3:** Both new e2e specs pass on the staging Vercel preview URL.
- [ ] **AC4:** No regression on existing 9 e2e specs.
- [ ] **AC5:** README ADR row added: `2026-05-10 — Cache-Control: no-store on auth-protected portal trees (P0 hydration + bfcache fix)`.

### Test plan

1. Local: `npm run build && DEMO_MODE=true npm run start`; visit `/admin` as admin, `/parent` as parent. Confirm content renders.
2. Playwright: 2 new specs run as part of full e2e suite.
3. Vercel preview: smoke-test U1 + U6 manually after merge.

### Rollback

Revert the merge commit. Layouts revert to no-cache-header behavior; reverts re-introduce U1 + U6 but no data loss.

### Estimated effort

3–5 hours (diagnosis is the unknown; the fix is small).

---

## 7. User Decisions (confirmed 2026-05-10)

The 7 open questions in the original draft are resolved as follows:

1. **Phase order:** Phase 0 (UAT blockers) FIRST, then Phase 1 (`/daftar`).
2. **Phase 3 (Address normalization):** SKIP (see §5 + §4).
3. **New admission permission scope:** admin + principal (no `admission_officer` role exists in v1; do not introduce in this plan — defer if needed later).
4. **Email integration:** use live Resend directly (v1 already wired); do not introduce a queued-email stub.
5. **UAT U4 (salary slip mobile) + U5 (profile photo upload):** DEFER to Phase 4 (feature gaps, not regressions; not in Phase 0 scope).
6. **Sibling-detect UX (Phase 1.2):** admin-only surface ("Detected sibling" badge on Admission detail page); NO applicant-facing message on `/daftar`.
7. **`/ship --to-main` cadence:** accumulate Phase 0 + Phase 1 (~5 cycles) before first production promotion since rollback. Phase 0 alone too small.

---

## 8. Why This Plan Is Different From v2

| v2 plan | This plan |
|---|---|
| Replace v1 with scaffold engine first | Keep v1 as the substrate forever |
| 8 phases, 36 cycles, 6+ weeks | 4 phases, ~10 cycles, 4–5 weeks |
| Schema rebuild (11 migrations) | Schema additions only (~3 migrations) |
| Cycle doc + foundation spec + §18A ledger + scaffold engine + entity registries + policy registries | Cycle doc + README ADR row only |
| Engine-first ("everything inherits from EntityDef") | Feature-first ("ship the admission feature, never mind the abstraction") |
| Required user to learn new conventions for every page | Existing v1 page patterns continue |
| 0 user-visible features in first 5 days | Phase 0 closes 6 BLOCKERS in week 1 |

The point: **the value the user wanted from v2 was the FEATURES, not the architecture.** This plan delivers the features without the architecture overhead.
