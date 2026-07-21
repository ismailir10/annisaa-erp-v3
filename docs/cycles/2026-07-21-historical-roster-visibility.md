# Historical Roster Visibility + Academic-Year Enum Normalization

## Context

After the roster backfill (#404) imported historical class enrollments for AY 2022/23–2025/26, the admin Kelas list renders every past-year class as `0/20` with an empty detail roster, even though the data is present. A prod audit (project `vxwywmvpxetdgnxejjgk`) confirmed the enrollments exist — 2025/2026 alone has 130 enrollments across 14 sections, 2024/2025 has 61, 2023/2024 has 17, 2022/2023 has 6; there are 0 orphan students and 130/166 current students carry prior-year history, so the promotion chain is intact. The rosters are invisible, not missing. Root cause is a read-path filter plus enum drift introduced by the import, **not** lost data:

1. **[PRIMARY]** All historical `StudentEnrollment` rows were stamped `status = "GRADUATED"`, while the class list count (`_helpers.ts` `classListSelect`), the detail roster (`classDetailSelect`), and the detail count (`[id]/route.ts`) hardcoded `status: "ACTIVE"`. Past year → 0 ACTIVE → `0/N` + empty roster.
2. `AcademicYear.status = "INACTIVE"` for past years is off the app enum (`PLANNING | ACTIVE | ARCHIVED`), so the year-guard immutability check (`lib/classes/year-guard.ts`, `=== "ARCHIVED"`) and the UI `archivedMode` (`app/admin/classes/client.tsx`) never engage — past rosters are wrongly editable and year labels show no Aktif/Arsip/Rencana suffix.
3. `ClassSection.status = "INACTIVE"` on historical sections drives the health badge to "Tidak Aktif" (`health.ts`) — correct for a past class, left as-is.

Intended outcome: viewing an inactive academic year shows each class's real historical roster and student count, past years are marked `ARCHIVED` (locking edits for audit integrity), and the importer is hardened so this enum drift cannot recur.

## Spec

**Acceptance criteria**
- [x] Admin Kelas list count for a historical (non-active) year shows the enrolled student count (2025/2026 sections show their real `N/capacity`, not `0/N`).
- [x] Admin class detail roster for a historical class lists its students (backfilled `GRADUATED` enrollments), ordered by student name.
- [x] `WITHDRAWN` enrollments remain excluded from both count and roster.
- [x] Active-year (2026/2027) counts and rosters are unchanged; a `GRADUATED` row on a still-ACTIVE year (mid-year promotion) is NOT shown as current — visibility is decided year-aware, not by a blanket `not: WITHDRAWN`.
- [x] Vitest covers: year-aware `rosterEnrollmentVisible` rule; historical section with `GRADUATED` returns count > 0 + non-empty roster; a `GRADUATED` row on an ACTIVE year is excluded; `WITHDRAWN` excluded; DELETE audit still counts ACTIVE.
- [x] Prod `AcademicYear.status` normalization documented as an idempotent, tenant-scoped SQL step in Ship Notes (run after code merge; backup first).
- [x] Importer maps to app enums at write time and ships a post-import reconcile assertion.
- [x] `design-system` cross-check recorded (frontend gate) — no visual change; verified no `.tsx`/`.css`/`tailwind.config` diff in this cycle, so the frontend gate does not apply.

**Non-goals**
- No mutation of `StudentEnrollment.status` — `GRADUATED` stays. (User decision: year-aware read, keep GRADUATED.)
- No new enrollment status enum value (`PROMOTED`/`COMPLETED` explicitly rejected this cycle).
- No change to the enrollment **mutation** subroute (`[id]/enrollments/route.ts`) — add/remove stays `ACTIVE`-scoped and year-guard-gated.
- No change to `ClassSection.status` on historical sections; health badge "Tidak Aktif" for past classes is intended.
- Parent/teacher portal read paths out of scope (admin-only).

**Assumptions**
1. A student "belongs to" a class roster if ACTIVE, or GRADUATED-in-a-past-year; WITHDRAWN never. Encoded in `rosterEnrollmentVisible(enrollmentStatus, yearStatus)`.
2. Only 2026/2027 is a current/writable year on prod; every other `INACTIVE` year is safely archivable. (Verified: distinct statuses are exactly `{ACTIVE, INACTIVE}`.)
3. Archiving past years is acceptable now — locking historical roster edits is the desired audit posture (user confirmed).
4. The Track 2 SQL runs against prod post-merge; reversible (`status='INACTIVE'`) and preceded by a backup confirmation.

**System-safety verification (blast radius)**
- **Capacity enforcement unaffected.** The "Kelas penuh" gate (`[id]/enrollments/route.ts`) runs its own in-transaction `count({ status: "ACTIVE" })`, independent of the display count → no over-enrollment risk.
- **Year-aware, not blanket.** Code review found a blanket `not: WITHDRAWN` would leak a mid-year promoted-out (`GRADUATED`) student onto a still-ACTIVE roster (source enrollment is flipped to GRADUATED by `app/api/promotions/route.ts` without the year being archived). Fixed by deciding visibility on `(enrollmentStatus, academicYear.status)`.
- **Select reuse contained.** `classListSelect`/`classDetailSelect` are imported only by `app/api/admin/classes/route.ts` and `[id]/route.ts`.
- **Health badge unchanged for history.** `computeHealthBadge` early-returns "Tidak Aktif" on `ClassSection.status === "INACTIVE"`.
- **Archive lock scoped to admin write endpoints.** Background writes (attendance, `reconcileSessions`) are not year-guarded. Importer re-runs use direct Prisma/SQL, bypassing the guard. UI consequence: past years enter `archivedMode` → edit controls hide (intended).
- **Track 2 SQL tenant-scoped.** Single tenant today (`tenant_annisaa`), but the UPDATE carries an explicit `tenantId` predicate.

## Tasks

1. [x] **Read-path: year-aware count + roster.** `_helpers.ts` fetches non-WITHDRAWN enrollment statuses + adds `rosterEnrollmentVisible`; `route.ts` (list) and `[id]/route.ts` (detail) compute the roster/count year-aware; DELETE audit `_count` stays ACTIVE.
2. [x] **Vitest for read-path.** `rosterEnrollmentVisible` rule + GET year-aware roster (past shows GRADUATED, active hides promoted-out GRADUATED) + DELETE ACTIVE audit.
3. [x] **Importer hardening + reconcile assert.** Generator emits `ARCHIVED` (not `INACTIVE`); reconcile-check.sql fails loud on off-enum year/enrollment status, zero-enrollment students, and count self-consistency.
4. [x] **Ship Notes: prod normalization SQL.** Idempotent, tenant-scoped `AcademicYear` archive.

## Implementation

- Subagent plan: driver=claude-opus-4-8, dirty-work=claude-sonnet-4-6; Task 1+2 (read-path + vitest) one subagent, Task 3 (importer hardening) parallel subagent — disjoint file sets. Driver ran gates + code review; a code-review pass caught a year-awareness gap (blanket `not: WITHDRAWN` leaks promoted-out GRADUATED onto active rosters) which the driver fixed by keying visibility on academic-year status. Subagent test output re-verified verbatim per feedback_subagent_test_reports.
- Task 1: read-path — `app/api/admin/classes/_helpers.ts` (added `rosterEnrollmentVisible`; `classListSelect`/`classDetailSelect` fetch non-WITHDRAWN statuses), `app/api/admin/classes/route.ts` (list enrich computes year-aware `enrolledCount`), `app/api/admin/classes/[id]/route.ts` (detail GET filters roster year-aware; DELETE audit `_count` reverted to ACTIVE) — historical rosters now render; active rosters unchanged; promoted-out GRADUATED hidden on active years.
- Task 2: `app/api/__tests__/admin-classes-historical-roster.test.ts` — 8 tests: rule table, list/detail select shapes, GET year-aware visibility (both directions), DELETE ACTIVE audit.
- Task 3: `scripts/import-roster/build-history-backfill.py` (year status → PLANNING/ACTIVE/ARCHIVED via `ay_status()`, off-enum asserts), `scripts/import-roster/history-import.sql` (4 AcademicYear rows patched INACTIVE→ARCHIVED), `scripts/import-roster/reconcile-check.sql` (new plpgsql RAISE-EXCEPTION assertions).

## Verification

- Task 1+2: `npx vitest run app/api/__tests__/admin-classes-historical-roster.test.ts` → 8 passed (8). Includes leak-prevention (`GRADUATED` on ACTIVE year → hidden).
- Full gate: `npm run build` → Compiled successfully. `npx vitest run` → 230 files passed / 2 skipped; 2201 tests passed / 42 todo; 0 failed.
- Task 3: generator run against synthetic fixtures emits `ARCHIVED` (no `INACTIVE` for AcademicYear); off-enum assert fires when broken. `reconcile-check.sql` is invoked via `psql -f` / Supabase SQL editor post-import (read-only; not run against a live DB in this cycle).
- Frontend gate: N/A — no `app/**/*.tsx`, `*.css`, or `tailwind.config.*` in the diff (API + scripts + test only).
- Playwright: local run deferred to CI (env cannot execute it — worktree lacks browsers + staging-only DB). Required CI check `Playwright E2E` gates the merge; CTO will not merge on red.
- Data reconciliation (prod `vxwywmvpxetdgnxejjgk`, read-only): 5 academic years; 2026/2027 ACTIVE; 130/166 active students carry 2025/2026 history; 0 orphan students. Confirms data present pre-fix.

## Ship Notes

**Migrations:** none (no schema change).

**Post-merge prod data normalization (Track 2) — run once after this PR merges, backup first:**

```sql
-- Preview (expect 4 rows: 2022/23–2025/26):
SELECT name, status FROM "AcademicYear"
WHERE status = 'INACTIVE' AND "tenantId" = 'tenant_annisaa' ORDER BY name;

-- Apply (idempotent; 2026/2027 excluded — it is already ACTIVE):
UPDATE "AcademicYear" SET status = 'ARCHIVED'
WHERE status = 'INACTIVE' AND "tenantId" = 'tenant_annisaa';

-- Verify (expect 0):
SELECT count(*) FROM "AcademicYear"
WHERE status NOT IN ('PLANNING','ACTIVE','ARCHIVED');
```

Rollback: `UPDATE "AcademicYear" SET status='INACTIVE' WHERE status='ARCHIVED' AND "tenantId"='tenant_annisaa';`

**Consequence to flag to admins:** after archiving, past years enter read-only `archivedMode` in the Kelas UI — historical class/enrollment/teaching-assignment edits return 403 (intended audit lock). Future historical re-imports must use the direct DB/SQL path, not the admin API.

**Reconcile check:** run `scripts/import-roster/reconcile-check.sql` (via `psql -f` or Supabase SQL editor) after any future roster import — it raises on off-enum statuses, zero-enrollment students, and count mismatch.

**Env vars:** none. **Rollback of code:** revert PR; no data migration coupled to the code deploy.
