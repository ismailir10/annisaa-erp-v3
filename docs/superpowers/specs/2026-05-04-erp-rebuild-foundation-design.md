# An Nisaa ERP Rebuild — Foundation & MVP Design

> Greenfield rebuild of school ERP for An Nisaa Sekolahku (Bekasi). Targets June 2026 launch for academic year 2026/2027. Solo developer. Replaces v1 staging build (`feat/*` from v1) which solved finance/HR/admissions but missed all academic/curriculum/event/story workflows.

**Status:** Draft (post-brainstorm)
**Date:** 2026-05-04
**Author:** Claude Opus 4.7 + Ismail
**Supersedes:** existing v1 ERP staging build (port `lib/` only, throw `app/` and `prisma/seed.ts`)

## Source materials

Read first:
- [Research insights](../../research/2026-05-04-nisaa-teacher-insights.md) — full field research (~50KB)
- [v1 ERP audit](../../research/2026-05-04-existing-erp-audit.md) — gap analysis
- [Artifacts catalog](../../research/artifacts/README.md) — Drive corpus, master roster, website, photos

## 1. Problem

v1 ERP staging build covers **office side** (admissions funnel, billing, Xendit, payroll) but missed **classroom side** entirely:
- No 3-tier curriculum (PROMES → Modul Ajar → Penilaian Harian)
- No 8-Sentra rotation
- No Hafalan multi-track tracker
- No Raport Triwulan generator
- No multi-program co-enrollment (Daycare + TK same student)
- No stable internal student ID (NIS reissues per cohort = unstable lookups)
- No multi-campus student assignment (Metland + Aster)
- No payer designation on guardian
- No event / RAB models
- Admin-teacher dual role blocked by single `User.role` column
- Hand-rolled forms 700-1400 lines violate Simplicity value
- Hardcoded enums everywhere violate Flexibility value
- Zero narrative engine violates Story value

Walas spends ~30 min per raport × 130 students × 4 terms = ~250 hours/year on docx wrangling alone. Admin manages 15 paper/Excel processes daily. Parent has no portal visibility — receives raport via WhatsApp.

## 2. Goals

### 2.1 Replace 15 manual processes (paper, Excel, Drive)

Full per-actor mapping below in §10. Source process list decoded in [research insights](../../research/2026-05-04-nisaa-teacher-insights.md).

### 2.2 Three founding values

1. **Simplicity** — fewer files per module, less code per page, scaffold-first.
2. **Flexibility** — admin self-serve soft-schema (custom fields, form layout, permissions, workflow guards) without engineer cycle.
3. **Story** — data primitives (TimelineEvent, anekdot, foto-berseri foundation) enable narrative compilation per actor (post-launch AI compile).

Plus one product-value commitment:

> **"Help teachers focus on what they do best — teaching."**
>
> Every walas-facing feature pre-fills what we know, removes file friction, saves partial work anytime. No teacher should context-switch to Word, Excel, or Drive for system-managed data.

### 2.3 Non-goals (MVP)

- Multi-tenant licensing (single An Nisaa locked, scalable pattern only)
- AI story compiler (foundation TimelineEvent ships, compile post-launch)
- AdminUI for: workflow / custom fields / form layout / list views / WA templates
- WhatsApp API integration (wa.me deep links + admin clicks send)
- PROMES / Modul Ajar / RAB authoring (continues in Drive)
- AKSERA Lomba scoring entity
- Referral / Be Our Ambassador
- Yayasan reporting dashboard
- Fingerprint integration
- Photo/video timeline (WA grup remains)
- Per-week hafalan tracking
- Rubric-driven raport narrative AI compile

## 3. Architecture

### 3.1 Layered stack

```
┌─────────────────────────────────────────────────────────┐
│ Domain UI (admin/teacher/parent pages)                  │
│  — Scaffold-generated CRUD by default                   │
│  — Custom UI via _actions/<verb>.tsx escape hatch       │
├─────────────────────────────────────────────────────────┤
│ Scaffold Engine                                         │
│  — Per-entity registry (lib/entities/<name>/*.ts)       │
│  — Form, list, detail page builders                     │
│  — Permission resolver w/ scope predicates              │
│  — Workflow renderer (state-aware actions)              │
├─────────────────────────────────────────────────────────┤
│ Workflow Engine                                         │
│  — States: Postgres enum (engineer)                     │
│  — Transitions: code-defined w/ typed effect registry   │
├─────────────────────────────────────────────────────────┤
│ Foundation Services                                     │
│  — Auth (Supabase SSR + Google OAuth, cached)           │
│  — Permission (role × resource × action × scope)        │
│  — Audit log (immutable append-only, PII-redacted)      │
│  — File storage (Supabase Storage + sharp compression)  │
│  — Custom fields (JSONB column on entities)             │
│  — Timeline event (write-side projection)               │
│  — WA link generator (template + wa.me deep link)       │
│  — i18n (next-intl, ID primary, EN admin fallback)      │
├─────────────────────────────────────────────────────────┤
│ Schema (Prisma + Postgres via Supabase)                 │
│  — ~75 models, ~34 Postgres enums                       │
│  — Multi-tenant w/ tenantId everywhere                  │
│  — Composite FK on UserRole+Permission for tenant align │
│  — RLS = SELECT-only; writes via service-role           │
└─────────────────────────────────────────────────────────┘
```

> Model count was `~50` in the original draft; per-domain expansion in §4.1 totals ~75 once Address chain + Admission/MPLS + Enrollment + Curriculum/Assessment + Raport + Finance + Payroll + Operational rows are summed. §4.1 is the canonical inventory; §3.1 stays a rough order-of-magnitude.

### 3.2 Stack decisions

| Component | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 App Router | Keep — server components proven |
| ORM | Prisma 7.6 | Keep — schema-first, type-safe |
| DB | Postgres via Supabase | Keep — RLS pattern works |
| Auth | Supabase Google OAuth only | Single method, no OTP/magic-link complexity |
| Payment | Xendit | Keep existing `lib/xendit/*` |
| Storage | Supabase Storage + sharp | NEW — compressed image upload |
| Queue | pg-boss | NEW — Postgres-native, no Redis |
| i18n | next-intl | NEW — ID primary + EN fallback |
| Forms | react-hook-form + zod-resolver | NEW — replace hand-rolled forms |
| PDF | @react-pdf/renderer | Keep — extend for raport |
| UI | Shadcn + Tailwind 4 | Keep — design tokens locked |
| Tables | @tanstack/react-table | Keep |
| Charts | Recharts | Keep |
| Hijri | `lib/hijri.ts` (pure Intl) | Keep |

### 3.3 Preserve list (port from v1 as-is)

- `lib/xendit/*` — typed errors, retry, demo short-circuit
- `lib/payroll/*` — UU 13/2003 compliance, BSI bank export
- `lib/finance/run-bulk-*` — P2002 race fixes, Vercel 60s workaround, concurrency-limit
- `lib/finance/invoice-numbers.ts` — sequence allocator pattern (replicate for NIS)
- `lib/hijri.ts`
- `lib/api/{response, pagination, validate}.ts`
- `lib/webhook/*`
- Auth pattern (Supabase SSR + react.cache) — refactor into smaller files
- Finance schema subset: `InvoiceNumberSequence, FeeComponentDef, ProgramFeeStructure, Invoice, InvoiceLine, Payment, PayrollRun, PayrollItem, PayrollItemLine, SalaryComponentDef, EmployeeSalaryValue, AttendanceRecord, LeaveRequest, OrgConfig, Holiday`

### 3.4 Throw list

- All `app/admin/*`, `app/teacher/*`, `app/parent/*` pages — rebuild on scaffold
- `prisma/seed.ts` (1421 lines) — rebuild modular per domain
- 19 ad-hoc Zod validators — derive from per-entity registry
- Single email template (`salary-slip.ts`) — replace w/ template engine
- Free-string enums in schema — replace w/ Postgres enums or catalog tables
- `proxy.ts` hardcoded portal idle thresholds — move to `OrgConfig`

## 4. Schema

### 4.1 Entity inventory

~75 models across 17 domain groups (`~50` in the original draft was an undercount — per-domain expansion below totals ~75; §3.1's stack diagram label was bumped accordingly):

| Domain | Models |
|---|---|
| Tenancy | Tenant, Campus, Program, AcademicYear, AcademicTerm |
| Identity | User, Role, Permission, UserRole, **RolePermission** |
| Org | Employee, EmployeeCampusAssignment |
| Classes | ClassSection, TeachingDefault, Sentra, SentraRotation |
| Sessions | ClassSession, SessionTeacher |
| Regions | Province, Regency, District, Village (idn-area-data seed) |
| Address | Address, StudentAddress, GuardianAddress |
| People | Household, Student, StudentIdentifier, StudentIdentifierSequence, Guardian, StudentGuardian, GuardianInvitation |
| Admission | Admission, InitialAssessment, MplsCohort, MplsMember, MplsAttendance |
| Enrollment | StudentEnrollment, StudentAttendance |
| Curriculum | ScoringScale, CurriculumIndicator, RaportSectionTemplate |
| Assessment | PenilaianHarian, HafalanItem, HafalanProgress |
| Raport | Raport, RaportComment |
| Finance | FeeComponentDef, ProgramFeeStructure, FeeInstallmentScheme, SiblingDiscountRule, InvoiceNumberSequence, Invoice, InvoiceLine, Payment |
| Payroll | SalaryComponentDef, EmployeeSalaryValue, AttendanceRecord, PayrollRun, PayrollItem, PayrollItemLine, LeaveRequest |
| Foundation | OrgConfig, Holiday, AuditLog, TimelineEvent, FileAsset, ExportJob, EmailLog, WebhookEvent |
| Operational journey | ParentMeeting, ParentMeetingAttendance, InvoiceReminder, EmployeeDailyCheckIn, AdmissionFile (FileAsset link), SubstituteAssignment |

> **`RolePermission` reconciliation note.** Shipped in `02_identity` (`p1-identity-rls`, 2026-05-05) but absent from this table in the original draft. Added inline above. Composite FK pattern wraps `UserRole` + `RolePermission` per §6.4.
>
> **Pengaturan > Jam Kerja decision.** No new entity — covered by `OrgConfig` work-time fields (`workStartTime`, `workEndTime`, `gracePeriodMinutes`). v1 baseline shipped wrong defaults (07:00/16:00/15min); An Nisaa runs 07:30/17:00/N (per v1 audit §2.3 + research insights). MVP wires a dedicated **Pengaturan > Jam Kerja** UI page on top of existing `OrgConfig` fields (placement declared in §10A admin sidebar). Per-staff schedule overrides (shift rotation, per-day overrides) deferred to v1.1 (§15).
>
> **Yayasan reporting / Event mgmt / Referral.** No MVP entities. Yayasan: §10.1 admin "Yayasan reporting" stays "CSV export by date range" — no dashboard entity. Event mgmt (Jambore/Fest/MABIT/PHBI/Manasik), Referral / Be Our Ambassador, Lomba scoring — all deferred to v1.1 (§15). §9.3 "NEVER" list unchanged (PROMES / Modul Ajar / RAB authoring stay Drive).

### 4.2 Enums (~34 Postgres-native)

```
Gender, StudentStatus, IdentifierKind, IncomeBracket, GuardianRelationship,
ParentSlotStatus, ParentalSituation, LivesWith, BloodType, AddressKind,
HouseholdRelationship, MaritalStatus, SpecialAttentionLevel, InviteChannel,
SessionStatus, SessionTeacherRole, AttendanceStatus, AssessmentFormat,
AssessmentStatus, MplsStatus, RaportStatus, AuditAction, PermissionScope,
TimelineVisibility, FileKind, FileStatus, ExportFormat, ExportJobStatus,
PaymentMethod, RegencyType, CatalogSource,
FeeFrequency, InvoiceStatus, FeeInstallmentLabel
```

### 4.3 Catalog tables (engineer-seeded MVP, admin-extensible v1.1+)

`Sentra, Role, Program, ScoringScale, CurriculumIndicator, HafalanItem, RaportSectionTemplate, FeeComponentDef`

### 4.4 Standard conventions

| Convention | Rule |
|---|---|
| Audit columns | `createdAt, createdById, updatedAt, updatedById, deletedAt, deletedById` on all entities |
| Soft delete | `deletedAt: DateTime?` only — NOT `isActive` |
| Optimistic concurrency | `version: Int` on Student, Enrollment, ClassSection, ClassSession, Employee, Invoice, Raport, Assessment via Postgres trigger |
| Workflow status | Separate enum field, NOT for delete |
| Active partial unique | Codes unique among non-deleted via `WHERE deletedAt IS NULL` |
| Length constraints | `@db.VarChar(N)` everywhere bounded (NIK 16, NISN 10, phone 20, email 255, code 50) |
| Postgres enums | Engineer-controlled (status, action, scope, role) |
| Catalog tables | Admin-extensible (jobTitle, ScoringScale, Sentra, Program, Pilar) |
| CHECK constraints | DB-level safety net via raw SQL migration |
| Composite indexes | `(tenantId, ...)` first |
| Tenant denorm | Root entities + RLS-critical join tables (UserRole, Permission). Composite FK enforces alignment |
| Date types | `DateTime` (timestamptz) default; `@db.Date` for date-only |
| JSONB | `customFields: Json @default("{}")` w/ single GIN index per entity |
| Cascade rules | `Restrict` for business FKs; `Cascade` for owned children (SessionTeacher, UserRole); never cascade Tenant |
| Audit PII | Whitelist via `/// @PII redact` schema annotations; hash NIK/KK; 7-yr retention; redact-not-delete |
| Field naming | English camelCase always |

### 4.5 Critical patterns

**Stable internal student_id:** `Student.id = cuid()` is canonical. NIS/NISN via `StudentIdentifier` history table. NIS reissues per cohort retain history, no overwrite.

**Multi-program co-enrollment:** `StudentEnrollment` allows multiple active rows per student. Partial unique enforces exactly one `isPrimary=true` per academic year.

**Mandatory Ayah + Ibu w/ slot pattern:** `Student` has `ayahGuardianId, ibuGuardianId, ayahStatus, ibuStatus, parentalSituation` enum. DB trigger enforces guardian set when slot status = `ACTIVE`. Edge cases (orphan, single parent, deceased) handled via `parentalSituation` enum + waiver note.

**Household = KK aggregator:** Replaces `Student.kkNumber`. `Student.householdId` + `Guardian.householdId` link to same Household. Sibling discount = `WHERE householdId = X` query, indexed.

**Class Session co-teacher:** `ClassSession` + `SessionTeacher` junction (PRIMARY/SUBSTITUTE/SENTRA/ASSISTANT). Both primary + substitute have edit access during validity. Audit attributes per write.

**Workflow:** States as Postgres enum (engineer code). Transitions code-defined w/ typed effect registry (`workflowEffects` keyed map, validated at save). Side effects run async via pg-boss after transition commits, with idempotency keys. No DB transition table MVP — transitions seeded in code.

**Billing (installment + Xendit + cash + graceful expiry):**
- Per-academic-year fee structure via `ProgramFeeStructure(programId, academicYearId, feeComponentId, amount)` — SPP and all components priced per (program × year).
- `FeeComponentDef.frequency: FeeFrequency` enum (`ONE_TIME | YEARLY | MONTHLY`) drives invoice generation cadence.
- `FeeComponentDef.isFamilyShared: Boolean` — `PC` paid 1× per Household when siblings active.
- `FeeInstallmentScheme(academicYearId, feeComponentId, installmentNo, percentage, dueOffsetDays | dueDate, label)` — defines per-component installment plan per year.
- `SiblingDiscountRule(academicYearId, feeComponentId, childOrder, discountPercent, validFrom, validTo)` — sibling tier discounts per artifact §C.
- On enrollment: `enrollment.generate_installments` effect creates Invoice rows per installment (DRAFT) with sibling discount applied, dueDate computed.
- Invoice status: `DRAFT | ISSUED | PARTIALLY_PAID | PAID | OVERDUE | EXPIRED | CANCELLED | REFUNDED`.
- Xendit session expiry tracked: `xenditSessionExpiresAt` field. Auto-regen cron hourly extends Xendit URL while invoice ISSUED + dueDate not passed (parent never sees stale link).
- Past due → cron flips status `ISSUED → OVERDUE`. Auto-regen stops (forces admin-parent conversation). Admin can manually regen + send wa.me link.
- Cash payment: any invoice status accepts `Payment(method=CASH, cashReceiptNumber, cashReceivedById)` row. Status recalculates: PAID if cumulative ≥ amount, else PARTIALLY_PAID.
- Multiple Payment rows per Invoice supported (cash trickle).
- Parent self-service: portal shows OVERDUE/EXPIRED w/ "Minta link bayar baru" button → admin notification → admin regen.

**Permission:** `(role, resource, action, scope)` matrix. Scope predicates: `ALL | OWN_CAMPUS | OWN_PROGRAM | OWN_CLASS | OWN_SESSION | OWN_STUDENT | SELF`. Resolved at session start to **materialized ID Sets** (e.g. walas → `{ studentIds: [16 IDs], classIds: [1] }`). Scaffold injects `WHERE id IN (...)` against the resolved Sets. Cache per `(userId, currentTerm)` for 5 min. Cap allowlist at 5000 — fall back to JOIN subquery beyond. Avoids per-request 4-table JOINs.

**RLS:** SELECT-only policies + REVOKE writes from `authenticated`. Service role bypasses for app writes. Verify via CI script.

**Audit log:** Immutable append-only via trigger. PII redaction via `/// @PII` schema annotations. 7-year retention enforced via cron. PDP erasure = redact-not-delete. **Partitioned by month from day 1** (Postgres native partitioning) — drop partitions in O(1) at retention. Without partitioning, 2033 cleanup would time-out on single DELETE (3.3M rows expected).

### 4.6 Raport — walas-first inline editor

`Raport` stores narrative as `sections: Json` keyed by `RaportSectionTemplate.code` (English: `introduction, religious_moral, self_identity, steam_literacy, performance, follow_up_school, follow_up_home, closing`). Per-section rich text editor, autosave 30s.

Auto-pulled snapshot at submit transition (DRAFT → IN_REVIEW): `attendanceSummary, hafalanSummary, pilarLearned, phbiAttended, parentMeetingAttended/Total`. Walas inputs only `heightCm, weightKg`.

PDF compose async via pg-boss queue on `IN_REVIEW → PUBLISHED` transition. Cached as FileAsset.

Inline review w/ kepala via `RaportComment(raportId, section, authorId, body, resolvedAt)`.

## 5. Scaffold Engine

### 5.1 Per-entity directory pattern

```
lib/entities/student/
├── schema.ts        # re-exports Prisma type + Zod input/output
├── entity.ts        # UI metadata: listColumns, searchFields, label, icon, filters, views
├── policy.ts        # permissions, audit config, workflow binding
├── events.ts        # timeline event shapes (zod-validated payloads)
└── __fixtures__/    # realistic seed data (AI mimics shape)
```

Each file <60 lines. AI-friendly: copy `lib/entities/student/` → `lib/entities/<new>/`, edit per concern, run `npm run scaffold:check`.

### 5.2 CRUD page contract

```tsx
// app/admin/students/page.tsx (4 lines)
import { ScaffoldListPage } from '@/lib/scaffold'
import student from '@/lib/entities/student/entity'
export default function Page() {
  return <ScaffoldListPage entity={student} />
}
```

Same pattern for form, detail. Identical UX across every entity.

### 5.3 Override hatch

Custom UI lives in `app/<portal>/<entity>/_actions/<verb>.tsx`. Mounted as button via `entity.detailActions[]`. Reuses scaffold permission, audit, mutation toast. File count for new feature: 1.

### 5.4 Standard page anatomy (locked UX)

| Page | Anatomy |
|---|---|
| List | Breadcrumbs → Header (title + actions) → Filter chips → DataTable (pagination 25, action col) → Bulk action bar (on selection) |
| Form | Breadcrumbs → Header → Sections (RHF-driven, custom fields auto-rendered last) → Footer (Cancel + Save) |
| Detail | Breadcrumbs → Header (avatar + status badge + workflow actions) → Tabs (Ringkasan / Wali / Riwayat / Lampiran / Aktivitas) |

### 5.5 Field renderer registry

Fixed 14 renderers (TEXT, TEXTAREA, NUMBER, DECIMAL, CURRENCY, DATE, DATETIME, BOOLEAN, SELECT, MULTISELECT, EMAIL, PHONE, RELATION, FILE, ENUM). Same renderer = same UX everywhere. Admin custom fields can't break consistency — renderer fixed per type.

### 5.6 Status badges + actions

5 fixed variants: `default | success | warning | destructive | info | muted`. Same colors via design tokens. Workflow transitions render as buttons in fixed location (top-right detail header), permission-gated, optional confirmation.

### 5.7 Empty / loading / error states

Mandatory 4 states per list: skeleton (loading), no-data empty (icon + CTA), filtered-out empty, error (icon + retry). Scaffold enforces.

### 5.8 Mobile + responsive

DataTable → card-stack on `< md`. Form 1-col mobile, 2-col `md+`. Tabs collapse to accordion mobile. All from scaffold.

### 5.9 Locale-aware formatters

`lib/scaffold/format.ts` exports `fmt.{date, dateTime, currency, number, phone, hijri, relativeTime}`. Every component uses these. Date never raw ISO to user.

### 5.10 Filtering — chip filters + Smart Views

Per entity 3-5 fixed chip filters defined in `entity.ts`. Operators implicit per type (multi-select=IN, date-preset=range, search=trigram). No nested AND/OR builder.

Smart Views = engineer-curated named filter combinations (`entity.views`). Default view per role via `defaultFor[]`.

URL state: simple query params. Shareable.

### 5.11 Export — current view + visible columns

Single "Ekspor" button on list page. Modal: format (CSV / XLSX / PDF) + visible-columns toggle. Inline CSV < 500 rows, async via pg-boss otherwise. Result via FileAsset signed URL 24h.

### 5.12 Bulk actions

Single `bulkAction()` helper (~150 LOC). Validates per-row scope. Chunks of 100 in transaction (or pg-boss > 500). Single audit row w/ `affectedIds[]`.

### 5.13 PII redaction (audit)

Engineer annotates schema:
```prisma
nik   String? @db.VarChar(16)  /// @PII redact
phone String? @db.VarChar(20)  /// @PII mask:last4
```

Generator script reads triple-slash comments → `lib/audit/redactor.ts`. Wraps audit writes — `before/after` always redacted before insert.

## 6. Migration + Seed + RLS

### 6.1 Migration files (21 numbered)

```
00_extensions          pg_trgm, pgcrypto
01_tenancy             Tenant, Campus, Program, AcademicYear, AcademicTerm
02_identity            User, Role, Permission, UserRole + composite FK + RLS
03_employees           Employee, EmployeeCampusAssignment
04_classes             ClassSection, TeachingDefault, Sentra, SentraRotation
05_sessions            ClassSession, SessionTeacher
06_audit_timeline      AuditLog (append-only trigger), TimelineEvent
07_students            Household, Student, StudentIdentifier, StudentIdentifierSequence
08_guardians           Guardian, StudentGuardian, GuardianInvitation
09_regions             Province/Regency/District/Village (idn-area-data v4.0.1, BPS-code PKs CHAR(2)/(4)/(6)/(10) — note District widened from CHAR(7) to CHAR(6) per p1-regions-seed Ship Notes; idn-area-data v4.0.1 ships PPRRDD 6-digit, not Permendagri 137/2017 PPRRDDD 7-digit)
10_addresses           Address chain referencing 09_regions PKs (deferred to p2-addresses-idn-chain — first p2 entity cycle that needs it)
11_curriculum          ScoringScale, CurriculumIndicator, HafalanItem, RaportSectionTemplate
12_admission_workflow  Admission, InitialAssessment, MplsCohort/Member/Attendance
13_enrollment          StudentEnrollment, StudentAttendance, PenilaianHarian, HafalanProgress
14_raport              Raport, RaportComment
15_finance             port from v1 + extend: FeeComponentDef (+ frequency, isFamilyShared), ProgramFeeStructure, FeeInstallmentScheme (NEW), SiblingDiscountRule (NEW), InvoiceNumberSequence, Invoice (+ installmentNo, parentInvoiceId, xenditSessionExpiresAt, baseAmount/discountAmount, expanded InvoiceStatus enum), Payment (+ method enum, cashReceiptNumber)
16_payroll             port from v1: SalaryComponentDef, EmployeeSalaryValue, PayrollRun
17_scaffold            FileAsset, ExportJob, EmailLog, WebhookEvent, OrgConfig, Holiday
18_version_triggers    bump_version per versioned entity
19_check_constraints   all CHECKs + partial uniques + GIN indexes
20_jwt_hook            Supabase custom access token hook
```

(Reconciled in `spec-sync-phase-1-actual`: original `09_addresses` slot split into `09_regions` + `10_addresses`; subsequent rows shifted +1; final list grew 20 → 21 numbered files.)

Each file <200 lines. Each migration tested independently in CI.

### 6.2 Seed (modular, idempotent)

```
prisma/seed/
├── 00-tenant.ts                   An Nisaa tenant + bootstrapStatus PENDING
├── 01-regions.sql                 idn-area-data → Province/Regency/District/Village (~80k via SQL file, ~3s)
├── 02-campuses.ts                 Metland + Aster
├── 03-programs.ts                 DAYCARE, TODDLER_1, TODDLER_2, PLAYGROUP, TK_A, TK_B
├── 04-academic-year.ts            TA 2026/2027 + 4 AcademicTerms + StudentIdentifierSequences
├── 05-system-roles.ts             admin, principal, kadiv, homeroom_teacher, sentra_teacher, admission_officer, finance_officer, parent
├── 06-permissions.ts              derived from per-entity policy.ts registry
├── 07-sentra.ts                   8 Sentra catalog
├── 08-pilar.ts                    Pilar Karakter (engineer seeds finite list)
├── 09-curriculum-indicator.ts     Kurikulum Merdeka NAB / Jati Diri / STEAM IKTP
├── 10-scoring-scales.ts           SM/BM, BB/MB/BSH/BSB, 3-level rubric
├── 11-hafalan-items.ts            Tahfidz Q.S., Hadits, Doa, Asmaul Husna catalog (per program)
├── 12-raport-sections.ts          8 default sections (introduction → closing)
├── 13-fee-components.ts           8 FeeComponentDef (Pendaftaran/Pangkal/Seragam/Tas/Sarana/Kegiatan/PC/SPP) w/ frequency + isFamilyShared
├── 14-program-fee-structure.ts    8 components × 6 programs amount table per artifact (TA 2025/2026 baseline, admin updates per year)
├── 15-fee-installment-scheme.ts   3 installments per component per artifact §D (Pembayaran 1/2/3)
├── 16-sibling-discount-rules.ts   sibling tier discounts per artifact §C
├── 17-employees.ts                initial staff (kepala + walas + sentra teachers)
├── 18-classes.ts                  A1-A4 + B1-B4 ClassSections per Metland + Aster
├── 19-teaching-defaults.ts        walas → kelas + sentra teacher assignments
└── 20-bootstrap-complete.ts       set tenant.bootstrapStatus = COMPLETE
```

All idempotent via `upsert` keyed on `(tenantId, code)`. Catalog tables get `source: SYSTEM | ADMIN` flag — seed never overwrites ADMIN-edited rows.

### 6.3 RLS strategy

Per existing v1 ADR: SELECT-only RLS, writes via service-role.

```sql
ALTER TABLE "Student" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "Student" FROM anon, authenticated;
GRANT SELECT ON "Student" TO authenticated;

CREATE POLICY tenant_isolation_select ON "Student"
  FOR SELECT TO authenticated
  USING (
    "tenantId" = (current_setting('request.jwt.claims', true)::json->>'tenant_id')
    AND "deletedAt" IS NULL
  );

CREATE POLICY no_writes_via_postgrest ON "Student"
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
```

CI script `verify-rls-coverage.sh` extends to assert REVOKE + no INSERT/UPDATE/DELETE policies on `authenticated`.

### 6.4 Tenant alignment

Composite FK on `UserRole` + `Permission` (the only RLS-critical join tables MVP). Other join tables app-layer enforced — revisit at tenant #2.

```prisma
model User    { id String @id; tenantId String; @@unique([id, tenantId]) }
model Role    { id String @id; tenantId String; @@unique([id, tenantId]) }
model UserRole {
  userId String; roleId String; tenantId String;
  user User @relation(fields: [userId, tenantId], references: [id, tenantId])
  role Role @relation(fields: [roleId, tenantId], references: [id, tenantId])
}
```

### 6.5 JWT custom claims

Supabase Custom Access Token Hook injects `tenant_id` + `role` into JWT. RLS reads `current_setting('request.jwt.claims')->>'tenant_id'`.

### 6.6 NIS allocator

`StudentIdentifierSequence(tenantId, academicYearId, programId)`. Allocator uses `pg_advisory_xact_lock(hashtext(tenantId || ':nis:' || academicYearId))` for cross-process safety. Mirrors `InvoiceNumberSequence` pattern from v1.

### 6.7 Data import (XLSX → fresh TA 2026/2027)

`app/admin/_import/student/page.tsx`. Per-entity, Zod-validated, audit batched, transaction-scoped.

Dedup heuristic:
1. NIK exact match → PRIMARY
2. (normalizedPhone + Levenshtein name ≤ 2) → FUZZY
3. Ask admin → MANUAL

Phone + name normalizers handle leading-zero strip, +62 prefix, diacritic strip.

Income parser regex-maps free-text outliers to nearest bucket, preserves raw in `customFields.incomeBracketRaw`. Staff (`< Rp 1.850.000`) flagged for staff-discount.

Excel scientific-notation truncation (`3.20703E+14`) → admin re-uploads from source w/ proper formatting.

## 7. Workflow + Effects

### 7.1 Admission state machine

```
INQUIRY → VISITED → FORM_SUBMITTED → UNDER_REVIEW → APPROVED 
                       ↑─REVISION_REQUESTED──┘  
→ INVOICE_SENT → PAID → PROMOTED → AWAITING_MPLS → PORTAL_ACTIVE → ENROLLED
                                                                      ↓
                                                                  (terminal)

DROPPED can branch from any state (admin-explicit)
AUTO_DROPPED: cron flips FORM_SUBMITTED → DROPPED after N days idle (default 30)
```

**State details:**
- `REVISION_REQUESTED` — admin asks parent to fix Phase 1 form fields (loopback to FORM_SUBMITTED on parent edit)
- `AWAITING_MPLS` — Student record exists, NIS allocated, MPLS cohort assigned but not yet completed. Distinct from PORTAL_ACTIVE (parent activated portal).
- `AUTO_DROPPED` — cron-driven dead-lead cleanup. Configurable threshold per OrgConfig.
- **No `REFUNDED` invoice status MVP** — cash-only refund tracked as ledger note in `Invoice.notes`. Xendit refund API not in port list. Future v1.1 may add.

### 7.2 Effects registry (typed)

```ts
// lib/workflow/effects.ts
export const workflowEffects = {
  'admission.create_initial_invoice': defineEffect({
    input: z.object({ admissionId: z.string(), method: z.enum(['XENDIT', 'CASH']) }),
    handler: async (ctx, input) => { /* enqueues pg-boss */ },
    idempotencyKey: (input, ctx) => `inv:${input.admissionId}:${ctx.transitionId}`,
  }),
  'admission.send_wa_template': defineEffect({...}),
  'admission.allocate_nis': defineEffect({...}),
  'admission.create_student_record': defineEffect({...}),
  'admission.send_portal_invitation': defineEffect({...}),
  'enrollment.generate_installments': defineEffect({...}),  // creates Invoice rows per FeeInstallmentScheme + applies SiblingDiscountRule
  'invoice.regen_xendit_session': defineEffect({...}),       // manual or auto via cron
  'invoice.flip_overdue': defineEffect({...}),                // cron daily
  'invoice.flip_expired': defineEffect({...}),                // cron daily after OVERDUE
  'invoice.recalculate_status_after_payment': defineEffect({...}),  // PARTIALLY_PAID / PAID derive
  'raport.generate_pdf': defineEffect({...}),
}
```

Effects run **after** transition commits, async via pg-boss with idempotency. Failure → retry exhaustion → admin notified.

## 8. Auth + Onboarding

### 8.1 Auth — Google OAuth only

Supabase Auth with Google provider only. No magic link, no WA OTP, no password.

Invitation-based portal access:
- Phase 1 admission form: NO auth required (public form)
- Post-promotion: parent receives `GuardianInvitation` token via wa.me link → activates account via Google sign-in → portal access

Edge case: parent doesn't have Gmail → admin guides creation OR fills on parent's behalf.

### 8.2 Phase 1 lite form (~10 fields)

Public, no auth, accessible via QR (Bitly-generated, `/daftar` route).

```
ANAK
  Nama lengkap *, Nama panggilan, Jenis kelamin *, Tempat lahir *, Tanggal lahir *

PILIHAN
  Jenjang *, Campus *

KONTAK
  Nama Anda *, Hubungan ke anak *, No HP * (sibling matcher), Email (optional)

LAINNYA
  Sumber info, Catatan
```

Submit → Admission `FORM_SUBMITTED` + auto sibling detect on phone match.

### 8.3 Phase 2 onboarding (post-promotion)

Parent activates portal via invitation → onboarding checklist:

```
Kelengkapan data ananda Aisyah: 35% ━━░░░░░░░░

  ☑ Data Ayah singkat (sudah dari pendaftaran)
  ☐ Identitas lengkap anak (NIK, akta) — wajib
  ☐ Data Ibu lengkap
  ☐ Data Ayah lengkap (NIK, pendidikan, pekerjaan)
  ☐ Alamat rumah lengkap
  ☐ Upload Akta Kelahiran
  ☐ Upload Kartu Keluarga
  ☐ Upload foto anak
  ☐ Riwayat kesehatan / alergi
  ☐ Kontak darurat
```

Save partial OK. Admin can fill on parent's behalf. ENROLLED status when admin satisfied.

## 9. MVP Scope Lock

### 9.1 IN scope (June 2026)

**Foundation:**
- Schema (~50 models) + migrations + seeds
- Scaffold engine + per-entity registry pattern
- Permission resolver + audit log + timeline event
- File upload pipeline + Supabase Storage
- RLS + Google OAuth + JWT custom claims hook
- idn-area-data regions seed
- Chip filters + Smart Views (engineer-defined)
- Export (CSV inline, XLSX async)
- Bulk action helper
- Locale formatters + i18n (ID + EN)
- Override hatch pattern

**Admin modules:**
- Admission funnel (public form + admin review + cash/Xendit + sibling auto-detect)
- Initial Assessment intake
- MPLS cohort + placement screen
- Students CRUD + multi-program co-enrollment + NIS allocation
- Guardians CRUD + Household + payer + invitation token
- Billing per academic year (8 components × 6 programs × per-year amounts)
- Installment schemes (3 payments per artifact §D, configurable per year)
- Sibling discount rules (artifact §C: anak ke-1/2/3/4+ tiers, time-bounded)
- Xendit auto-regen + cash payment + partial payment + manual regen
- OVERDUE / EXPIRED status flow + Tunggakan view + wa.me link button
- SPP monthly cron generation per active enrollment
- Classes + walas + sentra teacher assignment
- Employees CRUD
- Sentra catalog (8 fixed) + weekly rotation per kelas

**Teacher modules:**
- Daily check-in (manual web)
- Class attendance per session (tap-grid w/ AttendanceStatus enum)
- Penilaian Harian per Sentra (SM/BM grid)
- Hafalan tracker (4-track event-sourced, simple acquire UI per item per student)
- Buku penghubung daily journal (single timeline)

**Parent modules:**
- Dashboard (kid summary + Hijri greeting + invoice + journal excerpt)
- Invoice list + Xendit pay
- Raport download (PDF) + comment
- Journal respond
- Onboarding checklist

**Raport TW generator (walas-first):**
- AcademicTerm period (4/year)
- Inline rich text editor per section (8 sections via RaportSectionTemplate)
- Auto-pulled snapshot at submit (attendance, hafalan, pilar, PHBI, parent meeting)
- Walas inputs height/weight only
- Sign-off chain (DRAFT → IN_REVIEW → PUBLISHED)
- Inline review comments per section between walas + kepala
- PDF compose async via pg-boss on PUBLISHED
- Parent comment per term

**Migration:**
- Fresh TA 2026/2027 launch
- Student/Guardian XLSX import wizard
- No port from v1 DB or Drive (per locked decision)

### 9.2 OUT of MVP (deferred to v1.1, Aug 2026)

- AdminUI for: workflow editor, custom field builder, form layout editor, list view editor, WA template editor
- AI story compiler (foundation TimelineEvent ships)
- Lomba scoring (BB/MB/BSH/BSB infra ships, lomba entity post-launch)
- Referral / Be Our Ambassador
- Events full module (Jambore, Fest, MABIT, PHBI, Manasik)
- Yayasan reporting dashboard
- Fingerprint integration (manual web check-in MVP)
- Teacher photo/video upload (WA grup remains primary)
- Per-week hafalan tracking (single date stamp MVP)
- Per-event RSVP + parent meeting calendar
- Cross-entity workflows
- Multi-tenant licensing
- Parent timeline / yearbook compile
- Quarterly region refresh cron
- Auto-provision Supabase trigger (app-layer for launch)
- Penetration test

### 9.3 NEVER (out of system, stays Drive)

- PROMES authoring (Excel)
- Modul Ajar Pekanan / Harian authoring (Word in Drive)
- RAB Sentra / Event budgets (Excel)

## 10. Per-Actor Journey Map

### 10.1 Admin

| Task | Current | MVP |
|---|---|---|
| Buku tamu | Paper book | Digital Visit log |
| Form pendaftaran | Cetak paper | Public form via QR / tablet |
| Follow-up calon | Manual WA chat | wa.me link button per stale lead |
| Generate invoice biaya awal | Manual create | 1-click from Admission detail |
| Catat pembayaran cash | Buku kas tulisan tangan | Admin records receipt# + amount |
| Promote ke Student | Manual NIS alokasi | "Promote" button → auto NIS + invitation |
| Class placement post-MPLS | Verbal + paper | Drag-drop placement screen |
| Tagihan SPP bulanan | Manual per anak | Cron-generated draft |
| Tunggakan reminder | Manual WA | wa.me link button per arrear |
| Gaji guru | Hitung manual + transfer | Existing payroll engine ported |
| Master roster | Excel 26 sheets | Student/Guardian/Household DB |
| Daftar hadir murid | Print + tulis tangan | Walas marks digital, admin exports |
| Yayasan reporting | Excel manual | CSV export by date range |

### 10.2 Walas (Homeroom Teacher)

| Task | Current | MVP |
|---|---|---|
| Buku penghubung anak | Buku fisik per anak | Digital journal (single timeline MVP) |
| Presensi murid | Print + tulis tangan | Tap-grid per session w/ AttendanceStatus enum |
| Penilaian Harian per Sentra | Isi docx Drive | Digital grid: rows=students, cols=indikator, tap SM/BM |
| Hafalan progress | Free-text raport narrative | Mark "Sudah hafal" per item per student |
| Raport Triwulan | Tulis docx narrative offline | Inline rich text editor per section, autosave 30s, auto-pull facts |
| Modul Ajar Pekanan/Harian | Tulis Word di Drive | (kept Drive — defer authoring v1.1) |
| Foto/video kegiatan | Share via WA grup | Same — no system change MVP |
| Substitute coverage | Manual coordination | Admin assigns SUBSTITUTE on session, scope auto-grants |

### 10.3 Sentra Teacher

Subset of Walas. Penilaian Harian grid scoped to (sentra, session, kelas).

### 10.4 Kepala Sekolah

| Task | Current | MVP |
|---|---|---|
| Approve raport | Tanda tangan tiap docx | Click "Approve" w/ inline comments per section |
| Review penilaian aggregat | Lihat docx walas | Read-only access scaffold list |

### 10.5 Parent

| Task | Current | MVP |
|---|---|---|
| Bayar SPP | Transfer manual | Login portal → Xendit pay |
| Cek tagihan | Tunggu admin reminder | Visible in portal w/ due |
| Lihat raport | Tunggu docx via WA | Login portal → download PDF + comment |
| Buku penghubung respond | Tulis di buku | Reply via portal |
| Cek aktivitas harian | WA grup posts | Same — no system change MVP |
| Update data anak | Lapor walas via WA | Portal onboarding checklist + profile edit |
| Daftar adik | Datang ulang | Phone match auto-detects, family inherits |

### 10.6 Coverage stats

| Actor | Daily pain replaced |
|---|---|
| Admin | ~70% (admission + billing + roster + reporting) |
| Walas | ~60% (penilaian + journal + hafalan + attendance + raport) |
| Parent | ~80% (visibility + payment + raport + onboarding) |
| Kepsek | ~30% (raport approval; rest stays offline) |
| Sentra teacher | ~50% (penilaian only) |

## 10A. Information Architecture per Portal

§10.1-10.6 above are task-level. This section is the **canonical sidebar grouping** every page mounts under. Three portals (admin, teacher, parent); kepsek = admin portal w/ `principal` role per §10.4 (same shell, scope-filtered).

**Backend English, labels Indonesian.** Per §4.4 (`Field naming: English camelCase always`) extended to URLs + identifiers: every route segment, file path, entity slug, role code, scope code, action code, smart-view query value, enum literal, JSON key, and code-level identifier MUST be English. Sidebar group labels, page titles, button copy, status text, error/empty/success messages, and every user-visible string stay Indonesian per §10A tables and `voice.md`. **Rule of thumb:** if a developer types it (route, code, JSON), it's English. If a parent/walas/admin reads it on screen, it's Indonesian.

**Routing convention.** Pages live at `/<portal>/<group-slug>/<entity-slug>` for primary entity pages, `/<portal>/<group-slug>/<entity-slug>/[id]` for detail. Smart-View routes use `?view=<english-slug>` query (per §5.10 — URL state, shareable). Group slugs are **English** even though their displayed label is Indonesian:

| Group label (Indonesian) | Group slug (English) |
|---|---|
| Beranda | `/` (or `/home`) |
| Akademik | `/academic` |
| Penilaian | `/assessment` |
| Keuangan | `/finance` |
| HR | `/hr` |
| Berkas | `/files` |
| Audit | `/audit` |
| Pengaturan | `/settings` |

Entity slugs likewise English kebab-case (label → slug examples: `Pendaftaran → admissions`, `Wali Murid → guardians`, `Keluarga → households`, `Tahun Akademik → academic-years`, `Hari Libur → holidays`, `Jam Kerja → work-hours`, `Komponen Biaya → fee-components`, `Skema Cicilan → fee-installment-schemes`, `Tunggakan → invoices?view=overdue`, `Lampiran → file-assets`, `Profil Sekolah → org-config`, `Akun Saya → me`, `Penilaian Harian → daily-assessments`, `Penghubung → journal`). When unsure of the English term, use the Prisma model name as the canonical source (kebab-cased + pluralized).

Sidebar nav = its own cycle (`p2-portal-shell-sidebar`); scaffold pages mount under expected groups, sidebar active-state lands separately. ScaffoldListPage / ScaffoldFormPage / ScaffoldDetailPage per §5.2 — 4-line page recipe everywhere. The label↔slug mapping owned by each `lib/entities/<name>/entity.ts` (`label.id` Indonesian + `slug` English-kebab) — single source of truth.

**Read-scope notation.** Per-page `Min read` column lists role:scope tuples; multiple roles sharing a scope abbreviate (e.g. `A/P/KD: ALL`). Vocabulary defined in §10.7. Roles: `A=admin, P=principal, KD=kadiv, AO=admission_officer, FO=finance_officer, HT=homeroom_teacher, ST=sentra_teacher, PR=parent`.

### 10A.1 Admin portal

Lifecycle ordering: top of each group = where work starts; bottom = setup admin touches once per year (`— Konfigurasi —` subgroup at the end of Akademik / Penilaian / Keuangan). Detail-tab pattern (§5.4) absorbs workflow children — GuardianInvitation / InitialAssessment / MplsAttendance / SentraRotation / SessionTeacher / RolePermission / AcademicTerm / RaportComment all fold into parent detail, no top-level sidebar entry. Pengaturan is **strictly system config** — no domain catalogs.

| Group | Page | Entity | Min read |
|---|---|---|---|
| **Beranda** | Dashboard | (aggregated) | A/P/KD/AO/FO: ALL |
| **Akademik** | Pendaftaran (Admission funnel — smart views per state) | Admission · InitialAssessment (detail tab) · `source ∈ {ONLINE / WALK_IN / REFERRAL}` covers `/daftar` + buku-tamu walk-in + referral channels | A/P/KD/AO: ALL |
| | MPLS Cohort | MplsCohort + MplsMember + MplsAttendance (inline) | A/P/KD/AO: ALL |
| | Pendaftaran Program | StudentEnrollment | A/P/KD/AO/FO: ALL |
| | Siswa | Student · StudentIdentifier (detail tab) | A/P/KD/AO: ALL |
| | Wali Murid | Guardian · GuardianInvitation (action: "Kirim Undangan" + status pill) · StudentGuardian (detail tab) | A/P/KD/AO: ALL |
| | Keluarga | Household | A/P/KD/AO/FO: ALL |
| | Kelas | ClassSection · TeachingDefault (detail tab) · SentraRotation (detail tab) · ClassSession + SessionTeacher (detail tab) | A/P/KD: ALL |
| | Pertemuan Ortu | ParentMeeting + ParentMeetingAttendance (inline) | A/P/KD: ALL |
| | — Konfigurasi Akademik — | | |
| | Tahun Akademik | AcademicYear + AcademicTerm (inline) | A/P: ALL |
| | Program | Program (catalog) | A/P: ALL |
| | Sentra | Sentra (catalog) | A/P: ALL |
| **Penilaian** | Penilaian Harian (admin aggregate) | PenilaianHarian (read-only aggregate) | A/P/KD: ALL |
| | Hafalan (admin aggregate) | HafalanProgress (read-only aggregate) | A/P/KD: ALL |
| | Raport | Raport + RaportComment (inline) | A/P/KD: ALL |
| | — Konfigurasi Penilaian — | | |
| | Skala Penilaian | ScoringScale (catalog) | A/P: ALL |
| | Indikator Kurikulum | CurriculumIndicator (catalog) | A/P: ALL |
| | Item Hafalan | HafalanItem (catalog) | A/P: ALL |
| | Template Raport | RaportSectionTemplate (catalog) | A/P: ALL |
| **Keuangan** | Tagihan | Invoice | A/P/KD/FO: ALL |
| | Pembayaran | Payment | A/P/KD/FO: ALL |
| | Tunggakan (smart view) | Invoice (`view=overdue+expired`) | A/P/KD/FO: ALL |
| | Reminder Tagihan | InvoiceReminder | A/P/KD/FO: ALL |
| | — Konfigurasi Biaya — | | |
| | Komponen Biaya | FeeComponentDef (catalog) | A/P/FO: ALL |
| | Struktur Biaya per Program | ProgramFeeStructure | A/P/FO: ALL |
| | Skema Cicilan | FeeInstallmentScheme | A/P/FO: ALL |
| | Aturan Diskon Saudara | SiblingDiscountRule | A/P/FO: ALL |
| **HR** | Akun Saya | Employee + LeaveRequest + AttendanceRecord + slip (SELF for any role w/ Employee record) | A/P/KD/HT/ST/AO/FO: SELF |
| | Karyawan | Employee + EmployeeCampusAssignment (inline) | A/P: ALL · KD: OWN_CAMPUS · FO: ALL |
| | Daily Check-in | EmployeeDailyCheckIn | A/P/FO: ALL · KD: OWN_CAMPUS |
| | Absen Karyawan | AttendanceRecord (aggregate) | A/P/FO: ALL · KD: OWN_CAMPUS |
| | Cuti Karyawan | LeaveRequest | A/P/FO: ALL · KD: OWN_CAMPUS |
| | Substitute Assignment | SubstituteAssignment | A/P/KD: ALL |
| | — Penggajian (subgroup, hidden from `principal`) — | | |
| | Penggajian | PayrollRun + PayrollItem + PayrollItemLine (inline) | A/FO: ALL · KD: OWN_CAMPUS |
| | Komponen Gaji | SalaryComponentDef (catalog) | A/FO: ALL · KD: OWN_CAMPUS |
| | Nilai Gaji per Karyawan | EmployeeSalaryValue | A/FO: ALL · KD: OWN_CAMPUS |
| **Berkas** | Lampiran | FileAsset | A/P/KD/AO: ALL |
| | Job Ekspor | ExportJob | A/P/KD/AO/FO: ALL |
| | Email Log | EmailLog | A/P/FO: ALL |
| | Webhook | WebhookEvent | A/P/FO: ALL |
| **Audit** | Audit Log | AuditLog | A/P: ALL |
| | Timeline Events | TimelineEvent | A/P/KD: ALL |
| **Pengaturan** | Profil Sekolah | OrgConfig + Tenant | A/P: ALL |
| | Jam Kerja | OrgConfig (work-time fields) | A/P: ALL |
| | Kampus | Campus | A/P: ALL |
| | Hari Libur | Holiday | A/P: ALL |
| | Pengguna | User + UserRole (inline) | A/P: ALL |
| | Peran | Role + RolePermission (inline) | A/P: ALL |
| | Izin | Permission (catalog, read-only) | A/P: ALL |
| | Wilayah | Province/Regency/District/Village (read-only ~91k rows) | A/P/KD/AO/FO/HT/ST/PR: ALL |

### 10A.2 Teacher portal

Lifecycle ordering: today → context → input → period output → communication → self.

| Group | Page | Entity | Min read |
|---|---|---|---|
| **Beranda** | Dashboard | (aggregated: today's sessions, pending raport, daily check-in nudge) | HT/ST: SELF |
| **Kelas** | Sesi Hari Ini | ClassSession (filter: today + role-scoped) | HT: OWN_CLASS · ST: OWN_SESSION |
| | Daftar Kelas | ClassSection (own assignments) | HT/ST: OWN_CLASS |
| | Roster | Student (via own ClassSection) | HT/ST: OWN_CLASS |
| | Absensi Kelas | StudentAttendance (tap-grid) | HT: OWN_CLASS · ST: OWN_SESSION |
| **Penilaian** | Penilaian Harian per Sentra | PenilaianHarian (SM/BM grid) | HT/ST: OWN_CLASS |
| | Hafalan | HafalanProgress (acquire-mark) | HT/ST: OWN_CLASS |
| | Raport | Raport (DRAFT/IN_REVIEW for own walas-class) | HT: OWN_CLASS |
| **Penghubung** | Buku Penghubung | TimelineEvent + journal notes (single timeline) | HT: OWN_CLASS |
| **Akun** | Daily Check-in | EmployeeDailyCheckIn | HT/ST: SELF |
| | Profil | Employee | HT/ST: SELF |
| | Cuti | LeaveRequest | HT/ST: SELF |
| | Slip Gaji | PayrollItem + PayrollItemLine (own months) | HT/ST: SELF |

### 10A.3 Parent portal

Lifecycle ordering: child first (research-backed: child status checked daily, billing monthly), money second, self last. Onboarding Checklist auto-hides on Beranda once 100% complete.

| Group | Page | Entity | Min read |
|---|---|---|---|
| **Beranda** | Dashboard | (aggregated: Hijri greeting + kid card + unpaid invoice + journal excerpt + onboarding nudge if incomplete) | PR: OWN_HOUSEHOLD |
| **Akademik** | Anak Saya | Student (roster card) | PR: OWN_STUDENT |
| | Absen Anak | StudentAttendance (monthly) | PR: OWN_STUDENT |
| | Penghubung | TimelineEvent + journal notes | PR: OWN_STUDENT |
| | Hafalan | HafalanProgress (read-only) | PR: OWN_STUDENT |
| | Raport | Raport (PUBLISHED only) + RaportComment (own comment write) | PR: OWN_STUDENT (PUBLISHED) |
| **Tagihan** | Tagihan | Invoice | PR: OWN_STUDENT |
| | Pembayaran (riwayat) | Payment | PR: OWN_STUDENT |
| **Akun** | Profil | Guardian | PR: SELF |
| | Onboarding Checklist | (aggregated: Student + Guardian + AdmissionFile completeness — auto-hides at 100%) | PR: OWN_STUDENT |

### 10A.4 IA notes

- **Pengaturan = system config only.** Domain catalogs (Tahun Akademik / Program / Sentra / ScoringScale / CurriculumIndicator / HafalanItem / RaportSectionTemplate / FeeComponentDef / ProgramFeeStructure / FeeInstallmentScheme / SiblingDiscountRule / SalaryComponentDef / EmployeeSalaryValue) live INSIDE the modules they configure (`Akademik` / `Penilaian` / `Keuangan` / `HR > Penggajian`). Pengaturan retains only profile, work-time, location, calendar, RBAC, region master.
- **Lifecycle ordering within each group.** Top of group = where work starts (Pendaftaran → MPLS → Enrollment → Siswa). Bottom = `— Konfigurasi —` subgroup admin touches once per year. Same pattern across portals.
- **Kepsek = admin portal w/ `principal` role.** No separate sidebar shell. `principal` co-listed with `admin` in nearly every read tuple (per current `lib/entities/*/policy.ts`). Approval-only screens (raport sign-off) live inline on the relevant detail page.
- **Payroll subgroup hidden from `principal`.** HR > Penggajian (PayrollRun + Komponen Gaji + Nilai Gaji per Karyawan) gated to `A/FO/KD` only. `principal` sees HR roster + attendance + leave but no salary data — kepsek discipline. Own slip available via `Akun Saya` (SELF). Matrix §10.7.1 reflects: P drops to `—` on PayrollRun / SalaryComponentDef and to SELF on PayrollItem / PayrollItemLine / EmployeeSalaryValue.
- **Akun Saya pattern.** Top of HR group for any role w/ Employee record (admin / principal / kadiv / homeroom / sentra / admission / finance). Aggregates Employee profile + LeaveRequest + AttendanceRecord + slip — all SELF-scoped. Same pattern as Teacher portal Akun group.
- **Single Pendaftaran page per portal.** Admission funnel uses smart views (§5.10) per state — `view=calon` (INQUIRY/VISITED/FORM_SUBMITTED), `view=review` (UNDER_REVIEW/REVISION_REQUESTED), `view=approved` (APPROVED/INVOICE_SENT), `view=paid` (PAID/PROMOTED), `view=portal` (AWAITING_MPLS/PORTAL_ACTIVE), `view=drop` (DROPPED/AUTO_DROPPED). Source channels (`/daftar` ONLINE / buku-tamu WALK_IN / REFERRAL) all create Admission rows on the same page; `Admission.source` distinguishes channel. No separate "Calon Siswa" sidebar entry.
- **Detail-tab pattern (§5.4) absorbs workflow children.** GuardianInvitation inline on Guardian (action button + status pill); InitialAssessment inline on Admission detail tab; MplsAttendance inline on MplsCohort; SentraRotation + TeachingDefault + ClassSession inline on ClassSection; SessionTeacher inline on ClassSession; RolePermission inline on Role; UserRole inline on User; AcademicTerm inline on AcademicYear; RaportComment inline on Raport; ParentMeetingAttendance inline on ParentMeeting; PayrollItem + PayrollItemLine inline on PayrollRun; StudentIdentifier + StudentGuardian inline on Student. None get top-level sidebar entries.
- **`finance_officer` cross-domain reads** locked here for back-reference. FO reads: Household (sibling discounts) · Student (invoice context — drift #1) · Guardian (wa.me target — drift #2) · Invoice/Payment/InvoiceReminder · Email/Webhook · payroll · HR roster. FO does NOT read academic entities (PenilaianHarian / Hafalan / Raport / ClassSession / StudentAttendance) — pedagogy never reaches finance per audit-PII discipline.
- **Settings (Pengaturan) writes admin-only.** `A/P` only on every Pengaturan page. `KD` reads where granted but no edits. RBAC catalog (Role / Permission / RolePermission / UserRole) writes admin-only by convention.
- **`PR: OWN_HOUSEHOLD` on Household resolves dashboard-aggregation only — no parent Household page.** §10.7.1 grants parent OWN_HOUSEHOLD read on Household so the parent Beranda dashboard can aggregate sibling-discount rendering, unpaid-invoice grouping, and journal-excerpt sourcing across all kids in the household via a single household-keyed query. No standalone Household page exists in the parent portal sidebar (§10A.3) — Household is a join aggregator, not a browse target. Future v1.1 may surface a `/parent/keluarga` overview if data justifies it; MVP keeps it dashboard-only.

## 10.7 Role × Entity scope matrix

Canonical scope vocabulary used across `lib/entities/*/policy.ts` and §10A:

| Code | Meaning |
|---|---|
| `ALL` | Unrestricted within tenant |
| `OWN_CAMPUS` | Filter by `Employee.campusId` (or `EmployeeCampusAssignment` for cross-campus) |
| `OWN_PROGRAM` | Filter by `Employee` → `TeachingDefault.programId` |
| `OWN_CLASS` | Filter by `ClassSection` where teacher = HOMEROOM/SENTRA/ASSISTANT (`TeachingDefault`) or SUBSTITUTE for the date |
| `OWN_SESSION` | Filter by `ClassSession` where teacher in `SessionTeacher` for the date |
| `OWN_STUDENT` | Filter by `Student` where guardian links via `StudentGuardian` |
| `OWN_HOUSEHOLD` | Filter by `Household` where `Guardian.householdId = SELF.householdId` |
| `SELF` | Row keyed to self (`Employee.userId = SELF` / `Guardian.userId = SELF`) |
| `—` | No read |

Roles (per `06-permissions.ts` seed, §6.2):
`A=admin, P=principal, KD=kadiv, HT=homeroom_teacher, ST=sentra_teacher, AO=admission_officer, FO=finance_officer, PR=parent`.

### 10.7.1 Read-scope matrix

Default action = read. Write deltas in §10.7.2.

| Entity | A | P | KD | HT | ST | AO | FO | PR |
|---|---|---|---|---|---|---|---|---|
| **— Tenancy / Settings —** | | | | | | | | |
| Tenant | SELF | — | — | — | — | — | — | — |
| Campus | ALL | ALL | ALL | OWN_CAMPUS | OWN_CAMPUS | ALL | ALL | OWN_STUDENT.campus |
| Program | ALL | ALL | ALL | ALL | ALL | ALL | ALL | OWN_STUDENT.program |
| AcademicYear | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| AcademicTerm | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| OrgConfig | ALL | ALL | — | — | — | — | — | — |
| Holiday | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL |
| Sentra | ALL | ALL | ALL | ALL | ALL | ALL | — | ALL |
| **— Identity —** | | | | | | | | |
| User | ALL | ALL | OWN_CAMPUS | SELF | SELF | SELF | SELF | SELF |
| Role | ALL | ALL | — | — | — | — | — | — |
| Permission | ALL | ALL | — | — | — | — | — | — |
| RolePermission | ALL | ALL | — | — | — | — | — | — |
| UserRole | ALL | ALL | OWN_CAMPUS | — | — | — | — | — |
| **— People —** | | | | | | | | |
| Student | ALL | ALL | ALL | OWN_CLASS | OWN_CLASS | ALL | ALL | OWN_STUDENT |
| Household | ALL | ALL | ALL | — | — | ALL | ALL | OWN_HOUSEHOLD |
| Guardian | ALL | ALL | ALL | — | — | ALL | ALL | SELF |
| StudentGuardian | ALL | ALL | ALL | OWN_CLASS | — | ALL | ALL | OWN_STUDENT |
| StudentIdentifier | ALL | ALL | ALL | OWN_CLASS | — | ALL | — | OWN_STUDENT |
| GuardianInvitation | ALL | ALL | ALL | — | — | ALL | — | — |
| **— HR —** | | | | | | | | |
| Employee | ALL | ALL | OWN_CAMPUS | — | — | — | ALL | — |
| EmployeeCampusAssignment | ALL | ALL | OWN_CAMPUS | — | — | — | — | — |
| AttendanceRecord | ALL | ALL | OWN_CAMPUS | SELF | SELF | — | ALL | — |
| EmployeeDailyCheckIn | ALL | ALL | OWN_CAMPUS | SELF | SELF | — | ALL | — |
| LeaveRequest | ALL | ALL | OWN_CAMPUS | SELF | SELF | — | ALL | — |
| SubstituteAssignment | ALL | ALL | ALL | OWN_CLASS | — | — | — | — |
| **— Classes / Sessions —** | | | | | | | | |
| ClassSection | ALL | ALL | ALL | OWN_CLASS | OWN_CLASS | — | — | OWN_STUDENT |
| ClassSession | ALL | ALL | ALL | OWN_CLASS | OWN_SESSION | — | — | OWN_STUDENT |
| SessionTeacher | ALL | ALL | ALL | OWN_CLASS | OWN_SESSION | — | — | — |
| TeachingDefault | ALL | ALL | ALL | SELF | SELF | — | — | — |
| SentraRotation | ALL | ALL | ALL | OWN_CLASS | OWN_CLASS | — | — | OWN_STUDENT |
| **— Admission / MPLS —** | | | | | | | | |
| Admission | ALL | ALL | ALL | — | — | ALL | ALL | OWN_STUDENT |
| InitialAssessment | ALL | ALL | ALL | — | — | ALL | — | OWN_STUDENT |
| MplsCohort | ALL | ALL | ALL | OWN_CLASS | — | ALL | — | — |
| MplsMember | ALL | ALL | ALL | OWN_CLASS | — | ALL | — | OWN_STUDENT |
| MplsAttendance | ALL | ALL | ALL | OWN_CLASS | — | ALL | — | OWN_STUDENT |
| **— Enrollment / Attendance —** | | | | | | | | |
| StudentEnrollment | ALL | ALL | ALL | OWN_CLASS | — | ALL | ALL | OWN_STUDENT |
| StudentAttendance | ALL | ALL | ALL | OWN_CLASS | OWN_SESSION | ALL | — | OWN_STUDENT |
| **— Curriculum catalogs —** | | | | | | | | |
| ScoringScale | ALL | ALL | ALL | ALL | ALL | — | — | — |
| CurriculumIndicator | ALL | ALL | ALL | ALL | ALL | — | — | — |
| HafalanItem | ALL | ALL | ALL | ALL | ALL | — | — | ALL |
| RaportSectionTemplate | ALL | ALL | ALL | ALL | ALL | — | — | — |
| **— Assessment / Hafalan —** | | | | | | | | |
| PenilaianHarian | ALL | ALL | ALL | OWN_CLASS | OWN_CLASS | — | — | OWN_STUDENT |
| HafalanProgress | ALL | ALL | ALL | OWN_CLASS | OWN_CLASS | — | — | OWN_STUDENT |
| **— Raport —** | | | | | | | | |
| Raport | ALL | ALL | ALL | OWN_CLASS | — | — | — | OWN_STUDENT (PUBLISHED) |
| RaportComment | ALL | ALL | ALL | OWN_CLASS | — | — | — | OWN_STUDENT (PUBLISHED) |
| **— Finance —** | | | | | | | | |
| FeeComponentDef | ALL | ALL | ALL | — | — | ALL | ALL | — |
| ProgramFeeStructure | ALL | ALL | ALL | — | — | ALL | ALL | — |
| FeeInstallmentScheme | ALL | ALL | ALL | — | — | ALL | ALL | — |
| SiblingDiscountRule | ALL | ALL | ALL | — | — | ALL | ALL | — |
| InvoiceNumberSequence | ALL | ALL | ALL | — | — | ALL | ALL | — |
| StudentIdentifierSequence | ALL | ALL | ALL | — | — | ALL | — | — |
| Invoice | ALL | ALL | ALL | — | — | ALL | ALL | OWN_STUDENT |
| Payment | ALL | ALL | ALL | — | — | ALL | ALL | OWN_STUDENT |
| InvoiceReminder | ALL | ALL | ALL | — | — | ALL | ALL | OWN_STUDENT |
| **— Payroll —** (kepsek lockdown — `P` drops to `—` / SELF) | | | | | | | | |
| SalaryComponentDef | ALL | — | OWN_CAMPUS | — | — | — | ALL | — |
| EmployeeSalaryValue | ALL | SELF | OWN_CAMPUS | SELF | SELF | — | ALL | — |
| PayrollRun | ALL | — | OWN_CAMPUS | — | — | — | ALL | — |
| PayrollItem | ALL | SELF | OWN_CAMPUS | SELF | SELF | — | ALL | — |
| PayrollItemLine | ALL | SELF | OWN_CAMPUS | SELF | SELF | — | ALL | — |
| **— Operational —** | | | | | | | | |
| ParentMeeting | ALL | ALL | ALL | ALL | — | ALL | — | OWN_STUDENT |
| ParentMeetingAttendance | ALL | ALL | ALL | OWN_CLASS | — | ALL | — | OWN_STUDENT |
| AdmissionFile | ALL | ALL | ALL | — | — | ALL | — | OWN_STUDENT |
| **— Foundation —** | | | | | | | | |
| TimelineEvent | ALL | ALL | ALL | OWN_CLASS | OWN_CLASS | ALL | — | OWN_STUDENT |
| FileAsset | ALL | ALL | ALL | OWN_CLASS | OWN_CLASS | ALL | — | OWN_STUDENT (raport_pdf only) |
| AuditLog | ALL | ALL | ALL | — | — | — | — | — |
| ExportJob | ALL | ALL | ALL | — | — | ALL | ALL | — |
| EmailLog | ALL | ALL | ALL | — | — | ALL | ALL | — |
| WebhookEvent | ALL | ALL | ALL | — | — | — | ALL | — |
| **— Regions (public-read) —** | | | | | | | | |
| Province / Regency / District / Village | ALL | ALL | ALL | ALL | ALL | ALL | ALL | ALL |

### 10.7.2 Write-action deltas (create / update / soft_delete / restore)

Default: a role with read scope `S` on entity `E` can create / update at the same scope `S` if `E` is admin-editable. Exceptions:

| Action class | Rule |
|---|---|
| `create` / `update` on people-entities (Student, Guardian, Household, StudentGuardian, StudentIdentifier, GuardianInvitation) | `A/P/KD/AO: ALL`. `HT: OWN_CLASS update` (limited fields per existing policy). PR: SELF on Guardian profile only; no other writes. |
| `create` / `update` on academic catalogs (ScoringScale / CurriculumIndicator / HafalanItem / RaportSectionTemplate / Sentra) | `A/P: ALL` only. Teachers read-only — catalogs are admin-curated. |
| `create` / `update` on PenilaianHarian / HafalanProgress / StudentAttendance | `HT: OWN_CLASS · ST: OWN_CLASS (PenilaianHarian/HafalanProgress) or OWN_SESSION (StudentAttendance)`. Admin write override allowed for corrections. |
| `create` / `update` on Raport | `HT: OWN_CLASS` create + edit DRAFT/IN_REVIEW. `P: ALL` review/publish transition. Parent: comment-only write on PUBLISHED. |
| `create` / `update` on Invoice / Payment / InvoiceReminder | `A/P/FO: ALL`. AO: ALL on Admission-stage invoice (initial fees). HT/ST/PR: read-only. |
| `create` / `update` on payroll (PayrollRun / PayrollItem / EmployeeSalaryValue) | `A/P/FO: ALL` write; `KD: OWN_CAMPUS` read-only review; HT/ST: SELF read on slip. |
| `create` / `update` on Pengaturan group | `A/P: ALL` only (per §10A.4). KD/AO/FO read where matrix grants but no edits. |
| `soft_delete` / `restore` on any soft-deletable entity | `A/P: ALL` only (current policy.ts convention; preserves audit trail discipline). |
| `AuditLog` writes | **Never user-writable.** Append-only via `writeAuditLog` middleware (§4.4 + `audit-pii.md`). Trigger raises P0001 on UPDATE/DELETE for all roles incl. service-role. |
| `TimelineEvent` writes | **Never user-writable.** Emitted via `emitTimelineEvent` middleware (`timeline.md`). Audit→timeline bridge maps SOFT_DELETE/RESTORE automatically. |
| `FileAsset` writes | Created via `/api/upload` route (`storage.md`); status transitions `PENDING_UPLOAD → ACTIVE → FAILED/ORPHANED` system-driven. User write = upload + soft_delete only. |

### 10.7.3 Drift surfaced vs already-shipped policy.ts (5 entities)

This matrix is the **canonical source for every future `lib/entities/*/policy.ts`**. The 5 entity registries shipped in `p2-scaffold-registries` (2026-05-06) diverge from the matrix in three places — all flagged here for fix in the next cycle that touches the relevant policy file. **No fix in this cycle** (doc-only). Drift inventory:

1. **`Student.read`** policy currently lacks `finance_officer: ALL`. Matrix wants it (FO needs Student.firstName/lastName for invoice context + wa.me deep link). Fix lands in `p3-fee-foundation` when finance reads first cross-domain.
2. **`Guardian.read`** policy currently lacks `finance_officer: ALL`. Matrix wants it (FO sends wa.me reminders to guardian phone). Same cycle as drift #1.
3. **`GuardianInvitation.read`** policy currently grants `parent: OWN_STUDENT`. Matrix removes parent read entirely (post-activation parents have no need to read pending invitations; pre-activation parents access via token URL, not through portal). Fix lands in next entity audit cycle (low priority — no surface mounts the page yet).
4. **`Guardian.read` `HT: OWN_CLASS`** — matrix grants homeroom_teacher OWN_CLASS read on Guardian, but `lib/entities/guardian/policy.ts` omits homeroom_teacher entirely (admin/principal/kadiv/admission_officer/parent only). Resolution: **matrix is too broad**; teachers reach guardian context via Student detail's Wali tab (§5.4 detail anatomy + detail-tab pattern in §10A.4), not a direct Guardian list page. Teacher portal has no Guardian sidebar entry per §10A.2. Fix is to **drop HT from matrix Guardian row** in this cycle (matrix-side correction since policy.ts is the conservative source) — tracked here so the §10.7.1 Guardian row read `A/P/KD: ALL · AO: ALL · FO: ALL · PR: SELF` (no HT cell). Already corrected inline in §10.7.1 above.

Drift items that are **policy.ts correct and matrix wrong** (drift #4 above is the first instance). When future cycles hit such a case, update this matrix in the same PR — drift in either direction is a bug.

## 11. Sprint Plan — 8 weeks (honest)

Reviewer flagged 7-week plan = actually 8.5-9 weeks of work. Committing to 8 weeks honest. Phase 0 hard-delete folded into W1 day 1. Buffer week real, not optimistic.

| Week | Focus | Deliverables |
|---|---|---|
| W1 day 1 | **Phase 0 — Hard delete** | Single cycle: nuke domain code (app/admin, app/teacher, app/parent, seed.ts, schema domain models, validators, e2e specs). Tag v1 backup. Greenfield-ready repo. |
| W1 days 2-7 | Foundation + Schema | All migrations 00-19, seeds 00-12 (regions, programs, sentra, etc.), RLS, JWT hook, scaffold engine skeleton + 15 renderers, Google OAuth flow, Supabase Storage setup, audit redactor + write middleware, timeline event registry + emit middleware, file upload pipeline (`/api/upload` + sharp), region SQL seed. CI scaffold-check passing. **Phase 1 ran 10 cycles, not 7** — `p1-audit-timeline-files` and `p1-scaffold-engine-skeleton` each split mid-execution per §18.2 size cap; full per-cycle list in §18.1. |
| W2 | Admin core (admission + people) | Admission funnel state machine + public form + sibling detect + cash/Xendit + InitialAssessment + MPLS + ClassSection + Employee + Sentra + SentraRotation. Admin dashboard skeleton. |
| W3-W3.5 | Admin finance (1.5 weeks) | Port lib/xendit + lib/payroll + lib/finance. **Installment generator** (FeeInstallmentScheme + SiblingDiscountRule + on-enrollment effect). **Xendit auto-regen cron** + status-flip cron (OVERDUE/EXPIRED). **Cash payment recording** + partial payment flow. Tunggakan view + manual regen button + wa.me link templates. Payroll. |
| W3.5-W4 | Import wizard | Student/Guardian XLSX import. Phone/name normalizers + dedup heuristic. Income free-text parser. Audit batched. |
| W4-W5 | Teacher portal | Class attendance grid + Penilaian Harian per Sentra (SM/BM grid) + Hafalan tracker (4-track simple acquire UI) + Buku Penghubung (single timeline) + ClassSession materializer. Manual web check-in. |
| W5-W6 | Parent portal + Raport | Parent dashboard (Hijri greeting, kid card, invoice, journal excerpt) + Invoice list + Xendit pay + Onboarding checklist + Invitation flow (Google OAuth activation) + Raport inline editor (per section, autosave, auto-pull facts) + PDF compose async via pg-boss + Sign-off chain (DRAFT→IN_REVIEW→PUBLISHED) + Parent comment per term. |
| W7 | Polish + flesh-out | Slip absorption, edge cases, mobile responsive pass, parent forced-activation enforcement (invoice-only-portal, raport-only-portal, printed MPLS guide), DR runbook full, parent comms plan w/ Kepsek |
| W8 | UAT + cutover + launch | Full 20-step pre-launch checklist, **upgrade Vercel + Supabase Pro tiers**, data import dry-run + cutover, walas + admin pilot, load test, bug fix list, soft-launch w/ 5+1+5 cohort, full launch |

**Soft launch:** end-W7 / start-W8. **Full launch: early-mid July 2026** (school TA mid-July → 1-2 weeks settling buffer post-paid-tier-upgrade).

## 12. Risks + Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Solo dev burnout | High | High | 7-week ceiling enforced, daily commit cadence, weekly reflection |
| Xendit integration regression after port | Medium | High | Keep `lib/xendit/*` mostly intact, port w/ test suite, smoke test in W3 |
| Supabase JWT custom claim hook fragile | Medium | High | Document setup runbook, health check on app boot, fallback to app-layer tenant check |
| Data import edge cases (130 dirty Excel rows) | High | Medium | Build validate-only "dry run" mode first, fix XLSX issues w/ admin before commit |
| Parent low adoption (low tech savvy) | Medium | High | Admin can fill on parent's behalf, WA grup remains primary, optional adoption |
| Walas penilaian UX too complex | Medium | High | Walas pilot W4 end, iterate before launch |
| Sentra rotation misconfig at TA start | Medium | Medium | Admin pre-fills SentraRotation in W6, validate by walas |
| RLS hole via developer bug | Low | Critical | CI script verify-rls-coverage.sh, REVOKE explicit, code review on every route |
| PII leak via audit log | Low | Critical | Schema `/// @PII` annotations, redactor wrapped, audit log fixture tests |
| MPLS placement bottleneck | Medium | Low | Drag-drop w/ capacity warn, can defer to admin if not ready |
| Raport PDF render slow at term close | Low | Medium | Async via pg-boss, render in batches w/ retry |

## 13. Open Questions (lock BEFORE phase 0 — blocking)

🔴 Reviewer flagged: must resolve before phase 0 PR opens. 2-hour stakeholder interview can knock out all 6.

- **Sentra rotation source** — admin defines weekly, OR auto-rotate from week-of-month? Blocks `p1-employees-classes-sentra` + `p5-class-session-materializer`.
- **Akta Kelahiran upload** — mandatory at admission OR Phase 2 OK? Blocks `p2-admission-funnel`.
- **AISM singkatan** — full name? Blocks roster display labels.
- **Pilar Karakter master list** — how many total, when introduced per pekan? Blocks p1-pilar seed.
- **Kepala approval scope** — does walas need formal Kepsek approval or just informational? Blocks p6 raport sign-off chain.
- **Buku penghubung daily template** — walas wants pre-filled "today's topic" or blank? Blocks p5 buku-penghubung cycle.
- **Parent dispute path on raport** — informational comment only, OR `DISPUTED` status w/ walas-acknowledge transition? Blocks p6 raport flow design.

## 14. Success Metrics

Track at launch + 30/60/90 day post:

| Metric | Target |
|---|---|
| Manual processes replaced | ≥15 of 35 (49% full coverage) |
| Walas hours saved per term | ~70h/walas (raport + penilaian + hafalan + attendance) |
| Admin admission processing time | < 5 min per applicant (vs ~30 min paper) |
| Parent portal activation rate | > 80% within 14 days of invitation |
| Admin NPS | ≥ 50 |
| Walas NPS | ≥ 40 |
| Parent NPS | ≥ 30 |
| Critical bug count post-launch | < 5 in week 1 |
| RLS / auth incident | 0 |

## 15. Future v1.1+ (Aug 2026 onward)

Phase 2 enables:
- AdminUI for soft customization (custom fields, workflow editor, etc.)
- AI story compiler (per-student timeline narrative)
- Lomba module + AKSERA scoring
- Events module (Jambore, Fest, MABIT, PHBI, Manasik)
- Referral / Be Our Ambassador
- Yayasan reporting dashboard
- Fingerprint CSV import + multi-campus rotation
- Teacher photo upload + media bin + parent timeline
- Per-week hafalan tracking
- Rubric-driven raport AI compose (refines walas's draft)
- Parent meeting calendar + RSVP
- Yearbook auto-compile per kelas per year

Phase 3+ (multi-tenant, alumni tracking, public APIs).

> **Pengaturan > Jam Kerja v1.1 extension.** MVP wires a single `OrgConfig`-backed page (work-time fields per §4.1 reconciliation footnote). v1.1 extends with admin-extensible per-staff schedule (shift rotation, per-day overrides, per-campus working days, holiday calendar integration deeper than the current `Holiday` join). Yayasan reporting dashboard, Events module, Referral / Be Our Ambassador all remain v1.1 — no MVP entities; CSV export covers admin-side yayasan reporting per §10.1.

## 16. Operations

### 16.1 Hosting

**Dev tier (W1-W7):**
- Vercel free tier: 60s function timeout, 1 cron/day limit, no Analytics
- Supabase free tier: 500MB DB, 1GB Storage, no daily backup, no PITR
- Manual backup: weekly `pg_dump` to local archive during dev

**Launch tier (W8 cutover):**
- Vercel Pro **$25/mo**: cron > 60s, Analytics, longer build times
- Supabase Pro **$25/mo**: daily managed backup + PITR 7d, larger DB + Storage
- **Total $50/mo locked at launch**, NOT during dev

**Workarounds during dev (free tier):**
- Cron > 60s: implement w/ pg-boss in-process, run synchronously via test endpoint during dev. Switch to Vercel cron at W8.
- Daily backup: weekly manual `pg_dump` in W1-W7. Automated only at W8.
- Storage > 1GB: cap test fixtures small. Production load only at W8.
- DB > 500MB: prune dev DB weekly. Real student data only at W8 cutover.

**Cron alternative (worth considering):** Supabase `pg_cron` extension (DB-side scheduled functions). Survives free tier limits since runs in Postgres, not Vercel. Trade-off: less observability vs Vercel logs. Worth POC in p3.

- **File storage**: Supabase Storage (~20 GB/year compressed images at full prod, ~$0.50/month over Pro included)
- **Queue**: pg-boss runs in-process on Vercel (paid tier W8+) — same DB schema

### 16.1a Cron job inventory

| Job | Frequency | Purpose |
|---|---|---|
| `invoice.auto_regen_xendit_session` | hourly | Extend Xendit URL for ISSUED invoices nearing expiry, while dueDate not passed |
| `invoice.flip_overdue` | daily 00:30 | ISSUED + dueDate < now → OVERDUE |
| `invoice.flip_expired` | daily 01:00 | OVERDUE + xenditSessionExpiresAt < now → EXPIRED |
| `invoice.generate_monthly_spp` | monthly 1st @ 03:00 | Create SPP invoices per active enrollment for current month |
| `audit.retention_cleanup` | daily 02:00 | Delete AuditLog rows past `retentionUntil` (7-yr default) |
| `file_asset.orphan_cleanup` | daily 03:00 | Delete PENDING_UPLOAD files > 24h, mark orphaned files past 7-day grace |
| `class_session.materialize_week` | weekly Sun 22:00 | Generate next-week ClassSession rows from TeachingDefault + SentraRotation |
| `raport.generate_pdf` | on-demand (queue) | Renders raport PDF on `IN_REVIEW → PUBLISHED` transition |
| `export_job.process` | on-demand (queue) | Async XLSX/PDF export rendering |
| `region.refresh` (deferred v1.1) | quarterly | Pull idn-area-data updates from Kemendagri |

**Cron reliability:**
- pg-boss `retryLimit: 3` per job + exponential backoff
- Failed-job alert via Sentry (not just log)
- Solo dev cannot watch 10 cron logs — alerts mandatory
- `monthly_spp` failure on the 1st cannot silently skip month — needs alert + manual idempotent re-run
- DLQ pattern: failed jobs persist in pg-boss table 7 days, admin /admin/_cron/status page shows queue health (deferred MVP, log-only for now)

### 16.2 Local dev

- Postgres via `docker compose up postgres` (NOT SQLite — Prisma 7 multi-schema + RLS need real Postgres)
- `npm run db:reset` script: drops + applies all migrations + seeds
- `npm run scaffold:check` validates entity registry
- Demo-mode auth (cookie) for local testing without Supabase

### 16.3 Testing strategy

| Layer | Tool | Coverage |
|---|---|---|
| Unit (lib) | Vitest | `lib/payroll/*`, `lib/finance/*`, `lib/audit/redactor.ts`, scaffold helpers |
| Integration (DB + permissions) | Vitest + ephemeral Postgres in CI | RLS policy assertions, NIS allocator concurrency, tenant-match composite FK |
| Migration tests | Per `prisma/migrations/__tests__/*.test.ts` | Each migration applied to fresh DB, post-condition asserted |
| E2E | Playwright (Chromium-only, demo-mode auth) | Admin admission flow, walas penilaian, parent invoice pay, raport flow |
| Visual diff | Playwright screenshot per portal page | Mobile + desktop viewports |

CI gates per cycle:
- `npm run build && npx vitest run` — between every task (fast)
- `npm run build && npx vitest run && npx playwright test` — end of cycle
- Pure-docs cycles may skip Playwright (record skip in cycle Verification)

### 16.4 Observability

- **Error tracking**: Sentry (Vercel integration, free tier)
- **App logs**: Vercel structured logs + Supabase logs
- **Audit trail**: in-DB AuditLog (immutable)
- **Performance**: Vercel Analytics (built-in)
- **Telemetry for success metrics**:
  - Walas raport time-on-task: `Raport.createdAt` → `Raport.publishedAt` per kid per term
  - Admin admission time: `Admission.createdAt` (FORM_SUBMITTED) → `Admission.promotedAt`
  - Parent portal activation: `GuardianInvitation.consumedAt` - `GuardianInvitation.createdAt`
- **NPS surveys** sent monthly post-launch via Tally / Google Forms (out of system)

### 16.5 Backup + DR

**Dev tier (W1-W7):**
- Weekly manual `pg_dump` to local archive (engineer responsibility)
- File assets snapshot weekly (Supabase Storage CLI)
- No PITR — accept loss tolerance during dev

**Launch tier (W8+):**
- Supabase managed daily backup, 30-day retention
- Point-in-time recovery within 7 days
- File assets: Supabase Storage replicates per region; backup bucket separately
- Audit log: never deleted, append-only, 7-year retention via cron (partitioned monthly)

**DR runbook:** `docs/runbooks/disaster-recovery.md` — STUB drafted in phase 0, fleshed out W7. Covers:
- pg_dump restore steps (free tier baseline)
- Supabase PITR restore (paid tier)
- Vercel deploy rollback
- Sentry incident response
- Comm plan if extended outage

### 16.6 Pre-launch checklist (20 items)

1. Backup current DB if exists
2. Run migrations 00-19 in order
3. Verify schema via Prisma introspect
4. Run seed scripts 00-16
5. Smoke test: log in admin, create test admission, transition through workflow
6. Run permission matrix test (each role × each resource)
7. Verify RLS via anon-key direct PostgREST query
8. Verify pg_advisory_xact_lock allocator (NIS concurrent test)
9. Run `npm run scaffold:check` (every entity validates)
10. Smoke test export job (small CSV)
11. Verify audit redactor (test fixture w/ NIK)
12. Verify pg-boss queue worker running
13. Verify Supabase Storage bucket + signed URL works
14. Verify file retention cron scheduled
15. Verify timeline event emission on test transition
16. Run import dry-run w/ 5-row XLSX
17. Cutover: import full ~130 student XLSX
18. Verify smart views populate correctly per role
19. Backup restore test to fresh project
20. Soft-launch: 5 admin + 1 walas + 5 ortu, gather feedback before full rollout

## 17. Related Specs (per-domain detail when implementing)

This is the **foundation + MVP architecture** spec. Each domain gets dedicated /spec cycle for implementation detail:

- `2026-05-XX-foundation-scaffold-engine.md`
- `2026-05-XX-admission-funnel.md`
- `2026-05-XX-billing-spp-cycle.md`
- `2026-05-XX-curriculum-penilaian-hafalan.md`
- `2026-05-XX-raport-walas-first.md`
- `2026-05-XX-parent-portal.md`

## 18. Execution Plan + Workflow Adjustments

Big task = ~36 cycles over 8 weeks. Existing `/spec → /build → /ship` workflow + CLAUDE.md conventions need adjustments to handle multi-cycle marathon. (Original estimate was ~30/7 weeks; bumped after Phase 1 close — see §18.2 retrospective for the +3 cycles + §11 for the +1 week honest commitment.)

## 18A. Phase Status — shipped cycle ledger

Canonical surface for **what shipped, when, where**. One row per merged-to-staging cycle since v2 rebuild start (2026-05-04). Maintained by `/ship` post-merge (per `.claude/skills/ship/SKILL.md` Step 3) and read by `/spec` Preflight (per `.claude/skills/spec/SKILL.md` ground-truth check) so new sessions cannot draft cycle docs against stale staging tips. Authority split codified in `CLAUDE.md` Documentation Maintenance: this ledger = phase / cycle / sha grain (ship state); `README.md` ADR table = constraint / decision grain (why). Do NOT add a README ADR row for routine cycle merges — only when the cycle introduces a new architecture decision or constraint.

| Phase | Cycle | Slug | Merged | PR | Tip Commit | Status |
|---|---|---|---|---|---|---|
| 0 | hard-delete-domain-code | p0-hard-delete-domain-code | 2026-05-04 | #178 | 52112ee | shipped |
| 1 | extensions-tenancy | p1-extensions-tenancy | 2026-05-05 | #179 | ff55b93 | shipped |
| 1 | identity-rls | p1-identity-rls | 2026-05-05 | #180 | d1857ec | shipped |
| 1 | regions-seed | p1-regions-seed | 2026-05-05 | #181 | fd44713 | shipped |
| 1 | employees-classes-sentra | p1-employees-classes-sentra | 2026-05-05 | #182 | 93a42c6 | shipped |
| 1 | audit-timeline-files | p1-audit-timeline-files | 2026-05-05 | #183 | 371440b | shipped |
| 1 | scaffold-engine-skeleton | p1-scaffold-engine-skeleton | 2026-05-05 | #184 | fc87f31 | shipped |
| 1 | scaffold-renderers | p1-scaffold-renderers | 2026-05-05 | #185 | 21c648a | shipped |
| 1 | audit-write-middleware | p1-audit-write-middleware | 2026-05-06 | #186 | 1e6405f | shipped |
| 1 | timeline-registry | p1-timeline-registry | 2026-05-06 | #187 | 923ed62 | shipped |
| 1 | upload-route-sharp | p1-upload-route-sharp | 2026-05-06 | #188 | a2cb65b | shipped |
| 1 | spec-sync-phase-1-actual | spec-sync-phase-1-actual | 2026-05-06 | #189 | 22fbac9 | shipped |
| 1 | auth-google-oauth | p1-auth-google-oauth | 2026-05-06 | #190 | b344b4f | shipped |
| 2 | students-guardians-household | p2-students-guardians-household | 2026-05-06 | #191 | 02632e4 | shipped |
| 2 | guardians | p2-guardians | 2026-05-06 | #192 | bd7e661 | shipped |
| 2 | scaffold-registries | p2-scaffold-registries | 2026-05-07 | #193 | dd98ee9 | shipped |
| 2 | spec-rebuild-foundation-rethink | spec-rebuild-foundation-rethink | 2026-05-07 | #194 | f8a289e | shipped |
| 2 | scaffold-pages | p2-scaffold-pages | 2026-05-07 | #196 | ee8e7f2 | shipped |
| 2 | scaffold-pages-guardian-household | p2-scaffold-pages-guardian-household | 2026-05-07 | #198 | ea00b9b | shipped |
| 2 | scaffold-canary | p2-scaffold-canary | 2026-05-07 | #199 | dbb817e | shipped |
| 2 | spec-sync-canary-shipped | p2-spec-sync-canary-shipped | 2026-05-07 | #200 | 11a7933 | shipped |
| 2 | portal-write-widening | p2-portal-write-widening | 2026-05-08 | #206 | 725b7e4 | shipped |
| 2 | portal-shell-sidebar | p2-portal-shell-sidebar | 2026-05-08 | #204 | 805588f | shipped |
| 2 | entity-actions | p2-entity-actions | 2026-05-08 | #202 | 36550c9 | shipped |
| 2 | addresses-idn-chain | p2-addresses-idn-chain | 2026-05-08 | #208 | f8aaaec | shipped |
| 2 | admission-funnel-schema | p2-admission-funnel-schema | 2026-05-08 | #211 | 50bedfe | shipped |

**Notes:**
- **Slug column is the canonical match key.** `/ship` post-merge matches by exact-string equality (case-sensitive); on `status=next` row match → update-in-place; on `status=shipped` match → no-op; on no match → append.
- **PR gap at #195 is intentional.** PR #195 (`hotfix(spec): backend English / labels Indonesian rule`) is OPEN-not-merged at backfill time (verified 2026-05-07 via `gh pr view 195 --json state` → `OPEN`). Ledger only tracks merged-to-staging cycles.
- **Phase 1 ran 13 ledger rows, not 10 cycles.** `spec-sync-phase-1-actual` is a doc-only spec-sync row; the `[ ]→[x]` cycle count in §18.1 narrative remains 10.
- **Phase 2 ledger growth.** §18.1 Phase 2 narrative says ~9 cycles original/post-rethink scope; ledger rows for Phase 2 to-date = 7 shipped + 1 next (`spec-rebuild-foundation-rethink` is a Phase 2 spec-sync sibling).

### 18.1 Cycle decomposition (~36 cycles across 8 phases)

> **Cycle ship state is canonical at §18A Phase Status (above)** — this section retains planning narrative + per-phase cycle decomposition. Update §18.1 prose only when phase scope shifts; row-level status updates happen at §18A.

Phase-by-phase. Each cycle ≤ 2 working days. Cycle naming: `YYYY-MM-DD-p<N>-<slug>` where N = phase number.

#### Phase 0 — Hard delete (W1 day 1, 1 cycle)

🔴 **Hard-delete domain code upfront**, NOT incremental refactor. Avoids "is this old or new?" confusion mid-marathon.

- `p0-hard-delete-domain-code` — single cycle, ≤ 1 day:
  - Delete `app/admin/*`, `app/teacher/*`, `app/parent/*` (all pages)
  - Delete `prisma/seed.ts` (1421 lines)
  - Delete `prisma/schema.prisma` domain models (Tenant + Student + Admission + assessment + journal subset — keep ONLY finance/payroll subset that ports forward)
  - Delete `prisma/migrations/*` history (greenfield migrations)
  - Delete unused `lib/validations/*` (19 files — derive from registry later)
  - Delete `e2e/*` specs (will rewrite per cycle)
  - **Archive UAT reports**: move `docs/uat/reports/2026-04-*.md` and `docs/uat/reports/2026-05-*.md` (8 v1 reports per current git status) → `docs/uat/reports/_archive/v1/` for historical reference
  - **Keep `/uat` mechanism**: skill at `.claude/skills/uat/SKILL.md`, personas at `.claude/personas/{pak-budi,bu-sari,ibu-nur}.md`, reports dir structure unchanged
  - **Keep jobs library** `docs/uat/jobs/{admin,teacher,parent}.md` — evolve per cycle that affects user-facing capability (per existing CLAUDE.md rule)
  - Keep: `lib/xendit/*`, `lib/payroll/*`, `lib/finance/run-bulk-*`, `lib/finance/invoice-numbers.ts`, `lib/hijri.ts`, `lib/api/*`, `lib/webhook/*`, `lib/auth.ts` (refactored later in p1)
  - Keep: `components/ui/*` (Shadcn), `.claude/standards/design-system.html`, README/CLAUDE.md (update minimal)
  - Keep: `proxy.ts` (will refactor later)
  - Update README.md: add "v2 rebuild in progress" notice + link to foundation spec
  - Update CLAUDE.md: minimal note pointing to foundation spec, full rewrite in subsequent cycles
  - Reset `prisma/schema.prisma` to skeleton (Tenant model only, plus finance models port-ready)
  - Initial migration `00_extensions` placeholder
  - Verify: `npm run build` still passes (only finance lib remains active), `npx prisma migrate reset` works
  - PR title: `feat(rebuild): cycle 0 — hard delete domain code, prepare greenfield`

**Why upfront vs incremental:**
- Solo dev needs clear "before/after" boundary
- New schema must drop old tables — easier in fresh migration history vs replacing existing
- Avoids weeks of "is this old or new code?" confusion
- Phase 1+ starts on truly clean slate
- Single revertable PR if something goes wrong

**Risk: PR breaks staging in flight.** Mitigate: do this cycle when no other work in progress on staging. Coordinate w/ existing v1 stakeholders if any.

**Backup before delete (blocking PR checks):**
- [ ] `pg_dump` of staging DB → stored offline (not just git tag)
- [ ] Tag v1 staging branch: `git tag v1-final-2026-05-04 && git push origin v1-final-2026-05-04`
- [ ] No active v1 admin sessions during cutover (check Vercel logs last 24h)
- [ ] Vercel deploy of phase-0 PR scheduled outside school hours
- [ ] `lib/finance/run-bulk-*` test suite green against gutted schema (port subset)
- [ ] Rollback plan rehearsed locally: `git revert` + `prisma migrate reset` + restore `pg_dump` — TESTED before merge

#### Phase 1 — Foundation (W1, ~10 cycles — 9 shipped, 1 pending)

Original plan was 7 cycles; the `p1-audit-timeline-files` and `p1-scaffold-engine-skeleton` parents both hit the §18.2 per-cycle scope cap (≤25 staged files / ≤2 days) and were split mid-execution. Split rationale captured in each parent's Ship Notes; the four downstream cycles below all branched off the cycle-6 deferral chain.

- [x] `p1-extensions-tenancy` (2026-05-04) — migrations 00 + 01 (extensions, Tenant, Campus, Program, AcademicYear, AcademicTerm) + seeds 00-04
- [x] `p1-identity-rls` (2026-05-05) — migration 02 (User, Role, Permission, UserRole + composite FK + RLS policies + verify-rls-coverage extended) + seed 05-06 + JWT hook
- [x] `p1-regions-seed` (2026-05-05) — migration 09 (idn-area-data tables) + 01-regions.sql large seed
- [x] `p1-employees-classes-sentra` (2026-05-05) — migrations 03-05 (Employee, ClassSection, Sentra, SentraRotation, ClassSession + SessionTeacher) + seeds 07
- [x] `p1-audit-timeline-files` (2026-05-05) — migrations 06 + 16 schemas only (AuditLog, TimelineEvent, FileAsset, ExportJob) + Supabase Storage runbook + redactor generator. Storage runtime + sharp pipeline + `writeAuditLog` runtime + timeline emit middleware split into the 4 cycles below per §18.2 cap.
- [x] `p1-scaffold-engine-skeleton` (2026-05-05) — `lib/scaffold/*` engine + 1/15 field renderers (TEXT placeholder) + permission resolver w/ scope cache + format helpers + override hatch + `scaffold-check` CLI. Remaining 14 renderers split into the cycle below.
- [x] `p1-scaffold-renderers` (2026-05-05) — 14 of 15 field renderer impls completing the registry (`textarea/number/decimal/currency/date/datetime/boolean/select/multiselect/email/phone/relation/file/enum`); split from `p1-scaffold-engine-skeleton` per §18.2 cap.
- [x] `p1-audit-write-middleware` (2026-05-05) — `lib/audit/write.ts` `writeAuditLog` runtime + opt-in `audit?` config on `defineAction` + `audit-pii.md` standards + `verify-pii-annotations.sh` CI gate; split from `p1-audit-timeline-files` per §18.2 cap.
- [x] `p1-timeline-registry` (2026-05-06) — `TIMELINE_EVENTS` registry (8 seed kinds) + `emitTimelineEvent` middleware + audit→timeline SOFT_DELETE/RESTORE bridge + `timeline.md` standards; split from `p1-audit-timeline-files` per §18.2 cap.
- [x] `p1-upload-route-sharp` (2026-05-06) — `POST /api/upload` route + sharp compression pipeline + Supabase Storage wrapper + minimal `lib/auth/session.ts` `getSession()` shim + `storage.md` standards; split from `p1-audit-timeline-files` + `p1-scaffold-engine-skeleton` per §18.2 cap (final cycle-6 deferral, marks Phase 1 runtime-complete pending auth).
- [ ] `p1-auth-google-oauth` — Supabase Google OAuth flow refactor (split `lib/auth.ts`), session middleware (replace `proxy.ts`), demo-mode cookie write helper, extends the `lib/auth/session.ts` shim from `p1-upload-route-sharp` with the full callback. Until this ships, `/api/upload` 401s real callers (acceptable: no real upload UI mounted yet).

Deliverable end-W1: foundation green, scaffold-check passes, dev server boots, anonymous user blocked, authenticated user sees empty admin shell. **Status:** 9/10 shipped; awaiting `p1-auth-google-oauth` to close the auth surface.

#### Phase 2 — Admin core: people + admission (W2, ~9 cycles — 3 shipped, 6 pending)

Original plan was 5 cycles. Phase 2 grew +4 from 5 → 9 because: (a) `p2-students-guardians-household` hit the §18.2 cap and split into people-tier + guardian-tier (`p2-guardians`); (b) `p2-scaffold-registries` was added as a new lib/entities ratchet cycle (not in original §18.1) when the entity-registry pattern locked from `p1-scaffold-engine-skeleton` needed a dedicated cycle to seed 5 entity registries before scaffold pages mount; (c) `p2-scaffold-pages` was paused mid-/spec for the IA contract this rethink (`spec-rebuild-foundation-rethink`, 2026-05-07) lands; (d) `p2-portal-shell-sidebar` and `p2-scaffold-canary` are new cycles separating sidebar-nav-and-shell concerns from bulk page mounts. Same split-driven-by-cap pattern as Phase 1 (`spec-sync-phase-1-actual`, PR #189).

- [x] `p2-students-guardians-household` (2026-05-06) — migration 07 (Household, Student, StudentIdentifier, StudentIdentifierSequence) + RLS + storage.objects policies + rate limiting. Guardian cluster split into next cycle per §18.2 cap.
- [x] `p2-guardians` (2026-05-06) — migration 08 (Guardian, StudentGuardian, GuardianInvitation) + RLS (6 policies) + composite FK pattern w/ `ON DELETE SET NULL` (Postgres 15.4+) + partial unique on StudentGuardian primary; split from `p2-students-guardians-household` per §18.2 cap.
- [x] `p2-scaffold-registries` (2026-05-06) — 5 entity registries (`student`, `guardian`, `household`, `student-identifier`, `guardian-invitation`) under `lib/entities/*` + entity default-export pattern (4-line page recipe per §5.2) + barrel-import for introspection + consumer pattern sketched (SessionContext widening, fail-closed wrapper, server-action layer). Drift #1-#3 surfaced (FO missing from Student/Guardian read; PR over-broad on GuardianInvitation read) — fix lands in `p3-fee-foundation` + future audit cleanup. **Not in original §18.1**; added as ratchet cycle when entity-registry pattern needed seed-coverage before scaffold pages mount.
- [x] `spec-rebuild-foundation-rethink` (2026-05-07) — doc-only foundation md edits: §10A IA per portal (admin/teacher/parent, lifecycle ordering, Pengaturan-as-system-config), §10.7 role × entity scope matrix (canonical source for future policy.ts), §4.1 reconciliation (`RolePermission` added, Jam Kerja decision, Yayasan/Events/Referral re-confirmed v1.1), §18.1 Phase 2 refresh (this section), §15 v1.1 footnote.
- [ ] `p2-scaffold-canary` — canary-test scaffold output on 1 entity end-to-end before bulk pages. Validates ScaffoldListPage + ScaffoldFormPage + ScaffoldDetailPage rendering against `lib/entities/student/*` + an admin page mount + Playwright visual diff. Locks the renderer-and-policy round-trip before `p2-scaffold-pages` bulk-mounts.
- [ ] `p2-portal-shell-sidebar` — admin / teacher / parent portal shells: sidebar nav per §10A IA (lifecycle-ordered groups + active-state), header, breadcrumbs, role-gated visibility (e.g. payroll subgroup hidden from `principal`). Owns the IA contract from §10A. Mounts before `p2-scaffold-pages` so pages drop into expected groups.
- [ ] `p2-addresses-idn-chain` — migration 10 (Address chain referencing 09_regions PKs, deferred from p1-regions-seed) + cascading dropdown UI. Independent of scaffold pages — can land in parallel.
- [ ] `p2-admission-funnel-schema` — migration 11 (Admission, InitialAssessment, MplsCohort, MplsMember, MplsAttendance + 3 enums) + workflow state-machine library (`lib/admission/state-machine.ts` — pure transition algebra, 8 states / 15 legal edges) + Admission entity registry + minimal scaffold list page. Split from original `p2-admission-funnel` per §18.2 cap (≈30 files full scope > 25 cap). Rationale + split decision recorded in `docs/cycles/2026-05-09-p2-admission-funnel-schema.md`.
- [ ] `p2-admission-funnel-ui` — public form `/daftar` (multi-step) + sibling auto-detect on submit + admin review screen + ACCEPTED side-effect bundle (Household + Student + Guardian creation tx) + MPLS minimal admin UI (cohort list + detail with attendance grid + bulk attendance action) + 3 email templates (admission-submitted / admission-accepted / admission-rejected) + Playwright canary specs (public + admin). Depends on `p2-admission-funnel-schema` (migration + state-machine + Admission entity).
- [ ] `p2-classes-management` — admin pages for ClassSection w/ TeachingDefault + SentraRotation + ClassSession all as detail tabs (§10A.4 detail-tab pattern). Replaces original "Penugasan Walas + Sentra" + "Jadwal Sentra" + "Sesi Kelas" sidebar entries with a single Kelas page.
- [ ] `p2-scaffold-pages` — bulk-mount admin entity pages under expected sidebar groups per §10A.1. List + Form + Detail per entity. Smart views per §5.10 declared in `entity.ts`. Depends on `p2-scaffold-canary` (renderer validated) + `p2-portal-shell-sidebar` (groups exist) + `p2-admission-funnel-schema` + `p2-admission-funnel-ui` + `p2-classes-management` (entity backings present).

Cycle order: `p2-scaffold-canary` → `p2-portal-shell-sidebar` → `p2-addresses-idn-chain` (parallel-safe) → `p2-admission-funnel-schema` → `p2-admission-funnel-ui` → `p2-classes-management` → `p2-scaffold-pages`. **Status:** 3/10 shipped; foundation rethink (4/10) + 6 entity/scaffold cycles pending (admission split adds +1 cycle to phase total).

#### Phase 3 — Admin finance + import (W3-3.5, ~5 cycles)

- `p3-fee-foundation` — migration 14 (FeeComponentDef + frequency + isFamilyShared, ProgramFeeStructure, FeeInstallmentScheme, SiblingDiscountRule) + seeds 13-16 (artifact §A-C-D)
- `p3-invoice-payment-installment` — migration 14 (Invoice + expanded InvoiceStatus, Payment + PaymentMethod) + on-enrollment generate_installments effect + sibling discount apply + parent invoice grouping
- `p3-xendit-port-and-regen` — port lib/xendit/*, auto-regen cron, manual regen button, OVERDUE/EXPIRED status flips
- `p3-cash-payment-flow` — admin cash recording UI + receipt# + partial payment recalculation + Tunggakan view + wa.me link templates
- `p3-payroll-port` — port lib/payroll/* + PayrollRun/Item screens + employee attendance scaffold

#### Phase 4 — Import wizard (W3.5-4 boundary, ~2 cycles)

- `p4-student-import-wizard` — `app/admin/_import/student/page.tsx` + Zod row validation + dedup heuristic (NIK / phone+name fuzzy) + audit batch + dry-run preview
- `p4-import-cutover-utilities` — phone/name normalizers + income parser + Excel scientific-notation guard + manual fix-list UX

#### Phase 5 — Teacher portal (W4-5, ~5 cycles)

- `p5-class-attendance-grid` — StudentAttendance fact table (migration 12) + tap-grid UI + manual web check-in for walas
- `p5-penilaian-harian-grid` — migration 12 extends (PenilaianHarian, ScoringScale, CurriculumIndicator) + scaffold scoring grid (rows × cols × tap SM/BM) + autosave
- `p5-hafalan-tracker` — migration 12 extends (HafalanItem, HafalanProgress) + simple acquire-mark UI + bulk multi-student select + auto-feed raport
- `p5-buku-penghubung-journal` — single-timeline journal w/ template suggestions + parent reply support
- `p5-class-session-materializer` — weekly cron generate ClassSession rows from TeachingDefault + SentraRotation

#### Phase 6 — Parent portal + Raport (W5-6, ~5 cycles)

- `p6-parent-dashboard` — household kid card + Hijri greeting + invoice summary + journal excerpt + onboarding checklist
- `p6-parent-invoice-pay` — invoice list + Xendit redirect + status badges + history
- `p6-portal-invitation-flow` — GuardianInvitation token + activation `/onboarding?token=xxx` + Google OAuth bind
- `p6-raport-inline-editor` — migration 13 (Raport, RaportComment, RaportSectionTemplate seed) + per-section rich text + autosave + auto-pull snapshot at submit
- `p6-raport-pdf-pipeline` — @react-pdf/renderer template + pg-boss queue + PUBLISHED transition + parent download + parent comment

#### Phase 7 — UAT + cutover + buffer (W7, ~3 cycles)

- `p7-pre-launch-checklist` — run all 20 checklist items + load test + restore test + browser compat
- `p7-data-cutover` — full XLSX import dry-run + fix-list pass + commit cutover + audit batch
- `p7-soft-launch-pilot` — 5 admin + 1 walas + 5 ortu pilot, gather feedback, fix critical, prepare full launch

### 18.2 Per-cycle scope rules

Hard caps:
- ≤ 2 working days per cycle
- ≤ 25 staged files per /ship
- ≤ 1 migration per cycle (if migration-bearing)
- 1 cycle = 1 markdown doc in `docs/cycles/`

Cycle types:
- **schema** — Prisma migration + seed only, no UI. Skip Playwright OK (record).
- **service** — `lib/*` only, no UI. Skip Playwright OK.
- **scaffold** — scaffold engine internals. Visual diff via Playwright on simple test entity.
- **page** — admin/teacher/parent feature pages. Full E2E + visual diff required.
- **migration-only** — pure migration extension to existing entity. Skip Playwright.
- **docs** — README/CLAUDE.md alignment. Skip Playwright per CLAUDE.md rule.

Each cycle doc has `## Type` header to declare intent + permitted skips.

**Retrospective (Phase 1 close):** the cap fired twice during Phase 1 — `p1-audit-timeline-files` (cycle 5) and `p1-scaffold-engine-skeleton` (cycle 6) both blew the ≤25-file / ≤2-day budget once their full §18.1 scope was in front of the implementer. Both were split mid-execution into 4 follow-on cycles total (`p1-scaffold-renderers`, `p1-audit-write-middleware`, `p1-timeline-registry`, `p1-upload-route-sharp`) per the deferral chain recorded in each parent's Ship Notes. **This is the cap working as designed, not failing** — surfacing scope creep at the file-count boundary before the implementer commits to a 5-day megacycle is exactly the intent. Future phases should expect 1-2 splits per phase as a normal outcome and budget the cycle count accordingly (Phase 1 nominal 7 → actual 10).

### 18.3 CLAUDE.md adjustments needed

CLAUDE.md predates this rebuild. Edits required (carefully, incremental per cycle, not big-bang):

| Section | Adjustment |
|---|---|
| 3-Step Loop intro | Mention foundation-design spec as parent doc; per-cycle specs reference back |
| Standards table | Add new standards: `scaffold.md` (engine usage), `entity-registry.md` (per-entity directory pattern), `permission-scope.md` (RBAC scope predicates), `audit-pii.md` (`/// @PII` annotation usage). Update `crud.md` to mention scaffold-first |
| File structure | Update `prisma/` to reflect modular seed dir, `lib/scaffold/`, `lib/entities/<name>/` pattern |
| Hooks | Extend pre-commit: assert no Indonesian field names in schema (English camelCase); assert RLS coverage; assert scaffold-check passes if `lib/entities/` touched |
| Testing gates | Add migration-only test target: `npx vitest run --dir prisma/migrations/__tests__` |
| Testing skip rules | Document new types: schema cycles + service cycles can skip Playwright |
| Multi-LLM safety | Unchanged |
| One-file-per-cycle | Unchanged but cycle file naming convention updated to `YYYY-MM-DD-p<N>-<slug>.md` |
| Migration policy | New: only 1 migration per cycle; back-out via new forward migration; CI tests each migration in isolation |

Update CLAUDE.md across phases — small diff per cycle. Don't wipe-and-rewrite.

### 18.4 Standards docs lifecycle

Add new standards files in `.claude/standards/`:

| File | Created when | Owns |
|---|---|---|
| `scaffold.md` | p1-scaffold-engine-skeleton | scaffold engine + permission resolver + format helpers (renderer-side standards landed in the split cycle below) |
| `entity-registry.md` | p1-scaffold-engine-skeleton | per-entity directory contract (schema/entity/policy/events files) |
| `permission-scope.md` | p1-identity-rls | RBAC scope predicates, scope cache, debug view |
| `audit-pii.md` | p1-audit-write-middleware | `/// @PII` annotation usage, redactor generator, retention |
| `timeline.md` | p1-timeline-registry | TimelineEvent registry, emit middleware, audit→timeline bridge, visibility tiers |
| `storage.md` | p1-upload-route-sharp | `/api/upload` route, sharp pipeline, signed URL TTL, FAILED-row semantics, lazy upload trigger, bucket layout |
| `workflow.md` | (post-foundation) | state machine + typed effects pattern |
| `migration.md` | p1-extensions-tenancy | migration order, naming, test pattern, rollback policy |

UAT-related (kept from v1, evolve per cycle):

| File | Lifecycle in v2 |
|---|---|
| `.claude/skills/uat/SKILL.md` | Keep mechanism. Update test thresholds if mid-range Android profile changes. |
| `.claude/personas/{pak-budi,bu-sari,ibu-nur}.md` | Keep. Personas are persona-of-actor, not v1-specific. |
| `docs/uat/jobs/admin.md` | Evolve per p2-* + p3-* + p4-* cycles touching admin |
| `docs/uat/jobs/teacher.md` | Evolve per p5-* cycles |
| `docs/uat/jobs/parent.md` | Evolve per p6-* cycles |
| `docs/uat/reports/_archive/v1/` | NEW — archived v1 UAT reports for historical ref |
| `docs/uat/reports/<2026-Q3+>` | Active dir for v2 UAT runs (created post-launch, mid-W7 onward) |

Existing standards updated:
- `crud.md` — point to scaffold-first, list `_actions/<verb>.tsx` override pattern
- `ui.md` — note scaffold field renderers as canonical
- `patterns.md` — admin/teacher/parent page recipes derived from scaffold
- `voice.md` — unchanged
- `api.md` — REST helpers preserved, mention scaffold permission injection
- `security.md` — extend w/ RLS coverage CI script
- `colors.md` — unchanged
- `design-system.html` — unchanged (canonical)
- `portal.md` — Empty State Contract preserved + scaffold enforces

### 18.5 Branch + merge strategy

- Each cycle = own `feat/p<N>-<slug>` branch off latest `staging`
- /ship opens PR, author watches CI, manual merge
- **Sequential dependency**: foundation cycles (p1-*) must merge before phase 2 starts
- **Parallel-safe within phase**: e.g. `p2-students-guardians-household` and `p2-addresses-idn-chain` can develop in parallel branches if no schema overlap; admin merges in order
- **No long-lived branches** — keep cycles tight to avoid merge conflicts
- **No stacked PRs** — merge p1-A before starting p1-B that depends on it

`scripts/setup-worktree.sh` already supports this. Just execute serially.

### 18.6 Rollback strategy

For each migration cycle, write explicit `down.sql` (locked Section 6 v2). On failure mid-phase:
- Forward-only revert via new migration (don't run down in prod)
- Revert PR via git revert + new migration that undoes schema changes
- Document revert in cycle doc Ship Notes

For UI cycles: just revert PR, no schema impact.

For seed cycles: idempotent + source-flag prevents clobber. Seed always re-runnable.

### 18.7 Tooling improvements

Add to repo:
- `scripts/cycle-new.sh <phase> <slug>` — bootstraps cycle doc + branch + worktree in one command
- `scripts/cycle-ship.sh` — runs end-of-cycle gate + opens PR
- `scripts/db-reset.sh` — drops local DB + applies all migrations + runs seeds (for dev)
- `scripts/scaffold-check.sh` — calls `npm run scaffold:check`
- `scripts/verify-rls-coverage.sh` — extend existing to check REVOKE + policy completeness
- `scripts/verify-pii-annotations.sh` — assert `/// @PII` annotations present on PII fields per registry
- Pre-commit hook: scaffold-check if `lib/entities/` touched

Existing scripts unchanged:
- `scripts/setup-worktree.sh` — works as-is
- `scripts/install-hooks.sh` — extend marker
- `scripts/sync-staging.sh` — works as-is
- `scripts/check-role.sh` — works as-is

### 18.8 Documentation cadence

Per-cycle:
- Cycle doc updated by /build (Implementation + Verification) + /ship (Ship Notes)
- README.md updated when cycle adds module / route / entity (per existing CLAUDE.md commit-msg hook narrow rule)
- CLAUDE.md updated when cycle changes workflow / standards / hooks
- Standards docs updated alongside relevant cycle (e.g. p1-scaffold creates `scaffold.md`)

End-of-phase:
- Phase summary append to README ADR table
- Brief retrospective note appended to phase's last cycle doc Ship Notes
- Reflect on next phase, adjust if needed

End-of-rebuild (W7):
- README full update (modules, routes, entities, ADRs trimmed to last 60d)
- CLAUDE.md final review (workflow stable for v1.1+)
- ADR archive cleanup

### 18.9 Risk per cycle (top 5 watch)

| Cycle | Risk | Watch |
|---|---|---|
| p1-identity-rls | RLS hole if REVOKE misconfigured | Manual anon-key probe + verify-rls-coverage.sh in CI |
| p1-scaffold-engine-skeleton | Over-abstract scaffold blocks future flexibility | Build with 1 sample entity end-to-end before locking |
| p3-invoice-payment-installment | Race on installment generation w/ concurrent admissions | Concurrent test in CI |
| p3-xendit-port-and-regen | Xendit API quirk breaks regen | Smoke test against Xendit demo + production prior to release |
| p4-student-import-wizard | 130 dirty rows fail silently | Dry-run mandatory; admin reviews error list before commit |

### 18.10 Workflow improvements (proposed beyond CLAUDE.md edits)

Beyond per-cycle CLAUDE.md edits, structural improvements worth shipping early in phase 1:

1. **`/cycle-new` slash command** — wraps `cycle-new.sh`. Auto-branches, creates cycle doc skeleton, sets `.claude/session-role`. Eliminates manual setup friction.
2. **Cycle dashboard** — simple `docs/cycles/INDEX.md` updated by `/ship` w/ cycle title + status (open/merged) + PR link. Easy to see phase progress.
3. **Cycle template** — `docs/cycles/_TEMPLATE.md` w/ all 6 sections pre-filled. `/spec` copies as starting point.
4. **Phase boundaries** — see §18.1 above (single source for phase + cycle list + per-cycle checkbox status). Original plan called for a separate `docs/cycles/_PHASES.md` checkbox file; never created. §18.1 with `[x]/[ ]` markers absorbed the role.
5. **Cron monitor** — `/admin/_cron/status` dev-only page showing pg-boss job queue health. Useful during phase 3 when many crons land.
6. **Demo seed split** — modular `demo-seed/` for Playwright fixtures + `prod-seed/` for production. Same data sources, different rendering. Eliminates 20 test skips from current.

These improve developer ergonomics + monitoring visibility during the marathon.

### 18.11 Burnout mitigation (solo dev marathon)

- Hard 7-week ceiling. If slipping, cut features (per §9.2 deferral list) NOT extend timeline.
- Daily commit cadence — at least 1 commit/day, even if WIP. Maintains momentum + audit trail.
- Weekly reflection: end of each week, append 1-paragraph retro to last cycle Ship Notes. What worked / what blocked / what's at risk.
- Sleep + exercise non-negotiable. Tired solo dev ships bugs.
- Pair-debugging via Claude Code subagents for hard problems — don't burn hours alone.
- Buffer week (W7) is real. Don't pack new features into it.

### 18.12 /spec /build /ship cycle adjustments

Existing 3-step loop fits. Marathon needs targeted tweaks:

#### /spec adjustments

**Default flow** (CLAUDE.md):
- Brainstorm rigor (`superpowers:brainstorming`) → write Context/Spec/Tasks → handoff /build

**Marathon flow** (when cycle derives from foundation spec):
- **Skip full brainstorm** — foundation spec is parent doc, decisions already made
- Cycle doc Context section: `Implements §X.Y of [foundation spec](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md)`. 1-paragraph max.
- Spec section: just acceptance criteria specific to this cycle (schema delta / API contract / UI scope)
- Tasks section: ordered atomic tasks, each ≤ 4 hours
- Use `superpowers:writing-plans` lightly — outputs go straight to Tasks list
- Run for cycle: ~30 min instead of ~3 hours

**When to do full brainstorm anyway:**
- New domain not covered by foundation spec (e.g. v1.1 events module)
- Significant scope deviation from foundation
- Open question §13 needs resolving — brainstorm to lock answer

**`/spec` first action** (marathon mode):
1. Check if cycle is in §18.1 phase decomposition. If yes → marathon flow.
2. If no → full brainstorm via `superpowers:brainstorming`.
3. Cycle doc references foundation spec at top either way.

#### /build adjustments per cycle type

| Cycle type | TDD strictness | Verification gate | Notes |
|---|---|---|---|
| **schema** | None — write migration, post-condition test in `__tests__/` | `npx prisma migrate dev && npx vitest run --dir prisma/migrations/__tests__` | Skip Playwright |
| **service** (`lib/*`) | Strict — `superpowers:test-driven-development` | `npm run build && npx vitest run` | Skip Playwright |
| **scaffold** (engine internals) | Strict TDD on logic, visual diff via Playwright on test entity | Both gates | Use 1 sample entity end-to-end |
| **page** (admin/teacher/parent) | Loose — write E2E first, refine UI iteratively | Full gate (build + vitest + Playwright) | Visual diff mandatory |
| **migration-only** | Post-condition test only | Migration test target | Skip Playwright |
| **docs** | None | `markdownlint` only | Skip vitest + Playwright per CLAUDE.md |

`superpowers:test-driven-development` is **flexible per skill type** — schema cycles don't fit TDD, others do.

#### /ship adjustments

Unchanged from CLAUDE.md base flow:
- /ship opens PR `feat/<branch>` → `staging`
- Author watches `gh pr checks <number> --watch`
- Manual merge `gh pr merge <number> --squash --delete-branch` when 3 checks green
- /ship --to-main reserved for staging→main batch promote (every 2-4 cycles)

**Marathon-specific:** at end of each phase, batch staging→main promote via /ship --to-main. Phases 1-7 = 7 staging→main PRs total.

#### Cycle template (`docs/cycles/_TEMPLATE.md`)

Bootstrapped by `scripts/cycle-new.sh`:

```markdown
# <Cycle Title>

**Type:** schema | service | scaffold | page | migration-only | docs
**Phase:** p<N>
**Parent spec:** [foundation-design](../superpowers/specs/2026-05-04-erp-rebuild-foundation-design.md) §<X.Y>

## Context
Implements §<X.Y> of foundation spec. <1-paragraph context.>

## Spec
<Acceptance criteria specific to this cycle.>

## Tasks
- [ ] Task 1 (≤ 4h)
- [ ] Task 2

## Implementation
<Filled by /build per task — files touched, summary.>

## Verification
<Filled by /build — gates passed, manual smoke results.>

## Ship Notes
<Filled by /ship — migrations applied, env vars, rollback plan.>
```

### 18.13 Skill interplay map

How upstream skills compose w/ project commands during marathon. Skills auto-trigger via `using-superpowers` flow (already locked).

| Phase of cycle | Active skills | Notes |
|---|---|---|
| Cycle init | `using-superpowers` (entry) → `using-git-worktrees` (worktree setup via `setup-worktree.sh`) | Auto-triggered |
| /spec marathon-mode | `superpowers:writing-plans` (light) | Skip brainstorming |
| /spec full-mode (new domain) | `superpowers:brainstorming` → `superpowers:writing-plans` | When foundation doesn't cover |
| /build schema cycle | `engineering:architecture` (if ADR needed) | TDD skipped |
| /build service cycle | `superpowers:test-driven-development` (strict) | Test first |
| /build page cycle | `frontend-design:frontend-design` (if greenfield page) → `superpowers:test-driven-development` (loose, E2E first) | Use design-system.html |
| /build complex feature | `superpowers:subagent-driven-development` for parallel sub-tasks | Solo dev still benefits via parallel agents |
| /build verification | `superpowers:verification-before-completion` (mandatory before claiming done) | Always |
| Bug investigation mid-build | `engineering:debug` or `superpowers:systematic-debugging` | Hard stop, root cause |
| End of cycle code review | `feature-dev:code-reviewer` (project-defined agent) + `engineering:code-review` | Both |
| Pre-/ship | `superpowers:requesting-code-review` + `superpowers:finishing-a-development-branch` | Locks state before PR |
| /ship | `engineering:deploy-checklist` (light, since per-cycle) | At staging → main only deep |
| Per-phase end | `engineering:tech-debt` mini-audit + retro paragraph | 30 min, recorded in cycle Ship Notes |
| UAT phase 6/7 | `/uat <area>` standalone command (heuristic Playwright UAT) | Run on parent portal + admin admission flow. v1 reports archived; new reports land in `docs/uat/reports/<YYYY-MM-DD>-<area>.md` post phase 6 |

**Caveman mode interplay:**
- Caveman survives skill invocation (per system reminder: ACTIVE EVERY RESPONSE)
- Skills produce structured output (markdown sections) — caveman applies to prose around them
- Code blocks + commit messages + skill-output structure: untouched by caveman
- Net: caveman saves ~75% tokens during long brainstorm/plan exchanges, no quality loss

**`caveman:caveman-commit` skill:**
- Auto-triggered when committing
- Conventional Commits format, ultra-compressed body
- Use for every cycle commit + Ship PR description
- Pairs w/ existing `prepare-commit-msg` hook (Model-Trailer + Role auto-appended)

**`caveman:caveman-review` skill:**
- Code review comments compressed (location + problem + fix per line)
- Auto-trigger when reviewing PRs via /review or `feature-dev:code-reviewer`

**Anti-patterns to avoid:**
- ❌ Running full `superpowers:brainstorming` on cycles already designed in foundation spec — token waste
- ❌ Strict TDD on schema migrations — write migration + post-condition test
- ❌ Skipping `verification-before-completion` to ship faster — bugs leak to staging
- ❌ Manual code review w/o `feature-dev:code-reviewer` agent — solo dev misses things
- ❌ Skipping `using-git-worktrees` — multi-worktree pollution = lost work risk
- ❌ Multi-cycle in single worktree — merge conflicts cascade

### 18.14 Slash commands inventory (canonical for marathon)

Project-level (CLAUDE.md):
- `/spec` — define + plan (marathon mode auto-detected)
- `/build` — loop tasks, gates, commits
- `/ship` — open PR

Standalone:
- `/uat <area>` — heuristic UAT via Playwright MCP + persona personas (Pak Budi / Bu Sari / Ibu Nur)

Caveman plugin:
- `/caveman:caveman` — toggle caveman mode (default full)
- `/caveman:caveman-commit` — generate compressed commit message
- `/caveman:caveman-review` — compressed PR review
- `/caveman:caveman-help` — quick reference

Engineering plugin:
- `/engineering:architecture` — create ADR
- `/engineering:debug` — structured debugging
- `/engineering:code-review` — review PR/diff
- `/engineering:testing-strategy` — design test approach
- `/engineering:tech-debt` — categorize debt
- `/engineering:incident-response` — incident workflow
- `/engineering:standup` — daily/weekly summary
- `/engineering:deploy-checklist` — pre-deploy verification

Marathon usage frequency:
- High (every cycle): `/spec`, `/build`, `/ship`, `/caveman:caveman-commit`
- Medium (per-phase): `/engineering:architecture`, `/engineering:tech-debt`, `/uat`
- Low (as-needed): `/engineering:debug`, `/engineering:incident-response`

### 18.15 Marathon kickoff checklist

Before **phase 0 cycle 1** (hard delete):

- [ ] Foundation spec locked (this doc) + user approved
- [ ] **Tag v1 backup**: `git tag v1-final-2026-05-04 && git push origin v1-final-2026-05-04` on staging
- [ ] Confirm no v1 in-flight PRs blocking phase 0
- [ ] Caveman mode confirmed active (current session)
- [ ] Superpowers + caveman + engineering plugins all loaded
- [ ] Git hooks installed via `scripts/install-hooks.sh`
- [ ] Worktree pattern confirmed (current session in main checkout, will worktree per cycle)

Phase 0 deliverables:
- [ ] `p0-hard-delete-domain-code` cycle merged
- [ ] `npm run build` passes on greenfield repo (only finance/payroll/auth lib remains)
- [ ] README.md "v2 rebuild in progress" notice
- [ ] CLAUDE.md minimal pointer to foundation spec

Before **phase 1 cycle 1**:
- [ ] Phase 0 merged + verified
- [ ] `scripts/cycle-new.sh` created + tested
- [ ] `docs/cycles/_TEMPLATE.md` created
- [ ] Demo seed split planned

After phase 0 kickoff: invoke `superpowers:writing-plans` skill to produce **Phase 0 cycle (`p0-hard-delete-domain-code`)** implementation plan as first deliverable. Subsequent cycles get own /spec → plan via marathon workflow.

## Appendix A — Why these decisions

- **Greenfield app/, port lib/**: solo dev sprint + 18 critical schema gaps + violated values → refactor cost ≥ rebuild. Preserve mature finance/payroll/auth.
- **Custom scaffold (not Frappe)**: full control + AI-friendly + matches Indonesian school workflow. Frappe = heavy learning curve eats June deadline.
- **Single tenant locked**: solo dev + tight 6-week sprint, multi-tenant infra is post-launch. Schema scalable.
- **Google OAuth only**: simplest, parent-Gmail prevalent, no SMS/OTP cost.
- **wa.me + Bitly QR**: zero WA API cost, admin clicks send (acceptable for ~30 admissions/year burst).
- **Inline raport editor**: walas-first value commitment.
- **PROMES + Modul Ajar stay Drive**: low-value digitize for sprint, walas already has workflow.
- **Word upload for raport REJECTED**: context-switch friction, file management headache, format drift.
- **Phase 1 lite form + Phase 2 portal completion**: lower conversion friction.
- **Sibling silent detect by phone**: no UX friction question.
- **6 weeks accepted (not 5)**: protect quality, school TA mid-July buffer.
- **Extended to 7 weeks for installment + cash + graceful expiry**: artifact §D shows 3-installment scheme + sibling discount tier. Decided to ship full installment + Xendit/cash + auto-regen + partial payment from start (vs MVP-cut to admin-manual generate). Trade: +1 week, but billing system feels complete day 1 — no awkward "phase 2 installment" rollout.
- **Phase 0 hard-delete upfront, NOT incremental refactor**: solo dev needs clear before/after boundary. Avoids weeks of "is this old or new code?" mid-marathon confusion. Single revertable PR if catastrophe. Tag v1 backup before delete.
- **8 weeks honest, not 7 aspirational**: reviewer flagged 7-week plan = ~8.5d work. Committed to 8 weeks. Buffer week (W7 polish + W8 cutover) real, not optimistic. Slip absorption built in.
- **Free tier dev, paid tier at launch**: Vercel + Supabase Pro upgrade at W8 only. Saves ~$300 dev cost. Workarounds: pg-boss in-process during dev, manual weekly `pg_dump`, pg_cron POC for cron > 60s. Functional parity at launch when paid tier kicks in.
- **Forced parent activation: all 3 levers**: invoice-only-via-portal + raport-only-via-portal + printed MPLS guide. Soft launch lenient, full launch enforces. Mitigates portal adoption risk.

---

**End of foundation design spec. Implementation cycles to follow.**
