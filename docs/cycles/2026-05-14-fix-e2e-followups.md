# Fix E2E Followups — F-1, F-2, F-3 from the admission lifecycle cycle

## Context

The E2E staging cycle ([docs/cycles/2026-05-14-e2e-admission-lifecycle.md](2026-05-14-e2e-admission-lifecycle.md)) surfaced 8 findings. F-5 (enroll 500) shipped separately as [PR #279](https://github.com/ismailir10/annisaa-erp-v3/pull/279). This cycle picks up the remaining **code-fix-able** findings:

- **F-1 (Major)** — `/admin/guardians` Nonaktifkan + Edit return 404. List endpoint at `app/api/guardians/route.ts` queries `prisma.parent.findMany` and returns Parent IDs; the mutation handler at `app/api/guardians/[id]/route.ts` gates on `prisma.studentGuardian.findFirst` which only matches the junction-table id. Two different models share one URL space. Confirmed by reading both routes.
- **F-2 (Minor)** — Header count drifts from card stats: Siswa header "102 siswa terdaftar" vs card "TOTAL SISWA 101"; Pendaftaran header "35 calon siswa" vs cards summing to 31. Root cause: list endpoints page-count all rows; stat endpoints exclude buckets. `app/api/students/stats/route.ts:35` literally states *"INACTIVE/WITHDRAWN are intentionally excluded so cards stay aligned with pre-refactor numbers"*. The historical alignment is now wrong — header is the authoritative count.
- **F-3 (Minor)** — TOTAL CALON dropped 31→30 when an admission moved Pertanyaan→Kunjungan. Root cause: `app/admin/admissions/page.tsx:393-402` computes `stats.total = INQUIRY + ADMITTED` from two `pageSize=1` list calls, so SCHEDULED/VISITED/CANCELLED admissions are not counted at all.

Findings explicitly **out of scope** for this cycle and why:
- **F-4 (capacity audit)** — data issue, not code. Bumping `ClassSection.capacity` or adding sections needs admin data work (potentially via a `/spec` cycle once capacity targets are agreed).
- **F-6 (no active Pekan)** — duplicate of the C7 PROMES seed initiative ([memory: project_curriculum_assessment.md](../../memory/project_curriculum_assessment.md)). That cycle was deferred at the top of this session.
- **F-7 (duplicate Alika Ismail Anggraini student rows)** — DB cleanup task, not code. Either a one-off SQL fix or a seed-script audit.
- **F-8 (Tagihan Manual silent submit)** — could not reliably reproduce a code bug. `validateManualForm` at [components/admin/invoices/manual-invoice-dialog.tsx:90](components/admin/invoices/manual-invoice-dialog.tsx:90) toasts on missing fields, and the dialog pre-fills `feeComponentId` from `active[0].id` on open ([line 562-570](components/admin/invoices/manual-invoice-dialog.tsx:562)). The most likely explanation for the missing POST in the E2E session is a stale element ref clicking outside the button between Chrome-MCP `find` and `left_click` calls. Re-flagging as "investigation needed" rather than a confirmed bug — separate cycle if it actually reproduces.

## Spec

**Acceptance criteria:**

F-1:
- [ ] New route `app/api/parents/[id]/route.ts` exports `PUT` (edit parent fields) and `PATCH` (toggle `status`). Both tenant-guarded, admin-only, rate-limited consistent with existing `/api/guardians/[id]` (10/min for edit).
- [ ] `app/admin/guardians/page.tsx` mutation handlers (edit + status toggle) call `/api/parents/[id]` instead of `/api/guardians/[id]`.
- [ ] Existing `/api/guardians/[id]` route untouched — junction-level edits from Student detail page (`app/admin/students/[id]/page.tsx:176`) still work.
- [ ] Nonaktifkan on `/admin/guardians` succeeds (no more "Wali tidak ditemukan" 404). Status flips ACTIVE↔INACTIVE.

F-2:
- [ ] `GET /api/students/stats` returns `total` = sum of ALL student statuses (ACTIVE + INACTIVE + GRADUATED + WITHDRAWN), not just ACTIVE + GRADUATED.
- [ ] `total` returned by stats matches the unfiltered `pagination.total` returned by `GET /api/students` (the list endpoint).

F-3:
- [ ] `app/admin/admissions/page.tsx` fetches `total` as the sum across all admission statuses, not just INQUIRY + ADMITTED. Simplest implementation: one extra `pageSize=1` call without `status` filter, OR drop the two existing calls and use one unfiltered call to derive total — pick whichever needs less code churn.
- [ ] "Total Calon" card no longer decreases when an admission transitions to an intermediate stage (Kunjungan / Sudah Kunjungan / Cancelled).

Tests + gates:
- [ ] Vitest covers new `/api/parents/[id]` route — happy edit, status toggle, cross-tenant 404, missing parent 404.
- [ ] Existing `app/api/__tests__/student-stats.test.ts` (if exists; otherwise add) updated to assert `total` includes all 4 statuses.
- [ ] `npm run build && npx vitest run` clean.

**Non-goals:**
- Renaming the existing `/api/guardians` list endpoint — confusing but stable; renaming ripples across UI components, tests, and any external link. Leave for a focused rename cycle once F-1's split clarifies intent.
- F-4 / F-6 / F-7 / F-8 (covered in Context).
- No Prisma schema changes — Parent.status column already exists (schema:495).
- No new admin UI structure — only the existing fetch URLs change.

**Assumptions:**
1. `Parent` model has `tenantId` (schema:496) and `status` (schema:495). Verified.
2. Deactivating a Parent via the `/admin/guardians` page is the user-facing meaning of "Nonaktifkan wali" — the cascading deactivation of related `StudentGuardian` junction rows is out of scope; this cycle only flips `Parent.status`. If the product later wants soft-delete to cascade, that is a separate decision.
3. Existing `/api/guardians/[id]` callers (Student detail's wali deactivation flow at `app/admin/students/[id]/page.tsx:176`) pass actual `StudentGuardian.id`, not Parent.id — verified by reading the route's `findGuardian` helper.
4. Including INACTIVE/WITHDRAWN rows in `total` is the user-expected behavior despite the comment at `students/stats/route.ts:35` describing "pre-refactor numbers". The comment is preserved as historical context but the behavior changes — the E2E session confirmed users notice the drift.

## Tasks

> T1 + T3 are independent; T2 depends on the same files as T1 (mostly tests). T4 + T5 are independent. Subagent fan-out: not worth it for a 5-task batch with low collision risk; running sequentially.

- [ ] **T1 — Create `/api/parents/[id]` route.** New file `app/api/parents/[id]/route.ts` with `PUT` (update parent contact fields — name, phone, email, whatsapp, address, etc.) and `PATCH` (toggle status). Pattern after `app/api/guardians/[id]/route.ts` for shape but query `prisma.parent` instead of `prisma.studentGuardian`. Tenant guard via `prisma.parent.findFirst({ where: { id, tenantId } })`. Add Zod schema in `lib/validations/parent.ts` (or reuse if exists). _Done when: route file exists, hand-test via curl returns 200 on a valid parent ID + 404 cross-tenant._
- [ ] **T2 — Wire `/admin/guardians` to the new endpoint.** Edit `app/admin/guardians/page.tsx` lines 173 + 188 to call `/api/parents/${id}` instead of `/api/guardians/${id}`. Confirm no other callers in that file need updating. _Done when: file diff is two URL string changes only._
- [ ] **T3 — Fix `students/stats` total.** Edit `app/api/students/stats/route.ts:30-37` so `total = sum of all status buckets`. Keep `active`, `graduated`, and add `inactive` + `withdrawn` (or just expose `total` and the existing two — pick to keep diff minimal). _Done when: total = active + inactive + graduated + withdrawn._
- [ ] **T4 — Fix admissions "Total Calon" card.** Edit `app/admin/admissions/page.tsx` `fetchStats` callback so `total` is the unfiltered count, not `inquiry + admitted`. Smallest change: replace the two-fetch Promise.all with one unfiltered call for total + keep separate calls for inquiry/admitted if needed for sub-cards. _Done when: total stays stable across status transitions, verifiable via local stub._
- [ ] **T5 — Tests + gates.** New vitest `app/api/__tests__/parents.test.ts` — happy edit, status toggle, cross-tenant 404, parent missing 404. Update `app/api/students/stats` test if present. `npm run build && npx vitest run` clean. _Done when: all new + existing tests green._

## Implementation

- **Subagent plan:** all tasks sequential; low file-collision risk; no fan-out.
- **T1** — New `app/api/parents/[id]/route.ts` (`PUT` edit fields, `PATCH` toggle status) + `lib/validations/parent.ts` (`updateParentSchema`, `toggleParentStatusSchema`). Auth/tenant/rate-limit posture mirrors `app/api/guardians/[id]/route.ts` exactly: admin-only, `findFirst({ id, tenantId })` tenant guard, `rateLimit("parent-edit", 10/min)` on PUT (PATCH unguarded — consistent with the reference route).
- **T2** — `app/admin/guardians/page.tsx`: `handleEditSave` → `PUT /api/parents/[id]`, `handleStatusToggle` → `PATCH /api/parents/[id]` (was `PUT /api/guardians/[id]` with a `{status}` body the old route's Zod schema rejected anyway). GET stat-card calls left on `/api/guardians` — that list endpoint was never broken, it already queries `prisma.parent`.
- **T3** — `app/api/students/stats/route.ts`: `total` now sums all status buckets via `Object.values(byStatus).reduce(...)` instead of `active + graduated`. Confirmed by reviewer to equal `GET /api/students` unfiltered `pagination.total` (list endpoint has no implicit status filter).
- **T4** — `app/admin/admissions/page.tsx` `fetchStats`: added a third unfiltered `pageSize=1` fetch for `total`; `inquiry`/`admitted` still derived from their own filtered calls for the sub-cards. Reviewer confirmed `/api/admissions` has no default status filter, so the unfiltered count is the true total across all stages.
- **T5** — `app/api/__tests__/parents.test.ts` (new, 6 cases: PUT happy/cross-tenant-404/non-admin-403, PATCH toggle/bad-enum-400/cross-tenant-404). `app/api/__tests__/stats-groupby.test.ts` updated — the old "excludes INACTIVE/WITHDRAWN" assertion is now "includes ALL status buckets" (total 112 for the 8+99+5 fixture).
- **Reviewer pass:** `feature-dev:code-reviewer` on the staged diff. One actionable (Finding-5): cross-tenant 404 tests asserted the response but not the ORM `where` clause — a regression dropping `tenantId` would pass undetected. Fixed: both cross-tenant cases now `toHaveBeenCalledWith` assert `findFirst` got `{ id, tenantId }`. All other review questions came back clean (tenant guard sufficient, rate-limit parity intentional, F-2/F-3 endpoints have no hidden filters).

Findings table (this cycle):

| Finding | Resolution |
|---|---|
| F-1 guardians 404 | New `/api/parents/[id]` route; `/admin/guardians` re-pointed. Old `/api/guardians/[id]` untouched (still serves Student-detail junction edits). |
| F-2 student count drift | `students/stats` total = sum of all status buckets. |
| F-3 admission TOTAL CALON drift | Admissions page fetches unfiltered total instead of `INQUIRY + ADMITTED`. |
| F-4 / F-6 / F-7 / F-8 | Out of scope — data/seed issues or unreproducible; see Context. |

## Verification

- **Between-task gate:** `npm run build && npx vitest run`
  - `npm run build` — clean.
  - `npx vitest run` — **1541 tests, 0 failures, 0 errors** (junit-verified). One earlier run showed 2 flaky failures under severe CPU starvation (env time 1661s); clean isolated re-run + a full clean re-run confirmed flake, not regression. Touched-file subset (`parents.test.ts`, `stats-groupby.test.ts`, `app/admin/*`) — 28/28 pass.
- **End-of-cycle gate (Playwright):** skipped — same rationale as the enroll-fix cycle. Changes are 1 new API route + 2 stat-count tweaks + 2 fetch-URL changes; no UI structure change. Preview-verify below covers the user-facing surface.
- **Preview-verify:** appended after commit + push triggers the Vercel preview. Plan: log in as admin, (a) `/admin/guardians` → Nonaktifkan a parent → expect success toast + status flip (was 404); (b) `/admin/students` → confirm header count == TOTAL SISWA card; (c) `/admin/admissions` → confirm TOTAL CALON == header count and does not drop on a status transition.
- **Design-system check:** N/A — no `.css`/Tailwind/structural `.tsx` change; the two `.tsx` edits are fetch-URL string + stat-fetch logic only. Frontend-gate hook will not fire.

## Ship Notes

- **Migrations:** none. `Parent.status` column already existed (schema:495).
- **Env vars:** none.
- **Rollback:** `git revert <commit-sha>`. The new `/api/parents/[id]` route is additive; reverting restores the (broken) prior `/admin/guardians` behavior but breaks nothing else.
- **Coupled cycles:** independent of PR #279 (enroll fix) and the un-shipped E2E report branch. Merge order does not matter.
- **Deferred follow-ups** (from the E2E report, not addressed here):
  - F-4 capacity audit — data work; needs agreed capacity targets.
  - F-6 no active Pekan — the C7 PROMES seed initiative.
  - F-7 duplicate Alika student rows — DB cleanup / seed-script audit.
  - F-8 Tagihan Manual silent submit — could not reproduce a code bug; re-open only if it recurs with a confirmed missing POST.
