import { z } from "zod";

// Keringanan (durable per-student fee adjustments) — Cycle A,
// docs/cycles/2026-08-13-keringanan-fee-adjustments.md. `type` carries the
// sign (DISCOUNT subtracts, SURCHARGE adds); `value` is always a positive
// magnitude so the resolver in lib/finance/apply-adjustments.ts never has to
// disambiguate a negative value from a DISCOUNT type.
export const STUDENT_FEE_ADJUSTMENT_TYPES = ["DISCOUNT", "SURCHARGE"] as const;
export const STUDENT_FEE_ADJUSTMENT_MODES = ["PERCENT", "FIXED"] as const;

const typeSchema = z.enum(STUDENT_FEE_ADJUSTMENT_TYPES);
const modeSchema = z.enum(STUDENT_FEE_ADJUSTMENT_MODES);

// Same YYYY-MM-DD convention as `generatePlanSchema`/`generateBatchSchema`
// in lib/validations/invoice.ts — validFrom/validTo are compared against a
// run's plain-string dueDate by the resolver, never parsed into a Date.
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

const reasonSchema = z
  .string()
  .trim()
  .min(1, "Alasan wajib diisi")
  .max(500, "Maks 500 karakter");

// value is always a positive magnitude — reject zero and negative here so
// callers never have to special-case "0 means no adjustment".
const valueSchema = z.coerce.number().positive("Nilai harus lebih dari 0");

export const createStudentFeeAdjustmentSchema = z
  .object({
    studentId: z.string().trim().min(1, "Siswa wajib dipilih"),
    academicYearId: z.string().trim().min(1, "Tahun ajaran wajib dipilih"),
    // Nullable on the model (Cycle B adds whole-invoice adjustments with no
    // single FeeComponentDef to hang an InvoiceLine off), but Cycle A
    // validation *requires* it — every Cycle A adjustment is scoped to one
    // fee component. See the cycle doc's Non-goals: an invoice-level
    // discount needs either a nullable FK across every InvoiceLine consumer
    // or a seeded system "Keringanan" component, and both are wizard-cycle
    // work, not this one.
    feeComponentId: z.string().trim().min(1, "Komponen biaya wajib dipilih"),
    type: typeSchema,
    mode: modeSchema,
    value: valueSchema,
    reason: reasonSchema,
    validFrom: dateSchema.optional(),
    validTo: dateSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // PERCENT is capped at 100 — a percent adjustment above 100% has no
    // sane meaning (see cycle doc Assumption 3). Cross-field because the
    // cap only applies when mode === "PERCENT"; FIXED has no such ceiling.
    if (data.mode === "PERCENT" && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nilai persentase tidak boleh lebih dari 100",
        path: ["value"],
      });
    }
    if (data.validFrom && data.validTo && data.validTo < data.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tanggal berakhir tidak boleh sebelum tanggal mulai",
        path: ["validTo"],
      });
    }
  });

export const updateStudentFeeAdjustmentSchema = z
  .object({
    // studentId / academicYearId / feeComponentId / type are intentionally
    // NOT updatable — same reasoning as `code` in fee-component.ts, which
    // stays read-only on edit because it backs identity. These four fields
    // define WHAT the adjustment *is*: who it targets, which year, which
    // component, and discount-vs-surcharge sign. Changing any of them is a
    // re-scope, not an edit — the correct move is to deactivate the old
    // record (status: "INACTIVE") and create a new one, which preserves the
    // audit trail instead of mutating history in place.
    mode: modeSchema.optional(),
    value: valueSchema.optional(),
    reason: reasonSchema.optional(),
    // Nullable, not merely optional: `undefined` means "leave unchanged"
    // (Prisma drops undefined keys), so without an explicit `null` there is
    // no payload that can clear a validity bound back to open-ended once it
    // has been set. Blanking the date field in the edit form sends null.
    validFrom: dateSchema.nullable().optional(),
    validTo: dateSchema.nullable().optional(),
    // Soft-delete toggle reuses this schema instead of a dedicated one —
    // PUT { status: "INACTIVE" } / PUT { status: "ACTIVE" } is the
    // deactivate/reactivate roundtrip.
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .superRefine((data, ctx) => {
    // PERCENT cap on update is only checkable here when the payload carries
    // BOTH `mode` and `value` — e.g. a full edit-form submit that resends
    // every field. A partial update that changes only `value` (the common
    // case: admin corrects the discount amount, mode is unchanged and not
    // resent) cannot be validated against the 100% cap locally, because
    // this schema has no access to the stored row's mode. That is NOT a gap
    // this schema can close — it is a note to the T4 route implementer:
    // whenever `value` changes without `mode` in the same payload, the
    // route MUST re-fetch the stored row and re-check `value <= 100` against
    // its persisted `mode` before writing, or a percent adjustment could be
    // pushed above 100% one field at a time.
    if (data.mode === "PERCENT" && data.value !== undefined && data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nilai persentase tidak boleh lebih dari 100",
        path: ["value"],
      });
    }
    if (data.validFrom && data.validTo && data.validTo < data.validFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tanggal berakhir tidak boleh sebelum tanggal mulai",
        path: ["validTo"],
      });
    }
  });

export type CreateStudentFeeAdjustmentInput = z.infer<
  typeof createStudentFeeAdjustmentSchema
>;
export type UpdateStudentFeeAdjustmentInput = z.infer<
  typeof updateStudentFeeAdjustmentSchema
>;
