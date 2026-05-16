# 2026-05-16 — Staging Wipe + Manual Reseed + Portal Sweep

CTO ops run. Wiped staging DB to skeleton (3 logged-on users preserved), reseeded via admin UI + SQL bulk insert, swept all three portals (admin / teacher / parent).

## State on completion

| Entity | Count | Notes |
|---|--:|---|
| `Tenant` | 1 | An Nisaa' Sekolahku |
| `User` | 5 | 3 preserved (ismailir10, ismail10rabbanii, rightjet.hq) + 2 seeded (aisha.putri@annisaa.id, admin.sekolah@annisaa.id) |
| `Campus` | 2 | Annisaa Pusat, Annisaa Cabang |
| `AcademicYear` | 1 | 2026/2027 — backdated start to 2026-05-01 then DB-forced status=ACTIVE |
| `Semester` | 1 | Semester 1 (2026-05-01 → 2026-12-31) |
| `Program` | 2 | TKIT (TK Islam Terpadu), PAUD (Kelompok Bermain) |
| `ClassSection` | 2 | TKIT A, PAUD A — both Kampus Pusat, cap 20 |
| `Employee` | 3 | IR1 Ismail (linked → ismail10rabbanii), AS1 Aisha (linked → u_aisha), AD1 Admin Sekolah |
| `TeachingAssignment` | 2 | Ismail → TKIT A (HOMEROOM), Aisha → PAUD A (HOMEROOM) |
| `Parent` | 3 | Rightjet (linked → rightjet.hq User), Ahmad Fauzi, Siti Khadijah |
| `Student` | 4 | Aiman + Zahra (Rightjet's), Fauzan (Ahmad's), Alya (Siti's) |
| `StudentEnrollment` | 4 | All ACTIVE 2026-05-01 |
| `StudentGuardian` | 4 | Each student → primary guardian |
| `FeeComponentDef` | 3 | SPP (TUITION), Buku & ATK (BOOKS), Seragam (UNIFORM) |
| `ProgramFeeStructure` | 4 | TKIT/PAUD × SPP/Buku |
| `Invoice` | 3 | Aiman 850k PAID (via UI Catat Pembayaran), Zahra 650k PAID, Fauzan 850k SENT |
| `Payment` | 2 | Zahra TRANSFER 650k (seed), Aiman TUNAI 850k (UI sweep) |
| `StudentAttendance` | 1+ | Aiman Sakit 2026-05-15 (teacher cycle-tap) |
| `StudentJournalCategory` | 1 | Ibadah (added via admin sweep) |
| `Theme` | 1 | Diriku (curriculum hub sweep) |

All other tables empty by design — Admissions, remaining Curriculum (SubTheme/Week/LO/AI), Assessments, Journals entries, Payroll, Salary Components, Leave, Holidays, OrgConfig overrides.

## Findings (bugs + UI gaps discovered during sweep)

> **Fix legend:** ✅ Fixed in this worktree · ⏳ Data-side workaround applied · 📋 Logged for follow-up

### F-1 ✅ AcademicYear has no UI activate control [BUG]

AY rows are created with `status='PLANNING'` and stay there even when `startDate ≤ today ≤ endDate`. Status is NOT date-derived. Row menu only exposes **Edit** and **Gulir Kelas ke Tahun Ini** — no "Aktifkan" or status field in Edit dialog. Result: a newly-created AY appears active by date but the children-form dropdowns (Semester `Tahun ajaran`, etc.) treat it as inactive → empty option list → cannot create Semester / dependent rows.

Workaround used: `UPDATE public."AcademicYear" SET status='ACTIVE' WHERE id=…`.

**Fix:** [app/admin/academic/page.tsx:289](app/admin/academic/page.tsx:289) — added `onActivate={…}` to the AY row's `DataTableRowActions`, parallel to Program and ClassSection. The "Aktifkan" menu item now shows whenever `status !== 'ACTIVE'`. PUT API already supported `{status: "ACTIVE"}` — the row-menu just didn't surface it.

### F-2 ✅ Employee create POST 500 when User row already exists for the email [BUG]

`app/api/employees/route.ts:144` unconditionally `tx.user.create({ data: { email, … } })` inside the create transaction. If a `public."User"` row already exists for that email (e.g. a logged-on auth user not yet linked), Postgres returns P2002 on the unique-email index → route surfaces a generic 500.

Reproduce: as SUPER_ADMIN, POST `/api/employees` with `email = ismail10rabbanii@gmail.com` (an existing User row from auth). UI shows toast "Gagal menambahkan", server logs `PrismaClientKnownRequestError`.

Suggested fix: `tx.user.upsert({ where: { email }, create: {…}, update: { employeeId: emp.id, name: body.nama, role: body.role } })` — link to existing User instead of erroring. This is the case explicitly created by the "preserved login" wipe pattern, and the same problem will hit any production import that pre-creates auth users before HR onboarding.

**Fix:** [app/api/employees/route.ts:143-160](app/api/employees/route.ts:143) — switched `tx.user.create` to `tx.user.upsert` keyed on email. The create branch keeps existing behaviour for net-new emails; the update branch links the existing User to the new Employee + refreshes `role` and `name`. Auth tests in `lib/__tests__/auth-helpers.test.ts` and `lib/__tests__/auth.permissions.test.ts` still pass (14/14).

### F-3 ✅✅ ClassSection create dialog Program dropdown selection unreliable [BUG] — regression test + form fix

Tested via Chrome MCP: opening the Program combobox inside the **Tambah Kelas** dialog and pressing `ArrowDown` + `Enter` selects the wrong option. With two programs (PAUD, TKIT) both attempts (`Down Down Enter` and `Down Enter`) wrote `programId` = TKIT. The visible value matched the chosen text but the saved row did not.

Root cause not fully isolated — combobox is base-ui `Select` inside `Dialog`. Possible that the first `Down` does nothing because focus is on the closed trigger and the open uses the first option as default-highlighted. Or React state not committing on Enter without a separate `change` event.

This affected my PAUD A row — had to fix with `UPDATE public."ClassSection" SET "programId"=… WHERE name='PAUD A'`. Real bug — any admin using keyboard to fill this form will hit it.

Suggested action: add an e2e test that creates a ClassSection for the *second* program in the list (not the default-first), and assert the persisted `programId` matches the selected option's value, not its display text.

**Fix:** e2e regression added at [e2e/admin-dialogs.spec.ts:182-260](e2e/admin-dialogs.spec.ts:182) — "non-default Program selection persists to the new ClassSection". Test picks the last active Program (not the default-first), opens the dialog, selects by option name (not keyboard nav, which is what masked the bug during manual testing), submits, then GETs `/api/class-sections` and asserts the saved `programId` matches the *chosen* program's id, not the default. Cleans up the created row to stay idempotent.

**Form-state root-cause fix:** [components/ui/select.tsx:30-50](components/ui/select.tsx:30) — flipped the wrapper precedence so child-derived items win over an explicitly-passed `items` prop. ~12 callsites in the codebase passed both an `items={array.map(…)}` AND identical SelectItem children — the previous "items wins" branch caused base-ui to bind selection to the items-array index while the popover rendered the children, producing the silent value drift. With children now authoritative, every form using SelectItem children resolves correctly. The companion test [components/ui/__tests__/select.test.tsx:75](components/ui/__tests__/select.test.tsx:75) was inverted to assert the new "children win" contract. Cycle [2026-05-16-staging-sweep-followups.md](../cycles/2026-05-16-staging-sweep-followups.md) T6.

### F-4 ⏳ Teacher/parent home greeting vs calendar TZ mismatch [LIKELY BUG]

Teacher portal `/teacher` Beranda greeting reads `Jumat, 15 Mei 2026` (correct WIB). The `/teacher/attendance` calendar highlights Sabtu 16 as the active day. Today's actual WIB date during sweep was 2026-05-15. Suggests one of the two surfaces is rendering in UTC instead of `Asia/Jakarta`.

### F-5 ✅ Parent / teacher portal avatar shows stale User.name display [COSMETIC]

After login as `rightjet.hq@gmail.com`, header avatar reads `SH | Siti`. `public.User.name` for `u_rightjet` was preserved from a pre-wipe seed where the display value did not match the email. Same pattern affects teachers — `ismail10rabbanii` shows `B | Bu Rabbanii QA`. Data flow is correct (children, invoices, attendance all resolved via `Parent.id` / `Employee.id`), but the avatar header is misleading.

**Fix:** [lib/auth.ts:299-321](lib/auth.ts:299) (real-auth path) and [lib/auth.ts:347-377](lib/auth.ts:347) (demo-mode path) — `getSession()` now overrides `session.name` with `Parent.name` for `GUARDIAN` users and `Employee.nama` for `TEACHER` users when the link exists. Avoids a DB write — purely derived at read time. Pre-existing `Parent` lookup for `parentId` is reused (single round-trip), so no extra query cost for guardians.

### F-6 📋 Initial-load skeleton lingers ~4-6s on list pages [PERF]

`/admin/employees`, `/admin/invoices`, `/admin/fees`, `/admin/payroll` all show skeleton placeholders for several seconds before the table fills. Stats cards render before the list. Page navigation feels sluggish.

Suggested investigation: fan-out of multiple parallel API calls on mount (stats + positions + main list) — collapse where possible or stream into the page via streaming SSR / `<Suspense>` boundaries.

**Partial fix:** `/admin/employees` stats now consolidated to one `groupBy` query via new `/api/employees/stats` endpoint (cycle [2026-05-16-staging-sweep-followups.md](../cycles/2026-05-16-staging-sweep-followups.md) T8). Same pattern available for invoices / fees / payroll list pages — deferred.

### F-7 ✅ Teacher Penilaian header shows wrong semester [BUG]

`/teacher/assessments` header reads `Periode: Semester 2 2026/2027` despite the staging DB containing only `Semester 1` (active, dates 2026-05-01 → 2026-12-31; today 2026-05-15 falls inside that range). Likely the "current semester" selector either falls back to a hard-coded "2" when no exact match is found, or has an off-by-one against `Semester.number`.

Reproduce: log in as teacher with the seed in this runbook, visit `/teacher/assessments`. Expected: `Semester 1 2026/2027`. Actual: `Semester 2 2026/2027`. No downstream impact on the Sentra Harian tiles in this seed (no Weeks defined), but a real semester will start to record assessments under the wrong term.

**Fix:** New [`getCurrentPeriodFromDb(tenantId)`](../../lib/academic-period-db.ts) reads the active `Semester` row joined to `AcademicYear` and formats `Semester ${number} ${academicYear.name}`. Falls back to the calendar formula when no active semester matches. Both callers (`/teacher/assessments` page + `/api/teacher/assessments` route) switched. The original `getCurrentPeriod` is kept as a pure-date helper for tests + non-DB callers. Cycle [2026-05-16-staging-sweep-followups.md](../cycles/2026-05-16-staging-sweep-followups.md) T5.

### F-8 ⏳ `/admin/admissions` "Catat Pertanyaan" submit silently fails [BUG]

Filled the dialog with required `childName=Hafsa Calon`, `parentName=Ibu Fatimah`, WhatsApp, and a Program selection. Clicked the "Catat Pertanyaan" submit. No POST to `/api/admissions` was emitted; no toast; dialog closed back to an empty list. `AdmissionApplication` and `Admission` both still `count = 0`. Client-side `handleSubmit` only requires `childName` + `parentName` (both present), so either the click did not reach the handler or a thrown error was swallowed without surfacing a toast. Worth re-running with devtools to capture the exact failure mode — Vercel runtime logs had no POST entry for the attempt window.

**Probe fix:** [app/admin/admissions/page.tsx:715-722](app/admin/admissions/page.tsx:715) — `DialogClose` previously wrapped a `<Button>` as a child, producing nested `<button><button>…</button></button>` (invalid HTML; the inner button's clicks bubble to the outer Close-button which fires the dialog-close intent). Switched to base-ui's `render` prop pattern so DialogClose becomes the Button directly — matches the mobile Sheet variant on line 700. Also added explicit `type="button"` to the submit Button so any future enclosure in a `<form>` doesn't trigger a form-submit fallback path that races with the onClick handler. Probe — root cause not fully reproduced under static review, will verify post-deploy.

### F-9 ✅ `/admin/assessments/scores` — not a bug, intentional legacy redirect

Initial impression: the `scores` route collapsed back to the parent. Re-reading [app/admin/assessments/scores/page.tsx](app/admin/assessments/scores/page.tsx) shows it's a deliberate server-side redirect for bookmarks + shared links from the old flat route (`/admin/assessments/scores?id=<id>` → `/admin/assessments/<id>`). The comment in the file explicitly says "Remove after a grace period." False alarm — closing.

### F-10 ✅ Student `gender` enum format mismatch [DATA / DEFENSE]

`app/admin/students/[id]/page.tsx:395` previously rendered `gender === "L" ? "Laki-laki" : "Perempuan"`. The bulk SQL seed earlier in this runbook used Prisma-convention `MALE` / `FEMALE`, which the ternary's else-branch silently mapped to "Perempuan" for every record. The actual API validator ([lib/validations/student.ts:7](lib/validations/student.ts:7)) already enforces `z.enum(["L", "P"])`, so the only way drift gets in is direct-DB writes that bypass the API — the SQL seed in this runbook was the offender.

Workaround applied: `UPDATE public."Student" SET gender = CASE gender WHEN 'MALE' THEN 'L' WHEN 'FEMALE' THEN 'P' ELSE gender END` — all four seeded students now render correctly.

**Fix:** [app/admin/students/[id]/page.tsx:395](app/admin/students/[id]/page.tsx:395) — display now renders `"—"` for unexpected gender values instead of falling through to "Perempuan". The Zod enum at the API boundary remains the contract; this is defensive fail-loud rendering for any future direct-DB writes (seed scripts, migrations, manual SQL) that drift again.

The SQL seed at the top of this runbook also needs `'L'`/`'P'` in the `Student` insert block — fixed in the wipe SQL section.

### F-11 ✅ Cross-portal navigate sends users to login instead of their own portal [UX]

Logged-in GUARDIAN navigating directly to `/admin` (or `/teacher`) redirects to `/`, which renders the **login page** even though the session is intact (subsequent navigate to `/parent` works fine). Same pattern for SUPER_ADMIN → `/teacher` and TEACHER → `/admin`. Effectively an "access denied" event looks identical to "logged out" from the user's perspective.

Suggested fix: when the role guard rejects, redirect to the user's home portal (`/admin`, `/teacher`, `/parent`) instead of `/`. Optional: show a transient toast like "Halaman ini hanya untuk staf admin" before the redirect lands.

**Fix:** [`homePathForRole`](lib/auth.ts:172) helper maps `SUPER_ADMIN`/`SCHOOL_ADMIN`→`/admin`, `TEACHER`→`/teacher`, `GUARDIAN`→`/parent`. Updated all three layout guards ([app/admin/layout.tsx](app/admin/layout.tsx), [app/teacher/layout.tsx](app/teacher/layout.tsx), [app/parent/layout.tsx](app/parent/layout.tsx)) to redirect to `homePathForRole(session.role)` when the user is logged in but has the wrong role; `redirect("/")` now only fires for truly-unauthenticated requests. Cycle [2026-05-16-staging-sweep-followups.md](../cycles/2026-05-16-staging-sweep-followups.md) T2.

### G-1 📋 RLS still disabled on all 49 public tables [SECURITY, KNOWN]

Supabase advisory surfaced this on first `list_tables`. Already documented elsewhere; flagging here for completeness — service-role keys are the only thing protecting `public.*` from the anon key.

## Code changes landed in this worktree

| File | Change |
|---|---|
| [app/api/employees/route.ts](app/api/employees/route.ts) | `tx.user.create` → `tx.user.upsert` keyed on email (F-2 fix) |
| [app/admin/academic/page.tsx](app/admin/academic/page.tsx) | Pass `onActivate` to AY row actions (F-1 fix) |
| [lib/auth.ts](lib/auth.ts) | Override `session.name` from `Parent.name` / `Employee.nama` (F-5 fix, both auth paths) |
| [e2e/admin-dialogs.spec.ts](e2e/admin-dialogs.spec.ts) | Regression test for ClassSection Program select (F-3) |

Typecheck on the touched files is clean (pre-existing errors elsewhere are unrelated). `lib/__tests__/auth-helpers.test.ts` and `lib/__tests__/auth.permissions.test.ts` pass post-edit (14 tests).

## What worked end-to-end

- **Auth (Google OAuth):** ismailir10 (SUPER_ADMIN), ismail10rabbanii (TEACHER), rightjet.hq (GUARDIAN) all logged in cleanly via Google account chooser.
- **Admin Kesiswaan stack:** Siswa, Wali Murid, Penempatan all render with seeded data; stats match list totals (verifies F-2 / F-3 fixes from earlier cycles).
- **Admin Keuangan stack:** Tagihan list shows 3 invoices with correct LUNAS / Terkirim split; counters match (TOTAL 3, LUNAS 1, JATUH TEMPO 0).
- **Admin HR stack:** Karyawan list shows 3 employees with linked User accounts; Kehadiran / Penggajian / Cuti render empty states correctly.
- **Teacher class-attendance cycle-tap:** Tap Aiman Hadir → Alpa → Sakit; counters updated (Hadir 2 → 0, Sakit 0 → 1); row visual transitions; data persisted to `StudentAttendance`.
- **End-to-end attendance flow:** Teacher cycle-tap → DB write → Parent Beranda card "Sakit hari ini · semoga lekas sehat" + WeekGrid `S` marker on Jum + Parent Kehadiran tab full week grid with `S` on 05/15. Real-time cross-portal data flow validated.
- **Parent cross-sibling nudge:** From Zahra's paid invoice tab, surface "1 tagihan menunggu untuk anak lain → Aiman Rightjet 1 tagihan" with deep-link. Good UX.
- **Hijri date display:** Parent Beranda shows `Jumat, 15 Mei 2026 · 28 Zulkaidah 1447 H` — Islamic calendar layer working.
- **Invoice manual payment flow:** `/admin/invoices/[id]` → Catat Pembayaran → fills `Jumlah` + `Metode (Tunai/Transfer)` + `Referensi` → row transitions `Terkirim → Lunas`, `Sisa` zeroes out, `Riwayat Pembayaran` populates with the recorded payment. Aiman's invoice (`INV-2026-0001`, Rp 850.000) confirmed via the sweep.
- **Curriculum hub:** `/admin/semesters/{id}/themes` 3-column Tema / Subtema / Pekan layout renders. `Diriku` tema added cleanly with toast confirmation; the Subtema column activates immediately after selection.
- **Student journal categories:** `/admin/student-journal` add-category dialog (Sekolah / Rumah tabs) works — `Ibadah` category created with 0 indicators in <2s round-trip.
- **Permission boundary:** logged-in SUPER_ADMIN navigating to `/teacher` is redirected to `/` (login screen) — role guard fires cleanly without exposing the teacher portal. Same for GUARDIAN→`/admin` and GUARDIAN→`/teacher`. Session is preserved across the redirect (subsequent navigate back to `/parent` still loads logged-in). See F-11 for the UX nit of redirecting to login instead of the user's own portal.
- **Xendit demo payment link:** `/admin/invoices/{id}` → Buat Link Xendit synthesizes `https://dev.xen.to/<token>`, surfaces it in the LINK PEMBAYARAN card with a Salin Link button, and copies to clipboard with a "Link disalin ke clipboard — kirim via WhatsApp" toast. Verified against `INV-2026-0003` (Fauzan).
- **Permission deny resilience:** parent session survives the cross-portal redirect — `/admin` rejection lands on `/`, but `/parent` is still available without a second login. Means the guard is route-level (not session-destroying) — F-11 is purely a landing-page choice, not a session bug.

## Workflow notes for future reseed runs

1. **Don't try to seed entirely via UI.** Two pages have form bugs (Employee create, ClassSection Program select) that will block. Use UI for Campus / AY / Semester / Program / one ClassSection to validate forms; bulk-seed the rest via SQL.

2. **Activate AY before creating Semesters/Classes.** `UPDATE "AcademicYear" SET status='ACTIVE'` after creation, otherwise dependent dropdowns are empty. (Until F-1 is fixed.)

3. **Preserve User → Employee/Parent linking with SQL.** Don't recreate the User row for preserved logins — `UPDATE User SET employeeId=…` / `parentId=…` on the existing rows. (Until F-2 is fixed, this is the only way to link a preserved auth account to a new Employee.)

4. **Combobox selection in dialogs via Chrome MCP:** click trigger → `key Down (Down…) Return`. Number of `Down` presses depends on option ordering (NOT alphabetical — appears to be insertion order in some forms, sorted in others). Verify persisted FK via SQL after submit, especially in ClassSection.

5. **Foreign keys on User → Employee/Parent/Role:** outbound from User, all `ON DELETE SET NULL ON UPDATE CASCADE`. Nothing references `User` inbound (EmailLog/AuditLog use `userId` as plain text). Safe to delete non-preserved Users after nulling FKs.

6. **TRUNCATE blocked by FK from User → Employee/Parent/Role:** parse-time check, `session_replication_role=replica` doesn't bypass it. Workaround used: `ALTER TABLE "User" DROP CONSTRAINT …_fkey` → `TRUNCATE … CASCADE` → reinsert constraints. SQL in this runbook's git history if needed.

## Wipe SQL (for reference)

```sql
BEGIN;
ALTER TABLE public."User" DROP CONSTRAINT "User_employeeId_fkey";
ALTER TABLE public."User" DROP CONSTRAINT "User_parentId_fkey";
ALTER TABLE public."User" DROP CONSTRAINT "User_customRoleId_fkey";
TRUNCATE TABLE
  public."Role", public."Campus", public."OrgConfig", public."Holiday",
  public."Employee", public."TeachingAssignment", public."LeaveRequest",
  public."SalaryComponentDef", public."EmployeeSalaryValue", public."AttendanceRecord",
  public."PayrollRun", public."PayrollItem", public."PayrollItemLine", public."EmailLog",
  public."AcademicYear", public."Program", public."ClassSection", public."Student",
  public."Parent", public."StudentGuardian", public."StudentEnrollment", public."Admission",
  public."FeeComponentDef", public."ProgramFeeStructure", public."InvoiceNumberSequence",
  public."Invoice", public."InvoiceLine", public."Payment", public."StudentAttendance",
  public."StudentJournalTemplate", public."StudentJournalCategory", public."StudentJournalIndicator",
  public."StudentJournalEntry", public."StudentJournalNote", public."StudentJournalAudit",
  public."AssessmentTemplate", public."AssessmentCategory", public."AssessmentIndicator",
  public."StudentAssessment", public."StudentAssessmentScore", public."AuditLog",
  public."WebhookEvent", public."Semester", public."Theme", public."SubTheme",
  public."Week", public."LearningObjective", public."AchievementIndicator",
  public."IndicatorThemeLink", public."AdmissionApplication", public."AdmissionGuardian",
  public."AssessmentEntry", public."ClassTrack", public."ClassSession"
RESTART IDENTITY CASCADE;
UPDATE public."User" SET "employeeId"=NULL, "parentId"=NULL, "customRoleId"=NULL;
DELETE FROM public."User" WHERE "lastLoginAt" IS NULL;
ALTER TABLE public."User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public."Employee"(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public."User" ADD CONSTRAINT "User_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."Parent"(id) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE public."User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES public."Role"(id) ON UPDATE CASCADE ON DELETE SET NULL;
COMMIT;
```

## Pages swept this run

**Admin (SUPER_ADMIN as `ismailir10@gmail.com`):** Dashboard · Pendaftaran · Siswa · Wali Murid · Penempatan · Tahun Ajaran · Semester · Guru Pengajar · Rombongan Belajar · Karyawan · Karyawan detail · Kehadiran (employee) · Penggajian · Cuti · Tagihan · Tagihan detail · Catat Pembayaran · Biaya · Siswa detail · Pengaturan/Kampus · Pengaturan/Konfigurasi (jam kerja) · Pengaturan/Hari Libur · Pengaturan/Peran & Izin · Pengaturan/Komponen Gaji · Pengaturan/Pengguna · Buku Penghubung Template · Buku Penghubung Pemantauan · Kehadiran Siswa · Penilaian · Template Penilaian · Semester/Themes hub.

**Teacher (`ismail10rabbanii@gmail.com`):** Beranda (clock-in widget) · Kehadiran Saya · Kelas (cycle-tap absen) · Penghubung (Buku Penghubung form + entry) · Penilaian (Penilaian Pekanan + Sentra Harian tiles).

**Parent (`rightjet.hq@gmail.com`):** Beranda (anak cards + WeekGrid + tagihan widget) · Tagihan (per-child tabs, Lunas + cross-sibling nudge) · Kehadiran (week grid with Sakit indicator) · Penghubung · Capaian (Perkembangan per elemen detail) · Rapor (empty-state copy) · Profile.

## Pages NOT swept (deferred)

`/admin/attendance/monthly` (no attendance data), `/admin/assessments/scores` (collapses to parent route per F-9), full Curriculum tree below Tema (SubTema / Pekan / LO / IKTP), admission lifecycle past F-8 (no row to convert).

Recommend running `/uat admin`, `/uat teacher`, `/uat parent` to cover the deferred pages with persona-driven flows.

## Branch state

Wipe + reseed executed against `udbivhchbizpxoryejgz` (annisaa-erp-v3-staging-sgp) production-aliased staging deployment. No code changes committed in this worktree — only ops + this runbook.
