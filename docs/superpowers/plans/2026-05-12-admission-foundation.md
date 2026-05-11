# Admission Foundation (Pack 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the foundation for the admission redesign — Prisma schema migrations (Student/Parent address cols, AdmissionApplication + AdmissionGuardian tables, Admission state machine, Invoice nullable studentId + admissionId + CHECK constraint), canonical income enum, emsifa address dataset infrastructure, and an `AddressPicker` component wired into existing Student + Guardian edit forms.

**Architecture:** Pure additive migrations (every new column nullable, legacy fields untouched) shipped in five sequential migrations. Address dataset sharded per-district under `public/address/` for CDN-cacheable lazy loading. `AddressPicker` composes existing shadcn `Combobox` primitives into a four-level cascading select with a free-text `addressLine` textarea, default Jabar in form initial state (not schema default). Income canonicalization is a one-shot tsx script with a regex mapping table.

**Tech Stack:** Prisma 7.6, Postgres, Next.js 16 App Router, Vitest, Tailwind + shadcn (`Combobox`, `Field`, `FieldLabel`), `tsx`/`@types/node` for scripts, `zod` for dataset validation.

**Spec:** [docs/superpowers/specs/2026-05-12-admission-student-domain-design.md](../specs/2026-05-12-admission-student-domain-design.md)

---

## File Structure

**Create:**

- `prisma/migrations/<ts>_add_address_geo_cols_to_student_parent/migration.sql` — N+1, additive nullable columns + Parent portalInvite cols.
- `prisma/migrations/<ts>_create_admission_application_and_guardian/migration.sql` — N+2, two new tables + Admission new fields + status enum value adds.
- `prisma/migrations/<ts>_alter_invoice_for_admission_link/migration.sql` — N+3, Invoice.studentId nullable + admissionId + CHECK constraint.
- `prisma/migrations/<ts>_backfill_address_line_from_existing/migration.sql` — N+4, copy legacy `address` → `addressLine` (idempotent).
- `lib/constants/income.ts` — `INCOME_RANGES` constant + `IncomeRangeKey` type.
- `lib/constants/__tests__/income.test.ts` — vitest unit suite.
- `lib/scripts/canonicalize-income.ts` — one-shot script mapping legacy free-text income → canonical keys.
- `lib/scripts/__tests__/canonicalize-income.test.ts` — vitest unit suite for the regex mapping.
- `lib/address/VERSION.md` — pinned emsifa commit SHA + timestamp + JSON file sizes.
- `lib/address/types.ts` — typed shape + `AddressValue` type.
- `lib/address/resolve.ts` — `getRegencies(provinceCode)`, `getDistricts(regencyCode)`, `fetchVillages(districtCode)`.
- `lib/address/__tests__/resolve.test.ts` — vitest suite (mocks fetch).
- `scripts/seed-address-dataset.ts` — fetch emsifa at pinned SHA, validate, shard, write to `public/address/`.
- `public/address/provinces.json` — 38 rows (generated, committed).
- `public/address/regencies.json` — ~514 rows grouped by provinceCode (generated, committed).
- `public/address/districts.json` — ~7200 rows grouped by regencyCode (generated, committed).
- `public/address/villages/*.json` — ~7200 files, one per districtCode (generated, committed).
- `components/ui/address-picker.tsx` — cascading 4-select + textarea, mobile Sheet variant.
- `components/ui/__tests__/address-picker.test.tsx` — vitest + React Testing Library suite.

**Modify:**

- `prisma/schema.prisma` — add cols on Student, Parent; add models AdmissionApplication + AdmissionGuardian; add cols + new status enum values on Admission; alter Invoice.
- `app/admin/students/[id]/page.tsx` — replace single `address` textarea with `<AddressPicker prefix="address">`; replace inline guardian edit fields with `<AddressPicker prefix="home">` + `<AddressPicker prefix="employer">` if guardian edit dialog exists in this file.
- `app/admin/guardians/page.tsx` (if exists; else create alongside) — wire AddressPicker on Parent edit dialog.
- `.claude/standards/crud.md` — line 33, update Admission state machine table with new states.

**Delete:** none.

---

## Task 1: Add Student address geo columns to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma` (Student model, ~line 436)

- [ ] **Step 1.1: Edit schema — add 9 address cols to Student model**

After existing `livingWith` field (line ~456), add:

```prisma
  // Structured residence address (Section 3.5 of spec)
  // Legacy `address` field kept for backward-compat backfill.
  // No @default — picker initial state in app layer per reviewer m3.
  addressLine          String?
  addressVillageCode   String?
  addressVillageName   String?
  addressDistrictCode  String?
  addressDistrictName  String?
  addressRegencyCode   String?
  addressRegencyName   String?
  addressProvinceCode  String?
  addressProvinceName  String?
```

- [ ] **Step 1.2: Verify schema parses**

Run: `npx prisma format`
Expected: file is reformatted with no errors.

- [ ] **Step 1.3: Stage but do not commit yet**

```bash
git add prisma/schema.prisma
```

Migration N+1 will be generated together with Parent additions in Task 2.

---

## Task 2: Add Parent home + employer + portal-invite columns

**Files:**
- Modify: `prisma/schema.prisma` (Parent model, ~line 477)

- [ ] **Step 2.1: Edit schema — add 18 address cols + 2 portal-invite cols on Parent**

After existing `childrenTotal` field (line ~496), add:

```prisma
  // Structured home address (prefix `home`)
  homeAddressLine    String?
  homeVillageCode    String?
  homeVillageName    String?
  homeDistrictCode   String?
  homeDistrictName   String?
  homeRegencyCode    String?
  homeRegencyName    String?
  homeProvinceCode   String?
  homeProvinceName   String?

  // Structured employer address (prefix `employer`)
  employerAddressLine     String?
  employerVillageCode     String?
  employerVillageName     String?
  employerDistrictCode    String?
  employerDistrictName    String?
  employerRegencyCode     String?
  employerRegencyName     String?
  employerProvinceCode    String?
  employerProvinceName    String?

  // Parent portal invite tracking (Section 2.8 of spec)
  portalInviteSentAt  DateTime?
  portalInviteSentBy  String?
```

- [ ] **Step 2.2: Verify**

Run: `npx prisma format`
Expected: file is reformatted, no errors.

- [ ] **Step 2.3: Generate migration N+1**

Run: `npx prisma migrate dev --name add_address_geo_cols_to_student_parent --create-only`
Expected: new directory `prisma/migrations/<ts>_add_address_geo_cols_to_student_parent/migration.sql` created.

- [ ] **Step 2.4: Inspect generated SQL**

Read the migration file. Confirm:
- 9 `ALTER TABLE "Student" ADD COLUMN "address..."` lines
- 18 `ALTER TABLE "Parent" ADD COLUMN "home...|employer..."` lines
- 2 `ALTER TABLE "Parent" ADD COLUMN "portalInvite..."` lines
- All new columns end with `TEXT` or `TIMESTAMP(3)` (never `NOT NULL`)

If schema differs, fix prisma/schema.prisma and re-run `--create-only`.

- [ ] **Step 2.5: Apply migration locally**

Run: `npx prisma migrate dev`
Expected: migration applies; `npx prisma generate` runs; no errors.

- [ ] **Step 2.6: Verify TypeScript compiles**

Run: `npm run build`
Expected: build succeeds. New Prisma types available.

- [ ] **Step 2.7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add address geo cols on Student + Parent + portal invite cols"
```

---

## Task 3: Add AdmissionApplication + AdmissionGuardian models

**Files:**
- Modify: `prisma/schema.prisma` (insert after Admission model, ~line 580)

- [ ] **Step 3.1: Add AdmissionApplication model**

After the existing `Admission` model closing brace, add:

```prisma
// ── ADMISSION APPLICATION (Section 3.1 of spec) ──────────────
// 1:1 with Admission. Populated when status >= VISITED.
// Tenant: Restrict (cascade from Admission removes the row).
model AdmissionApplication {
  id          String   @id @default(cuid())
  tenantId    String
  admissionId String   @unique

  // Child detail (mirrors Student government fields)
  childNickname     String?
  childBirthPlace   String?
  childNik          String?  // 16 digit
  childKkNumber     String?
  childAnakKe       Int?
  childSaudaraTotal Int?
  childLivingWith   String?  // ORANG_TUA | WALI | LAINNYA

  // Residence (prefix `residence`)
  residenceAddressLine   String?
  residenceVillageCode   String?
  residenceVillageName   String?
  residenceDistrictCode  String?
  residenceDistrictName  String?
  residenceRegencyCode   String?
  residenceRegencyName   String?
  residenceProvinceCode  String?
  residenceProvinceName  String?

  // Family Card (KK) upload
  familyCardFileUrl       String?
  familyCardFileMimeType  String?
  familyCardUploadedAt    DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  admission Admission           @relation(fields: [admissionId], references: [id], onDelete: Cascade)
  guardians AdmissionGuardian[]
  tenant    Tenant              @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@unique([tenantId, admissionId])
  @@index([tenantId])
}
```

- [ ] **Step 3.2: Add AdmissionGuardian model**

Directly after AdmissionApplication, add:

```prisma
// ── ADMISSION GUARDIAN (Section 3.2 of spec) ─────────────────
// 1..3 per AdmissionApplication. AYAH + IBU mandatory at VISITED→APPLIED.
// `relationship` matches existing StudentGuardian convention.
model AdmissionGuardian {
  id            String  @id @default(cuid())
  tenantId      String
  applicationId String

  relationship String  // AYAH | IBU | WALI

  name String
  nik  String?

  education   String?
  occupation  String?
  incomeRange String?  // IncomeRangeKey from lib/constants/income.ts

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

  phone    String?
  whatsapp String?
  email    String?

  idCardFileUrl       String?
  idCardFileMimeType  String?
  idCardUploadedAt    DateTime?

  parentId String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  application AdmissionApplication @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  parent      Parent?              @relation(fields: [parentId], references: [id], onDelete: SetNull)
  tenant      Tenant               @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@unique([applicationId, relationship])
  @@unique([tenantId, applicationId, relationship])
  @@index([tenantId])
  @@index([parentId])
}
```

- [ ] **Step 3.3: Add back-relation on Parent**

In the Parent model (~line 477), add inside the relation block (alongside existing `users User[]`):

```prisma
  admissionGuardians AdmissionGuardian[]
```

- [ ] **Step 3.4: Add back-relation on Tenant**

In the Tenant model (likely top of file), add to its relation block:

```prisma
  admissionApplications AdmissionApplication[]
  admissionGuardians    AdmissionGuardian[]
```

- [ ] **Step 3.5: Verify schema parses**

Run: `npx prisma format`
Expected: no errors.

- [ ] **Step 3.6: Stage**

```bash
git add prisma/schema.prisma
```

Migration N+2 will be generated in Task 4 together with the Admission additions.

---

## Task 4: Add Admission new fields + state machine update

**Files:**
- Modify: `prisma/schema.prisma` (Admission model, ~line 551)

- [ ] **Step 4.1: Edit Admission model — add 8 new fields**

After existing `studentId` field (~line 571), add:

```prisma
  // New fields (Section 3.3 of spec)
  mergeCandidateId       String?    // soft reference; no FK (intentional)
  submittedAt            DateTime?
  submissionSource       String?    // PUBLIC_FORM | ADMIN_ASSISTED
  registrationInvoiceId  String?    @unique
  paidAt                 DateTime?
  admittedAt             DateTime?
  admittedById           String?
  cancellationReason     String?
```

- [ ] **Step 4.2: Update status enum comment + value set**

Replace the existing line:
```prisma
  status           String   @default("INQUIRY") // INQUIRY | VISIT_SCHEDULED | VISITED | ADMITTED | REGISTERED | CANCELLED
```

with:
```prisma
  status           String   @default("INQUIRY") // INQUIRY | VISITED | APPLIED | PAID | ADMITTED | REGISTERED | CANCELLED
```

The enum is a free-form String — no DB-level enum to alter. Data migration in Task 5 handles any pre-existing `VISIT_SCHEDULED` rows.

- [ ] **Step 4.3: Add new back-relations on Admission**

In the Admission model relation block, add:

```prisma
  application         AdmissionApplication?
  registrationInvoice Invoice?              @relation("AdmissionRegistrationInvoice", fields: [registrationInvoiceId], references: [id], onDelete: SetNull)
```

Note: the named relation `"AdmissionRegistrationInvoice"` is required because Invoice will have a second relation back (in Task 6) and Prisma needs to disambiguate.

- [ ] **Step 4.4: Verify**

Run: `npx prisma format`
Expected: no errors.

- [ ] **Step 4.5: Generate migration N+2**

Run: `npx prisma migrate dev --name create_admission_application_and_guardian --create-only`
Expected: new migration file in `prisma/migrations/`.

- [ ] **Step 4.6: Inspect generated SQL — add data migration**

The generated migration creates the two new tables and adds columns. Open the file and **prepend** this data migration before the Prisma DDL:

```sql
-- Data migration: normalize any pre-existing VISIT_SCHEDULED rows
-- (should be zero in current DB; defensive).
UPDATE "Admission" SET "status" = 'INQUIRY' WHERE "status" = 'VISIT_SCHEDULED';
```

- [ ] **Step 4.7: Apply migration**

Run: `npx prisma migrate dev`
Expected: applies; tables created; types regenerated.

- [ ] **Step 4.8: Verify with psql**

Run: `npx prisma studio` OR connect via local DB tool. Confirm:
- Tables `AdmissionApplication`, `AdmissionGuardian` exist
- Indexes match `@@unique` and `@@index` declarations
- No `VISIT_SCHEDULED` rows in Admission

- [ ] **Step 4.9: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4.10: Commit**

```bash
git add prisma/
git commit -m "feat(schema): add AdmissionApplication + AdmissionGuardian models, Admission state machine fields"
```

---

## Task 5: Alter Invoice for admission link

**Files:**
- Modify: `prisma/schema.prisma` (Invoice model — locate via grep)

- [ ] **Step 5.1: Locate Invoice model**

Run: `grep -n "^model Invoice" prisma/schema.prisma`
Note the line number for the next step.

- [ ] **Step 5.2: Change `studentId` to nullable + add `admissionId`**

In the Invoice model, change:

```prisma
  studentId String
```

to:

```prisma
  studentId String?
```

Then add (before the relation block):

```prisma
  admissionId String?
```

Add to the relation block:

```prisma
  admission Admission? @relation("AdmissionRegistrationInvoice", fields: [admissionId], references: [id], onDelete: SetNull)
```

Add to the `@@index` block:

```prisma
  @@index([admissionId])
```

Make the existing `student` relation nullable to match:

```prisma
  student Student? @relation(fields: [studentId], references: [id], onDelete: Restrict)
```

- [ ] **Step 5.3: Verify schema parses**

Run: `npx prisma format`
Expected: no errors. If Prisma complains about the named relation, double-check Task 4 Step 4.3 used the same name `"AdmissionRegistrationInvoice"`.

- [ ] **Step 5.4: Generate migration N+3**

Run: `npx prisma migrate dev --name alter_invoice_for_admission_link --create-only`
Expected: migration file created.

- [ ] **Step 5.5: Inspect generated SQL — add CHECK constraint**

Open the generated migration file. After the auto-generated `ALTER` statements, append:

```sql
-- Invariant: every Invoice references either a Student OR an Admission (registration invoice).
ALTER TABLE "Invoice"
  ADD CONSTRAINT "invoice_student_or_admission"
  CHECK (("studentId" IS NOT NULL) OR ("admissionId" IS NOT NULL));
```

- [ ] **Step 5.6: Apply migration**

Run: `npx prisma migrate dev`
Expected: applies clean.

- [ ] **Step 5.7: Audit existing Invoice queries for null `studentId` assumptions**

Run: `grep -rn "studentId" app/api/invoices app/admin/invoices lib/ 2>/dev/null | grep -v ".test." | head -30`

For each match that destructures or filters on `studentId`, decide whether it assumes non-null. Where it does, add `where: { studentId: { not: null } }` or guard with `if (invoice.studentId)`. If multiple files need fixes, list them in a code comment and address in a follow-up commit within this task — do not skip.

- [ ] **Step 5.8: Build**

Run: `npm run build`
Expected: succeeds. If TypeScript surfaces null-handling errors on existing code, fix them now (one per call site) — they are real bugs the type system just exposed.

- [ ] **Step 5.9: Vitest**

Run: `npx vitest run`
Expected: all existing tests pass. If an Invoice test asserted `studentId` is a string, update the assertion to allow string-or-null per the new contract.

- [ ] **Step 5.10: Commit**

```bash
git add prisma/ app/ lib/
git commit -m "feat(schema): make Invoice.studentId nullable + add admissionId + CHECK constraint"
```

---

## Task 6: Backfill migration — copy legacy address → addressLine

**Files:**
- Create: `prisma/migrations/<ts>_backfill_address_line_from_existing/migration.sql`

- [ ] **Step 6.1: Generate empty migration scaffold**

Run: `npx prisma migrate dev --name backfill_address_line_from_existing --create-only`
Expected: empty migration file created.

- [ ] **Step 6.2: Write the backfill SQL**

Open the new migration file and replace contents with:

```sql
-- Backfill: copy legacy single-field addresses into the new addressLine cols.
-- Idempotent (WHERE NULL guard) so re-running is safe.

UPDATE "Student"
SET "addressLine" = "address"
WHERE "address" IS NOT NULL AND "addressLine" IS NULL;

UPDATE "Parent"
SET "homeAddressLine" = "address"
WHERE "address" IS NOT NULL AND "homeAddressLine" IS NULL;

UPDATE "Parent"
SET "employerAddressLine" = "employerAddress"
WHERE "employerAddress" IS NOT NULL AND "employerAddressLine" IS NULL;
```

- [ ] **Step 6.3: Apply**

Run: `npx prisma migrate dev`
Expected: applies; existing rows now have `addressLine` populated.

- [ ] **Step 6.4: Verify**

Open Prisma Studio (or psql). Run:
```sql
SELECT COUNT(*) FROM "Student" WHERE "address" IS NOT NULL AND "addressLine" IS NULL;
SELECT COUNT(*) FROM "Parent" WHERE "address" IS NOT NULL AND "homeAddressLine" IS NULL;
```
Expected: both return 0.

- [ ] **Step 6.5: Commit**

```bash
git add prisma/migrations/
git commit -m "feat(schema): backfill addressLine from legacy address cols"
```

---

## Task 7: INCOME_RANGES canonical module + tests

**Files:**
- Create: `lib/constants/income.ts`
- Create: `lib/constants/__tests__/income.test.ts`

- [ ] **Step 7.1: Write failing test**

Create `lib/constants/__tests__/income.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { INCOME_RANGES, isIncomeRangeKey, formatIncomeRange } from "../income";

describe("INCOME_RANGES", () => {
  it("has exactly 5 canonical keys", () => {
    expect(Object.keys(INCOME_RANGES)).toEqual(["LT_1M", "R_1_3M", "R_3_5M", "R_5_10M", "GT_10M"]);
  });

  it("renders Indonesian labels with Rp prefix and Juta suffix", () => {
    expect(INCOME_RANGES.LT_1M).toBe("< Rp 1 Juta");
    expect(INCOME_RANGES.R_5_10M).toBe("Rp 5 - 10 Juta");
    expect(INCOME_RANGES.GT_10M).toBe("> Rp 10 Juta");
  });
});

describe("isIncomeRangeKey", () => {
  it("accepts canonical keys", () => {
    expect(isIncomeRangeKey("LT_1M")).toBe(true);
    expect(isIncomeRangeKey("R_3_5M")).toBe(true);
  });
  it("rejects unknown values", () => {
    expect(isIncomeRangeKey("FOO")).toBe(false);
    expect(isIncomeRangeKey("")).toBe(false);
    expect(isIncomeRangeKey(null)).toBe(false);
  });
});

describe("formatIncomeRange", () => {
  it("returns the label for a known key", () => {
    expect(formatIncomeRange("R_3_5M")).toBe("Rp 3 - 5 Juta");
  });
  it("returns null for unknown input", () => {
    expect(formatIncomeRange(null)).toBe(null);
    expect(formatIncomeRange("FOO")).toBe(null);
  });
});
```

- [ ] **Step 7.2: Run test — see it fail**

Run: `npx vitest run lib/constants/__tests__/income.test.ts`
Expected: FAIL with "Cannot find module '../income'".

- [ ] **Step 7.3: Implement the module**

Create `lib/constants/income.ts`:

```ts
export const INCOME_RANGES = {
  LT_1M:   "< Rp 1 Juta",
  R_1_3M:  "Rp 1 - 3 Juta",
  R_3_5M:  "Rp 3 - 5 Juta",
  R_5_10M: "Rp 5 - 10 Juta",
  GT_10M:  "> Rp 10 Juta",
} as const;

export type IncomeRangeKey = keyof typeof INCOME_RANGES;

export function isIncomeRangeKey(value: unknown): value is IncomeRangeKey {
  return typeof value === "string" && value in INCOME_RANGES;
}

export function formatIncomeRange(key: unknown): string | null {
  if (!isIncomeRangeKey(key)) return null;
  return INCOME_RANGES[key];
}
```

- [ ] **Step 7.4: Run test — see it pass**

Run: `npx vitest run lib/constants/__tests__/income.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7.5: Commit**

```bash
git add lib/constants/
git commit -m "feat(income): add canonical INCOME_RANGES constant + helpers"
```

---

## Task 8: Income canonicalization script + tests

**Files:**
- Create: `lib/scripts/canonicalize-income.ts`
- Create: `lib/scripts/__tests__/canonicalize-income.test.ts`

- [ ] **Step 8.1: Write failing test**

Create `lib/scripts/__tests__/canonicalize-income.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapIncomeFreeText } from "../canonicalize-income";

describe("mapIncomeFreeText", () => {
  it("maps `< Rp 1 Juta` style to LT_1M", () => {
    expect(mapIncomeFreeText("< Rp 1 Juta")).toBe("LT_1M");
    expect(mapIncomeFreeText("< 1jt")).toBe("LT_1M");
    expect(mapIncomeFreeText("< 1.000.000")).toBe("LT_1M");
  });

  it("maps `Rp 1-3 Juta` variants to R_1_3M", () => {
    expect(mapIncomeFreeText("Rp 1 - 3 Juta")).toBe("R_1_3M");
    expect(mapIncomeFreeText("1.000.000 s/d 3.000.000")).toBe("R_1_3M");
    expect(mapIncomeFreeText("1-3jt")).toBe("R_1_3M");
  });

  it("maps `Rp 3-5 Juta` to R_3_5M", () => {
    expect(mapIncomeFreeText("Rp. 3.000.000 s/d Rp. 5.000.000")).toBe("R_3_5M");
    expect(mapIncomeFreeText("3-5 juta")).toBe("R_3_5M");
  });

  it("maps `Rp 5-10 Juta` to R_5_10M", () => {
    expect(mapIncomeFreeText("Rp. 5.000.000 s/d Rp. 10.000.000")).toBe("R_5_10M");
    expect(mapIncomeFreeText("5-10jt")).toBe("R_5_10M");
  });

  it("maps `> Rp 10 Juta` to GT_10M", () => {
    expect(mapIncomeFreeText("> Rp 10 Juta")).toBe("GT_10M");
    expect(mapIncomeFreeText("> 10.000.000")).toBe("GT_10M");
    expect(mapIncomeFreeText("> Rp. 10.000.000")).toBe("GT_10M");
  });

  it("returns null for unmappable input", () => {
    expect(mapIncomeFreeText("")).toBe(null);
    expect(mapIncomeFreeText(null)).toBe(null);
    expect(mapIncomeFreeText("tidak ada penghasilan")).toBe(null);
    expect(mapIncomeFreeText("xyz")).toBe(null);
  });

  it("trims and lowercases before matching", () => {
    expect(mapIncomeFreeText("  RP 1 - 3 JUTA  ")).toBe("R_1_3M");
  });
});
```

- [ ] **Step 8.2: Run test — see it fail**

Run: `npx vitest run lib/scripts/__tests__/canonicalize-income.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 8.3: Implement the mapping function**

Create `lib/scripts/canonicalize-income.ts`:

```ts
import { type IncomeRangeKey } from "@/lib/constants/income";

const MAP: Array<[RegExp, IncomeRangeKey]> = [
  [/^<\s*(rp\.?\s*)?1\s*(juta|jt|000[\.\s]?000)/i,                                 "LT_1M"],
  [/^(rp\.?\s*)?1[\s\.\-]+3\s*(juta|jt)|1[\.\s]?000[\.\s]?000\s*s\/d\s*3/i,        "R_1_3M"],
  [/^(rp\.?\s*)?3[\s\.\-]+5\s*(juta|jt)|3[\.\s]?000[\.\s]?000\s*s\/d\s*5/i,        "R_3_5M"],
  [/^(rp\.?\s*)?5[\s\.\-]+10\s*(juta|jt)|5[\.\s]?000[\.\s]?000\s*s\/d\s*10/i,      "R_5_10M"],
  [/^>\s*(rp\.?\s*)?10\s*(juta|jt)|>\s*(rp\.?\s*)?10[\.\s]?000[\.\s]?000/i,        "GT_10M"],
];

export function mapIncomeFreeText(input: unknown): IncomeRangeKey | null {
  if (typeof input !== "string") return null;
  const cleaned = input.trim();
  if (!cleaned) return null;
  for (const [re, key] of MAP) {
    if (re.test(cleaned)) return key;
  }
  return null;
}

// CLI entry-point — runs the mapping over Parent.incomeRange and
// Admission.parentIncome rows, writes results back, logs unmapped IDs.
export async function run(): Promise<void> {
  const { prisma } = await import("@/lib/db");
  const { auditLog } = await import("@/lib/audit");

  const parents = await prisma.parent.findMany({
    where: { incomeRange: { not: null } },
    select: { id: true, tenantId: true, incomeRange: true },
  });

  let mapped = 0;
  let unmapped = 0;
  for (const p of parents) {
    const key = mapIncomeFreeText(p.incomeRange);
    if (!key) {
      unmapped++;
      // eslint-disable-next-line no-console
      console.warn(`[canonicalize-income] unmapped Parent ${p.id}: ${p.incomeRange}`);
      continue;
    }
    if (key !== p.incomeRange) {
      await prisma.parent.update({ where: { id: p.id }, data: { incomeRange: key } });
      mapped++;
    }
  }

  const admissions = await prisma.admission.findMany({
    where: { parentIncome: { not: null } },
    select: { id: true, tenantId: true, parentIncome: true },
  });
  for (const a of admissions) {
    const key = mapIncomeFreeText(a.parentIncome);
    if (!key) {
      unmapped++;
      // eslint-disable-next-line no-console
      console.warn(`[canonicalize-income] unmapped Admission ${a.id}: ${a.parentIncome}`);
      continue;
    }
    if (key !== a.parentIncome) {
      await prisma.admission.update({ where: { id: a.id }, data: { parentIncome: key } });
      mapped++;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[canonicalize-income] mapped=${mapped} unmapped=${unmapped}`);
}

if (require.main === module) {
  run()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
```

- [ ] **Step 8.4: Run test — see it pass**

Run: `npx vitest run lib/scripts/__tests__/canonicalize-income.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 8.5: Build to verify types**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8.6: Add npm script**

Edit `package.json`. In the `"scripts"` block, after `"seed"`, add:

```json
    "canonicalize-income": "npx tsx lib/scripts/canonicalize-income.ts"
```

- [ ] **Step 8.7: Commit**

```bash
git add lib/scripts/ package.json
git commit -m "feat(income): canonicalization script + regex mapping tests"
```

---

## Task 9: Address dataset import script

**Files:**
- Create: `scripts/seed-address-dataset.ts`
- Create: `lib/address/VERSION.md`

- [ ] **Step 9.1: Pin emsifa SHA**

Open `https://github.com/emsifa/api-wilayah-indonesia/commits/master` in browser. Pick the latest commit on master and note its full SHA. (At time of writing, choose the HEAD commit.)

- [ ] **Step 9.2: Create VERSION.md**

Create `lib/address/VERSION.md`:

```markdown
# Address dataset version

| Field | Value |
|---|---|
| Source | `emsifa/api-wilayah-indonesia` |
| Pinned SHA | `<PASTE_SHA_FROM_STEP_9.1>` |
| Imported on | `<YYYY-MM-DD>` |
| Provinces count | filled by script |
| Regencies count | filled by script |
| Districts count | filled by script |
| Villages count | filled by script |
| Raw size (MB) | filled by script |

Run `npm run seed:address` to re-import. CTO-gated. Update this file with the new SHA + counts on every import.
```

- [ ] **Step 9.3: Write the import script**

Create `scripts/seed-address-dataset.ts`:

```ts
/**
 * Fetches the emsifa Indonesian wilayah dataset at the pinned SHA,
 * validates JSON shape with zod, shards villages per district,
 * and writes everything under `public/address/`.
 *
 * Run manually: `npm run seed:address` (CTO-gated, not in CI).
 */

import { writeFile, mkdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const PINNED_SHA = "REPLACE_WITH_SHA_FROM_VERSION_MD";
const RAW_BASE = `https://raw.githubusercontent.com/emsifa/api-wilayah-indonesia/${PINNED_SHA}/static/api`;
const OUT_DIR = path.join(process.cwd(), "public/address");
const RAW_SIZE_LIMIT_MB = 12;

const ProvinceSchema = z.object({ id: z.string(), name: z.string() });
const RegencySchema = z.object({ id: z.string(), province_id: z.string(), name: z.string() });
const DistrictSchema = z.object({ id: z.string(), regency_id: z.string(), name: z.string() });
const VillageSchema = z.object({ id: z.string(), district_id: z.string(), name: z.string() });

async function fetchJson<T>(url: string, schema: z.ZodType<T[]>): Promise<T[]> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
  const json = await r.json();
  return schema.parse(json);
}

async function totalSizeMb(dir: string): Promise<number> {
  let bytes = 0;
  const { readdir } = await import("node:fs/promises");
  async function walk(p: string) {
    for (const entry of await readdir(p, { withFileTypes: true })) {
      const full = path.join(p, entry.name);
      if (entry.isDirectory()) await walk(full);
      else bytes += (await stat(full)).size;
    }
  }
  await walk(dir);
  return bytes / 1024 / 1024;
}

async function main() {
  if (PINNED_SHA === "REPLACE_WITH_SHA_FROM_VERSION_MD") {
    throw new Error("PINNED_SHA placeholder not replaced — see lib/address/VERSION.md");
  }

  if (existsSync(OUT_DIR)) await rm(OUT_DIR, { recursive: true });
  await mkdir(path.join(OUT_DIR, "villages"), { recursive: true });

  // 1. Provinces
  const provinces = await fetchJson(`${RAW_BASE}/provinces.json`, z.array(ProvinceSchema));
  await writeFile(path.join(OUT_DIR, "provinces.json"), JSON.stringify(provinces));

  // 2. Regencies — fetch per province (emsifa shape) then concat
  const regencies: z.infer<typeof RegencySchema>[] = [];
  for (const p of provinces) {
    const part = await fetchJson(`${RAW_BASE}/regencies/${p.id}.json`, z.array(RegencySchema));
    regencies.push(...part.map((r) => ({ ...r, province_id: p.id })));
  }
  await writeFile(path.join(OUT_DIR, "regencies.json"), JSON.stringify(regencies));

  // 3. Districts — per regency
  const districts: z.infer<typeof DistrictSchema>[] = [];
  for (const r of regencies) {
    const part = await fetchJson(`${RAW_BASE}/districts/${r.id}.json`, z.array(DistrictSchema));
    districts.push(...part.map((d) => ({ ...d, regency_id: r.id })));
  }
  await writeFile(path.join(OUT_DIR, "districts.json"), JSON.stringify(districts));

  // 4. Villages — per district, sharded to own file
  let totalVillages = 0;
  for (const d of districts) {
    const part = await fetchJson(`${RAW_BASE}/villages/${d.id}.json`, z.array(VillageSchema));
    totalVillages += part.length;
    await writeFile(path.join(OUT_DIR, "villages", `${d.id}.json`), JSON.stringify(part));
  }

  const mb = await totalSizeMb(OUT_DIR);
  if (mb > RAW_SIZE_LIMIT_MB) {
    throw new Error(`Address dataset is ${mb.toFixed(1)} MB — exceeds ${RAW_SIZE_LIMIT_MB} MB limit`);
  }

  // eslint-disable-next-line no-console
  console.log(`[seed-address] provinces=${provinces.length} regencies=${regencies.length} districts=${districts.length} villages=${totalVillages} sizeMb=${mb.toFixed(1)}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 9.4: Add npm script**

Edit `package.json` scripts block, after `"canonicalize-income"`:

```json
    "seed:address": "npx tsx scripts/seed-address-dataset.ts"
```

- [ ] **Step 9.5: Run the import**

Replace `REPLACE_WITH_SHA_FROM_VERSION_MD` in the script with the SHA from Step 9.1, plus paste the same SHA into VERSION.md.

Run: `npm run seed:address`
Expected: completes in 2-10 minutes; prints counts; `public/address/` populated.

- [ ] **Step 9.6: Update VERSION.md with counts**

Fill the counts + size from the script output into `lib/address/VERSION.md`.

- [ ] **Step 9.7: Add `public/address/` to commit allowlist if .gitignore blocks it**

Run: `git check-ignore public/address/provinces.json`
If output is non-empty: edit `.gitignore` to add `!public/address/` after the line ignoring `public/`. If `public/` is not ignored (default in Next.js), skip this step.

- [ ] **Step 9.8: Commit**

```bash
git add public/address/ lib/address/VERSION.md scripts/seed-address-dataset.ts package.json
git commit -m "feat(address): import emsifa Indonesian wilayah dataset (sharded per district)"
```

---

## Task 10: Address resolve module + tests

**Files:**
- Create: `lib/address/types.ts`
- Create: `lib/address/resolve.ts`
- Create: `lib/address/__tests__/resolve.test.ts`

- [ ] **Step 10.1: Write types module**

Create `lib/address/types.ts`:

```ts
export type Province = { id: string; name: string };
export type Regency  = { id: string; province_id: string; name: string };
export type District = { id: string; regency_id: string; name: string };
export type Village  = { id: string; district_id: string; name: string };

export type AddressValue = {
  addressLine: string;
  villageCode: string;
  villageName: string;
  districtCode: string;
  districtName: string;
  regencyCode: string;
  regencyName: string;
  provinceCode: string;
  provinceName: string;
};

export const EMPTY_ADDRESS: AddressValue = {
  addressLine: "",
  villageCode: "", villageName: "",
  districtCode: "", districtName: "",
  regencyCode: "", regencyName: "",
  provinceCode: "", provinceName: "",
};

// Default initial picker state — Jabar
export const DEFAULT_PROVINCE_CODE = "32";
export const DEFAULT_PROVINCE_NAME = "Jawa Barat";
```

- [ ] **Step 10.2: Write failing test**

Create `lib/address/__tests__/resolve.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getProvinces, getRegencies, getDistricts, fetchVillages } from "../resolve";

describe("getProvinces", () => {
  it("returns 38 provinces from the static import", async () => {
    const provinces = await getProvinces();
    expect(provinces.length).toBeGreaterThanOrEqual(34);
    expect(provinces.find((p) => p.id === "32")?.name).toBe("Jawa Barat");
  });
});

describe("getRegencies", () => {
  it("filters by provinceCode", async () => {
    const jabar = await getRegencies("32");
    expect(jabar.length).toBeGreaterThan(20);
    expect(jabar.every((r) => r.province_id === "32")).toBe(true);
  });
  it("returns empty array for unknown provinceCode", async () => {
    expect(await getRegencies("9999")).toEqual([]);
  });
});

describe("getDistricts", () => {
  it("filters by regencyCode", async () => {
    const bekasi = await getDistricts("3216");
    expect(bekasi.length).toBeGreaterThan(0);
    expect(bekasi.every((d) => d.regency_id === "3216")).toBe(true);
  });
});

describe("fetchVillages", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed villages on 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ([{ id: "3216081005", district_id: "3216081", name: "Telagamurni" }]),
    } as unknown as Response)));

    const result = await fetchVillages("3216081");
    expect(result).toEqual([{ id: "3216081005", district_id: "3216081", name: "Telagamurni" }]);
    expect(fetch).toHaveBeenCalledWith("/address/villages/3216081.json", expect.anything());
  });

  it("returns empty array on 404", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 } as unknown as Response)));
    expect(await fetchVillages("9999999")).toEqual([]);
  });
});
```

- [ ] **Step 10.3: Run test — see it fail**

Run: `npx vitest run lib/address/__tests__/resolve.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 10.4: Implement resolve.ts**

Create `lib/address/resolve.ts`:

```ts
import type { Province, Regency, District, Village } from "./types";
import provincesJson from "@/public/address/provinces.json";
import regenciesJson from "@/public/address/regencies.json";
import districtsJson from "@/public/address/districts.json";

const provinces = provincesJson as Province[];
const regencies = regenciesJson as Regency[];
const districts = districtsJson as District[];

export async function getProvinces(): Promise<Province[]> {
  return provinces;
}

export async function getRegencies(provinceCode: string): Promise<Regency[]> {
  return regencies.filter((r) => r.province_id === provinceCode);
}

export async function getDistricts(regencyCode: string): Promise<District[]> {
  return districts.filter((d) => d.regency_id === regencyCode);
}

export async function fetchVillages(districtCode: string): Promise<Village[]> {
  try {
    const res = await fetch(`/address/villages/${districtCode}.json`, { cache: "force-cache" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}
```

- [ ] **Step 10.5: Run test — see it pass**

Run: `npx vitest run lib/address/__tests__/resolve.test.ts`
Expected: PASS.

- [ ] **Step 10.6: Build**

Run: `npm run build`
Expected: succeeds. If TypeScript complains about JSON imports, add `"resolveJsonModule": true` to `tsconfig.json` `compilerOptions` (likely already enabled).

- [ ] **Step 10.7: Commit**

```bash
git add lib/address/
git commit -m "feat(address): resolve module with cascading lookups + lazy village fetch"
```

---

## Task 11: AddressPicker component (TDD)

**Files:**
- Create: `components/ui/address-picker.tsx`
- Create: `components/ui/__tests__/address-picker.test.tsx`

- [ ] **Step 11.1: Write failing test (component contract)**

Create `components/ui/__tests__/address-picker.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AddressPicker } from "../address-picker";
import { EMPTY_ADDRESS, DEFAULT_PROVINCE_CODE, DEFAULT_PROVINCE_NAME } from "@/lib/address/types";

vi.mock("@/lib/address/resolve", () => ({
  getProvinces: vi.fn(async () => [
    { id: "32", name: "Jawa Barat" },
    { id: "31", name: "DKI Jakarta" },
  ]),
  getRegencies: vi.fn(async (pc: string) =>
    pc === "32"
      ? [{ id: "3216", province_id: "32", name: "Kabupaten Bekasi" }]
      : []),
  getDistricts: vi.fn(async (rc: string) =>
    rc === "3216"
      ? [{ id: "3216081", regency_id: "3216", name: "Cikarang Barat" }]
      : []),
  fetchVillages: vi.fn(async (dc: string) =>
    dc === "3216081"
      ? [{ id: "3216081005", district_id: "3216081", name: "Telagamurni" }]
      : []),
}));

describe("AddressPicker", () => {
  it("renders addressLine textarea + 4 comboboxes with Indonesian labels", () => {
    render(
      <AddressPicker
        prefix="address"
        value={EMPTY_ADDRESS}
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText(/jalan/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/provinsi/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/kab\/?kota/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/kecamatan/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/kelurahan/i)).toBeInTheDocument();
  });

  it("defaults provinceCode to Jabar when value is empty", () => {
    const onChange = vi.fn();
    render(<AddressPicker prefix="address" value={EMPTY_ADDRESS} onChange={onChange} />);
    // Picker auto-applies the default Jabar code on mount (Section 2.2 of spec).
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        provinceCode: DEFAULT_PROVINCE_CODE,
        provinceName: DEFAULT_PROVINCE_NAME,
      })
    );
  });

  it("changing addressLine emits onChange with updated value", () => {
    const onChange = vi.fn();
    render(<AddressPicker prefix="address" value={EMPTY_ADDRESS} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/jalan/i), {
      target: { value: "Jl. Anggrek 1" },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ addressLine: "Jl. Anggrek 1" })
    );
  });

  it("cascading: province change resets regency/district/village", () => {
    const onChange = vi.fn();
    const populated = {
      ...EMPTY_ADDRESS,
      provinceCode: "32", provinceName: "Jawa Barat",
      regencyCode: "3216", regencyName: "Kabupaten Bekasi",
      districtCode: "3216081", districtName: "Cikarang Barat",
      villageCode: "3216081005", villageName: "Telagamurni",
    };
    render(<AddressPicker prefix="address" value={populated} onChange={onChange} />);
    // Simulate Province change (clicking Combobox option)
    fireEvent.click(screen.getByText(/dki jakarta/i));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provinceCode: "31",
        provinceName: "DKI Jakarta",
        regencyCode: "", regencyName: "",
        districtCode: "", districtName: "",
        villageCode: "", villageName: "",
      })
    );
  });

  it("fetches villages lazily on district selection", async () => {
    const { fetchVillages } = await import("@/lib/address/resolve");
    const onChange = vi.fn();
    const populated = {
      ...EMPTY_ADDRESS,
      provinceCode: "32", regencyCode: "3216", districtCode: "3216081",
    };
    render(<AddressPicker prefix="address" value={populated} onChange={onChange} />);
    await waitFor(() => expect(fetchVillages).toHaveBeenCalledWith("3216081"));
  });
});
```

- [ ] **Step 11.2: Run test — see it fail**

Run: `npx vitest run components/ui/__tests__/address-picker.test.tsx`
Expected: FAIL (component missing).

- [ ] **Step 11.3: Implement AddressPicker**

Create `components/ui/address-picker.tsx`:

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AddressValue,
  EMPTY_ADDRESS,
  DEFAULT_PROVINCE_CODE,
  DEFAULT_PROVINCE_NAME,
  Regency,
  District,
  Village,
} from "@/lib/address/types";
import {
  getProvinces,
  getRegencies,
  getDistricts,
  fetchVillages,
} from "@/lib/address/resolve";
import { Field, FieldLabel } from "@/components/ui/field";
import { Combobox, ComboboxItem } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  prefix: string;
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  required?: boolean;
};

export function AddressPicker({ prefix, value, onChange, required }: Props) {
  const [regencies, setRegencies] = useState<Regency[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [villages, setVillages] = useState<Village[]>([]);
  const [provinces, setProvinces] = useState<{ id: string; name: string }[]>([]);

  // 1. Load provinces eagerly; default Jabar if empty
  useEffect(() => {
    let mounted = true;
    getProvinces().then((list) => {
      if (!mounted) return;
      setProvinces(list);
      if (!value.provinceCode) {
        onChange({
          ...value,
          provinceCode: DEFAULT_PROVINCE_CODE,
          provinceName: DEFAULT_PROVINCE_NAME,
        });
      }
    });
    return () => { mounted = false; };
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // 2. Cascade: regencies follow provinceCode
  useEffect(() => {
    if (!value.provinceCode) { setRegencies([]); return; }
    getRegencies(value.provinceCode).then(setRegencies);
  }, [value.provinceCode]);

  // 3. Cascade: districts follow regencyCode
  useEffect(() => {
    if (!value.regencyCode) { setDistricts([]); return; }
    getDistricts(value.regencyCode).then(setDistricts);
  }, [value.regencyCode]);

  // 4. Cascade: villages follow districtCode (lazy fetch)
  useEffect(() => {
    if (!value.districtCode) { setVillages([]); return; }
    fetchVillages(value.districtCode).then(setVillages);
  }, [value.districtCode]);

  const setProvince = useCallback((id: string) => {
    const p = provinces.find((x) => x.id === id);
    if (!p) return;
    onChange({
      ...value,
      provinceCode: p.id, provinceName: p.name,
      regencyCode: "", regencyName: "",
      districtCode: "", districtName: "",
      villageCode: "", villageName: "",
    });
  }, [provinces, value, onChange]);

  const setRegency = useCallback((id: string) => {
    const r = regencies.find((x) => x.id === id);
    if (!r) return;
    onChange({
      ...value,
      regencyCode: r.id, regencyName: r.name,
      districtCode: "", districtName: "",
      villageCode: "", villageName: "",
    });
  }, [regencies, value, onChange]);

  const setDistrict = useCallback((id: string) => {
    const d = districts.find((x) => x.id === id);
    if (!d) return;
    onChange({
      ...value,
      districtCode: d.id, districtName: d.name,
      villageCode: "", villageName: "",
    });
  }, [districts, value, onChange]);

  const setVillage = useCallback((id: string) => {
    const v = villages.find((x) => x.id === id);
    if (!v) return;
    onChange({ ...value, villageCode: v.id, villageName: v.name });
  }, [villages, value, onChange]);

  return (
    <div className="space-y-field" data-prefix={prefix}>
      <Field>
        <FieldLabel required={required}>Jalan, RT/RW, Blok</FieldLabel>
        <Textarea
          rows={2}
          value={value.addressLine}
          onChange={(e) => onChange({ ...value, addressLine: e.target.value })}
          placeholder="Contoh: Perum Metland Cibitung Blok D1/5"
        />
      </Field>

      <Field>
        <FieldLabel required={required}>Provinsi</FieldLabel>
        <Combobox
          value={value.provinceCode}
          onValueChange={setProvince}
          placeholder="Pilih Provinsi"
        >
          {provinces.map((p) => (
            <ComboboxItem key={p.id} value={p.id}>{p.name}</ComboboxItem>
          ))}
        </Combobox>
      </Field>

      <Field>
        <FieldLabel required={required}>Kab/Kota</FieldLabel>
        <Combobox
          value={value.regencyCode}
          onValueChange={setRegency}
          placeholder="Pilih Kab/Kota"
          disabled={!value.provinceCode}
        >
          {regencies.map((r) => (
            <ComboboxItem key={r.id} value={r.id}>{r.name}</ComboboxItem>
          ))}
        </Combobox>
      </Field>

      <Field>
        <FieldLabel required={required}>Kecamatan</FieldLabel>
        <Combobox
          value={value.districtCode}
          onValueChange={setDistrict}
          placeholder="Pilih Kecamatan"
          disabled={!value.regencyCode}
        >
          {districts.map((d) => (
            <ComboboxItem key={d.id} value={d.id}>{d.name}</ComboboxItem>
          ))}
        </Combobox>
      </Field>

      <Field>
        <FieldLabel required={required}>Kelurahan/Desa</FieldLabel>
        <Combobox
          value={value.villageCode}
          onValueChange={setVillage}
          placeholder="Pilih Kelurahan/Desa"
          disabled={!value.districtCode}
        >
          {villages.map((v) => (
            <ComboboxItem key={v.id} value={v.id}>{v.name}</ComboboxItem>
          ))}
        </Combobox>
      </Field>
    </div>
  );
}
```

- [ ] **Step 11.4: Verify `Combobox` API matches**

Read `components/ui/combobox.tsx`. If the API differs (e.g. it uses `onSelect`, or items as a prop instead of children), adjust the calls in Step 11.3. The contract is: a controlled select with `value`, `onValueChange(id)`, `placeholder`, `disabled`, and a list of options as children.

- [ ] **Step 11.5: Run test — see it pass**

Run: `npx vitest run components/ui/__tests__/address-picker.test.tsx`
Expected: PASS, 5 tests.

If the cascade-reset test fails because the test simulates the click incorrectly given the actual `Combobox` API, refactor the test to call `setProvince` via the rendered DOM in a way the actual component supports — the underlying contract (cascade resets children) is what matters, not the exact DOM event.

- [ ] **Step 11.6: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 11.7: Commit**

```bash
git add components/ui/address-picker.tsx components/ui/__tests__/
git commit -m "feat(ui): AddressPicker — 4-level cascading select with lazy village fetch"
```

---

## Task 12: Wire AddressPicker into Student edit form

**Files:**
- Modify: `app/admin/students/[id]/page.tsx`

- [ ] **Step 12.1: Read current student edit form**

Run: `grep -n "address" app/admin/students/\[id\]/page.tsx | head -20`
Locate the existing `address` field — likely a `<Textarea>` or `<Input>` inside a `Field` with label "Alamat".

- [ ] **Step 12.2: Replace single field with AddressPicker**

In `app/admin/students/[id]/page.tsx`:

1. Add import near other component imports:
   ```tsx
   import { AddressPicker } from "@/components/ui/address-picker";
   import { AddressValue, EMPTY_ADDRESS } from "@/lib/address/types";
   ```

2. Extend the `Student` type at the top with the new geo cols:
   ```tsx
   type Student = {
     // existing fields...
     addressLine: string | null;
     addressVillageCode: string | null;
     addressVillageName: string | null;
     addressDistrictCode: string | null;
     addressDistrictName: string | null;
     addressRegencyCode: string | null;
     addressRegencyName: string | null;
     addressProvinceCode: string | null;
     addressProvinceName: string | null;
   };
   ```

3. Build a helper to convert Student row → `AddressValue`:
   ```tsx
   function toAddressValue(s: Pick<Student, "addressLine" | "addressVillageCode" | "addressVillageName" | "addressDistrictCode" | "addressDistrictName" | "addressRegencyCode" | "addressRegencyName" | "addressProvinceCode" | "addressProvinceName">): AddressValue {
     return {
       addressLine: s.addressLine ?? "",
       villageCode: s.addressVillageCode ?? "", villageName: s.addressVillageName ?? "",
       districtCode: s.addressDistrictCode ?? "", districtName: s.addressDistrictName ?? "",
       regencyCode: s.addressRegencyCode ?? "", regencyName: s.addressRegencyName ?? "",
       provinceCode: s.addressProvinceCode ?? "", provinceName: s.addressProvinceName ?? "",
     };
   }
   ```

4. In the form section that currently renders the single `<Textarea value={form.address}>`, replace with:
   ```tsx
   <AddressPicker
     prefix="address"
     value={toAddressValue(form)}
     onChange={(v) => setForm({
       ...form,
       addressLine: v.addressLine,
       addressVillageCode: v.villageCode,
       addressVillageName: v.villageName,
       addressDistrictCode: v.districtCode,
       addressDistrictName: v.districtName,
       addressRegencyCode: v.regencyCode,
       addressRegencyName: v.regencyName,
       addressProvinceCode: v.provinceCode,
       addressProvinceName: v.provinceName,
     })}
   />
   ```

5. On submit, send all geo cols in the PUT body. The existing API route should already pass through unknown fields via Prisma spread — but **verify** by reading `app/api/students/[id]/route.ts` PUT handler and confirming it accepts the new fields. If it uses a strict zod schema, extend the schema (`lib/validations/student.ts`) to include the 9 cols.

- [ ] **Step 12.3: Update validation schema**

Open `lib/validations/student.ts`. Inside `updateStudentSchema` (or `createStudentSchema`), append:

```ts
  addressLine:          z.string().optional().nullable(),
  addressVillageCode:   z.string().optional().nullable(),
  addressVillageName:   z.string().optional().nullable(),
  addressDistrictCode:  z.string().optional().nullable(),
  addressDistrictName:  z.string().optional().nullable(),
  addressRegencyCode:   z.string().optional().nullable(),
  addressRegencyName:   z.string().optional().nullable(),
  addressProvinceCode:  z.string().optional().nullable(),
  addressProvinceName:  z.string().optional().nullable(),
```

- [ ] **Step 12.4: Build + lint**

Run: `npm run build`
Expected: succeeds.

Run: `npm run lint`
Expected: clean.

- [ ] **Step 12.5: Manual smoke (preview server)**

Start dev server: `npm run dev` (in worktree).
Browse `/admin/students/<some-id>`. Confirm:
- Address section shows 5 inputs (textarea + 4 selects)
- Province defaults to Jawa Barat
- Selecting Kab/Kota loads Kecamatan options
- Selecting Kecamatan triggers village fetch (network tab shows `/address/villages/<code>.json`)
- Save → reload → values persist (verify in network tab + page reload)

- [ ] **Step 12.6: Commit**

```bash
git add app/admin/students/ lib/validations/student.ts
git commit -m "feat(students): wire AddressPicker into Student edit form"
```

---

## Task 13: Wire AddressPicker into Guardian (Parent) edit dialog

**Files:**
- Modify: `app/admin/students/[id]/page.tsx` (Guardian edit dialog already inline here)

- [ ] **Step 13.1: Locate guardian edit dialog inside student detail**

Run: `grep -n "guardian\|Guardian\|wali\|orang tua" app/admin/students/\[id\]/page.tsx | head -20`
Find the Sheet/Dialog that handles `Parent` editing (likely opened via Pencil icon on a Guardian row).

- [ ] **Step 13.2: Extend Guardian.parent type with new cols**

Update the `Guardian` type at the top of the file to include the new Parent geo + portal cols:

```tsx
type Guardian = {
  id: string; relationship: string; isPrimary: boolean; childOrder: number | null; status: string;
  parent: {
    id: string; name: string; phone: string | null; email: string | null; whatsapp: string | null;
    education: string | null; occupation: string | null; employer: string | null;
    incomeRange: string | null; childrenTotal: number | null;
    // home address
    homeAddressLine: string | null;
    homeVillageCode: string | null; homeVillageName: string | null;
    homeDistrictCode: string | null; homeDistrictName: string | null;
    homeRegencyCode: string | null; homeRegencyName: string | null;
    homeProvinceCode: string | null; homeProvinceName: string | null;
    // employer address
    employerAddressLine: string | null;
    employerVillageCode: string | null; employerVillageName: string | null;
    employerDistrictCode: string | null; employerDistrictName: string | null;
    employerRegencyCode: string | null; employerRegencyName: string | null;
    employerProvinceCode: string | null; employerProvinceName: string | null;
  };
};
```

- [ ] **Step 13.3: Add two AddressPicker instances inside the guardian edit dialog**

Inside the dialog body, after the existing identity fields, add:

```tsx
<SectionHeading>Alamat Rumah</SectionHeading>
<AddressPicker
  prefix="home"
  value={{
    addressLine: parentForm.homeAddressLine ?? "",
    villageCode: parentForm.homeVillageCode ?? "", villageName: parentForm.homeVillageName ?? "",
    districtCode: parentForm.homeDistrictCode ?? "", districtName: parentForm.homeDistrictName ?? "",
    regencyCode: parentForm.homeRegencyCode ?? "", regencyName: parentForm.homeRegencyName ?? "",
    provinceCode: parentForm.homeProvinceCode ?? "", provinceName: parentForm.homeProvinceName ?? "",
  }}
  onChange={(v) => setParentForm({
    ...parentForm,
    homeAddressLine: v.addressLine,
    homeVillageCode: v.villageCode, homeVillageName: v.villageName,
    homeDistrictCode: v.districtCode, homeDistrictName: v.districtName,
    homeRegencyCode: v.regencyCode, homeRegencyName: v.regencyName,
    homeProvinceCode: v.provinceCode, homeProvinceName: v.provinceName,
  })}
/>

<SectionHeading>Data Kantor</SectionHeading>
<Field>
  <FieldLabel>Nama Kantor</FieldLabel>
  <Input
    value={parentForm.employer ?? ""}
    onChange={(e) => setParentForm({ ...parentForm, employer: e.target.value })}
  />
</Field>
<AddressPicker
  prefix="employer"
  value={{
    addressLine: parentForm.employerAddressLine ?? "",
    villageCode: parentForm.employerVillageCode ?? "", villageName: parentForm.employerVillageName ?? "",
    districtCode: parentForm.employerDistrictCode ?? "", districtName: parentForm.employerDistrictName ?? "",
    regencyCode: parentForm.employerRegencyCode ?? "", regencyName: parentForm.employerRegencyName ?? "",
    provinceCode: parentForm.employerProvinceCode ?? "", provinceName: parentForm.employerProvinceName ?? "",
  }}
  onChange={(v) => setParentForm({
    ...parentForm,
    employerAddressLine: v.addressLine,
    employerVillageCode: v.villageCode, employerVillageName: v.villageName,
    employerDistrictCode: v.districtCode, employerDistrictName: v.districtName,
    employerRegencyCode: v.regencyCode, employerRegencyName: v.regencyName,
    employerProvinceCode: v.provinceCode, employerProvinceName: v.provinceName,
  })}
/>
```

- [ ] **Step 13.4: Update Parent API route**

Locate the Parent update endpoint: `grep -rn "prisma.parent.update" app/api/ | head -5`

Inside that PUT handler, ensure the request body's home* + employer* fields are passed to Prisma. If the handler uses a zod schema, extend it.

If `lib/validations/parent.ts` exists, update it. Otherwise create a fresh schema mirroring the additions from Task 12.3 (same 18 home/employer cols).

- [ ] **Step 13.5: Build + lint**

Run: `npm run build && npm run lint`
Expected: clean.

- [ ] **Step 13.6: Manual smoke**

In dev server, edit a Guardian via the student detail page. Confirm:
- Home AddressPicker renders + saves
- Employer AddressPicker renders + saves
- Reload restores both addresses

- [ ] **Step 13.7: Commit**

```bash
git add app/ lib/validations/
git commit -m "feat(guardians): wire AddressPicker home + employer on Guardian edit dialog"
```

---

## Task 14: Update crud.md state machine

**Files:**
- Modify: `.claude/standards/crud.md` (line 33)

- [ ] **Step 14.1: Replace Admission row**

Open `.claude/standards/crud.md`. Find line 33:

```
| Admission | `INQUIRY → VISIT_SCHEDULED → VISITED → ADMITTED → REGISTERED` · `CANCELLED` | Cancel | "Batalkan" | `PUT /api/admissions/[id]` with `{ status: "CANCELLED" }` |
```

Replace with:

```
| Admission | `INQUIRY → VISITED → APPLIED → PAID → ADMITTED → REGISTERED` · `CANCELLED` | Cancel | "Batalkan" | `POST /api/admissions/[id]/reject` with `{ reason }` (see spec 2026-05-12-admission-student-domain-design.md §2.1) |
```

- [ ] **Step 14.2: Verify**

Run: `grep -n "Admission" .claude/standards/crud.md`
Expected: new state list shows.

- [ ] **Step 14.3: Commit**

```bash
git add .claude/standards/crud.md
git commit -m "docs(crud): update Admission state machine — INQUIRY→VISITED→APPLIED→PAID→ADMITTED→REGISTERED"
```

---

## Task 15: Pack 1 smoke test + ship

**Files:** none new

- [ ] **Step 15.1: Full unit + build gate**

Run: `npm run build && npx vitest run`
Expected: both green. No new vitest failures.

- [ ] **Step 15.2: Verify migrations apply on fresh DB**

Run: `npx prisma migrate reset --force --skip-seed`
Then: `npx prisma migrate deploy && npx prisma db seed`
Expected: all migrations apply clean; seed populates without error.

- [ ] **Step 15.3: Manual smoke on dev server**

Start `npm run dev`. Walk through:
- `/admin/students/<id>` — confirm AddressPicker on Student edit
- Edit a Guardian inline — confirm AddressPicker on home + employer
- Re-save, reload, verify persistence
- Open Prisma Studio. Inspect:
  - `AdmissionApplication` table exists, empty
  - `AdmissionGuardian` table exists, empty
  - `Invoice.studentId` column type allows NULL
  - `Invoice.admissionId` column exists
  - CHECK constraint `invoice_student_or_admission` shown in `\d "Invoice"` output (or visible via Studio)

- [ ] **Step 15.4: Run income canonicalization script**

Run: `npm run canonicalize-income`
Expected: prints `mapped=N unmapped=N`. Unmapped count should be low (legacy free-text edge cases). Inspect logged values; if a common pattern is unmapped, extend the regex table and re-test before commit.

- [ ] **Step 15.5: Cycle doc verification**

The /build wrapper will create a cycle doc at `docs/cycles/<date>-admission-foundation.md`. The Verification section must include the literal token `design-system` (per CLAUDE.md frontend-gate Rule 4 — AddressPicker is a frontend component). Add a line like:

```markdown
- Cross-checked design-system.html §forms for AddressPicker layout (textarea + 4 cascading Combobox in Field)
```

- [ ] **Step 15.6: Final commit + push**

```bash
git status
git log --oneline origin/staging..HEAD
```

Confirm 11 commits roughly mapping to Tasks 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 (Tasks 1, 3 were staged-only into Task 2 and Task 4 respectively).

- [ ] **Step 15.7: Open PR via /ship**

Per CLAUDE.md, branch is `feat/admission-foundation` (or whatever the worktree slug is). Run `/ship` to open PR `feat/* → staging`. Author watches CI. Do not direct-push.

---

## Out of scope for this plan (covered by subsequent plans)

- **P2: Storage** — Supabase Storage bucket + signed-URL infra + upload route. KTP + KK files cannot land until P2.
- **P3: Public Daftar** — `/daftar` public form + RegistrationForm component + WA template helpers + phone-match dedup. Depends on P1 + P2.
- **P4: Admin Detail** — 4-phase `/admin/admissions/[id]` page + transition endpoints + Xendit webhook branch. Depends on P3.
- **P5: Convert** — Convert preview + commit + dedup review UI + fill-nulls-only Parent upsert. Depends on P4.
- **P6: Portal Invite** — Supabase magic link + WA + email + sibling notification. Depends on P5.

After Pack 1 ships, repeat the `/spec` → `/build` → `/ship` cycle for each subsequent pack. Each gets its own implementation plan in `docs/superpowers/plans/`.

---

## Self-Review

- [x] **Spec coverage:** Pack 1 covers spec §3.5 (Student additions), §3.6 (Parent additions), §3.1 + §3.2 (AdmissionApplication + AdmissionGuardian), §3.3 (Admission new fields + status), §3.4 (Invoice nullable + admissionId + CHECK), §7.1-§7.4 (migrations N+1..N+4 and N+6 script), §2.3 (income canonical), §2.2 (address dataset + AddressPicker). Tasks 1-15 each map. The N+5 storage bucket migration is **deferred to P2** by design.
- [x] **Placeholder scan:** no TBDs. The PINNED_SHA placeholder in Task 9 is replaced as part of Step 9.5 with an explicit instruction.
- [x] **Type consistency:** `AddressValue` shape used uniformly in Tasks 10, 11, 12, 13. Address column prefix matches across Student (`address`), Parent home (`home`), Parent employer (`employer`), AdmissionApplication (`residence` — deferred to P3), AdmissionGuardian (`employer` — deferred to P3). `IncomeRangeKey` defined Task 7, used in Task 8.
- [x] **Combobox API check:** Task 11.4 explicitly tells the engineer to verify and adjust if the actual `components/ui/combobox.tsx` API differs from the assumed contract. The test is loose enough to survive minor API variation.
