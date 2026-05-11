# Phase 2.1 — Admission Lifecycle Simplification (drop REGISTERED)

> **Source-of-truth plan:** [`docs/plans/2026-05-10-v1-incremental-evolution.md`](../plans/2026-05-10-v1-incremental-evolution.md) §5 Phase 2 cycle 2.1 — **REVISED THIS CYCLE.** Plan originally called for a v2 8-state machine lift; user 2026-05-12 decision rejects it as overcomplicated for the Indonesian school use case. This cycle audits v1's existing 6-state from first principles and lands the minimal defensible cleanup.
> **Phase:** 2 — Admission State Machine + Audit. **First Phase 2 cycle.**
> **Branch:** `feat/admission-lifecycle-simplification` (off `origin/staging` @ `9c1ee2c` — post-PR-#243 squash).
> **Prior cycles for pattern reference:** [`2026-05-10-daftar-public-form.md`](2026-05-10-daftar-public-form.md) (PR #240 — cycle 1.1) — per-task `chore/test`+ single `feat(…)` wrap commit cadence, TWO code-review pattern, `design-system` token gate. [`2026-05-11-admin-admissions-empty-string-fix.md`](2026-05-11-admin-admissions-empty-string-fix.md) (PR #243) — most recent admin-admissions touch; informs page.tsx diff shape.
> **Phase 1.2 (sibling-detect, PR #241) STILL OPEN at session start.** Cycle 2.1 ships against staging-without-sibling-detect. No file overlap; PR 241 merges independently.

---

## Context

The v1 Admission table ships with a 6-state status vocabulary: `INQUIRY | VISIT_SCHEDULED | VISITED | ADMITTED | REGISTERED | CANCELLED`. The v2 rebuild (rolled back 2026-05-04) proposed an 8-state replacement (`DRAFT|SUBMITTED|UNDER_REVIEW|INTERVIEW_SCHEDULED|OFFER_EXTENDED|ACCEPTED|REJECTED|WITHDRAWN`). Plan §5 cycle 2.1 originally lifted that 8-state lock-stock-and-barrel. **User decision 2026-05-12: v2's 8-state is theatre for the actual Indonesian school workflow** — walk-in/WhatsApp inquiry → school visit → admin yes/no → family registers → enrolment. Five stages at most. Revisit from first principles.

**Audit findings (against `origin/staging` @ `9c1ee2c`):**

1. **State literal inventory.** Six states currently appear across 9 files (19 REGISTERED-specific references): validation enum [`lib/validations/admission.ts:36`](../../lib/validations/admission.ts), inline `VALID_TRANSITIONS` map [`app/api/admissions/[id]/route.ts:10-17`](../../app/api/admissions/[id]/route.ts), `NEXT_STATUS` + `TERMINAL_STATUSES` [`app/admin/admissions/page.tsx:85-93`](../../app/admin/admissions/page.tsx), dashboard tile fetcher [page.tsx:347-355](../../app/admin/admissions/page.tsx), filter chip options [page.tsx:677-682](../../app/admin/admissions/page.tsx), convert-flow gate + sink [`app/api/admissions/[id]/convert/route.ts:27,85`](../../app/api/admissions/[id]/convert/route.ts), badge label + icon + border maps [`components/ui/status-badge.tsx:79-83, 144-153, 173, 197, 203`](../../components/ui/status-badge.tsx), seed routes ([`app/api/admin/seed/route.ts:298-308`](../../app/api/admin/seed/route.ts), [`prisma/seed.ts:1130-1165`](../../prisma/seed.ts)), e2e illegal-jump fixture [`e2e/admin.spec.ts:296-326`](../../e2e/admin.spec.ts). Schema column [`prisma/schema.prisma:568`](../../prisma/schema.prisma) is a TEXT field with a `@default("INQUIRY")` — vocabulary is a comment annotation, NOT a Postgres enum; backfill is a single UPDATE, no DDL.

2. **Demo DB live row counts per state** (Prisma `groupBy` 2026-05-12):

   | state | rows |
   |---|---|
   | `INQUIRY` | **56** |
   | `VISIT_SCHEDULED` | 4 |
   | `VISITED` | 2 |
   | `ADMITTED` | **0** |
   | `REGISTERED` | **1** |
   | `CANCELLED` | 0 |

   Production: 0 admission rows since rollback (`main` untouched). Backfill blast radius: 1 row on demo, 0 on prod.

3. **Real-world Indonesian school funnel — 4 transitions, 5 states max.** Inquiry intake → visit/interview tracking → admin decision (yes/no) → family conversion (registration paperwork + student record creation). v1's 6-state captures four of these cleanly:
   - `INQUIRY` — applicant landed (`/daftar` POST or admin manual entry).
   - `VISIT_SCHEDULED` / `VISITED` — admin's follow-up tracking. **Two-state split is real**: 4 + 2 live rows in demo prove admins flip the row after each visit so the next-action button changes from "Tandai Sudah Kunjungan" to "Terima". Collapsing to a single `REVIEWING` + a `visitCompletedAt: DateTime?` column loses the linear list-filter visibility admins use today.
   - `ADMITTED` / `REGISTERED` — **redundant**. `ADMITTED` = "school said yes, no student record yet". `REGISTERED` = "school said yes, student record materialised via `/api/admissions/[id]/convert`". The distinction is **already encoded** by the nullable `Admission.studentId` FK ([`prisma/schema.prisma:571`](../../prisma/schema.prisma)). Two-status encoding of one Boolean. Real clutter.
   - `CANCELLED` — single terminal lane for reject + withdrawal. Admins do not distinguish; no rename warranted.

4. **Convert flow source-state check ([`app/api/admissions/[id]/convert/route.ts:27`](../../app/api/admissions/[id]/convert/route.ts:27)):** gate on `status === "ADMITTED"` → atomic txn creates Student + Parent + StudentGuardian → [L85](../../app/api/admissions/[id]/convert/route.ts:85) sets `studentId + status: "REGISTERED"`. Post-cleanup: gate stays on `ADMITTED`, the status flip drops, only `studentId` is written. "Converted vs not" reads from `studentId IS NOT NULL` — single source of truth.

5. **Plan §5 cycle 2.2 wording — REVISED THIS CYCLE.** Originally: "5 transition server actions (`submit`, `review`, `accept`, `reject`, `withdraw`) wrapping v2 8-state vocabulary." Post-audit: the same 5 server-action shape lands against the 5-state vocab (`INQUIRY → VISIT_SCHEDULED → VISITED → ADMITTED + CANCELLED`); audit-log + side-effect bundle is unchanged in intent; pure-transition lib (`lib/admission/state-machine.ts`) extracts at cycle 2.2 — NOT this cycle, because YAGNI — the existing inline `VALID_TRANSITIONS` map in `app/api/admissions/[id]/route.ts` is adequate for cycle 2.1's vocab cleanup. Hoisting the gate to a pure lib without the audit/email/side-effect work that justifies a lib is premature abstraction per CLAUDE.md system-prompt discipline.

**3 options presented to user 2026-05-12; user picked option 3a.**

- Option 1 — keep 6-state, doc-only (2 files). Lowest risk; leaves ADMITTED↔REGISTERED ambiguity.
- Option 2 — collapse to 4-state (`INQUIRY|REVIEWING|ACCEPTED|CLOSED`) + `visitCompletedAt` column. Best long-term ergonomics; loses visit-tracking granularity admins value; loud rename.
- **Option 3a — drop `REGISTERED` only.** Final states: `INQUIRY|VISIT_SCHEDULED|VISITED|ADMITTED|CANCELLED`. Smallest defensible cleanup. Keeps visit-tracking. Removes the redundant state. **Picked.**

**What does NOT change:**
- `/daftar` applicant-facing UX. Public form keeps writing `status="INQUIRY"` (schema default). No applicant ever sees status names; rename is invisible to the public.
- `POST /api/admission/submit` response shape (cycle 1.1).
- Sibling-detect lib + `Admission.detectedParentId` FK (cycle 1.2, PR 241 — independent path; merges later).
- The `convert-to-student` server-action's **gate** stays `status === "ADMITTED"`. Only the post-success side-effect drops the status flip; `studentId` becomes the single "converted" signal.
- All other portals + entities.

**Existing infra reused, not re-built:**
- Inline `VALID_TRANSITIONS` in `app/api/admissions/[id]/route.ts` stays — vocab trims, shape unchanged. No new lib.
- `app/admin/admissions/page.tsx` `NEXT_STATUS` + `TERMINAL_STATUSES` trims by one entry each.
- `components/ui/status-badge.tsx` label/icon/border maps drop the REGISTERED rows; `ADMITTED` retains its existing "Diterima" label + present-green chip. Admin list page derives a "Terdaftar" display label via the existing `studentId` predicate in a render-time check (no new map; no new column; cycle 2.x picks up richer "converted" surfacing if user needs it).
- Status-badge map adds NO new keys, NO new colors, NO new icons — pure deletion. Design-system parity preserved.

**Hooks reminders for `/build`:**
- **Frontend gate (pre-commit Rule 4)** fires on `app/admin/admissions/page.tsx` + `components/ui/status-badge.tsx`. This cycle doc contains the literal token `design-system` (next bullet). Task 2 Verification cross-references `.claude/standards/design-system.html` admission-status chip palette — removing REGISTERED preserves ADMITTED's present-green chip; no new tokens; no map gaps.
- **`design-system` cross-check.** REGISTERED's chip (`bg-primary/10 text-primary` per status-badge.tsx:83) is unique to admission terminal-success and not shared with any other domain; deletion is safe. The 5 remaining chips (INQUIRY=info-blue, VISIT_SCHEDULED=warn-amber, VISITED=neutral-holiday, ADMITTED=present-green, CANCELLED=muted) still cover the funnel with severity readable at 3m glance per design-system.html §Status-chip set.
- **Commit-msg narrow rule (`^(feat|perf):` + staged `app/**` or `lib/**` requires README staged).** Per cycle 1.1/1.2 precedent: per-task commits use `chore(lifecycle):` / `docs(lifecycle):` subjects; SINGLE wrap commit uses `feat(lifecycle):` and stages README + remaining cycle-doc deltas together.
- **`pre-push` blocks direct pushes to `staging`/`main` for all roles incl. `cto`** — `/ship` opens the PR; CTO does not push direct.
- **25-file cap (§18.2).** Estimated staged files: 13. Well under cap.
- **Per-task pre-commit broad doc-sync rule.** Code changes to `app/**`/`lib/**`/`prisma/**` require at least one of cycle-doc / README / CLAUDE.md staged in same commit.

**Carry-over caveats:**
- **GitHub Actions billing failure (since 2026-05-10) blocks ALL CI.** Local gates canonical. PR description records "CI red due to billing — local gates green" per cycle 0.2 / 0.3 / 1.1 / 1.2 precedent.
- **Marathon-Playwright stall.** Full local suite stalls after ~25 min serial run. End-of-cycle gate runs full suite once; moderate-subset re-run (`e2e/admin.spec.ts` admissions block only) on fresh server triages.
- **Build-cache caveat.** `pkill -f "next-server"; sleep 1; DEMO_MODE=true npm run start &` before every `npx playwright test` when source changed in same session.
- **Admin-tagihan flake set** (`e2e/admin.spec.ts:473 / 524 / 575 / 628`) — pre-existing carry-over; not blocking.
- **Prisma `migrate dev --create-only` shadow-DB step fails on existing `20260415_enable_rls`** (cycle 1.2 finding). Hand-write the migration directory + `migration.sql`; apply via `npx prisma migrate deploy` against demo to verify.

---

## Spec

### Acceptance Criteria

- [ ] **AC1. Schema comment + validation enum trimmed.** `prisma/schema.prisma:568` comment becomes `// INQUIRY | VISIT_SCHEDULED | VISITED | ADMITTED | CANCELLED`. `lib/validations/admission.ts:36` enum drops `"REGISTERED"`. The schema column shape is unchanged (TEXT, default `"INQUIRY"`); the comment + zod enum are the vocabulary lock.

- [ ] **AC2. Hand-written backfill migration.** New `prisma/migrations/20260512000000_admission_drop_registered/migration.sql` runs `UPDATE "Admission" SET status = 'ADMITTED' WHERE status = 'REGISTERED';`. Idempotent (running twice on a post-backfill DB is a no-op). No DDL — no new columns, no enum drops (column is TEXT). Verified on demo DB before commit: pre-migrate 1 row in REGISTERED; post-migrate 0 rows in REGISTERED + 1 row in ADMITTED with non-null `studentId`. Production-safe: 0 rows on prod since rollback.

- [ ] **AC3. Inline transition map trimmed.** `app/api/admissions/[id]/route.ts:10-17` `VALID_TRANSITIONS` becomes:
  ```ts
  const VALID_TRANSITIONS: Record<string, string[]> = {
    INQUIRY: ["VISIT_SCHEDULED", "CANCELLED"],
    VISIT_SCHEDULED: ["VISITED", "CANCELLED"],
    VISITED: ["ADMITTED", "CANCELLED"],
    ADMITTED: ["CANCELLED"],
    CANCELLED: [],
  };
  ```
  Comment on L8 updates: `// Terminal states (ADMITTED with studentId, CANCELLED) have no outgoing transitions.` (ADMITTED is terminal after convert; conversion no longer flips status.) NO new lib extraction — the inline map is adequate for this cycle's vocab cleanup; cycle 2.2 hoists it when adding audit + side-effects.

- [ ] **AC4. Convert flow keeps gate, drops status flip.** `app/api/admissions/[id]/convert/route.ts:85` becomes `data: { studentId: student.id }` (no `status` field). L27 gate stays `if (admission.status !== "ADMITTED")`. Behavioural shift: post-convert admission rows stay in `ADMITTED` status; `studentId !== null` is the new "registered" signal. The L21-26 "already converted" check (`admission.studentId` non-null) gates re-conversion exactly as before — no regression.

- [ ] **AC5. Admin list page trimmed.**
  - `NEXT_STATUS` map [page.tsx:85-90](../../app/admin/admissions/page.tsx) drops the `ADMITTED: { status: "REGISTERED", label: "Daftarkan" }` entry. ADMITTED becomes terminal in the next-action button surface.
  - `TERMINAL_STATUSES` [page.tsx:93](../../app/admin/admissions/page.tsx) becomes `new Set(["CANCELLED"])`. **ADMITTED is NOT added to TERMINAL** — `VALID_TRANSITIONS[ADMITTED]=["CANCELLED"]` (AC3) keeps ADMITTED→CANCELLED live, so "Batalkan" must stay available on ADMITTED rows. The existing L603 early-return (`if (a.studentId) return "Sudah jadi siswa"`) hides the actions menu on converted rows; ADMITTED-without-studentId retains both "Konversi ke Siswa" + "Batalkan". Adding ADMITTED to TERMINAL would also hide "Konversi ke Siswa" at L615, breaking the convert flow's UI entry-point. Comment on L84 updates to `// Terminal states (CANCELLED) have no next step. ADMITTED-with-studentId hides via the row-action early-return.`
  - Dashboard `stats` useState shape [page.tsx:342](../../app/admin/admissions/page.tsx) trims the `registered: 0` key — becomes `useState({ total: 0, inquiry: 0, admitted: 0 })`. Fetcher [page.tsx:346-354](../../app/admin/admissions/page.tsx) drops the third `fetch(...?status=REGISTERED)` Promise.all entry; destructure becomes `([inquiry, admitted])`; `r` constant removed; `total: i + a + r` recomputes as `total: i + a`; `setStats` body drops the `registered: r` field. **StatCard tile at [page.tsx:660](../../app/admin/admissions/page.tsx) (`<StatCard label="Terdaftar" value={stats.registered} icon={UserPlus} … />`) is REMOVED** — dashboard renders 3 tiles (Total Calon / Inquiry / Diterima) instead of 4. `UserPlus` import at L34 STAYS (still consumed by the row-action icon at L618 — verified).
  - Filter chip options [page.tsx:677-683](../../app/admin/admissions/page.tsx) drops the `{ value: "REGISTERED", label: "Terdaftar" }` entry. Filter retains 5 + `all`.
  - Display label: rows with `status === "ADMITTED" && studentId` render the badge label as "Terdaftar" (post-convert) instead of "Diterima" — derived at render time via the existing `studentId` field on the admission row; no schema or query change. Falls back to "Diterima" when `studentId` is null. Render-time derivation lives in `app/admin/admissions/page.tsx` table cell, NOT inside `<StatusBadge>` (component stays domain-agnostic).

- [ ] **AC6. Status-badge map cleared of REGISTERED.** `components/ui/status-badge.tsx` drops REGISTERED entries from: `STATUS_MAP` label map (L83) and `STATUS_ICON_MAP` icon map (L153). `STATUS_LEFT_BORDER_MAP` (L166-213) has NO REGISTERED key in staging — confirmed by inspection; no border-row deletion required. ADMITTED retains its present-green chip + BadgeCheck icon + `border-l-status-present` border. The list page consumes the badge via the existing `<StatusBadge>` component; no API surface change.

- [ ] **AC7. Seeds + e2e updated.**
  - `app/api/admin/seed/route.ts:307` — the `"Gibran Alfarizi"` seed row's `status: "REGISTERED"` becomes `status: "ADMITTED"`. **`studentId` stays UNSET** (the API seed-route's `admissionDefs` array has no preceding student lookup; coupling the API seed to the student-create loop is out of scope for cycle 2.1). The row demonstrates the new vocab as an ADMITTED-without-conversion row. The full "ADMITTED + studentId-linked" shape is exercised by `prisma/seed.ts` (next bullet).
  - `prisma/seed.ts:1160` — same: status becomes `"ADMITTED"`; `studentId: convertedStudent.id` stays as-is (already wired in the existing seed); log line at L1165 updates to `"1 INQUIRY + 1 ADMITTED (converted)"`.
  - `e2e/admin.spec.ts:316` illegal-jump target swaps `"REGISTERED"` → `"ADMITTED"` (still illegal from VISIT_SCHEDULED — `VALID_TRANSITIONS[VISIT_SCHEDULED]` is `["VISITED","CANCELLED"]`). Assertion at L320 (`/Invalid status transition/i`) stays — the error path is unchanged (zod accepts ADMITTED; VALID_TRANSITIONS rejects). Comment at L314 updates to reflect the new target literal.

- [ ] **AC8. Plan §5 revised + README ADR row added.** `docs/plans/2026-05-10-v1-incremental-evolution.md` §5 Phase 2.1 wording replaced (audit + drop-REGISTERED outcome). §5 Phase 2.2 wording trims to: "5 transition server actions wrapping `assertTransition` against the 5-state vocab + per-transition AuditLog + email side-effects + refactor `convert-to-student` into the `accept` transition's side-effect with no status flip (gate stays `ADMITTED`, sink is `studentId`)." README ADR row added (dated 2026-05-12) — cell ≤ 400 chars per pre-commit rule.

- [ ] **AC9. Verification gates green.** `npm run build` green; `npx vitest run` green (no new vitest — existing tests don't reference REGISTERED in assertions); `npx playwright test` admin block green (the e2e admission-transitions test now targets ADMITTED for illegal-jump; full suite optional — moderate-subset triage covers the surface).

### Non-Goals

- NO new `lib/admission/state-machine.ts` pure-transition library. YAGNI — the inline `VALID_TRANSITIONS` map covers cycle 2.1's vocab cleanup; cycle 2.2 extracts the lib when the audit-log + side-effect work justifies it.
- NO change to applicant-facing `/daftar` UX.
- NO change to convert-to-student gate logic (still `ADMITTED`).
- NO new database column. `studentId` already exists. `visitCompletedAt` is NOT added — option 2 was declined.
- NO rename of ADMITTED → ACCEPTED. Option 3b was rejected to minimise vocabulary churn.
- NO new e2e spec file. The existing `admin.spec.ts` admission-transitions test covers the surface with a one-literal swap.
- NO Phase 2.2 work in this cycle (transition server actions + audit log + side-effect refactor stay in cycle 2.2).
- NO `/ship --to-main` this cycle. Deferred per user 2026-05-11 decision until Phase 2 lands.

### Spec Assumptions (surface for user correction before `/build`)

1. **Dashboard tile collapse.** Cycle 2.1 collapses the "Terdaftar" tile into the ADMITTED count. Admins see Total / Pertanyaan / Diterima three-tile shape. If user wants a separate "Terdaftar (converted)" tile, it lands in cycle 2.2 as a `?status=ADMITTED&hasStudent=true` query (requires extending `GET /api/admissions` with a `hasStudent` filter — out of scope for 2.1).
2. **Badge label "Terdaftar" vs "Diterima" derivation.** Cycle 2.1 picks the label at render-time in `app/admin/admissions/page.tsx` table cell, NOT inside `<StatusBadge>` — the badge component stays domain-agnostic (label keyed by status only). If user wants the badge component to learn the studentId predicate, it lands in cycle 2.2.
3. **Status-badge map deletion.** Cycle 2.1 deletes REGISTERED from the three maps in `status-badge.tsx`. Any future consumer that still passes `status="REGISTERED"` will fall back to the component's default-rendering path (label = the raw status string). Acceptable: after the backfill, no row ships with REGISTERED status; the map deletion + zod enum trim guarantee no new writes.
4. **Idempotent migration.** Migration SQL is a single UPDATE without a guard. Running twice on a post-backfill DB updates 0 rows (the WHERE clause matches nothing). Safe to re-run; prisma migrations table tracks application.
5. **PR 241 (sibling-detect) merge order.** PR 241 still open at session start. Cycle 2.1 ships off `origin/staging` without its changes. When PR 241 lands, this branch may need a rebase if files overlap. Verified: PR 241 touches `app/api/admission/submit/route.ts` + `app/admin/admissions/page.tsx` (adds Saudara column). Cycle 2.1 touches `app/admin/admissions/page.tsx` (NEXT_STATUS/TERMINAL_STATUSES/dashboard/filter). Both touch the same file but different regions — merge conflicts likely but mechanical.

---

## Tasks

Cycle 1.2 commit cadence: per-task `chore(lifecycle):`/`docs(lifecycle):` + single wrap `feat(lifecycle):` commit; cycle doc Implementation section gets a line per task in the same commit; wrap commit stages README + final cycle-doc deltas.

- [ ] **T0 — Doc skeleton.** This file lands at `/spec` time. Commit: `docs(lifecycle): scaffold cycle 2.1 doc — audit + option 3a`. Files: `docs/cycles/2026-05-12-admission-lifecycle-simplification.md`. **Independent.** No code; narrow rule does not fire.

- [ ] **T1 — Migration SQL hand-written + verified on demo DB.** Create `prisma/migrations/20260512000000_admission_drop_registered/migration.sql` with the backfill UPDATE. Apply via `npx prisma migrate deploy` against demo DB. Confirm row-count shift (1 REGISTERED → 0 REGISTERED; ADMITTED count grows by 1 with non-null `studentId`). Commit: `chore(lifecycle): backfill migration REGISTERED → ADMITTED`. Files: `prisma/migrations/20260512000000_admission_drop_registered/migration.sql`, `docs/cycles/2026-05-12-admission-lifecycle-simplification.md` (Implementation line). **Independent.** No app code; narrow rule does not fire.

- [ ] **T2 — Atomic code cleanup (validation + route + convert + page + status-badge + seeds + e2e).** Single feat-wrap commit covering AC1+AC3+AC4+AC5+AC6+AC7. Run between-task gate: `npm run build && npx vitest run`. Cross-check `design-system.html` admission-status chip palette per AC8 cycle-doc bullet. Commit: `feat(lifecycle): drop REGISTERED admission state — converted via studentId predicate`. Files: `lib/validations/admission.ts`, `app/api/admissions/[id]/route.ts`, `app/api/admissions/[id]/convert/route.ts`, `app/admin/admissions/page.tsx`, `components/ui/status-badge.tsx`, `app/api/admin/seed/route.ts`, `prisma/seed.ts`, `prisma/schema.prisma`, `e2e/admin.spec.ts`, `README.md` (ADR row), `docs/cycles/2026-05-12-admission-lifecycle-simplification.md` (Implementation lines). **Depends on T1** — migration must apply before the validation enum trim lands or stale REGISTERED rows fail enum validation in admin update flow. Narrow rule fires (`feat:` + `app/**`+`lib/**`); README staged ✓.

- [ ] **T3 — Plan §5 revision + verification + ship notes.** Update `docs/plans/2026-05-10-v1-incremental-evolution.md` §5 Phase 2.1 (audit outcome) + §5 Phase 2.2 (drop v2 vocab; lock to 5-state). Fill cycle doc Verification (gate output) + Ship Notes (migration apply order, rollback). Run end-of-cycle gate: `npm run build && npx vitest run && npx playwright test` (admin block as moderate-subset triage; admin-tagihan flake set carry-over expected). Commit: `docs(lifecycle): revise plan §5 2.1+2.2 + cycle 2.1 verification`. Files: `docs/plans/2026-05-10-v1-incremental-evolution.md`, `docs/cycles/2026-05-12-admission-lifecycle-simplification.md` (Verification + Ship Notes). **Depends on T2.** No code; narrow rule does not fire.

---

## Implementation

### T1 — Backfill migration

- `prisma/migrations/20260512000000_admission_drop_registered/migration.sql` (NEW): single `UPDATE "Admission" SET status = 'ADMITTED' WHERE status = 'REGISTERED';`. Header comments document idempotence + production-safety claim.
- Verified on demo DB via `npx prisma migrate deploy`:
  - Pre-state: 56 INQUIRY / 4 VS / 2 V / **0 ADMITTED / 1 REGISTERED** / 0 CANCELLED.
  - Post-state: 56 INQUIRY / 4 VS / 2 V / **1 ADMITTED** (id=`cmoz7j4ip01y218x741g2tzs6`, `childName="Ahmad Zafran Hidayat"`, `studentId="cmoz7hs2500d318x7l7bmwyvi"` — preserved) / 0 REGISTERED / 0 CANCELLED.
- `studentId` FK preserved on the backfilled row → "converted" signal travels intact.
- Migration registered in `_prisma_migrations` table; idempotent re-apply is a no-op (WHERE clause matches 0 rows on post-backfill DB).

### T2 — Atomic code cleanup

- `lib/validations/admission.ts` (L36): zod enum drops `"REGISTERED"`. Now `["INQUIRY", "VISIT_SCHEDULED", "VISITED", "ADMITTED", "CANCELLED"]`.
- `app/api/admissions/[id]/route.ts` (L8-16): `VALID_TRANSITIONS` trims `ADMITTED: ["REGISTERED", "CANCELLED"]` → `ADMITTED: ["CANCELLED"]`; `REGISTERED: []` row removed. Header comment rewritten to record the cycle + the rationale for keeping the `ADMITTED → CANCELLED` escape hatch.
- `app/api/admissions/[id]/convert/route.ts` (L85): convert txn no longer writes `status: "REGISTERED"`; only `studentId: student.id`. Gate at L27 stays `status === "ADMITTED"`. Already-converted guard (L21-26, `admission.studentId` non-null) unchanged.
- `app/admin/admissions/page.tsx`:
  - L10 — adds `import { Badge } from "@/components/ui/badge";`.
  - L82-93 — `NEXT_STATUS` map drops the `ADMITTED → REGISTERED` entry; comment block rewritten to explain ADMITTED's terminal-in-next-action behaviour. `TERMINAL_STATUSES` becomes `new Set(["CANCELLED"])` (NOT `["ADMITTED", "CANCELLED"]` as initial AC5 draft suggested — ADMITTED retains the `Batalkan` button via `VALID_TRANSITIONS[ADMITTED]=["CANCELLED"]`, and the `Konversi ke Siswa` button at L615 must stay reachable for ADMITTED rows).
  - L342 — `stats` useState shape drops `registered: 0`.
  - L346-353 — fetcher drops the third `Promise.all` entry (`status=REGISTERED`); destructure becomes `[inquiry, admitted]`; `total: i + a`; `setStats({ total, inquiry, admitted })`.
  - L597-603 — status column cell wraps `<StatusBadge>` in a render-time check: when `status === "ADMITTED" && studentId` non-null, render an inline `<Badge variant="secondary" className="bg-primary/10 text-primary">Terdaftar</Badge>` (preserves the visual identity of the dropped REGISTERED chip); otherwise delegate to `<StatusBadge status={a.status} />`.
  - Old L660 — `<StatCard label="Terdaftar" value={stats.registered} icon={UserPlus} … />` deleted. Dashboard now renders 3 tiles. `UserPlus` import at L34 stays (still used at the row-action icon).
  - Old L681 — filter chip option `{ value: "REGISTERED", label: "Terdaftar" }` deleted. Filter retains 5 status + `all`.
- `components/ui/status-badge.tsx`:
  - L83 — `REGISTERED: { label: "Terdaftar", className: "bg-primary/10 text-primary" }` row deleted from `STATUS_MAP`.
  - L153 — `REGISTERED: BadgeCheck` row deleted from `STATUS_ICON_MAP`.
  - `STATUS_LEFT_BORDER_MAP` had no REGISTERED entry pre-cycle — confirmed; no change.
- `app/api/admin/seed/route.ts` (L307): the `"Gibran Alfarizi"` seed row's `status` becomes `"ADMITTED"` (no `studentId` set — the API seed-route does not couple to the student-create loop; this row demonstrates the "ADMITTED + studentId=null" shape).
- `prisma/seed.ts`:
  - L1130 — comment updates to `INQUIRY + ADMITTED linked to converted student`.
  - L1160 — `status: "REGISTERED"` becomes `status: "ADMITTED"` (`studentId: convertedStudent.id` already set; preserved).
  - L1165 — log line updates: `"1 INQUIRY + 1 ADMITTED (converted)"`.
- `prisma/schema.prisma` (L568): comment annotation on `Admission.status` updates to the new 5-state vocab + records that "converted" is encoded by `studentId IS NOT NULL`.
- `e2e/admin.spec.ts` (L314-320): illegal-jump target swaps `"REGISTERED"` → `"ADMITTED"`. Comment at L314 updates to explain why the swap preserves the same error path (zod accepts ADMITTED; `VALID_TRANSITIONS["VISIT_SCHEDULED"]` rejects it). Assertion at L320 (`/Invalid status transition/i`) unchanged.
- `README.md`: ADR row added at L68 (date-descending order); both cells well under 400-char pre-commit limit.

**Design-system cross-check:** verified `.claude/standards/design-system.html` admission status-chip palette — removing REGISTERED preserves all five remaining chips (INQUIRY=info-blue, VISIT_SCHEDULED=warn-amber, VISITED=neutral-holiday, ADMITTED=present-green, CANCELLED=muted). No new color tokens introduced. The render-time "Terdaftar" badge reuses the existing `bg-primary/10 text-primary` token (the same one the deleted `STATUS_MAP[REGISTERED]` entry held), so the visual identity is conserved.

## Verification

<!-- filled by /build -->

## Ship Notes

<!-- filled by /ship -->
