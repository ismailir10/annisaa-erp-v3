# Existing ERP Audit — Painpoint + Coverage Gap

> Audit current school-erp staging codebase against decoded real-world workflow at [2026-05-04-nisaa-teacher-insights.md](./2026-05-04-nisaa-teacher-insights.md). Lens: painpoint + coverage gap. Plain facts, no preserve-mindset.
>
> Captured 2026-05-04 via 4 parallel research agents.

**Legend:** ✅ covered well · 🟡 partial · ❌ missing · 🔴 critical gap · ⚠️ mismatch with reality

---

# 1. Headline Pattern

**What's built well:** Office admin + finance + HR vertical (admissions funnel, invoices, Xendit, payroll, employee attendance, leave).

**What's missing entirely:** Everything academic — curriculum hierarchy, sentra, hafalan, raport narrative, events, story.

**Mismatch:** Build solved **office side**, not **classroom side**. Teacher's daily reality (Drive §2, §4) has near-zero coverage.

---

# 2. Schema Audit

## 2.1 Models Inventory

`prisma/schema.prisma` — **980 lines, 33 models, 1 enum** (only `JournalStatus`).

| Domain | Models | Count |
|---|---|---|
| Org / RBAC / HR | Tenant, User, Role, Campus, OrgConfig, Holiday, Employee, TeachingAssignment, LeaveRequest, SalaryComponentDef, EmployeeSalaryValue | 11 |
| Attendance / Payroll | AttendanceRecord, PayrollRun, PayrollItem, PayrollItemLine | 4 |
| Academic | AcademicYear, Program, ClassSection, Student, StudentEnrollment | 5 |
| Parent / Admission | Parent, StudentGuardian, Admission | 3 |
| Billing | FeeComponentDef, ProgramFeeStructure, InvoiceNumberSequence, Invoice, InvoiceLine, Payment | 6 |
| Student attendance | StudentAttendance | 1 |
| Buku Penghubung | StudentJournalTemplate, StudentJournalCategory, StudentJournalIndicator, StudentJournalEntry, StudentJournalNote, StudentJournalAudit | 6 (one is audit) |
| Raport / Assessment | AssessmentTemplate, AssessmentCategory, AssessmentIndicator, StudentAssessment, StudentAssessmentScore | 5 |
| Infra | EmailLog, AuditLog, WebhookEvent | 3 |

## 2.2 Coverage Matrix vs Drive Reality

| Drive finding | Schema | Gap |
|---|---|---|
| Multi-campus (Metland + Aster) | 🟡 | `Campus` exists; `Employee.campusId` single — Hana does PJ Tahfidz Aster while based elsewhere; no multi-campus assignment. `Student` has no campusId. `Admission.campusPreference` free string. |
| Two legal entities (RA vs TKIT) | ❌ | No `institutionType` discriminator anywhere. Different sign-off chains absent. |
| 3-tier curriculum (PROMES → Pekanan → Harian) | ❌ | No Tema, SubTema, KurikulumIndikator, IKTP, ProgramSemester, ModulPekanan, ModulHarian. Only `AssessmentTemplate→Category→Indicator` (2-level generic). |
| 8 Sentra catalog | ❌ | No Sentra model/enum, no rotation schedule. |
| Hafalan multi-track | ❌ | No HafalanTrack/HafalanProgress/surah catalog. |
| Pilar Karakter | ❌ | No catalog. |
| 3 scoring scales (SM/BM, BB/MB/BSH/BSB, 3-level rubric) | 🟡 wrong | `StudentAssessmentScore.score` String comment-hardcoded `BB|MB|BSH|BSB`. SM/BM (real data layer §4.7) absent. 3-level rubric absent. Single column conflates 3 systems. |
| 6 jenjang (DC/Toddler/KB/TK A/TK B) | 🟡 | `Program.code` free string, comment "DCARE/KB/TKIT/POPUP" — 4 only. Toddler 1+2 not represented. TK A vs TK B collapsed. |
| Multi-program co-enrollment | 🟡 | `StudentEnrollment` unique on `(studentId, classSectionId)` — multi-class allowed. No "primary enrollment" flag. |
| Stable internal student_id (UUID) | ✅ | `Student.id = cuid()`. NIS/NISN nullable attributes. Good. |
| NIS reissue per cohort | ❌ | No NIS-history. Single column overwrite loses prior-cohort lookup. |
| NIK/KK 16-digit | 🟡 | String fields, no length CHECK. |
| Guardian model with payer field | 🔴 | `StudentGuardian.isPrimary` only "billing contact". No `payerGuardianId` on Student. |
| Income brackets enum | ❌ | `Parent.incomeRange: String` free-text. Drift already observed. |
| RAB (Sentra + Event w/ Rencana/Realisasi) | ❌ | Zero event/budget models. |
| Substitute teacher | ❌ | `TeachingAssignment.role: HOMEROOM\|ASSISTANT` only. No class_session(date, primary, substitute). |
| Admin-teacher dual role (RBAC roles[]) | 🔴 | `User.role: String` single. `customRoleId` single FK. Dual-role staff (Eneng Rina = Kepala RA + walas B2) not first-class. |
| Buku tamu / P2DB log | ❌ | Only `Admission`. No paper-mirror visitor log. |
| Triwulan vs Semester raport | 🟡 | `AssessmentTemplate.type: SEMESTER\|QUARTERLY\|MONTHLY`. No 4-period TW/Sem enum. No height/weight, attendance summary, hafalan summary, RTL split, parent comment. |
| Catatan Anekdot + Foto Berseri | ❌ | 7 asesmen techniques (curriculum primitives) — none modeled. No photo/file attachment table. |
| Multi-paralel walas (B1-B4) | 🟡 | `TeachingAssignment` allows HOMEROOM, but unique key is `(employeeId, classSectionId)` — nothing prevents two HOMEROOMs. No lead vs co-walas. |
| Referral / Be Our Ambassador | ❌ | `Admission.source` includes "REFERRAL" but no link to referrer. No 6% reward ledger. |

## 2.3 Hardcoded Constants (should be admin-editable)

| Field | Currently | Should be |
|---|---|---|
| Working hours / grace period | `OrgConfig.workStartTime/EndTime/gracePeriod` 07:00/16:00/15min defaults | Defaults wrong (An Nisaa = 07:30–17:00) |
| Program codes | Free string, comment "DCARE/KB/TKIT/POPUP" | Drive shows 6 jenjang — admin catalog with ageMin/ageMax |
| Assessment scoring scale | Hardcoded BB/MB/BSH/BSB by convention | 3 distinct scales coexist — needs `ScoringScale` table |
| `AttendanceRecord.status` | Free string, no enum | Catalog |
| `Holiday.type` | Free string | Catalog (NATIONAL/SCHOOL/RELIGIOUS) |
| `Admission.source` | Free string with enum-in-comment | Catalog (TikTok/Instagram emerge) |
| `LeaveRequest.leaveType` | `ANNUAL\|SICK\|PERMISSION\|OTHER` free string | Catalog (cuti haid, melahirkan, hajj) |
| `Parent.education / occupation` | Free string | Catalog (drift already observed) |
| `Parent.incomeRange` | Free string | Enum 6 buckets |
| `StudentGuardian.relationship` | `AYAH\|IBU\|WALI\|OTHER` free string | Catalog (kakek, nenek, paman) |

## 2.4 Schema Smells

- **Zero TODO/FIXME** in 980 lines — clean baseline, but no migration scars.
- **JSON-as-string anti-pattern**: `Student.metadata: String? // JSON`, `Role.permissions: String // JSON array`. Prisma supports `Json` type (used in WebhookEvent, AuditLog). Inconsistent.
- **Dates-as-String everywhere**: `Holiday.date`, `Employee.hireDate`, `LeaveRequest.startDate/endDate`, `AttendanceRecord.date`, `StudentAttendance.date`, `Student.dateOfBirth`. Loses range query, timezone correctness, validation.
- **Enums declared once, abandoned**: only `JournalStatus`. Every other discriminator is String with values inlined as comments. Invites typo + drift.
- **Double role system**: `User.role` + `User.customRoleId` coexist. Comment doesn't say which wins.
- **`StudentEnrollment` no business-rule constraint** on "exactly one ACTIVE primary enrollment".
- **`Admission.studentId @unique`** (1:1) — re-admission collision.
- **`AssessmentTemplate @@unique([tenantId, programId, name, type])`** — no `academicYearId` in key. Forces overwrite of last year's template instead of versioning.
- **`StudentJournalTemplate.tenantId @unique`** — only ONE journal template per tenant. Multi-campus differentiation impossible.
- **No soft-delete pattern** — only `isVoided` on `StudentAttendance`, `CANCELLED` on Invoice. No `deletedAt` audit.

---

# 3. Admin Module Coverage

**Total: 28 admin pages** (CLAUDE.md says 19 — stale count).

## 3.1 Coverage Matrix

| Real-world need | Page | Quality | Gap |
|---|---|---|---|
| Buku tamu / P2DB inbound | 🟡 `/admin/admissions` | Real CRUD + state machine | UI not column-mirrored to paper buku tamu. No WA inbound ingest. |
| Admission funnel | 🟡 | INQUIRY→VISITED→ADMITTED→REGISTERED real | No form# tracking, no Rp 300k pickup payment, no auto Xendit on REGISTERED |
| Student roster (130-140) | ✅ `/admin/students` | Real (642 lines) | No multi-program co-enrollment surface, no NIS-vs-NISN distinction, no income-bracket parser |
| Class placement post-MPLS | 🟡 `/admin/enrollments` | Real CRUD | No MPLS workflow, no batch placement after 3-day pengelompokan |
| Guardian management | 🟡 `/admin/guardians` | Light (301 lines) | No payer_guardian_id, no `Tinggal` custodial flag |
| Fee/billing | ✅ `/admin/fees` + `/admin/invoices` | Real (FeeComponent, FeeStructure, Invoice, Payment, Xendit) | "Komponen biaya awal" treated generically; SPP cycle automation absent |
| Tunggakan | 🟡 implicit in `/admin/invoices` | Status filter only | No arrears dashboard, aging buckets, escalation |
| RAB Sentra + Event | ❌ | — | Zero RAB pages |
| Curriculum 3-tier | ❌ | — | Entirely absent |
| Indikator catalog | 🟡 | Journal indicators ≠ Kurikulum Merdeka IKTP | Missing actual NAB/Jati Diri/STEAM catalog |
| Sentra rotation | ❌ | — | No sentra entity |
| Hafalan tracker | ❌ | — | No 4-track tracker |
| Raport TW + Sem | 🟡 `/admin/assessments/templates` | Template builder | No 4-period generator, no rubric bank, no docx narrative compiler, no photo embed |
| Event mgmt | ❌ | — | Jambore/Fest/AKSERA/MABIT/PHBI/Manasik all absent |
| Referral/Ambassador | ❌ | — | No referral_program, no 6% ledger |
| Staff payroll | ✅ `/admin/(hr)/payroll` | Real | — |
| Yayasan reporting | ❌ | — | No financial dashboard |
| Multi-campus | 🟡 `/admin/settings/campuses` | First-class on ClassSection | No campus-scoped fingerprint sync, no per-campus capacity, no rotation roster |
| Multi-entity (RA/TKIT) | ❌ | — | No discriminator |

## 3.2 Spot-check (3 pages — all REAL, no stubs)

- `/admin/admissions/page.tsx` (735 lines) — full state machine, soft-cancel, status filter, pagination. Gap: flat form, no file upload (akta/KK/foto), no admission-fee trigger.
- `/admin/fees/page.tsx` (289 lines) — Two-tab UX, decimal coercion, real APIs.
- `/admin/academic/page.tsx` (590 lines) — REAL but **OVERLOADED** managing 4 entities (TA + Program + ClassSection + TeachingAssignment). Section name free-text, no enforced "B1/B2/B3/B4" taxonomy, no campus-capacity validation.

## 3.3 Missing Modules Entirely

- Buku tamu inbound capture (paper-mirror UI)
- Curriculum 3-tier (PROMES, Modul Pekanan, Modul Harian per Sentra)
- Indikator catalog (Kurikulum Merdeka IKTP)
- Sentra entity & rotation schedule
- Hafalan tracker (4 tracks)
- Pilar Karakter catalog
- Raport generator (TW1/TW2/Sem1/Sem2 narrative-from-rubric, docx export, photo embed)
- Event management (8 event types)
- Lomba scoring (BB/MB/BSH/BSB separate from Penilaian Harian SM/BM)
- RAB module (Sentra + Event w/ Rencana+Realisasi, funding_source)
- Referral / Ambassador
- Yayasan financial reporting
- Tunggakan dashboard
- Substitute teacher assignment
- Multi-entity discriminator
- Buku penghubung admin oversight
- Story/narrative engine
- Parent meeting tracker (monthly Parenting/Pengajian)
- MPLS workflow (3-day pengelompokan → final placement)
- Initial assessment intake (perhatian khusus flagging)
- Admission file uploads

---

# 4. Portal Coverage

**Counts:** 10 teacher pages (CLAUDE.md says 5 — stale). 6 parent pages (CLAUDE.md says 5 — stale).

## 4.1 Teacher Pages

| Route | Action | Quality |
|---|---|---|
| `/teacher` | Daily check-in card | Manual web, no fingerprint |
| `/teacher/attendance` | Self-attendance + leave | ✅ |
| `/teacher/class-attendance` | Mark student attendance | ✅ |
| `/teacher/assessments` | Template list per class | navigation only |
| `/teacher/assessments/[classSectionId]/[templateId]/[period]` | Score grid | Real |
| `/teacher/student-journal` | Picker → entry | ✅ |
| `/teacher/student-journal/entry` | Class grid for day | ✅ |
| `/teacher/student-journal/students/[id]` | Per-student weekly | Production-grade |
| `/teacher/slips` | Salary slip list | view-only |
| `/teacher/profile` | Profile | ✅ |

## 4.2 Teacher Workflow Coverage

| Daily activity (§2) | Page | Gap |
|---|---|---|
| 06.30 fingerprint check-in | 🟡 `/teacher` | Manual web, no fingerprint vendor integration, no per-campus CSV/API import |
| Morning routine markers (Fatihah, Asmaul Husna, Pertemuan pagi) | ❌ | No opener log, no tema-of-day surface |
| 8 Sentra rotation | ❌ | No sentra entity, no rotation schedule |
| Penilaian Harian per Sentra (SM/BM × 3-4 indikator × 9-15 anak) | 🟡 | Generic indicator grid; not shaped per sentra/2-day/SM-BM dual columns; no 7 teknik (Anekdot, Foto Berseri, etc) |
| Buku penghubung daily fill | ✅ | Real, week + per-student, school/home/notes split. Not aligned to paper layout, no photo attach |
| Foto/video → WA grup end-of-schedule | ❌ | No media bin, no broadcast helper |
| 13.00 penilaian (20-25 min, 4 hari kolom) | 🟡 | Same template grid, not 4-day matrix, no save-resume, no offline drafting |
| Modul Ajar Pekanan/Harian prep | ❌ | No curriculum authoring; ADLX/INTROFLEX absent |
| PROMES yearly | ❌ | — |
| Hafalan progress per murid | ❌ | Free-text only inside raport — no tracker |
| Raport authoring (3-level rubric narrative) | 🟡 | Numeric scale only, no rubric, no docx export, no photo embed, no Komentar Ortu reply |
| "Curi waktu" entry pattern | 🟡 | Web forms, no offline draft, no batch sync, online-first assumed |
| Phone-locked policy | ❌ | No tablet mode, no end-of-day batch sync window |
| Substitute teacher | ❌ | Buku penghubung writes always attribute to logged-in user |
| Multi-campus rotation | ❌ | No campus discriminator visible |
| Lomba scoring | ❌ | No AKSERA/Fest BB/MB/BSH/BSB |

## 4.3 Parent Pages

| Route | Action | Quality |
|---|---|---|
| `/parent` | Household dashboard | Real (311 lines) — Hijri greeting, KidCard WeekGrid, journal note excerpt, unpaid invoice |
| `/parent/attendance` | Monthly per child | ✅ |
| `/parent/invoices` | List + Xendit pay | ✅ |
| `/parent/reports` | Published assessments | thin shim (51 lines) — not RA Triwulan format |
| `/parent/student-journal` | Sekolah/Rumah/Catatan tabs | Production-grade (459 lines) |
| `/parent/profile` | Profile | ✅ |

## 4.4 Parent Workflow Coverage

| Need | Page | Gap |
|---|---|---|
| Daily updates (foto/video from WA) | ❌ | No media feed, comm still in WA grup |
| Weekly progress (hafalan, sentra) | 🟡 `/parent/student-journal` | No hafalan view, no sentra-tagged activity |
| Triwulan raport access | 🟡 `/parent/reports` | Generic table, not 10-section RA narrative, no docx download, no Komentar Ortu submit |
| Tagihan/SPP | ✅ | Real Xendit flow. No SPP recurrence, no tunggakan flow |
| Permission slips | ❌ | No event_attendance consent flow |
| Parent meeting calendar (monthly, skip Ramadhan) | ❌ | No event/meeting RSVP |
| Buku penghubung response | ✅ | Notes parent CRUD. No photo/voice attach |
| Komentar ortu di raport | ❌ | Reports read-only |
| Onboarding/referral | ❌ | No ambassador tracker |

## 4.5 Workflow Misalignments (UX vs Reality)

1. **Buku Penghubung is single-channel, but reality is week-grid + sentra + Catatan Anekdot + photo.** Current = flat indicator ceklis.
2. **`/teacher/assessments/...` mixes "score during class" with "raport authoring".** Reality splits 3 tiers (Penilaian Harian → Pekanan rollup → Raport TW narrative).
3. **Class is the unit, but pedagogy unit is `(sentra × 2-day-pair × kelas)`.**
4. **Online-first vs phone-locked.** No offline draft, no batch-sync at 13.00.
5. **Parent reports = generic assessment list, not docx narrative.**
6. **Hafalan absent entirely** — yet core 4-track artifact in every modul + raport.
7. **WA grup is real comm channel; product has no media bin / share-out.** Story value (§0.2) zero coverage.
8. **Multi-campus + multi-entity not surfaced.**

---

# 5. Tech Stack & Painpoints

## 5.1 Foundation

- **Framework**: `next@16.2.3`, `react@19.2.4`. **README says Next 15 — drift.**
- **DB/ORM**: `prisma@7.6.0`, `pg@8.20.0` Postgres prod, SQLite local.
- **Auth**: `@supabase/ssr@0.10.0` (Google OAuth + Magic Link + demo cookie).
- **Payment**: Xendit — **no SDK**, raw `fetch` against `api.xendit.co`. Checkout Session API.
- **Email**: `resend@6.10.0`. **Single template only** (`salary-slip.ts`).
- **PDF**: `@react-pdf/renderer@4.4.0` (invoice receipt + salary slip).
- **UI**: Shadcn (Base UI, cmdk, vaul, sonner, lucide), `tailwindcss@4` (no config — postcss only), framer-motion 12.
- **Tables**: `@tanstack/react-table@8.21.3`.
- **Charts**: `recharts@3.8.0`.
- **Forms**: ❌ **No `react-hook-form`** (zero deps, zero imports). All hand-rolled.
- **Validation**: `zod@4.3.6`, 19 schemas in `lib/validations/`.
- **Hijri**: pure `Intl.DateTimeFormat("id-u-ca-islamic-umalqura")` — no npm dep.

## 5.2 Hono Status

🚨 **Hono is NOT a dependency** despite CLAUDE.md mentioning it. `grep -ic hono package.json = 0`. All 132 routes are stock Next.js handlers.

## 5.3 Integrations

| | State | Notes |
|---|---|---|
| Auth (`lib/auth.ts:184-329`) | ✅ mature | `getSession()` cached via `react.cache()` + 10s in-memory map. Auto-provisions `User` from Supabase Auth on first login. **`assertSingleTenant()` hard-throws if tenant.count > 1.** |
| Xendit (`lib/xendit/`) | ✅ mature | typed `XenditApiError`, retry, demo short-circuit, defensive id extraction, ping balance health probe |
| Email (`lib/email/`) | 🟡 thin | single template, no retry, no queue inside file |
| Storage | ❌ none | Zero `supabase.storage` or S3 imports. Any photo upload = unbuilt |
| API | 132 routes, all Next.js stock | Helpers in `lib/api/{response, pagination, validate}` |
| Background jobs | 1 cron (`finance-maintenance`) | No queue lib (no bullmq/inngest). Bulk fan-out via `lib/finance/concurrency-limit.ts`, `pLimit(5)`, throttled in-process |
| Caching | 10s in-memory userCache | No Redis/Upstash |
| Multi-tenancy | schema-level only | RLS = SELECT-tenant-scope; writes via service_role. **`assertSingleTenant()` blocks tenant #2** — single-tenant enforced |
| i18n | ❌ none | Indonesian copy hardcoded throughout (`Pak`/`Bu` honorifics in `app/parent/page.tsx:179-180`) |
| Hijri | ✅ | `lib/hijri.ts:14-26` — 30 lines, no dep |
| PDF | 🟡 | Invoice + salary slip only. **Raport export = unbuilt.** |
| WhatsApp | ❌ none | Zero matches for `whatsapp\|twilio\|wa.me` |

## 5.4 TODO/FIXME Count

**Zero.** `grep -rE "TODO\|FIXME\|HACK\|XXX"` across `lib/`, `app/`, `components/` returns 0 hits in `.ts/.tsx`. Codebase actively scrubbed.

## 5.5 Hardcoded Magic Strings

- **Brand**: `"An Nisaa' Sekolahku"` + prod URL `annisaa-erp-v3.vercel.app` baked in (`lib/email/send-slip.ts:24,32`).
- **Role enums**: `SUPER_ADMIN/SCHOOL_ADMIN/TEACHER/GUARDIAN` literals appear ~65× in non-test code.
- **Indonesian honorifics**: `app/parent/page.tsx:179` — `firstRel === "FATHER" ? "Pak" : "Bu"`.
- **Scoring scale**: `BB/MB/BSH/BSB` literals — no central enum.
- **Permission codes**: `"attendance.checkin"`, `"leave.submit"` strings in `lib/auth.ts:81`. Permission strings as JSON in `Role.permissions` String column.
- **Idle thresholds**: `proxy.ts:8-12` hardcoded 4h/24h/24h per portal.
- **Cache TTLs**: `10_000`, `60_000`, `5*60*1000` scattered.
- **Timezone**: `"Asia/Jakarta"` hardcoded across formatters.

## 5.6 Skipped Tests (Brittle Seed)

20 `test.skip(...)` in Playwright specs — all conditional on demo-seed gaps (`e2e/admin.spec.ts` 15×, `e2e/teacher.spec.ts` 3×, `e2e/admin-school-admin.spec.ts` 1×). Not real failures — seed brittleness.

## 5.7 Missing Capabilities

- **No file storage** — any photo upload (student photo, expense receipt, raport attachment) = unbuilt.
- **No queue/retry infra** — every async op in-request, capped by Vercel 60s.
- **No i18n layer** — Indonesian copy mixed in JSX.
- **No WhatsApp** — parent comm flow email-only despite Indonesia WA-first culture.
- **No raport PDF** — schema has assessments, no generator.
- **Single email template** — no templating system.
- **No real multi-tenancy** — `assertSingleTenant()` blocks tenant #2.
- **Forms hand-rolled** — no react-hook-form, every form bespoke (e.g. `manual-invoice-dialog.tsx` 711 lines).

## 5.8 Complexity Smells

- `prisma/seed.ts` — **1421 lines** (largest in repo, drives 20 test skips).
- `app/admin/invoices/page.tsx` — 889 lines.
- `app/admin/students/[id]/page.tsx` — 801 lines.
- `app/admin/admissions/page.tsx` — 735 lines.
- `components/admin/invoices/manual-invoice-dialog.tsx` — 711 lines.
- `app/admin/students/page.tsx` — 642; `academic/page.tsx` 590; `(hr)/employees/page.tsx` 587; `settings/roles/page.tsx` 537.
- Pattern: admin pages do server fetch + client state + dialog + table + breakdown popover all in one file. **Missing CRUDPage abstraction** (CLAUDE.md `crud.md` standard exists but not codified into a component).
- `lib/auth.ts` (367 lines) carries 4 concerns: cache, derivation, single-tenant guard, auto-provisioning.
- 21 `lib/finance/run-bulk-*` files — finance has most surface area outside admin pages.

## 5.9 ADRs (active, all 2026-04 to 2026-05)

22 ADRs in README. High-impact:

- Xendit > Midtrans for parent payments (2026-04)
- RLS = SELECT-only, writes via service_role (2026-04-24)
- Permission-based RBAC replaces role-string checks (2026-04-25)
- **Tagihan async pipeline** with `PENDING_PAYMENT_LINK` status because Vercel 60s cap forces ≤25-row chunks + `pLimit(5)` (2026-04-25) — **single largest workaround in codebase**
- `InvoiceNumberSequence` allocator for P2002 race; two-phase webhook (2026-04-26)
- Typed `XenditApiError` + `withXenditRetry` (2026-04-27); concurrency=2 + 1s pacing (2026-04-28)
- Capacity check inside `$transaction` with `SELECT FOR UPDATE OF cs` (2026-04-24)
- Date helpers must use `getYmdInTimezone(d, "Asia/Jakarta")` (2026-04-24) — `toISOString()` returned yesterday's data 00:00–06:59 WIB
- `AuditLog` table for sensitive HR mutations (2026-05-02)
- `OrgConfig.lemburCompliant` flag for UU 13/2003 §78(4) tiered overtime (2026-05-02)

## 5.10 Reusable vs Throw-Worthy

### Keep (mature, well-isolated)
- `lib/xendit/*` — typed errors, retry, demo short-circuit. Well factored.
- `lib/payroll/{engine, working-days, bsi-export}` — Indonesian payroll domain logic, UU 13/2003 compliance.
- `lib/finance/{invoice-numbers, concurrency-limit, run-bulk-*}` — race fixes earned through prod pain.
- `lib/hijri.ts` — pure Intl, 30 lines.
- `lib/api/{response, pagination, validate}` — thin route helpers.
- `lib/webhook/{redact-payload, extract-display-fields, error-labels}` — battle-tested.
- `prisma/schema.prisma` — 980 lines, explicit `onDelete`, multi-tenant unique. Solid baseline.

### Throw or rebuild
- `prisma/seed.ts` (1421 lines) — monolithic, fragile (drives 20 Playwright skips).
- Hand-rolled admin pages 500-900 lines each — replace with **generated CRUD layer** (zod schema → list + form + dialog).
- 19 ad-hoc Zod validators — could collapse into per-model derivation.
- `lib/auth.ts` (367 lines) — 4-in-one. Auto-provision branch is code smell.
- Single email template — no abstraction.
- `proxy.ts` portal idle-timeout — hardcoded thresholds belong in OrgConfig.

### Plan-around (not in code)
- Hono (claimed in CLAUDE.md, never installed)
- File storage
- Queue
- i18n
- WhatsApp
- Raport generator
- React-hook-form

---

# 6. Critical Gaps Summary (Blocker for Current Workflow)

1. **No 3-tier curriculum hierarchy** (PROMES/Modul Pekanan/Modul Harian).
2. **No Sentra model** (8 fixed sentra + rotation).
3. **No Penilaian Harian fact table** (student × indikator × date × sentra → SM/BM).
4. **No Hafalan tracking** (4 cumulative tracks).
5. **No Raport Triwulan structure** (narrative, height/weight, attendance summary, hafalan summary, parent-event attendance, signers, parent comment).
6. **No two-entity (RA vs TKIT) discriminator**.
7. **No payer field** on Student or StudentGuardian.
8. **No event/RAB models** (Puncak Tema, Jambore, MABIT, Fest, AKSERA, PHBI, Manasik all absent).
9. **No AKSERA/Lomba scoring** (BB/MB/BSH/BSB scale present in schema but no lomba/regu/score/kesimpulan).
10. **No referral/ambassador**.
11. **Single `User.role` string** blocks dual-role staff.
12. **Single `Employee.campusId`** blocks cross-campus teaching.
13. **No substitute-teacher concept**.
14. **`StudentJournalTemplate.tenantId @unique`** prevents per-program journal differentiation.
15. **NIS single column, no history**.
16. **No file storage** infrastructure.
17. **No WhatsApp / media bin**.
18. **Forms hand-rolled** (1421-line seed, 700+-line dialogs) — directly contradicts Simplicity + Flexibility values.

---

# 7. Tech Foundation Decisions to Reconsider

| Decision | Current | New value lens |
|---|---|---|
| ORM | Prisma | Keep — solid. Schema is the right unit of evolution |
| DB | Postgres + Supabase | Keep — RLS pattern works |
| Framework | Next.js 16 App Router | Keep — but stock Next routes (no Hono needed) |
| Auth | Supabase | Keep — Google OAuth + Magic Link |
| Payment | Xendit | Keep — code already mature |
| Email | Resend | Keep — but build template system |
| Forms | Hand-rolled | **Throw** — adopt react-hook-form + zod-resolver. Build CRUDPage component. |
| Storage | None | **Add** — Supabase Storage for photos/docs |
| Queue | None | **Add** — pg-boss (Postgres-native, no Redis) or Trigger.dev |
| i18n | None | **Add** — next-intl (Indonesian primary, English fallback) |
| WhatsApp | None | **Add** — Wati / Twilio / Fonnte integration for broadcast + notification |
| Multi-tenancy | Single-tenant locked | **Decide** — keep single, or open for licensing? |
| Mobile | PWA via Next | **Decide** — add tablet-first mode for "phone-locked" policy |
| PDF | react-pdf | Keep — but build raport template engine |
| Generic CRUD | None (one-off pages) | **Build** — schema-driven scaffold layer (per §0.3 user direction) |

---

# 8. Recommended Pre-Brainstorm Reading

1. **This file** — what's built, gap, painpoints.
2. **[teacher-insights.md](./2026-05-04-nisaa-teacher-insights.md)** — what real workflow looks like.
3. **README.md ADR table (lines 61-83)** — 22 active architectural decisions.
4. **`prisma/schema.prisma`** — entity baseline.
5. **`lib/xendit/*`, `lib/payroll/*`, `lib/finance/run-bulk-*`** — proven domain logic to preserve.

---

# 9. Brainstorm Anchors

User's 3 founding values (§0 of insights doc):
1. **Simplicity** — current code: 700-1400 line files, hand-rolled forms, monolithic seed → directly violated.
2. **Flexibility** — current code: hardcoded enums in comments, free-string fields with "should be" comments → directly violated.
3. **Story** — current code: zero narrative engine, no media bin, no milestone tracking → not started.

**Tension to resolve**: existing finance + payroll + auth maturity worth preserving vs CRUD/curriculum/story rebuild needed. Migration vs replacement vs parallel-run TBD.
