import { z } from "zod";

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
        amount: z.number().nonnegative("Nominal tidak boleh negatif"),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .max(100),
});
