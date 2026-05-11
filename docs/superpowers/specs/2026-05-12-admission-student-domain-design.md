# Admission + Student Domain Redesign — Design

**Date:** 2026-05-12
**Owner:** ismailir10 (CTO)
**Status:** Approved (brainstorm phase complete; awaiting implementation plan)
**Source artifact:** `artifacts/Data siswa TA 2526-1.xlsx` (gitignored in main checkout) — "Data Awal Tahun" roster for RA An Nisaa' Sekolahku across 13 class sections (DC, TD1-2, KB1/3/4, A1-A4, B1-B4) capturing canonical per-student attributes.

---

## 1. Context

The Admission funnel in Talib captures parents as a single flat record on the `Admission` table (`parentName, parentPhone, parentEmail, parentEducation, parentOccupation, parentIncome`). The xlsx ground truth shows the school actually captures **both Ayah AND Ibu data independently** for every student — each with own NIK, pendidikan, pekerjaan, kantor, penghasilan, telp. The current convert flow at `app/api/admissions/[id]/convert/route.ts` hardcodes `relationship: "WALI"` and creates only one Parent record, losing all ayah/ibu fidelity at the moment a child enters the system. Government compliance (Dapodik) requires NIK Ayah and NIK Ibu separately.

Beyond the parent split, the xlsx reveals four other gaps:

1. **Address granularity** — single `Student.address` string vs xlsx's separate Alamat / Desa/Kelurahan / Kecamatan columns.
2. **Income enum drift** — three divergent definitions across schema (`Parent.incomeRange` doc has `"7-10jt"` typo, `Admission.parentIncome` uses different scale, xlsx uses a fourth).
3. **No CRM funnel reality** — current flat Admission table tries to be both lean inquiry capture AND full registration record. They are different stages with different completeness requirements.
4. **No payment gate** — the current flow can promote admissions to REGISTERED without proof of registration fee paid.

This initiative redesigns the admission domain to mirror the xlsx ground truth, splits inquiry from registration via a child detail table, integrates Xendit payment as a hard gate before admin approval, and introduces a public daftar form so parents self-serve via printed QR code.

### Pain signals from artifact

- 13 separate xlsx tabs (one per class section) means the same student attribute schema is replicated 13× with manual data entry. The 23+ government compliance fields per student are filled by hand each year.
- Ayah and Ibu are tracked symmetrically in xlsx — same 7 columns each (Nama, Pendidikan, Pekerjaan, Nama Kantor, Alamat Kantor, Kota/Kab, Penghasilan) plus separate phone columns (Telp. Ayah / Telp. Ibu). Talib loses one of them at admission.
- Income values are free-text strings like `"Rp 5.000.000 s/d Rp 10.000.000"` and `"> 10.000.000"` and `"> Rp. 10.000.000"` — no canonical key.
- Address granularity stops at Kecamatan in xlsx; no Kabupaten or Provinsi column (implicit from school location = Bekasi, Jawa Barat).
- Files (KTP scans, KK scans) live in physical office folders, not in any ERP.

### Goals and non-goals

**In scope (this initiative):**
- AdmissionApplication (1:1 with Admission) + AdmissionGuardian (1:N) tables capturing full registration data
- Address infrastructure (emsifa dataset, cascading Province → Regency → District → Village picker, denormalized code+name storage)
- Income enum canonical (5 values, xlsx-aligned)
- State machine: INQUIRY → VISITED → APPLIED → PAID → ADMITTED → REGISTERED + CANCELLED terminal
- File uploads: KTP Ayah, KTP Ibu, Kartu Keluarga via Supabase Storage with signed URLs
- Public daftar form at static `/daftar` path (self-derived URL, no env)
- Admin-assisted form inside `/admin/admissions/[id]` detail page (4-phase card layout)
- WhatsApp template helper (`wa.me` links, no server-side send)
- Convert flow rewrite with per-guardian dedup review (NIK-based lookup, admin decides)
- Parent portal invite at REGISTERED with sibling-aware notification
- Documentation update across README.md, CLAUDE.md (none needed), `.claude/standards/crud.md` (state machine table)

**Out of scope (deferred):**
- Akta kelahiran upload (absent from xlsx ground truth; defer to Student edit page post-enrollment)
- Riwayat kesehatan, golongan darah, alergi, foto anak, hobby, cita-cita, kontak darurat, asal sekolah, agama, kewarganegaraan, status hidup ortu, tempat-tanggal-lahir ortu (all absent from artifact — do not invent)
- Sibling discount logic (schema supports via shared Parent; finance rule deferred)
- Refund automation on post-PAID CANCELLED (manual ops via existing Xendit dashboard)
- Real-time co-edit on AdmissionGuardian rows (admin-only post-submit)
- Multi-province expansion (Jabar default in picker; schema allows any province; no tenant-level setting yet)

---

## 2. Spec

### 2.1 State machine (locked)

```
INQUIRY  →  VISITED  →  APPLIED  →  PAID  →  ADMITTED  →  REGISTERED
                ↘             ↘        ↘         ↘
                            CANCELLED (terminal, allowed from any pre-REGISTERED stage)
```

Two entry paths converge at APPLIED:

- **Path A — Public self-serve:** parent scans printed QR (generated externally via Bitly by admin operator) pointing at static `/daftar`, fills RegistrationForm, uploads 3 files, submits. Server creates fresh `Admission` with `status = APPLIED`, `submissionSource = PUBLIC_FORM`.
- **Path B — Admin-initiated:** admin captures `INQUIRY` from a call or WhatsApp inquiry, marks `VISITED` after physical school visit. Two sub-options:
  - **B1:** admin clicks "Kirim Form via WA" → generates `wa.me` link with `sendDaftarForm` template containing the static `/daftar` URL → parent goes to `/daftar` independently → submits → creates a NEW `APPLIED` admission. Server detects phone match against the existing INQUIRY/VISITED row and sets `mergeCandidateId` for admin review.
  - **B2:** admin clicks "Isi Form Sekarang" inside `/admin/admissions/[id]` → RegistrationForm renders inline targeting the existing admission → submit advances status `VISITED → APPLIED` on the same row, `submissionSource = ADMIN_ASSISTED`.

Transition guards (enforced in API layer, not schema):

| Transition | Guard |
|---|---|
| `INQUIRY → VISITED` | Admin manual action only |
| `VISITED → APPLIED` | `AdmissionApplication` row exists; `AdmissionGuardian` rows for **AYAH AND IBU** both exist; 3 file URLs present (`idCardFileUrl` on Ayah + Ibu, `familyCardFileUrl` on Application); all required fields complete per validation schema |
| `APPLIED → PAID` | `registrationInvoiceId` set; linked `Invoice.status = PAID`. Side-effect from Xendit webhook only |
| `PAID → ADMITTED` | Admin manual action; sets `admittedAt`, `admittedById` |
| `ADMITTED → REGISTERED` | Admin convert action commits Student + Parent + StudentGuardian writes in transaction |
| `* → CANCELLED` | Allowed from `INQUIRY`, `VISITED`, `APPLIED`, `PAID`, `ADMITTED`. Reason note required |

Status guard at API: `app/api/admissions/[id]/route.ts` PUT handler rejects invalid transitions with 400 + missing-fields list. `app/api/xendit/webhook/route.ts` adds a branch: if matched `Invoice.admissionId` is set, run `Admission.status = PAID, paidAt = NOW()` under the same transaction that flips the invoice.

### 2.2 Address dataset (locked)

Source: `emsifa/api-wilayah-indonesia` (full Indonesia, 38 provinces / ~514 regencies / ~7200 districts / ~83000 villages). Pinned commit SHA recorded in `lib/address/VERSION.md`. Upgrade via manual run of `scripts/seed-address-dataset.ts`, CTO-gated.

Default province in form picker: `32` Jawa Barat. Schema does not enforce — picker initial state only. Allows expansion without migration.

Delivery: pre-sharded per district to keep page bundle lean.

```
public/address/
  provinces.json                       # 38 rows, 5KB
  regencies.json                       # ~514 rows, grouped by provinceCode, ~50KB
  districts.json                       # ~7200 rows, grouped by regencyCode, ~700KB
  villages/{districtCode}.json         # one file per district, 10-30 villages each, 1-3KB
```

Eager bundle: provinces + regencies + districts (~750KB raw). Lazy fetch: `villages/{districtCode}.json` on district select (CDN-cached). Bundle gate: total `public/address/` raw > 12MB → fail build.

Store on each address-bearing row: `addressLine` (free text — jalan, RT/RW, blok), plus 8 cols: `${prefix}VillageCode/Name`, `${prefix}DistrictCode/Name`, `${prefix}RegencyCode/Name`, `${prefix}ProvinceCode/Name`. Denormalized names protect against dataset version drift; codes (BPS official) protect against rename collisions.

Apply prefix convention to:

| Model | Prefix | Purpose |
|---|---|---|
| `Student` | `address` | Residence |
| `Parent` | `home` | Home address (split from existing `address` field) |
| `Parent` | `employer` | Office address (split from existing `employerAddress` + `employerCity`) |
| `AdmissionApplication` | `residence` | Child's residence (mirrors Student) |
| `AdmissionGuardian` | `employer` | Office address per guardian |

### 2.3 Income enum canonical (locked)

```ts
// lib/constants/income.ts
export const INCOME_RANGES = {
  LT_1M:    "< Rp 1 Juta",
  R_1_3M:   "Rp 1 - 3 Juta",
  R_3_5M:   "Rp 3 - 5 Juta",
  R_5_10M:  "Rp 5 - 10 Juta",
  GT_10M:   "> Rp 10 Juta",
} as const;
export type IncomeRangeKey = keyof typeof INCOME_RANGES;
```

Persist `IncomeRangeKey` (e.g. `R_5_10M`), render label via lookup. Backfill existing free-text via regex mapping table (Section 7.4).

### 2.4 File storage (locked, greenfield)

Bucket `admission-documents` on Supabase Storage. Created via SQL migration `scripts/create-storage-bucket.sql`. RLS policies enforce admin-only direct access; uploads via short-lived signed URLs.

**Allowlist:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`. Max 5MB per file.

**Path convention:**

```
tenant/{tenantId}/admission/{admissionId}/{kind}-{uuid}.{ext}
```

`kind` ∈ `id-card-ayah | id-card-ibu | id-card-wali | family-card`.

**Validation:** never use HTTP HEAD on user-supplied URLs (SSRF vector). Verify uploaded files via Supabase Storage SDK `.list()` / `.info()` calls — authenticated, host-bound, no external request surface.

```
lib/supabase/storage.ts                NEW
  createSignedUploadUrl(path, expires=300)
  createSignedDownloadUrl(path, expires=60)
  deleteFile(path)
  validateUploadedFile(path)           # uses SDK .info, not HTTP HEAD
```

### 2.5 Public daftar form (locked)

Single static URL `/daftar`, no token, no auth. URL self-derived from request host at runtime — no env var, no leak to public repo.

```ts
// lib/constants/urls.ts
export function getDaftarUrl(req?: Request | { headers: Headers }): string {
  if (req) {
    const host = req.headers.get("host") ?? "";
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}/daftar`;
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/daftar`;
  }
  return "/daftar";
}
```

QR generation is **out of band** — operator pastes long URL into Bitly, downloads QR, prints for school office. No Bitly API in repo.

### 2.6 Rate limiting (locked, with caveat)

Public submit and upload routes use existing `lib/rate-limit.ts` in-memory sliding window. **Acknowledged limitation:** in-memory store resets on serverless cold start and does not share across parallel Lambda instances, making the 5/min/IP limit a best-effort dev-mode guard, not a real abuse defense.

**Primary defense:** Vercel WAF rule on `/api/public/admissions/*` (CTO sets up in Vercel project console, no code change). Documented in deploy runbook.

### 2.7 Parent dedup (locked)

| Stage | Lookup | Trigger |
|---|---|---|
| Public daftar POST | **No** NIK lookup (security — public route + NIK probe risk = enumeration attack vector) | Parent retypes data |
| Admin-assisted form | "Cari parent yang sudah ada" button → server lookup by NIK or `phone + name` similarity → admin picks → prefill | Admin click |
| Convert preview | Auto-suggest existing Parent per AdmissionGuardian (NIK exact match preferred; phone + name fallback) | Admin reviews per-guardian decision |

All dedup queries tenant-scoped (`where: { tenantId, ... }`) per `.claude/standards/security.md`.

### 2.8 Parent portal invite (locked)

Triggered at REGISTERED (post-convert success). Admin sees per-guardian checkbox panel:

```
☑ Ayah  Supardi   (supardi@gmail.com)
☑ Ibu   Siti      (siti@gmail.com)
☐ Wali  —         (no email)
[Kirim Undangan]
```

Per checked guardian:
1. Generate Supabase magic link (admin SDK)
2. Send via `wa.me` template `portalInvitation` (admin clicks → WhatsApp Web)
3. Send via email if `email` present (existing `lib/supabase/email-templates/` pattern)
4. Set `Parent.portalInviteSentAt`, `Parent.portalInviteSentBy`
5. AuditLog entry

**Sibling case:** if AdmissionGuardian linked to existing Parent that already has a `User`, skip portal invite; send `childAddedToFamily` notification instead.

**Re-invite:** admin manual click only ("Kirim Ulang Undangan" badge if `Parent.portalInviteSentAt` set + no User activation within 7 days). No automatic re-send.

**Edge — no contact:** if guardian has neither email nor WhatsApp, skip invite, surface warning. Admin generates magic link manually, prints, hands at school.

---

## 3. Data Model

All new tables tenant-scoped (`tenantId` field, indexed). `createdAt` / `updatedAt`. Soft-delete via `deletedAt` per `.claude/standards/crud.md`. Field names English. Enum string values match existing repo convention where applicable (`AYAH | IBU | WALI | OTHER` to align with existing `StudentGuardian.relationship`).

### 3.1 AdmissionApplication

```prisma
model AdmissionApplication {
  id          String   @id @default(cuid())
  tenantId    String
  admissionId String   @unique

  // Child detail
  childNickname     String?
  childBirthPlace   String?
  childNik          String?  // 16 digit
  childKkNumber     String?
  childAnakKe       Int?
  childSaudaraTotal Int?
  childLivingWith   String?  // ORANG_TUA | WALI | LAINNYA

  // Residence (prefix `residence`)
  residenceAddressLine    String?
  residenceVillageCode    String?
  residenceVillageName    String?
  residenceDistrictCode   String?
  residenceDistrictName   String?
  residenceRegencyCode    String?
  residenceRegencyName    String?
  residenceProvinceCode   String?
  residenceProvinceName   String?

  // Family card (KK) upload
  familyCardFileUrl         String?
  familyCardFileMimeType    String?
  familyCardUploadedAt      DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  admission Admission           @relation(fields: [admissionId], references: [id], onDelete: Cascade)
  guardians AdmissionGuardian[]
  tenant    Tenant              @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@unique([tenantId, admissionId])  // tenant-scoped unique seek (per reviewer M4)
  @@index([tenantId])
}
```

### 3.2 AdmissionGuardian

```prisma
model AdmissionGuardian {
  id            String  @id @default(cuid())
  tenantId      String
  applicationId String

  relationship String  // AYAH | IBU | WALI

  // Identity
  name String
  nik  String?

  // Education / work
  education   String?    // SMA | D1-D3 | S1 | S2 | S3 | Profesi
  occupation  String?    // Karyawan Swasta | ASN | Guru | Wiraswasta | BUMN | Ibu Rumah Tangga | Lainnya
  incomeRange String?    // IncomeRangeKey from lib/constants/income.ts

  // Employer (prefix `employer`)
  employerName          String?
  employerAddressLine   String?
  employerVillageCode   String?
  employerVillageName   String?
  employerDistrictCode  String?
  employerDistrictName  String?
  employerRegencyCode   String?
  employerRegencyName   String?
  employerProvinceCode  String?
  employerProvinceName  String?

  // Contact
  phone    String?
  whatsapp String?
  email    String?

  // KTP upload
  idCardFileUrl       String?
  idCardFileMimeType  String?
  idCardUploadedAt    DateTime?

  // Dedup linkage to existing Parent (set by admin during admin-assisted form or convert review)
  parentId String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  application AdmissionApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  parent      Parent?              @relation(fields: [parentId], references: [id], onDelete: SetNull)
  tenant      Tenant               @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@unique([applicationId, relationship])           // one AYAH, one IBU, one WALI max
  @@unique([tenantId, applicationId, relationship]) // tenant-scoped seek (per reviewer M4)
  @@index([tenantId])
  @@index([parentId])
}
```

**P2002 handling:** the `@@unique([applicationId, relationship])` constraint fires on duplicate POST. Convert Prisma error to `{ error: "Data ${relationship} sudah terisi" }` 409. Implementation pattern in `lib/api/prisma-errors.ts` (verify exists or create).

### 3.3 Admission additions

```prisma
// Add to existing Admission model
status                 String   @default("INQUIRY")
// Status enum updated: INQUIRY | VISITED | APPLIED | PAID | ADMITTED | REGISTERED | CANCELLED
// Drops VISIT_SCHEDULED (lean — schedule lives in followUpDate)

mergeCandidateId       String?  // soft reference; no FK (intentional — older admission may be deleted by admin)
submittedAt            DateTime?
submissionSource       String?  // PUBLIC_FORM | ADMIN_ASSISTED
registrationInvoiceId  String?  @unique
paidAt                 DateTime?
admittedAt             DateTime?
admittedById           String?
cancellationReason     String?

application            AdmissionApplication?
registrationInvoice    Invoice?              @relation(fields: [registrationInvoiceId], references: [id], onDelete: SetNull)
```

`mergeCandidateId` is a documented soft reference (per reviewer m2). The convert preview endpoint must handle null gracefully if the referenced admission was deleted.

### 3.4 Invoice additions

```prisma
// Add to existing Invoice model
admissionId String?    // pre-student registration invoice link
studentId   String?    // CHANGED: was String (NOT NULL), now nullable
                       // Invariant: admissionId XOR studentId set (enforced by CHECK constraint or app code)

admission   Admission? @relation(fields: [admissionId], references: [id], onDelete: SetNull)

@@index([admissionId])
```

**Migration:** existing invoices all have `studentId` set; nullable change is safe. New registration invoices have `admissionId` set, `studentId` null. Convert flow does **not** retroactively update old `Invoice` rows — `studentId` stays null on registration invoices forever (audit trail).

CHECK constraint (Postgres):
```sql
ALTER TABLE "Invoice" ADD CONSTRAINT invoice_student_or_admission
  CHECK ((studentId IS NOT NULL) OR (admissionId IS NOT NULL));
```

All existing `Invoice` list/detail queries must add `WHERE studentId IS NOT NULL` if they assume student presence. Audit needed: `app/api/invoices/**/*.ts`, `app/admin/invoices/**`.

### 3.5 Student additions

```prisma
// Add to existing Student model — 9 cols
addressLine          String?  // jalan, RT/RW, blok (replaces semantic role of existing `address`)
addressVillageCode   String?
addressVillageName   String?
addressDistrictCode  String?
addressDistrictName  String?
addressRegencyCode   String?
addressRegencyName   String?
addressProvinceCode  String?  // no default — picker initial state in app layer (per reviewer m3)
addressProvinceName  String?
```

Existing `Student.address` String kept for backward-compat (legacy rows preserved). New edits write `addressLine` and geo cols. Legacy `address` populated in `addressLine` on backfill migration (Section 7.3).

### 3.6 Parent additions

```prisma
// Add to existing Parent model

// Home address (prefix `home`) — splits existing `address` field
homeAddressLine    String?
homeVillageCode    String?
homeVillageName    String?
homeDistrictCode   String?
homeDistrictName   String?
homeRegencyCode    String?
homeRegencyName    String?
homeProvinceCode   String?
homeProvinceName   String?

// Employer (prefix `employer`) — splits existing `employerAddress` + `employerCity`
employerAddressLine     String?
employerVillageCode     String?
employerVillageName     String?
employerDistrictCode    String?
employerDistrictName    String?
employerRegencyCode     String?
employerRegencyName     String?
employerProvinceCode    String?
employerProvinceName    String?

// Portal invite tracking
portalInviteSentAt  DateTime?
portalInviteSentBy  String?    // admin User.id
```

Existing `Parent.address`, `Parent.employerAddress`, `Parent.employerCity` kept for backfill. Deprecated in new UI.

### 3.7 StudentGuardian — no change

Existing model already supports the design: `relationship: AYAH | IBU | WALI | OTHER`, `isPrimary`, `childOrder` all present. Convert flow writes to existing shape.

---

## 4. UI and Routes

### 4.1 Routes

```
/admin/admissions                   existing list page (lean inquiry dialog)
/admin/admissions/[id]              NEW detail page — 4-phase cards
/admin/admissions/[id]/convert      NEW convert review page (per-guardian dedup decisions)

/admin/students/[id]/edit           existing — AddressPicker replaces single `address` textarea
/admin/parents/[id]/edit            existing or new — 2× AddressPicker (home + employer)

/(public)/daftar                    NEW public RegistrationForm
/api/public/admissions/submit       NEW POST — creates APPLIED admission
/api/public/admissions/upload       NEW POST — returns signed upload URL

/api/admissions/[id]                existing PUT — new transition guards
/api/admissions/[id]/application    NEW PUT — upserts AdmissionApplication + guardians
/api/admissions/[id]/generate-invoice  NEW POST — creates registration Invoice via Xendit
/api/admissions/[id]/approve        NEW POST — PAID → ADMITTED
/api/admissions/[id]/reject         NEW POST — * → CANCELLED with reason
/api/admissions/[id]/convert/preview  NEW GET — per-guardian dedup suggestions
/api/admissions/[id]/convert/commit   NEW POST — transactional Student + Parent writes
/api/admissions/[id]/portal-invites   NEW POST — sends portal invites per checked guardian

/api/xendit/webhook                 existing — new branch for Invoice.admissionId
```

### 4.2 Admin detail page — 4-phase layout

`/admin/admissions/[id]` shows 4 cards gated by status:

```
┌─ Phase 1: Visit Info     [✓ DONE if VISITED+ ] ┐
│ Lean inquiry fields editable until APPLIED      │
│ [📱 Undang Kunjungan WA]  (visible at INQUIRY)  │
│ Status: INQUIRY → [Tandai Visited]              │
└─────────────────────────────────────────────────┘

┌─ Phase 2: Daftar Form    [LOCKED until VISITED] ┐
│ Completion: N/14 fields, N/3 files              │
│ [📱 Kirim Form via WA]   sendDaftarForm template │
│ [✏️ Isi Form Sekarang]   admin-assisted inline   │
│ When complete + admin commits → APPLIED         │
│ [➜ Generate Invoice Pendaftaran]                │
└─────────────────────────────────────────────────┘

┌─ Phase 3: Pembayaran     [LOCKED until APPLIED] ┐
│ Invoice INV-...   Status: UNPAID | PAID         │
│ [📱 Kirim Reminder Bayar WA]                    │
│ [🔗 Lihat Xendit]                               │
│ On webhook PAID → auto status PAID              │
└─────────────────────────────────────────────────┘

┌─ Phase 4: Persetujuan    [LOCKED until PAID]    ┐
│ [✓ Terima]  → ADMITTED                          │
│ [✗ Tolak]   → CANCELLED + reason note required  │
│ After ADMITTED:                                 │
│ [🔄 Konversi ke Siswa]  → opens convert review  │
└─────────────────────────────────────────────────┘
```

When `mergeCandidateId` set: shows "Kemungkinan Duplikat" banner with merge/dismiss buttons.

After REGISTERED: "Undangan Portal Orang Tua" panel appears (per-guardian checkbox, "Kirim Undangan" CTA).

### 4.3 RegistrationForm (shared between public daftar and admin-assisted)

Tabbed component: **Anak / Ayah / Ibu / Wali (opsional)**. On mobile, tabs collapse to stacked accordion sections.

```
Anak tab:
  Nama Lengkap*       Nama Panggilan
  L/P*                Tempat Lahir*
  Tanggal Lahir*      NIK Anak* (16 digit, mask)
  No. KK*             Anak ke-*     Dari* (saudara total)
  Tinggal bersama*    [Orang Tua | Wali | Lainnya]
  --- Alamat Tempat Tinggal ---
  <AddressPicker prefix="residence" required />
  --- Dokumen ---
  <FileUploadField kind="family-card" required />

Ayah tab (mandatory):
  Nama*               NIK* (16 digit, mask)
  Pendidikan*         Pekerjaan*
  Penghasilan*        [IncomeRanges dropdown]
  Telp                WhatsApp     Email
  --- Data Kantor ---
  Nama Kantor
  <AddressPicker prefix="employer" />
  --- Dokumen ---
  <FileUploadField kind="id-card-ayah" required />

Ibu tab (mandatory): identical shape to Ayah.

Wali tab (optional, default hidden):
  Hubungan dengan anak
  Same shape as Ayah/Ibu. KTP upload optional.
```

`*` = required for transition `VISITED → APPLIED`. Soft-required: form saves incomplete; transition is the gate.

Autosave per-tab on blur. Submit button "Kirim Pendaftaran" only enabled when all required fields complete.

### 4.4 AddressPicker component

```
components/ui/address-picker.tsx

Props:
  prefix: string                 // residence | employer | home | address
  value: AddressValue            // 9-field shape
  onChange: (v: AddressValue) => void
  required?: boolean

AddressValue = {
  addressLine: string;
  villageCode: string;  villageName: string;
  districtCode: string; districtName: string;
  regencyCode: string;  regencyName: string;
  provinceCode: string; provinceName: string;
}

Layout (top to bottom):
  [Textarea]  Jalan, RT/RW, Blok, No. Rumah     full-width
  [Combobox]  Provinsi     defaults to "32 Jawa Barat"
  [Combobox]  Kab/Kota     filtered by provinceCode; disabled until Provinsi set
  [Combobox]  Kecamatan    filtered by regencyCode
  [Combobox]  Kelurahan    filtered by districtCode (lazy-fetched from public/address/villages/{districtCode}.json)

Cascade reset behavior:
  Province change → reset regency, district, village
  Regency change  → reset district, village
  District change → reset village

Mobile: comboboxes open Sheet bottom (touch-friendly long lists)
Desktop: Popover anchored to trigger
Search: shadcn Command within Popover/Sheet
```

Existing `useIsMobile` hook gates mobile variant. Existing Combobox / Field / FieldLabel components used — no new design tokens.

### 4.5 Sidebar nav — no changes

`/admin/admissions` already in sidebar. New routes nest under it.

---

## 5. APIs

All routes follow `.claude/standards/api.md`. Auth + tenant filter via existing middleware. RLS coverage check (`scripts/verify-rls-coverage.sh`) gates new tables.

### 5.1 Public submit endpoint

`POST /api/public/admissions/submit`

```ts
// Pseudo-flow
1. Rate limit by IP (5/min via lib/rate-limit.ts; primary defense = Vercel WAF)
2. Validate body against RegistrationFormSchema (zod)
3. For each file URL in body:
     await validateUploadedFile(path)  // Supabase SDK .info, never HEAD
     verify MIME in allowlist, size ≤ 5MB
4. Normalize phone (E.164: 08xxx → 628xxx)
5. Tenant resolution: query Tenant WHERE slug = headers.host.split('.')[0]
                     OR default tenant (single-tenant deploy)
6. Phone-match dedup query (tenant-scoped):
     await prisma.admission.findFirst({
       where: { tenantId, status: { in: ["INQUIRY","VISITED"] },
                OR: [{ parentPhone: phone }, { parentWhatsapp: phone }] },
       orderBy: { createdAt: "desc" },
     })
7. Transaction:
     - Create Admission with status=APPLIED, submissionSource=PUBLIC_FORM,
       mergeCandidateId = match?.id ?? null
     - Create AdmissionApplication
     - Create AdmissionGuardian × 2-3
8. AuditLog entry via lib/audit.ts
9. Return { admissionId, mergeAvailable: !!match }
```

### 5.2 Admin transition endpoints

Each transition is its own POST endpoint (not generic PUT). Reasons: clearer audit, narrower validation, easier RLS.

```
POST /api/admissions/[id]/application  upserts AdmissionApplication + guardians; advances VISITED → APPLIED if complete
POST /api/admissions/[id]/generate-invoice  creates Invoice with admissionId set, returns Xendit checkoutUrl
POST /api/admissions/[id]/approve      PAID → ADMITTED
POST /api/admissions/[id]/reject       any pre-REGISTERED → CANCELLED, body { reason }
POST /api/admissions/[id]/convert/preview   returns dedup suggestions
POST /api/admissions/[id]/convert/commit    body { guardianDecisions, primaryGuardianRelationship }
POST /api/admissions/[id]/portal-invites    body { guardianIds: [...] }
POST /api/admissions/[id]/merge        body { keepId, removeId } — merges duplicates from mergeCandidateId banner
```

### 5.3 Xendit webhook branch

`app/api/xendit/webhook/route.ts` adds:

```ts
// After Invoice.status = PAID
if (invoice.admissionId) {
  await tx.admission.update({
    where: { id: invoice.admissionId, status: "APPLIED" },  // status guard prevents race
    data: { status: "PAID", paidAt: new Date() },
  });
  await auditLog({ /* ... */ });
}
```

Status guard `status: "APPLIED"` in the update WHERE protects against race with admin manual transition. If admin already moved status forward (unlikely but possible), update silently no-ops.

---

## 6. Convert Flow

### 6.1 Preview endpoint

`POST /api/admissions/[id]/convert/preview` — returns dry-run plan, no writes.

```ts
1. Load Admission + AdmissionApplication + AdmissionGuardian[] (tenant-scoped)
2. Validate admission.status = ADMITTED, admission.studentId IS NULL
3. For each guardian:
     if (guardian.parentId) {
       action: "LINKED_EXISTING", parent: <Parent>
     } else {
       const matches = await prisma.parent.findMany({
         where: {
           tenantId: admission.tenantId,
           OR: [
             { nik: guardian.nik },
             { AND: [{ phone: guardian.phone }, { name: { contains: firstWord(guardian.name) } }] },
           ],
         },
       });
       if (matches.length === 0) action: "CREATE"
       else if (matches.length === 1) action: "REUSE_SUGGEST", candidate: matches[0]
       else action: "MULTIPLE_MATCH", candidates: matches
     }
4. Return { student: <preview>, guardians: [...] }
```

### 6.2 Commit endpoint

`POST /api/admissions/[id]/convert/commit` body:

```ts
{
  guardianDecisions: [
    { admissionGuardianId, action: "REUSE_EXISTING" | "CREATE_NEW", reusedParentId?: string },
    ...
  ],
  primaryGuardianRelationship: "AYAH" | "IBU" | "WALI",  // default IBU
}
```

Transactional flow:

```ts
await prisma.$transaction(async (tx) => {
  // 1. Re-validate admission state (within tx — prevents TOCTOU)
  const a = await tx.admission.findUnique({
    where: { id, status: "ADMITTED", studentId: null, tenantId: session.tenantId },
    include: { application: { include: { guardians: true } } },
  });
  if (!a) throw new Error("Invalid state");

  // 2. Create Student from AdmissionApplication
  const student = await tx.student.create({
    data: {
      tenantId: a.tenantId,
      name: a.childName,
      nickname: a.application.childNickname,
      dateOfBirth: a.dateOfBirth,
      gender: a.childGender,
      birthPlace: a.application.childBirthPlace,
      nik: a.application.childNik,
      kkNumber: a.application.childKkNumber,
      livingWith: a.application.childLivingWith,
      addressLine: a.application.residenceAddressLine,
      addressVillageCode: a.application.residenceVillageCode,
      addressVillageName: a.application.residenceVillageName,
      addressDistrictCode: a.application.residenceDistrictCode,
      addressDistrictName: a.application.residenceDistrictName,
      addressRegencyCode: a.application.residenceRegencyCode,
      addressRegencyName: a.application.residenceRegencyName,
      addressProvinceCode: a.application.residenceProvinceCode,
      addressProvinceName: a.application.residenceProvinceName,
    },
  });

  // 3. Per guardian: REUSE_EXISTING or CREATE_NEW
  for (const g of a.application.guardians) {
    const decision = body.guardianDecisions.find(d => d.admissionGuardianId === g.id);
    let parentId: string;

    if (decision.action === "REUSE_EXISTING") {
      const existing = await tx.parent.findUnique({
        where: { id: decision.reusedParentId, tenantId: a.tenantId },
      });
      if (!existing) throw new Error("Reused parent not found");
      // Fill-nulls-only pattern (per reviewer M2)
      await tx.parent.update({
        where: { id: existing.id },
        data: {
          nik:                 existing.nik                 ?? g.nik,
          education:           existing.education           ?? g.education,
          occupation:          existing.occupation          ?? g.occupation,
          incomeRange:         existing.incomeRange         ?? g.incomeRange,
          employer:            existing.employer            ?? g.employerName,
          employerAddressLine: existing.employerAddressLine ?? g.employerAddressLine,
          // ... per field, never overwrite non-null existing data
          phone:               existing.phone               ?? g.phone,
          whatsapp:            existing.whatsapp            ?? g.whatsapp,
          email:               existing.email               ?? g.email,
        },
      });
      parentId = existing.id;
    } else {
      const created = await tx.parent.create({
        data: {
          tenantId: a.tenantId,
          name: g.name,
          nik: g.nik,
          phone: g.phone,
          whatsapp: g.whatsapp,
          email: g.email,
          education: g.education,
          occupation: g.occupation,
          incomeRange: g.incomeRange,
          employer: g.employerName,
          employerAddressLine: g.employerAddressLine,
          employerVillageCode: g.employerVillageCode,
          // ... full geo cols
          homeAddressLine: a.application.residenceAddressLine,  // default parent home = child residence
          homeVillageCode: a.application.residenceVillageCode,
          // ... full geo cols
        },
      });
      parentId = created.id;
    }

    // Set AdmissionGuardian.parentId for audit trail
    await tx.admissionGuardian.update({
      where: { id: g.id },
      data: { parentId },
    });

    // Create StudentGuardian
    await tx.studentGuardian.create({
      data: {
        studentId: student.id,
        parentId,
        relationship: g.relationship,
        isPrimary: g.relationship === body.primaryGuardianRelationship,
        childOrder: a.application.childAnakKe,
      },
    });
  }

  // 4. Update Admission
  await tx.admission.update({
    where: { id: a.id },
    data: { studentId: student.id, status: "REGISTERED" },
  });

  return { student };
});
```

**Idempotency:** `where: { id, status: "ADMITTED", studentId: null }` in step 1 makes the entire flow safe to retry — second invocation returns "Invalid state" with no writes. AuditLog entry per Parent mutation.

**Legacy fallback:** if admission has no `AdmissionApplication` row (pre-migration data), fall back to existing single-WALI flow with deprecation log. 90-day window then remove fallback path.

### 6.3 Convert review UI

`/admin/admissions/[id]/convert` — step-by-step page:

```
Step 1: Preview Anak data (read-only summary card)
Step 2: Per guardian — 3 cards (Ayah, Ibu, optional Wali)
  Each card shows:
    [Action: REUSE existing | CREATE new | PICK_OTHER]
    REUSE → existing Parent name + NIK + linked student count
    CREATE → new Parent data preview
    PICK_OTHER → searchable combobox by name/NIK
Step 3: Pick primary contact for billing (default IBU)
Step 4: [Confirm + Konversi]
```

### 6.4 Sibling discount eligibility

Schema after convert: shared Parent → multiple StudentGuardian rows queryable. Finance can compute:

```ts
const siblingCount = await prisma.studentGuardian.count({
  where: {
    parentId: primaryParentId,
    studentId: { not: thisStudentId },
    status: "ACTIVE",
    student: { status: "ACTIVE" },
  },
});
```

Discount **logic** out of scope this initiative. Schema enables it.

---

## 7. Migration Plan

### 7.1 Migration order

```
N+1: add_address_geo_cols_to_student_parent.sql
  - ALTER Student ADD addressLine, address{Village,District,Regency,Province}{Code,Name}
  - ALTER Parent ADD home* (9 cols), employer{AddressLine,VillageCode,VillageName,DistrictCode,DistrictName,RegencyCode,RegencyName,ProvinceCode,ProvinceName}
  - ALTER Parent ADD portalInviteSentAt, portalInviteSentBy
  - All nullable. No data change. Fully reversible.

N+2: create_admission_application_and_guardian.sql
  - CREATE TABLE AdmissionApplication + indexes
  - CREATE TABLE AdmissionGuardian + indexes
  - ALTER Admission ADD mergeCandidateId, submittedAt, submissionSource,
                        registrationInvoiceId UNIQUE, paidAt, admittedAt,
                        admittedById, cancellationReason
  - ALTER Admission DROP value 'VISIT_SCHEDULED' from status enum (data migration: SET status='INQUIRY' WHERE status='VISIT_SCHEDULED' — should be zero rows in practice)
  - ALTER Admission status: add new enum values APPLIED, PAID
  - No data backfill of existing rows into new tables.

N+3: alter_invoice_for_admission_link.sql
  - ALTER Invoice ALTER COLUMN studentId DROP NOT NULL
  - ALTER Invoice ADD admissionId STRING NULLABLE + FK
  - ADD CHECK constraint: studentId IS NOT NULL OR admissionId IS NOT NULL
  - CREATE INDEX on admissionId

N+4: backfill_address_line_from_existing.sql
  - UPDATE Student SET addressLine = address WHERE address IS NOT NULL AND addressLine IS NULL
  - UPDATE Parent  SET homeAddressLine = address WHERE address IS NOT NULL AND homeAddressLine IS NULL
  - UPDATE Parent  SET employerAddressLine = employerAddress WHERE employerAddress IS NOT NULL AND employerAddressLine IS NULL
  - Geo cols left null. Admin upgrades on edit.

N+5: create_storage_bucket.sql
  - INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit) VALUES ('admission-documents', 'admission-documents', false, ARRAY['image/jpeg','image/png','image/webp','application/pdf'], 5242880)
  - CREATE POLICY for SELECT, INSERT, DELETE per .claude/standards/security.md

N+6: canonicalize_income_range.ts (server script, not raw SQL — regex mapping is lossy)
  - lib/scripts/canonicalize-income.ts
  - Maps existing free-text Parent.incomeRange, Admission.parentIncome via regex table
  - Unmappable → null + log row id to AuditLog
  - Run manually via npm run script after N+1..N+5 deploy
```

### 7.2 Income mapping table

```ts
const MAP: Array<[RegExp, keyof typeof INCOME_RANGES]> = [
  [/^<\s*(rp\.?\s*)?1\s*(juta|jt|000\.?000)/i,                              "LT_1M"],
  [/^(rp\.?\s*)?1[\s\.-]+3\s*(juta|jt)|1[\.\s]?000[\.\s]?000\s*s\/d\s*3/i,  "R_1_3M"],
  [/^(rp\.?\s*)?3[\s\.-]+5\s*(juta|jt)|3[\.\s]?000[\.\s]?000\s*s\/d\s*5/i,  "R_3_5M"],
  [/^(rp\.?\s*)?5[\s\.-]+10\s*(juta|jt)|5[\.\s]?000[\.\s]?000\s*s\/d\s*10/i,"R_5_10M"],
  [/^>\s*(rp\.?\s*)?10\s*(juta|jt)|>\s*10[\.\s]?000[\.\s]?000/i,            "GT_10M"],
];
```

### 7.3 Legacy Admission row treatment

| Pre-migration status | Behavior post-migration |
|---|---|
| INQUIRY, VISITED, CANCELLED, REGISTERED | Untouched. Flat parent fields stay. No AdmissionApplication created retroactively. |
| ADMITTED (not yet converted) | Admin prompted on next edit to upgrade via inline form. Convert blocked until structured `AdmissionApplication` complete. |

`convertToStudent` path detection: load admission → if `application` relation present → new flow; else → legacy single-WALI flow with deprecation log. 90-day window after launch, then remove legacy branch.

### 7.4 Address dataset import

```
scripts/seed-address-dataset.ts
  1. Fetch emsifa/api-wilayah-indonesia at pinned SHA (env: ADDRESS_DATASET_SHA)
  2. Validate JSON shape via zod
  3. Strip unused fields
  4. Shard villages by parent districtCode → public/address/villages/{districtCode}.json
  5. Write provinces.json, regencies.json, districts.json
  6. Bundle gate: total raw size > 12MB → exit 1
  7. Update lib/address/VERSION.md with new SHA + timestamp
```

Manual run only. CTO-gated via PR.

### 7.5 Rollback

| Migration | Reversal |
|---|---|
| N+1 | DROP COLUMN — fully reversible, no data loss (legacy `address` cols untouched) |
| N+2 | DROP TABLE AdmissionApplication, DROP TABLE AdmissionGuardian, DROP new Admission cols, restore status enum |
| N+3 | DROP COLUMN admissionId, restore studentId NOT NULL (requires no NULL rows present — registration invoices must be cleared first) |
| N+4 | UPDATE Student SET addressLine = NULL; UPDATE Parent SET homeAddressLine = NULL, employerAddressLine = NULL |
| N+5 | DROP BUCKET admission-documents (loses files) |
| N+6 | Restore from DB snapshot pre-script |

All migrations dry-run on staging clone before prod per CLAUDE.md staging→main cadence.

---

## 8. Documentation Updates

| Document | Change |
|---|---|
| `README.md` | Add Environments section. Production + staging URLs placeholder: "see internal docs (gitignored)". Document `/daftar` static path. Update Modules table — Admission domain links to this spec. |
| `CLAUDE.md` | No changes needed. Workflow + standards table unchanged. |
| `.claude/standards/crud.md` | Update Category B state machine table for Admission with new states (INQUIRY → VISITED → APPLIED → PAID → ADMITTED → REGISTERED + CANCELLED). |
| `.claude/standards/security.md` | No changes (existing tenant-scoping rule covers new tables). RLS coverage script gates them automatically. |
| `.claude/standards/api.md` | No changes (existing list/mutation conventions covered). |
| `docs/internal/environments.md` (gitignored) | New. Document prod + staging URLs for ops reference. |

---

## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Public form abuse (spam, mass submissions) | Medium | Medium | Vercel WAF rule on `/api/public/admissions/*` as primary defense. In-memory rate limit as soft backup. Audit log every public mutation. |
| KTP file leak via unsigned URLs | Low | High | Bucket private, signed URLs only (60s download TTL), RLS policies on admin-only direct SELECT. |
| SSRF via user-supplied file URL validation | Low | Medium | Never HEAD user-supplied URLs. Validate via Supabase SDK `.info()` on path (host-bound). |
| Phone-match dedup false positive cross-tenant | Low | High | All dedup queries tenant-scoped. Lint rule enforces per security standard. |
| Convert flow transaction failure mid-write (orphan Parent rows) | Low | Medium | Single `prisma.$transaction` wraps all writes. Idempotency guard `status="ADMITTED" AND studentId IS NULL` prevents partial retry corruption. |
| Xendit webhook race with admin manual status change | Low | Low | Webhook update WHERE status="APPLIED" — no-op if admin already advanced. |
| Address dataset version drift | Medium | Low | Denormalize names on row. Pin SHA in `lib/address/VERSION.md`. Manual upgrade only. |
| In-memory rate limiter bypass via parallel cold starts | High | Low (with WAF) | WAF is the actual blocker. Rate limiter is dev-mode courtesy. |
| File upload spam fills bucket | Low | Low | 5MB max, MIME allowlist, signed upload TTL 300s, daily upload count alert via existing Supabase quotas dashboard. |
| Invoice.studentId nullable breaks existing list queries | High | Medium | Audit all `app/api/invoices/**` + `app/admin/invoices/**` for null assumptions. Add WHERE guards where existing code assumes non-null. |
| Parent portal invite email delivery failure | Medium | Low | "Belum aktivasi" badge after 7 days. Admin manual re-send. Magic link expires 24h — generate fresh on re-send. |
| Sibling-case false-match in convert review | Low | Medium | NIK is primary match key (Dapodik-unique). Admin reviews every suggestion before commit. PICK_OTHER allows manual override. |
| 83k-village bundle bloats admin page load | Low | Low | Shard per district → eager bundle ~750KB. Lazy fetch single district file (1-3KB) on selection. |

---

## 10. Open Items

1. **Verify `lib/api/prisma-errors.ts` helper** — for P2002 → 409 mapping. Create if missing in C1.
2. **Verify Supabase Admin SDK config** — `lib/supabase/server.ts` may need a service-role client for `generateLink` admin API. Add in portal-invite cycle.
3. **Verify existing User model has `lastSignInAt`** — required for "Belum aktivasi" badge logic.
4. **Confirm Vercel WAF tier** — free tier limits per route. CTO checks Vercel dashboard before launch.
5. **Confirm Supabase Storage quota** — free tier 1GB. With 200 students × 3 files × 5MB max = 3GB worst case. Audit current usage; may need Pro tier upgrade.
6. **Bitly account ownership** — operator's responsibility (external to repo). Confirm process for QR refresh if domain changes.
7. **Email template for portal invite** — verify `lib/supabase/email-templates/` has admin-invite shape; design if missing.
8. **Tenant resolution for public form** — single-tenant deploy currently. If multi-tenant rollout, need `host → tenant` resolution map.

---

## 11. Acceptance Criteria

### 11.1 Schema + Migration

- [ ] All 6 migrations run clean on staging clone; no data loss
- [ ] N+3 CHECK constraint enforces invoice has admissionId XOR studentId
- [ ] `npx prisma migrate status` green on staging post-deploy
- [ ] Audit query confirms zero null `studentId` on legacy Invoice rows; only new registration invoices may have null

### 11.2 Public Daftar

- [ ] `/daftar` renders mobile + desktop, fully form-fillable
- [ ] Submit with 3 valid files + complete required fields → 200, Admission created with status=APPLIED, submissionSource=PUBLIC_FORM
- [ ] Submit with phone match against older INQUIRY → response includes `mergeAvailable: true`, admin sees banner
- [ ] Rate limit returns 429 after 5 attempts/min/IP (best effort)
- [ ] File upload rejects non-allowlist MIME, returns clear error
- [ ] Vercel WAF rule active on `/api/public/admissions/*`

### 11.3 Admin Detail Page

- [ ] 4-phase cards render with correct lock state per admission status
- [ ] WA template buttons open `wa.me` link with E.164 normalized phone + URL-encoded Indonesian message
- [ ] "Isi Form Sekarang" inline form advances VISITED → APPLIED on submit if complete
- [ ] "Generate Invoice Pendaftaran" creates Invoice with admissionId set, returns Xendit checkout URL
- [ ] Xendit webhook on PAID event flips Admission to PAID with race-safe status guard
- [ ] "Terima" advances PAID → ADMITTED, sets admittedAt/admittedById
- [ ] "Tolak" requires reason, advances to CANCELLED, surfaces reason in detail page
- [ ] "Kemungkinan Duplikat" banner shows when mergeCandidateId set; merge button deletes older row + copies notes

### 11.4 Convert Flow

- [ ] Preview returns per-guardian dedup suggestions tenant-scoped
- [ ] Commit creates Student, 2-3 Parents (or REUSE existing), 2-3 StudentGuardian rows in single transaction
- [ ] REUSE_EXISTING path uses fill-nulls-only pattern; verified with test where existing Parent has values, incoming has different — existing wins
- [ ] Idempotency: second commit call on same admission returns 400 "Invalid state", no duplicate writes
- [ ] Legacy admission (no AdmissionApplication) still converts via fallback with deprecation log
- [ ] AuditLog entry per Parent mutation visible in `/admin/audit` (if exists)

### 11.5 Address

- [ ] AddressPicker renders 5 inputs, defaults to Jabar
- [ ] Cascade reset: province change clears regency/district/village; regency change clears district/village
- [ ] Mobile shows Sheet bottom for combobox; desktop shows Popover
- [ ] Village fetch lazy-loads `public/address/villages/{districtCode}.json` on district select
- [ ] Build gate fails if `public/address/` raw > 12MB

### 11.6 Files

- [ ] Storage bucket `admission-documents` created with correct policies
- [ ] Signed upload URL TTL 300s; signed download URL TTL 60s
- [ ] Server validates via SDK `.info()`, never HTTP HEAD
- [ ] Non-allowlist MIME rejected with clear error
- [ ] > 5MB file rejected with clear error
- [ ] RLS denies non-admin direct bucket access without signed URL

### 11.7 Parent Portal Invite

- [ ] After REGISTERED, "Undangan Portal Orang Tua" panel appears with per-guardian checkboxes
- [ ] "Kirim Undangan" generates magic link, sends WA template + email (if email present), sets `portalInviteSentAt`
- [ ] Sibling case (existing Parent with User) skips invite, sends `childAddedToFamily` template
- [ ] No email + no WhatsApp → warning surfaced, no silent failure
- [ ] "Belum aktivasi" badge after 7 days; "Kirim Ulang" generates fresh link

### 11.8 Documentation

- [ ] README.md Environments section added; URLs only in gitignored `docs/internal/environments.md`
- [ ] `.claude/standards/crud.md` Admission state machine table updated
- [ ] Spec doc this file lives at `docs/superpowers/specs/2026-05-12-admission-student-domain-design.md`
- [ ] Implementation plan exists at `docs/superpowers/plans/2026-05-12-admission-student-domain.md` (written via `superpowers:writing-plans` skill)

---

## 12. Glossary

| Indonesian | English code identifier |
|---|---|
| Pendaftaran | Admission |
| Calon siswa | Applicant (in flow context) |
| Anak | Child (Student post-convert) |
| Ayah | Father (relationship enum value: `AYAH`) |
| Ibu | Mother (relationship enum value: `IBU`) |
| Wali | Guardian (relationship enum value: `WALI`) |
| NIK | National ID Number (16 digit) — stored as `nik` |
| KK / Kartu Keluarga | Family Card — stored file `familyCardFileUrl` |
| KTP | National ID Card — stored file `idCardFileUrl` per guardian |
| NIS | School-assigned student ID (post-enrollment) |
| NISN | National student ID |
| Akta lahir | Birth certificate (out of scope; deferred) |
| Penghasilan | Income — stored as IncomeRangeKey |
| Pendidikan | Education |
| Pekerjaan | Occupation |
| Tinggal bersama | Lives with — `childLivingWith` |
| Anak ke- | Birth order — `childAnakKe` |
| Tempat lahir | Birth place — `childBirthPlace` |
| Tanggal lahir | Date of birth — existing `dateOfBirth` |
| Desa / Kelurahan | Village — `${prefix}VillageCode/Name` |
| Kecamatan | District — `${prefix}DistrictCode/Name` |
| Kabupaten / Kota | Regency / City — `${prefix}RegencyCode/Name` |
| Provinsi | Province — `${prefix}ProvinceCode/Name` |
| Pendaftaran (form) | Daftar form — public route `/daftar` |
