import { z } from "zod";

// Billing Run wizard (bulk invoice wizard arc, Cycle B1 —
// docs/cycles/2026-08-14-billing-run-wizard.md). A `BillingRun` is a
// persisted draft between scope selection (step 1) and commit (step 3).
// Conventions follow `lib/validations/student-fee-adjustment.ts`.

// Same YYYY-MM-DD convention as `generatePlanSchema`/`generateBatchSchema`
// in lib/validations/invoice.ts.
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal jatuh tempo harus YYYY-MM-DD");

// Step 1 (Scope). `classSectionIds` and `includeStudentIds` together define
// the in-scope student set; `excludeStudentIds` removes from that set. A
// payload with both `classSectionIds` and `includeStudentIds` empty would
// silently scope to nobody — or, if a caller instead reads "empty scope" as
// "everyone" somewhere downstream, silently bill the entire tenant. Neither
// reading is safe, so an explicit non-empty scope is required up front.
export const createBillingRunSchema = z
  .object({
    periodLabel: z.string().min(1, "Periode wajib diisi"),
    dueDate: dateSchema,
    academicYearId: z.string().min(1, "Tahun ajaran wajib dipilih"),
    classSectionIds: z.array(z.string().min(1)).default([]),
    includeStudentIds: z.array(z.string().min(1)).default([]),
    excludeStudentIds: z.array(z.string().min(1)).default([]),
  })
  .superRefine((data, ctx) => {
    if (data.classSectionIds.length === 0 && data.includeStudentIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pilih minimal satu kelas atau siswa untuk ditagih",
        path: ["classSectionIds"],
      });
    }
  });

// Step 2 (Review). Exclude / re-include a single row — this cycle only,
// per the Cycle B1 spec (no other row mutation is exposed yet).
export const updateBillingRunRowSchema = z.object({
  status: z.enum(["PENDING", "EXCLUDED"]),
});

// Step 3 (Commit). One chunk of row ids per call — capped at 25 to match
// the existing bulk-generate batch chunk cap (`generateBatchSchema` in
// lib/validations/invoice.ts).
export const commitBillingRunSchema = z.object({
  rowIds: z
    .array(z.string().min(1))
    .min(1, "Pilih minimal satu baris untuk dikomit")
    .max(25, "Maksimal 25 baris per batch"),
});

// Cancel a draft — a status flip, no DELETE (per the T5 route spec).
export const cancelBillingRunSchema = z.object({
  status: z.literal("CANCELLED"),
});

export type CreateBillingRunInput = z.infer<typeof createBillingRunSchema>;
export type UpdateBillingRunRowInput = z.infer<typeof updateBillingRunRowSchema>;
export type CommitBillingRunInput = z.infer<typeof commitBillingRunSchema>;
export type CancelBillingRunInput = z.infer<typeof cancelBillingRunSchema>;
