import { z } from "zod";

// `ProgramFeeStructure.amount` (and `Invoice.totalDue`, which sums several of
// them) are numeric(15,2): anything at or above 10^13 overflows Postgres and
// used to surface as a bare 500 (FIN-5). Rp 10 miliar per component keeps a
// full invoice of up to 100 lines an order of magnitude inside the column.
export const MAX_FEE_AMOUNT = 10_000_000_000;

// PUT /api/fee-structure previously trusted its TS-annotated body verbatim
// (payments-module-hardening audit, 2026-07-27): a negative `amount` would
// flow straight into batch invoice generation's sumDecimals and shrink
// `totalDue`, and a foreign tenant's `feeComponentId` was persisted unchecked
// (the route only verified program + academic-year ownership). Zero stays
// allowed — the admin fees grid submits `amount: 0` for every enabled but
// unpriced component.
export const saveFeeStructureSchema = z.object({
  programId: z.string().min(1),
  academicYearId: z.string().min(1),
  fees: z
    .array(
      z.object({
        feeComponentId: z.string().min(1),
        amount: z
          .number()
          .nonnegative("Nominal tidak boleh negatif")
          .max(MAX_FEE_AMOUNT, "Nominal maksimal Rp 10.000.000.000"),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .max(100),
});
