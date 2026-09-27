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

// `dateSchema.optional()` alone only lets a literal `undefined` through —
// DatePicker's own empty state is `""` (same shape as a native
// `<input type="date">`), same problem `zod-helpers.ts`'s `optionalTrimmed`
// documents for other optional string fields. Preprocessing "" → undefined
// at the SCHEMA level (not by calling `field.onChange(undefined)` from the
// widget) matters here specifically: an RHF `Controller`-registered field
// fed a literal `undefined` through `onChange` does not reliably propagate
// to the field's live value or the native input's rendered value (verified
// empirically — a plain `useState`-controlled `DatePicker` clears fine, a
// `Controller`-bound one calling `onChange(undefined)` does not). Keeping
// the live field value a plain string and doing the "" → undefined mapping
// only when the resolver parses a snapshot avoids that class of bug.
function optionalDate() {
  return z.preprocess((v) => (v === "" ? undefined : v), dateSchema.optional());
}

const reasonSchema = z
  .string()
  .trim()
  .min(1, "Alasan wajib diisi")
  .max(500, "Maks 500 karakter");

// value is always a positive magnitude — reject zero and negative here so
// callers never have to special-case "0 means no adjustment".
const valueSchema = z.coerce.number().positive("Nilai harus lebih dari 0");

// Shared by every schema below that carries a full (non-partial) mode+value —
// create, and the admin form's own edit-mode schema. `updateStudentFeeAdjustmentSchema`
// (server-side, genuinely partial) keeps its own copy of this check because its
// `value`/`mode` are optional and it has the extra "only when both are resent"
// caveat documented on it below — collapsing the two into one helper would make
// that partial-update nuance harder to read, not easier.
function checkPercentCapAndDateOrder(
  data: { mode: (typeof STUDENT_FEE_ADJUSTMENT_MODES)[number]; value: number; validFrom?: string; validTo?: string },
  ctx: z.RefinementCtx,
) {
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
}

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
  .superRefine(checkPercentCapAndDateOrder);

// Client-only schema for the admin Keringanan dialog (`keringanan-tab.tsx`),
// which reuses ONE `useZodForm` instance for both create and edit rather than
// swapping schema objects between renders — two structurally-different zod
// schemas feeding the same `useForm`/`Control` generic produces "two
// different types with this name exist, but are unrelated" resolver-typing
// errors, so a single stable schema is the only type-safe option here.
//
// `isEditing` is a hidden, never-submitted marker (seeded by `form.reset()`
// on open) that turns off the studentId/academicYearId/feeComponentId
// requirement — those three fields are immutable post-creation and the edit
// dialog never renders them as inputs, so gating on their *current* value
// would block a perfectly valid edit whenever the stored row happens to hold
// one that looks "empty" (e.g. a legacy or Cycle-B `feeComponentId: null`,
// coalesced to `""` for the form — found in review, since
// `createStudentFeeAdjustmentSchema` used directly here made such a row's
// Simpan Perubahan silently no-op). mode/value/reason (always rendered,
// always required) and the percent-cap/date-order rules are unconditional —
// same `checkPercentCapAndDateOrder` the create schema uses, not a copy.
export const keringananFormSchema = z
  .object({
    isEditing: z.boolean(),
    studentId: z.string(),
    academicYearId: z.string(),
    feeComponentId: z.string(),
    type: typeSchema,
    mode: modeSchema,
    value: valueSchema,
    reason: reasonSchema,
    validFrom: optionalDate(),
    validTo: optionalDate(),
  })
  .superRefine((data, ctx) => {
    if (!data.isEditing) {
      if (!data.studentId.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Siswa wajib dipilih", path: ["studentId"] });
      }
      if (!data.academicYearId.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tahun ajaran wajib dipilih", path: ["academicYearId"] });
      }
      if (!data.feeComponentId.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Komponen biaya wajib dipilih", path: ["feeComponentId"] });
      }
    }
    checkPercentCapAndDateOrder(data, ctx);
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
