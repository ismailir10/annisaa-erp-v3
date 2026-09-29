# Admin HR, mobile lists, and destructive-action guards

## Context
The 2026-09-29 full E2E review (`docs/uat/reports/2026-09-29-full-e2e.md`) found a cluster of admin gaps:

- **HR-3 (major) + DOC-2** — a new employee has no salary structure and the Gaji section could not add one (its empty state pointed at Pengaturan, which does not attach components). A newly created salary component stayed invisible on every employee until a value row existed. Payroll generation then 422'd for the whole run, shown only as a vanishing toast.
- **HR-12** — generation accepted a period that has not started and produced a negative net (Rp -50.000) that could be approved.
- **CORE-7, FIN-21, ACAD-10, DOC-5** — at 390px Siswa and Kelas lists showed almost nothing beyond the name, Tagihan/Penerimaan clipped Jumlah and Status, Kehadiran Siswa hid Status, and the raport editor ran off-screen.
- **CORE-4 (major)** — deactivating the primary guardian left the student with no primary guardian (payment links need an active primary, `lib/payments/session.ts`).
- **CORE-3 (major)** — class "Tambah Siswa" picker loaded 100 students, no search, homonyms indistinguishable.
- **CORE-6 (major) + DOC-3** — activating a PLANNING academic year is an unwarned school-wide switch; PLANNING years cannot be archived; the semester dialog lists only ACTIVE years; reordering semesters silently flips the active one.
- **ACAD-2 (major)** — a published raport keeps a frozen attendance snapshot that diverges from later corrections with no warning.
- **CORE-9 / FIN-12 / HR-17 / CORE-12** — no-match search shows the first-run empty state; HR routes bounce school_admin silently; focus is lost after Escape closes a dialog.

## Spec
- [ ] Employee Gaji section lists every active salary component with its value ("Belum diatur" when none), lets the admin fill/edit values and save; a new component appears immediately.
- [ ] Payroll generation errors (missing salary structure / rekening / negative net) stay on screen as an alert with a link per employee.
- [ ] Generation rejects a period that has not started; generation and approval refuse a negative net slip with a clear message.
- [ ] At 390px Siswa, Kelas, Tagihan, Penerimaan, Kehadiran Siswa show identity + status + amount without horizontal scrolling; raport editor fields fit.
- [ ] Deactivating a primary guardian: server keeps the invariant (auto-promote the next active guardian, or refuse/return warning when none), UI states which.
- [ ] Class add-student picker: server-side search + pagination, NIS/birthdate/current class shown, already-enrolled excluded.
- [ ] Academic years: activation confirm states the real effect; PLANNING year can be archived; semester dialog can pick PLANNING years; reordering semesters never changes which is active.
- [ ] Raport: stale-attendance warning with one-click "Perbarui kehadiran".
- [ ] Minors where trivial: no-match vs no-data empty state; HR "tidak punya akses" message; dialog focus return.

### Non-goals
No schema migration, no new dependency, nothing in auth/session code (HR-17 is a UI message only), no change to how payroll is calculated.

### Assumptions
1. "Future payroll period" = `periodStart` after today (Asia/Jakarta). A period that has started but not finished is allowed (the default period ends on the 20th, so generating on the 25th for the 21st-20th window stays legal).
2. Salary values are only upserted from the UI; "unset" is not written (there is no way to delete a value row, and 0 is a legitimate saved value).

## Tasks
- [x] **T1 — HR-3 / DOC-2 / HR-12: salary structure UI, persistent payroll blockers, period + negative-net guards.**
- [x] **T2 — CORE-4: primary guardian invariant on deactivate.**
- [ ] **T3 — CORE-3: class add-student picker search + pagination.**
- [ ] **T4 — CORE-6 / DOC-3: academic year activation, archive PLANNING, semester dialog + reorder.**
- [ ] **T5 — ACAD-2: stale raport attendance warning + re-sync.**
- [ ] **T6 — CORE-7 / FIN-21 / ACAD-10 / DOC-5: mobile lists and raport editor at 390px.**
- [ ] **T7 — CORE-9 / FIN-12 / HR-17 / CORE-12 minors.**

## Implementation
- Subagent plan: driver=claude-sonnet-5-5, no subagents — this is a fix-cycle agent run by the lead (single harness tier, no down-tier available); the seven slices share one finding list and touch mostly disjoint files, so fan-out would cost more than it saves.
- Task 1: new `components/admin/employees/salary-editor.tsx` (`buildSalaryRows` merges `GET /api/salary-components` with the employee's value rows so every enabled component is listed; empty value = "Belum diatur"; save sends only the filled ones). Employee page uses it. New `components/admin/payroll/generate-blockers.tsx` — the payroll dialog keeps the 422 `{error, employees[]}` in an inline destructive Alert with a link per employee (`#salary` / `#profile`). New `lib/payroll/generation-guards.ts`; `app/api/payroll/generate/route.ts` returns a 400 field error for a future period and 422 (naming employees) for a negative net; `app/api/payroll/[id]/approve/route.ts` refuses to approve a run with a negative-net slip (one items read, reused for the attendance lock).
- Task 2: new `lib/guardians/primary.ts` (`changeGuardianLinkStatus`, `pickReplacementPrimary`) — one serializable transaction: deactivating the primary promotes the admin's `newPrimaryId` (validated as a remaining ACTIVE guardian of the student, else 400) or the first by AYAH/IBU/WALI/OTHER; reactivating into an empty primary slot re-promotes; the response carries `promotedPrimary` + `noActiveGuardian`. Both PATCH routes (`/api/guardians/[id]`, `/api/students/[id]/guardians/[guardianId]`) use it; `toggleGuardianStatusSchema` gains optional `newPrimaryId`. `keluarga-section.tsx` confirm: a replacement Select when others exist, a destructive Alert when the primary is the last active guardian, toast names the new primary. `/admin/guardians` (Parent-level status) is a different record and is unchanged.

## Verification
- Frontend diffs checked against `design-system.html` (shared `Alert`, `EmptyState`, `RupiahInput`, `StatusBadge` primitives; tokens only).
- Task 1: Vitest `salary-editor.test.tsx`, `generate-blockers.test.tsx`, `generation-guards.test.ts`, `payroll-generate-hr12.test.ts`, `payroll-approve-cas.test.ts` (+1); existing `payroll/__tests__/page.test.tsx` and `accessibility-contract.test.ts` updated for the inline blockers alert and the moved salary inputs.
- Task 1 gate: `npm run build` exit 0; `npx vitest run` 434 files passed, 2 failed (the two tests above, since fixed and re-run green).
- Task 2: `lib/guardians/__tests__/primary.test.ts`, `guardians-id-route.test.ts` PATCH block rewritten (promote / choose / reject / last guardian / reactivate x2), students guardian route test mocks extended, jsdom `keluarga-deactivate-primary.test.tsx` (3).

## Ship Notes
