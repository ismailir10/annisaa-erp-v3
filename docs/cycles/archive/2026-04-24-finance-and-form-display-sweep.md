# Finance & Form Display Sweep — Class B+C (numeric sums + currency dedupe)

## Context

Two bug classes reported app-wide on the finance surface:

- **Class A — raw cuid in Select trigger.** `/admin/fees` "Struktur per Program" shows cuid in Program + Tahun Ajaran triggers. `/admin/invoices` "Buat Tagihan" dialog shows cuid in Tahun Ajaran.
- **Class B — string concat instead of numeric sum.** `/admin/fees` "Total Bulanan" renders `Rp 7.500.002.000.000.550.000` (concatenation of `"750000"+"2000000"+"550000"`).
- **Class C — currency rendered without shared `formatRupiah`.** Two local duplicates.

This cycle scope is **Class B + C only**. Class A spans 21 files and gets its own branch/PR (per hard rule in spec: >15 files → split). See `docs/cycles/2026-04-24-select-raw-id-sweep.md` (next cycle).

## Spec

### Class B fixes
- `app/admin/fees/page.tsx` — Total in "Struktur per Program" must compute a real numeric sum. Decimal-as-string values from API must be coerced on ingest.
- Label decision: the structure list displays *every* enabled fee component — both `isRecurring=true` (Bulanan) and `isRecurring=false` (Sekali bayar). Summing both under the label **"Total Bulanan"** is semantically wrong. **Decision: rename label to "Total Komponen"** — sums all components shown. Preserves existing behavior (sum of all fees) and matches the visible list. No filter change.

### Class C fixes
- `app/api/payroll/[id]/send-slips/route.ts` — remove local `formatRupiah`, import from `lib/format`.
- `lib/pdf/salary-slip.tsx` — remove local `fmtRp`, import `formatRupiah` from `lib/format`.

### Out of scope (audited, confirmed safe)
- `app/admin/settings/config/page.tsx` — server schema uses `z.coerce.number()`. Safe. NIT.
- `app/admin/settings/campuses/page.tsx` — server uses `parseFloat(lat)`. Safe. NIT.
- `app/admin/invoices/[id]/page.tsx` — `parseFloat(payForm.amount)` called before API. Safe. NIT.
- Every other `.reduce`/`<Input type="number">` — audited, inputs already parsed before arithmetic (payroll/[id], academic, employees/[id], salary-components).

## Tasks

1. Fix `fees/page.tsx` ingest coercion + numeric reduce + label rename.
2. Dedupe `formatRupiah` in send-slips route + salary-slip PDF.
3. Add vitest tests for `formatRupiah` + a defensive numeric-reduce helper used in fees page.

## Audit findings

Class A (deferred to separate branch):
- 21 files, ~42 `<Select>` instances. Root cause: **Base UI `<Select.Value>` renders raw value** when no `items` prop on root and no render-fn on Value. Applies to cuid-bound AND enum-bound Selects.

Class B (this cycle):
- **[BLOCKER]** `app/admin/fees/page.tsx:96` — `amounts[s.feeComponentId] = s.amount` where `s.amount` is `Decimal` serialized as string.
- **[BLOCKER]** `app/admin/fees/page.tsx:234` — `.reduce((s, v) => s + v, 0)` over string values → concatenation.

Class C (this cycle):
- **[MAJOR]** `app/api/payroll/[id]/send-slips/route.ts:10-12` — duplicate `formatRupiah`.
- **[MAJOR]** `lib/pdf/salary-slip.tsx:225-227` — duplicate `fmtRp`.

README claims audit: no ADR asserts "all selects use shared FormSelect helper". Nothing to prune.

## Implementation

**Class B — numeric sum fix**
- `app/admin/fees/page.tsx:96` — coerce Decimal-as-string on ingest: `amounts[s.feeComponentId] = Number(s.amount) || 0`.
- `app/admin/fees/page.tsx:234` — defensive numeric reduce: `.reduce<number>((s, v) => s + (Number(v) || 0), 0)`. Belt-and-suspenders with ingest coercion.
- Label rename: "Total Bulanan" → "Total Komponen" (sum includes both `isRecurring=true` and `isRecurring=false` components, matching the visible list).

**Class C — shared helper dedupe**
- `app/api/payroll/[id]/send-slips/route.ts` — dropped local `formatRupiah`; imports `formatRupiah` from `@/lib/format`.
- `lib/pdf/salary-slip.tsx` — dropped local `fmtRp`; imports `formatRupiah` from `@/lib/format`. Renamed all 5 call sites.

**Tests**
- `lib/__tests__/format.test.ts` — 7 new tests covering `formatRupiah` for int/string/fractional/zero inputs, the exact reported bug reproduction (`["750000","2000000","550000"]` → `Rp 3.300.000`), and the defensive `Number(v) || 0` reduce pattern.

## Verification

- `npm run build` — green (production build).
- `npx vitest run` — **276 passed, 42 todo, 0 failed** (43 files). New format.test.ts: 7/7 green.
- `npx playwright test` — **38/38 passed, 2 skipped** (pre-existing skips — admission state machine + invoice void, both unrelated). 43.5s.
- Preview MCP screenshot attempt: blocked by harness `EPERM uv_cwd` in this worktree environment. Visual verification substituted by the literal-bug-reproduction vitest (sum of reported `["750000","2000000","550000"]` values produces `Rp 3.300.000`, not the concatenated 19-digit string). The reported dedupe changes in `send-slips` and `salary-slip.tsx` are mechanical imports with no user-visible change (same output function body). PDF salary slip is covered indirectly by the fact that production build succeeds and the `SalarySlipPdf` component signature is unchanged.
- Cross-checked design-system.html: Rupiah rendering continues via `lib/format.formatRupiah`; label change "Total Bulanan" → "Total Komponen" keeps the existing typography class `font-currency`.

## Ship Notes

- No migrations.
- No env vars.
- Rollback: revert the commit; no state change.
- Follow-up PR: `feat/select-raw-id-sweep` — Class A (Base UI `Select.Value` fix across 21 files).

Cross-checked design-system.html — no typography/spacing changes; Rupiah rendering continues via `lib/format.formatRupiah` per "Typography & Numerics" section.
