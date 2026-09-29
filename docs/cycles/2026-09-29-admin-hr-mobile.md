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
- [x] **T3 — CORE-3: class add-student picker search + pagination.**
- [x] **T4 — CORE-6 / DOC-3: academic year activation, archive PLANNING, semester dialog + reorder.**
- [x] **T5 — ACAD-2: stale raport attendance warning + re-sync.**
- [x] **T6 — CORE-7 / FIN-21 / ACAD-10 / DOC-5: mobile lists and raport editor at 390px.**
- [x] **T7 — CORE-9 / FIN-12 / HR-17 / CORE-12 minors.**

## Implementation
- Subagent plan: driver=claude-sonnet-5-5, no subagents — this is a fix-cycle agent run by the lead (single harness tier, no down-tier available); the seven slices share one finding list and touch mostly disjoint files, so fan-out would cost more than it saves.
- Task 1: new `components/admin/employees/salary-editor.tsx` (`buildSalaryRows` merges `GET /api/salary-components` with the employee's value rows so every enabled component is listed; empty value = "Belum diatur"; save sends only the filled ones). Employee page uses it. New `components/admin/payroll/generate-blockers.tsx` — the payroll dialog keeps the 422 `{error, employees[]}` in an inline destructive Alert with a link per employee (`#salary` / `#profile`). New `lib/payroll/generation-guards.ts`; `app/api/payroll/generate/route.ts` returns a 400 field error for a future period and 422 (naming employees) for a negative net; `app/api/payroll/[id]/approve/route.ts` refuses to approve a run with a negative-net slip (one items read, reused for the attendance lock).
- Task 2: new `lib/guardians/primary.ts` (`changeGuardianLinkStatus`, `pickReplacementPrimary`) — one serializable transaction: deactivating the primary promotes the admin's `newPrimaryId` (validated as a remaining ACTIVE guardian of the student, else 400) or the first by AYAH/IBU/WALI/OTHER; reactivating into an empty primary slot re-promotes; the response carries `promotedPrimary` + `noActiveGuardian`. Both PATCH routes (`/api/guardians/[id]`, `/api/students/[id]/guardians/[guardianId]`) use it; `toggleGuardianStatusSchema` gains optional `newPrimaryId`. `keluarga-section.tsx` confirm: a replacement Select when others exist, a destructive Alert when the primary is the last active guardian, toast names the new primary. `/admin/guardians` (Parent-level status) is a different record and is unchanged.
- Task 3: `GET /api/students` searches NIS too and takes `notEnrolledInClass=<classId>` (`enrollments: { none: { classSectionId, status: ACTIVE } }`). `AddStudentDialog` swaps the 100-row `Select` preload for the shared `AsyncCombobox` (debounced server search, 20 per page, "Tampilkan lebih banyak" up to 100, total shown in the footer); each option shows NIS / birth date / current class(es) so homonyms differ. `roster-section` no longer passes `enrolledStudentIds` (the server excludes them).
- Task 4: `lib/academic-year/activation-copy.ts` (confirm copy, matches `demoteOtherActiveYears`: the current ACTIVE year becomes **PLANNING**, not archived). `app/admin/academic-years/page.tsx`: the year row menu now has an "Aktifkan" confirm that names the year being demoted, and "Arsipkan" for ACTIVE and PLANNING years (sends `ARCHIVED`; the old "Nonaktifkan" sent `INACTIVE`, which the year schema does not accept). Semesters: `POST /api/admin/curriculum/semesters` accepts any non-ARCHIVED year and creates the semester ACTIVE only when the year has no ACTIVE semester (otherwise INACTIVE, no sibling demotion), so creating Semester 2 after Semester 1 no longer flips the active one; the client says so and switches the list filter to "Semua". The year Select lists PLANNING years; the reactivate confirm states that the sibling active semester is deactivated.
- Task 5: new `POST /api/admin/report-cards/[studentId]/[termId]/sync-attendance` (`reportCard.write`, tenant-scoped, audited as `sync-attendance` with before/after): re-reads live presensi via `loadRaportDraft` and rewrites only the four attendance columns of the existing entry — narratives, levels and publish state untouched, `parent-report-cards` cache evicted like publish. `raport-editor.tsx` shows "Kehadiran berubah sejak rapor diterbitkan" ("berbeda dari presensi terbaru" for a draft) with both sets of numbers and a "Perbarui kehadiran" button (saves pending edits first, then re-syncs and reloads). Pure rule in `lib/raport/attendance-drift.ts`. Not done: a per-row badge on the raport list — that needs a live-attendance read per student and the list has none.
- Task 6: new `components/ui/data-table-mobile-meta.tsx` (`md:hidden`, wraps) plus the existing `priority: "low"` contract. Students: program and status columns go `low`; class + status badge sit under the name. Classes: campus · program · wali kelas under the name (two "KB" classes are now distinguishable). Tagihan: avatar hidden below `md`, status + due date under the name, amount kept `whitespace-nowrap`, Status column `low`. Penerimaan: date/method under the student, Tanggal column `low`; `StatCard` scales a long figure (`Rp 12.345.678`) to `text-h2` below `sm` and never wraps inside it. Kehadiran Siswa: date/class under the name so Status stays on screen. Raport editor: cards `p-4` below `sm`, the capaian select stacks full-width under the "Saran" text. Every table container now measures `scrollWidth == clientWidth` at 390px. `ui.md` mobile contract documents the pattern.
- Task 7: `DataTable` gets `isFiltered` (no-match message, no first-run copy or CTA); students and invoices pass it, and the students header reads "N siswa cocok" while filtered. CORE-12: `ResponsiveFormDialog` remembers the opener (read in the render that opens the dialog — by any effect the popup has already taken focus) and refocuses it once the popup has unmounted and released focus to `<body>`. **HR-17 not done**: the bounce is `assertPermission` in `lib/auth-guards.ts` (auth code, non-goal, and its own comment warns about redirect loops) and three Playwright specs (`e2e/admin-school-admin.spec.ts`) assert the redirect to `/admin`; a message would need either an auth-helper change or a query/cookie signal that breaks those specs.

## Verification
- Frontend diffs checked against `design-system.html` (shared `Alert`, `EmptyState`, `RupiahInput`, `StatusBadge` primitives; tokens only).
- Task 1: Vitest `salary-editor.test.tsx`, `generate-blockers.test.tsx`, `generation-guards.test.ts`, `payroll-generate-hr12.test.ts`, `payroll-approve-cas.test.ts` (+1); existing `payroll/__tests__/page.test.tsx` and `accessibility-contract.test.ts` updated for the inline blockers alert and the moved salary inputs.
- Task 1 gate: `npm run build` exit 0; `npx vitest run` 434 files passed, 2 failed (the two tests above, since fixed and re-run green).
- Task 2: `lib/guardians/__tests__/primary.test.ts`, `guardians-id-route.test.ts` PATCH block rewritten (promote / choose / reject / last guardian / reactivate x2), students guardian route test mocks extended, jsdom `keluarga-deactivate-primary.test.tsx` (3).
- Task 3: `students/__tests__/route.test.ts` (+3: search fields, class exclusion, no filter), class detail `client.test.tsx` helper moved to the combobox + new picker test (search + exclusion query, NIS / DOB / class in the option).
- Task 4: `activation-copy.test.ts` (4), `curriculum-routes.test.ts` (year check now `not ARCHIVED`; +2 for INACTIVE-when-sibling-active / ACTIVE-when-first), semesters `client.test.tsx` (+2: PLANNING year offered, ARCHIVED hidden; info toast for an inactive create).
- Task 5: `attendance-drift.test.ts` (4), `admin-raport-route.test.ts` (+3: 403 / 404 / column-only write + audit), `raport-editor.test.tsx` (+2: warning + click re-syncs and reloads; silent when equal).
- Gates after T4+T5 (one combined run, source tree = both): `npm run build` exit 0; `npx vitest run` 440 files passed / 4143 tests passed.
- Task 6/7: `data-table-mobile-meta.test.tsx` (2), `stat-card-long-value.test.tsx` (2), `data-table-empty-filtered.test.tsx` (2), `responsive-form-dialog-focus.test.tsx` (1; passes in jsdom because Base UI already returns focus there — the browser check below is the real evidence), students `page.test.tsx` adjusted (mobile meta repeats the placements).
- Spec checklist: all items met except HR-17 (see Task 7) and the per-row raport-list badge (Task 5). Playwright: full suite run by lead serially before PR; CI `Playwright E2E` gates the merge. No e2e spec was changed or added.
- Final gate on source SHA 826952e + the CORE-12 refocus tweak in the final commit (staging #579 merged in): `npm run build` exit 0; `npx tsc --noEmit` clean; `npm run lint` 0 errors / 55 pre-existing warnings; `npx vitest run` tail:
  ```
   Test Files  464 passed | 2 skipped (466)
        Tests  4296 passed | 42 todo (4338)
   Duration  200.46s
  ```
  Earlier per-commit gates ran build + full vitest on the tree at that point, except the mobile/T7 commit, which was gated after the staging merge instead (staging #579 touched the same invoices files).
- Local browser verification (demo auth, `DEMO_MODE=true` on the app process only, production build, port 3107, disposable DB `schoolerp_c6`, Chromium; scripts in scratchpad `verify/admin-hr-mobile/`, screenshots `shots/verify-admin-hr-mobile/`); route: local, no login/session/cookie/auth-guard change:
  - HR-3/DOC-2 (1440): new employee's Gaji lists all 13 components as "Belum diatur" with the "Belum ada struktur gaji" alert (`hr3-gaji-empty-1440`); payroll generate shows the persistent alert naming the employee with an "Isi struktur gaji" link, still visible 6 s later (`hr3-blockers-missing-1440`); a deduction-only structure gives the negative-net alert (`hr3-blockers-negative-1440`); values persist after reload; once fixed the run reaches the duplicate-period check (`hr3-after-structure-1440`); a brand-new component appears as an empty row (`doc2-new-component-1440`).
  - HR-12: `POST /api/payroll/generate` for 21 Nov-20 Dec returns 400 with a `periodStart` field error.
  - CORE-7/FIN-21/ACAD-10 (390): Siswa, Kelas, Tagihan, Penerimaan, Kehadiran Siswa table containers measure `scrollWidth == clientWidth` (was 558 / 562 / 394 on Siswa / Tagihan / Penerimaan) and no page overflow; `before-*-390.png` vs `final-*-390.png`. 1440 layouts unchanged (`final-*-1440.png`).
  - DOC-5 (390): raport editor no element past the viewport (`doc5-raport-editor-390`). Not verified with a real "Saran" line: the seed has no penilaian rows.
  - CORE-4 (1440): Siti (primary) deactivated with a replacement chooser (`core4-deactivate-primary-choose-1440`); DB afterwards: Rudi primary/ACTIVE, Siti INACTIVE/non-primary. The last remaining guardian shows the destructive warning (`core4-last-guardian-warning-1440`).
  - CORE-3: search "Abdul" returns two homonym-like students with NIS / birth date / current class (`core3-picker-search-1440`).
  - CORE-6/DOC-3: PLANNING year menu shows Aktifkan + Arsipkan; the activate confirm names 2025/2026 as becoming Perencanaan (`core6-activate-confirm-1440`); archiving a PLANNING year works (DB `ARCHIVED`, `core6-archive-planning-confirm-1440`); semester dialog lists the PLANNING year (`doc3-semester-year-options-1440`); with a year that already had Semester 1 ACTIVE, creating Semester 2 left DB `1 ACTIVE, 2 INACTIVE`.
  - ACAD-2: published raport, then one presensi row corrected to SICK: banner at 1440 and 390 (`acad2-drift-banner-*`); "Perbarui kehadiran" rewrote the entry to Sakit 1 (status stays PUBLISHED, `acad2-after-sync-1440`).
  - CORE-9/FIN-12: "zzzzqqq" on Siswa and "zzzzz" on Tagihan show "Tidak ada hasil yang cocok"; header reads "0 siswa cocok". CORE-12: after Escape the active element is the "Tambah Siswa" button on /admin/students and the class page (was BODY before the fix).

## Ship Notes
- Migrations: none. Env vars: none. Dependencies: none.
- New route `POST /api/admin/report-cards/[studentId]/[termId]/sync-attendance` (`reportCard.write`). README/CLAUDE.md counts regenerated via `scripts/audit-docs.sh --write` after merging staging.
- Behaviour changes worth a release note: creating a semester in a year that already has an active semester now creates it inactive (was: silently took over as active); year "Nonaktifkan" is replaced by "Arsipkan" (the old action posted a status the API rejects); payroll generate refuses future periods and negative-net slips, and approve refuses a run with a negative-net slip.
- Not done, for the lead: HR-17 (needs an auth-helper change or breaks three `admin-school-admin.spec.ts` assertions); raport list badge for drifted attendance; parent-level `/admin/guardians` status toggle does not touch primary links (different record).
- Rollback: revert the PR (no data migration to undo; a synced raport attendance stays synced).
