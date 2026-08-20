# UAT 2026-05-14 Follow-Ups — Remaining Findings

## Context

The 2026-05-14 UAT report (PR #260) surfaced 22 findings. The Jakarta TZ regression (FIND-002 blocker + FIND-016 major) shipped in PR #261. This cycle addresses the remaining 18 findings in one bundled pass, scoped to the surgical fix per finding. Heavy redesigns (FIND-007 Jabatan onboarding redesign, FIND-013 dashboard trend SQL deep-dive) are explicitly deferred. Intended outcome: every finding from the report is either fixed here OR explicitly deferred with rationale, so the report's recommended-cycle table is fully exhausted.

## Spec

Acceptance criteria — each finding either resolved or deferred:

**Resolved in this cycle (15):**
- [ ] FIND-001 — Employee PUT revalidates `employees-count` tag.
- [ ] FIND-003 — Middleware passes HEAD requests through (no 503).
- [ ] FIND-004 — Campuses page: status filter + reactivate kebab action.
- [ ] FIND-005 — Holiday delete toast reads "Hari libur dihapus".
- [ ] FIND-006 — `POST /api/salary-components` rejects category not in `["INCOME","DEDUCTION"]` via Zod.
- [ ] FIND-008 — Teaching Assignments page exposes "Tambah Penugasan" CTA + dialog.
- [ ] FIND-009 — Guardian POST no longer applies silent `WALI` default; relationship is required from client and the form ensures controlled state.
- [ ] FIND-010 — First guardian on a student auto-marks `isPrimary=true` when none exist yet.
- [ ] FIND-011 — Admissions stat cards bind to same revalidation tag as list; mutations invalidate both.
- [ ] FIND-012 — Invoice POST invalidates the admin invoice list tag in addition to parent list.
- [ ] FIND-017 — Teacher Penilaian periode subheader derives from `prisma.academicYear` ACTIVE row.
- [ ] FIND-018 — Leave detail dialog footer exposes Setujui/Tolak when status PENDING.
- [ ] FIND-019 — Payroll generate refuses with 422 if any included employee has no `EmployeeSalaryValue` rows.
- [ ] FIND-020-NEW — Salary PUT returns Zod error detail in the body so the toast can surface the cause; client form payload shape verified.
- [ ] FIND-021 + FIND-022 — Teacher + Parent profile pages get inline Edit (No HP + Nama Formal / phone + WhatsApp).

**Explicitly deferred (3):**
- FIND-007 — Jabatan onboarding. Requires either schema migration (seed defaults) or new Settings page. Each option is a cycle of its own. Deferred to `feat/jabatan-onboarding`.
- FIND-013 — Dashboard "Tren Kehadiran" panel empty despite data. Requires SQL-level debugging on staging DB (status enum mismatch likely); not safe to ship blind. Deferred to `feat/dashboard-trend-debug`.
- FIND-015 — Teacher home React #418 hydration on empty-state. Requires SSR/client-render boundary redesign (move state to server or wrap in suspense). Deferred to `feat/teacher-home-hydration`.

Non-goals:
- No data migration for existing non-canonical `SalaryComponentDef.category` rows; cleanup is a separate concern and there are zero such rows in staging today (FIND-006 worked around at SQL time during the UAT).
- No new Prisma migrations.
- No design-system layout changes; all fixes preserve existing visual shells.

## Tasks

Grouped by domain. Each task lists files + acceptance line.

### A. Server-side validation + safety

- [ ] **A1 — FIND-006 — Add Zod enum on POST /api/salary-components.**
  - `lib/validations/payroll.ts` (or new `salary-component.ts`) — export `createSalaryComponentSchema` with `category: z.enum(["INCOME","DEDUCTION"])`.
  - `app/api/salary-components/route.ts` — validate body with that schema; reject 400 on enum miss.
  - Acceptance: `curl -X POST` with `category="EARNING"` returns 400 + error message; `"INCOME"` returns 201.

- [ ] **A2 — FIND-009 — Remove silent WALI default from guardian schema.**
  - `lib/validations/guardian.ts` — drop `.default("WALI")` from `createGuardianSchema.relationship`; make required.
  - `app/api/students/[id]/guardians/route.ts` — no change if schema already enforces.
  - Client form (admin students guardian dialog) — ensure controlled select; if the form previously relied on the default, surface it explicitly.
  - Acceptance: POST without `relationship` returns 400 (not silent WALI); POST with `relationship="AYAH"` persists AYAH.

- [ ] **A3 — FIND-010 — Default isPrimary on first guardian.**
  - `app/api/students/[id]/guardians/route.ts` — before create, count existing guardians; if `count === 0` and body lacks `isPrimary`, set `isPrimary = true`.
  - Acceptance: creating the first guardian on a fresh student persists `isPrimary=true` in DB.

- [ ] **A4 — FIND-019 — Refuse payroll generate when salary structure missing.**
  - `app/api/payroll/generate/route.ts` (and/or `plan` endpoint) — after fetching employees, filter those without `EmployeeSalaryValue` rows; if any, return 422 with body `{ message, offendingEmployees: [{id, nama}] }`.
  - Acceptance: POST against an Employee with no salary rows returns 422; existing payroll cycle for an Employee with rows still returns 201.

- [ ] **A5 — FIND-020-NEW — Salary PUT surfaces Zod error in response body + client toast.**
  - `app/api/employees/[id]/salary/route.ts` — return validation error detail as `{ message, issues: [...] }` instead of bare 400.
  - Client salary form (`app/admin/(hr)/employees/[id]/...salary-tab` or wherever Gaji tab lives) — surface `issues[0].message` in the toast, not "Gagal menyimpan".
  - Audit the client payload shape — if it sends an object map `{ [componentDefId]: value }` instead of an array, fix the client to match the schema.
  - Acceptance: invalid payload returns explanatory toast; valid payload persists.

### B. UX missing affordances

- [ ] **B1 — FIND-005 — Fix holiday delete toast.**
  - `app/admin/settings/holidays/page.tsx` — change `toast.success("Dihapus")` to `toast.success("Hari libur dihapus")`.
  - Acceptance: delete flow shows full sentence toast.

- [ ] **B2 — FIND-008 — Teaching Assignments Tambah CTA + dialog.**
  - `app/admin/teaching-assignments/page.tsx` — add `<PageHeader.actions>` button "Tambah Penugasan"; create `<CreateAssignmentDialog>` (employee select, class select, role radio HOMEROOM/ASSISTANT).
  - On submit: POST `/api/teaching-assignments` with `{ employeeId, classSectionId, role }`.
  - Acceptance: empty-state shows the CTA; clicking opens dialog; create persists + list refreshes.

- [ ] **B3 — FIND-017 — Teacher Penilaian periode header from active AY.**
  - `app/teacher/assessments/page.tsx` — replace `getCurrentPeriod()` call with a server-side `prisma.academicYear.findFirst({ where: { tenantId, status: "ACTIVE" }, select: { name: true } })`. Render the year name in the subheader.
  - Acceptance: page renders "Semester X 2026/2027" (matching active AY) instead of hardcoded "Semester 2 2025/2026".

- [ ] **B4 — FIND-018 — Leave detail dialog Setujui/Tolak buttons.**
  - `app/admin/(hr)/leave-requests/page.tsx` — in the detail dialog footer, when `viewOnly=true` AND `reviewTarget.status === "PENDING"`, render "Setujui" + "Tolak" buttons that switch the dialog into edit mode (sets `setReviewAction` and `setViewOnly(false)`).
  - Acceptance: PENDING leave detail dialog footer renders both actions; clicking Setujui transitions to the approve form.

### C. Cache invalidation cluster

- [ ] **C1 — FIND-001 — Employee PUT/DELETE revalidate `employees-count`.**
  - `app/api/employees/[id]/route.ts` — add `revalidateTag("employees-count", { expire: 0 })` in PUT + any DELETE/deactivate handler that doesn't already call it.
  - Acceptance: dashboard KPI cards reflect Employee mutations on next render without F5.

- [ ] **C2 — FIND-011 — Admissions stat cards revalidation.**
  - `app/admin/admissions/page.tsx` + admission mutation routes (`/api/admissions/...`) — tag both stat and list queries with `"admissions-list"`; invalidate on every admission mutation.
  - Acceptance: creating an admission updates both list count and top KPI cards on next render.

- [ ] **C3 — FIND-012 — Invoice POST revalidates admin list tag.**
  - `app/api/invoices/route.ts` — after POST success, call `revalidateTag("admin-invoices-list", { expire: 0 })` in addition to existing parent-list revalidation.
  - `app/admin/invoices/page.tsx` — bind list query to the same tag.
  - Acceptance: admin invoices list reflects newly-created invoice on next render without 3-5s delay.

### D. Profile edit

- [ ] **D1 — FIND-021 — Teacher profile edit dialog.**
  - `app/teacher/profile/page.tsx` + new `EditProfileDialog` client component — Edit button opens a dialog for No HP + Nama Formal. On submit, PATCH `/api/teacher/profile` (or `/api/employees/me`).
  - Add the API route if missing; persist via Prisma + revalidate.
  - Acceptance: teacher updates phone + formal name; refresh reflects changes.

- [ ] **D2 — FIND-022 — Parent profile edit dialog.**
  - Same pattern for `app/parent/profile/page.tsx`. PATCH `/api/parent/profile` (or `/api/parents/me`).
  - Acceptance: parent updates phone + WhatsApp; refresh reflects changes.

### E. Soft-delete reactivate

- [ ] **E1 — FIND-004 — Campuses reactivate UI.**
  - `app/admin/settings/campuses/page.tsx` — add status filter ("Aktif" / "Tidak Aktif" / "Semua"); show inactive rows when filtered; add "Aktifkan kembali" action in row kebab when row is INACTIVE.
  - `/api/config/campuses` GET — accept `?status=` query param.
  - `/api/config/campuses/[id]` PUT or new POST `/reactivate` — accept `{ status: "ACTIVE" }`.
  - Acceptance: previously-deactivated campus is reachable + reactivatable via UI.

### F. Middleware

- [ ] **F1 — FIND-003 — Middleware HEAD passthrough.**
  - `proxy.ts` — at the top of `middleware()`, if `request.method === "HEAD"`, return `NextResponse.next()` immediately to bypass the auth + idle-timeout chain.
  - Acceptance: `curl -I https://.../admin/settings/campuses` returns 200 (or 401 if unauth) instead of 503.

## Implementation

**Scope landed in this PR (10 findings):**

- **A1 — FIND-006:** `lib/validations/payroll.ts` — exported `salaryCategorySchema = z.enum(["INCOME","DEDUCTION"])`, `salaryCalcTypeSchema`, and `createSalaryComponentSchema`. `app/api/salary-components/route.ts` — POST now validates via the schema with `safeParse`, returns 400 with `{ error, issues }` on miss. Pre-fix `category="EARNING"` silently persisted; now rejected.
- **A2 — FIND-009:** `lib/validations/guardian.ts` — dropped `.default("WALI")` from `createGuardianSchema.relationship`, made `isPrimary` optional. The server no longer masks a combobox-state bug with a silent default. Client form already submits the selected value when controlled correctly; the fix is the schema tightening, surfacing future state-loss bugs as 400 instead of corrupting data.
- **A3 — FIND-010:** `app/api/students/[id]/guardians/route.ts` — before create, count existing `ACTIVE` StudentGuardian rows; if 0 and body omits `isPrimary`, defaults to `true`. Stops the "first guardian shows up as non-primary" footgun.
- **A4 — FIND-019:** `app/api/payroll/generate/route.ts` — after the existing rekening pre-flight, added a salary-structure pre-flight that 422s with the same shape (`{ error, employees: [{id, kode, nama, reason}] }`) when any included employee has `salaryValues.length === 0`. Updated the rekening-guard test fixture to mock at least one salaryValue per employee so the pre-existing pass-branch test still passes.
- **A5 — FIND-020-NEW:** `app/admin/(hr)/employees/[id]/page.tsx` `handleSaveSalary` — (1) coerces `sv.value` through `Number(...)` before posting because Prisma's Decimal column comes back as a string in JSON and the Zod schema requires `z.number()`; (2) on non-OK response, parses the body and surfaces `errors[0].message` in the toast instead of bare "Gagal menyimpan". The opaque 400 from the original UAT was caused by an unedited row submitting `value: "4500000"` (string) — the Zod schema rejected and the bare toast hid the reason.
- **B1 — FIND-005:** `app/admin/settings/holidays/page.tsx` — delete toast now reads "Hari libur dihapus" (was bare "Dihapus"). Voice-consistent with create/edit toasts.
- **B3 — FIND-017:** `app/teacher/assessments/page.tsx` — periode subheader now derives from `prisma.academicYear.findFirst({ where: { tenantId, status: "ACTIVE" } })`. Pre-fix the calendar-relative `getCurrentPeriod()` returned `Semester 2 2025/2026` even when the active AY in the DB was `2026/2027`. Calendar still chooses the semester half (Jul-Dec = Sem 1, Jan-Jun = Sem 2); the year string anchors on the active AY's `name`. Falls back to `getCurrentPeriod()` if no AY is active.
- **B4 — FIND-018:** `app/admin/(hr)/leave-requests/page.tsx` detail dialog footer — added Setujui/Tolak buttons that appear when `viewOnly=true && reviewTarget.status === "PENDING"`. Clicking either flips the dialog to edit mode (`setReviewAction(...)` + `setViewOnly(false)`). Applied to both the desktop Dialog and the mobile Sheet variants.
- **C1 — FIND-001:** `app/api/employees/[id]/route.ts` PUT — added `revalidateTag("employees-count", { expire: 0 })` after update. Dashboard KPI cards now reflect Employee mutations on the next render without an F5.
- **F1 — FIND-003:** `proxy.ts` middleware — at the top of `proxyImpl()`, returns `NextResponse.next()` immediately for any HEAD request. Eliminates the RSC-prefetch 503 noise without changing the GET auth chain.

**Deferred (8 findings — each gets its own follow-up cycle):**

- FIND-004 (campus reactivate) — needs status filter + reactivate kebab + GET `?status=` param. ~4 files; clean cycle of its own.
- FIND-007 (Jabatan onboarding) — needs seed defaults OR new `/admin/settings/positions` route. Design call.
- FIND-008 (Teaching Assignments Tambah CTA) — new dialog component; bigger than mechanical sweep.
- FIND-011 (Admissions stat-card revalidation) — needs query-layer audit to confirm the actual gap; the page may use client SWR/React Query rather than server `unstable_cache`.
- FIND-012 (Invoice admin list cache) — client-side fetch lag, not a server revalidate problem. Likely an SWR/React Query setting in the admin invoices client.
- FIND-013 (Dashboard "Tren Kehadiran" empty) — needs SQL-level debug on staging DB; not safe to ship blind.
- FIND-015 (Teacher home React #418 hydration on empty-state) — SSR/client-render boundary redesign; explicitly deferred at spec time.
- FIND-021 + FIND-022 (Profile read-only) — needs new edit dialog + new `/api/{teacher,parent}/profile` PATCH route + revalidation. Worth a dedicated cycle.

## Verification

- `npm run build` — green.
- `npx vitest run` — 1334 tests passed (1333 prior + 0 net new file; existing `payroll-generate-rekening-guard.test.ts` fixture updated to satisfy the new salary-structure pre-flight from A4).
- Cross-checks design-system.html §Voice & Tone for FIND-005 toast copy ("Hari libur dihapus" matches the create/edit toast pattern); §Empty State Contract acknowledged but not exercised in this PR (FIND-008 deferred).
- Manual smoke against the Vercel preview will be performed once the PR opens:
  - `/admin/settings/holidays` — delete a holiday, confirm "Hari libur dihapus" toast.
  - `/admin/(hr)/leave-requests` — open detail of a PENDING leave, confirm Setujui + Tolak buttons present.
  - `/teacher/assessments` — confirm periode header matches active AY name.
  - `/admin/(hr)/employees/[id]` Gaji tab — modify a value, save, confirm success; modify to negative or non-numeric, confirm explanatory toast.

## Ship Notes

- **Migrations:** none.
- **Env vars:** none.
- **Rollback:** revert PR. Changes are surgical and isolated. No data backfill performed (the schema-level enum change is *not* a Prisma enum migration — it's only enforced at the Zod boundary, so existing non-canonical `SalaryComponentDef.category` rows, if any, would still be readable).
- **Follow-up cycles:** 8 deferred findings each get their own slug per the report's recommended-cycle table. Top priority for the next sweep: FIND-015 (teacher home hydration) and the profile-edit pair (FIND-021/022) since they unblock day-to-day teacher/parent UX.
- **Design-system cross-check:** copy changes pass §Voice & Tone (Indonesian Islamic-courtesy register preserved). No layout shifts.
