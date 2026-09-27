import { z } from "zod";

/**
 * SalaryComponentDef.category — canonical enum. The payroll engine filters
 * lines on these exact values; the pre-2026-05-14 regression (FIND-006)
 * accepted any string so a typo like "EARNING" silently disappeared from
 * payroll calc. Tightening at the API boundary catches it server-side.
 */
export const salaryCategorySchema = z.enum(["INCOME", "DEDUCTION"], {
  message: "Kategori tidak valid",
});
// NOTE: POST has only ever accepted FIXED | ATTENDANCE_BASED, although the
// engine (lib/payroll/engine.ts) and seed data also use PCT_OF_BASE and the
// dialog offers it. Widening POST is out of scope for the forms cycle; see
// `salaryComponentFormSchema` for how the dialog handles it.
export const salaryCalcTypeSchema = z.enum(["FIXED", "ATTENDANCE_BASED"], {
  message: "Tipe kalkulasi tidak valid",
});

export const createSalaryComponentSchema = z.object({
  code: z.string().trim().min(1, "Code wajib diisi"),
  label: z.string().trim().min(1, "Label wajib diisi"),
  category: salaryCategorySchema,
  calcType: salaryCalcTypeSchema,
  isProRated: z.boolean().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export type CreateSalaryComponentInput = z.infer<typeof createSalaryComponentSchema>;

// Admin create/edit dialog form. Reused for both — `code` is hidden once
// editing, seeded from the existing row via `reset` so it stays valid.
// `calcType` accepts all three engine values: PUT /api/salary-components/[id]
// has never restricted it and seeded rows already use PCT_OF_BASE, so the
// create-only enum would make those rows un-editable. A PCT_OF_BASE *create*
// is still rejected by POST exactly as before; that 400 maps back onto the
// field via applyServerErrors. `sortOrder` is a string in the number input.
export const salaryComponentFormSchema = createSalaryComponentSchema.extend({
  calcType: z.enum(["FIXED", "PCT_OF_BASE", "ATTENDANCE_BASED"], {
    message: "Tipe kalkulasi tidak valid",
  }),
  sortOrder: z.coerce
    .number({ message: "Urutan harus berupa angka" })
    .int("Urutan harus bilangan bulat")
    .nonnegative("Urutan tidak boleh negatif")
    .optional(),
});

// PayrollRun.periodStart / periodEnd are stored as String (YYYY-MM-DD) per
// prisma schema — validate as ISO date-only strings, not coerced Date objects.
const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD");

export const updatePayrollRunSchema = z
  .object({
    periodStart: isoDateString.optional(),
    periodEnd: isoDateString.optional(),
    actualWorkDays: z.number().int().nonnegative().optional(),
  })
  .refine(
    (v) =>
      v.periodStart !== undefined ||
      v.periodEnd !== undefined ||
      v.actualWorkDays !== undefined,
    { message: "Minimal satu field harus diisi" }
  )
  .refine(
    (v) =>
      v.periodStart === undefined ||
      v.periodEnd === undefined ||
      v.periodStart <= v.periodEnd,
    { message: "Tanggal mulai periode harus sebelum atau sama dengan tanggal selesai", path: ["periodStart"] }
  );

export type UpdatePayrollRunInput = z.infer<typeof updatePayrollRunSchema>;

// Hard cap on payroll period length. A school payroll spans at most one
// month — values beyond that are almost always typos and would cause the
// engine to scan O(employees * days) attendance rows for nothing.
const MAX_PERIOD_DAYS = 45;

export const generatePayrollSchema = z
  .object({
    periodStart: isoDateString,
    periodEnd: isoDateString,
  })
  .refine((v) => v.periodStart <= v.periodEnd, {
    message: "Tanggal mulai periode harus sebelum atau sama dengan tanggal selesai",
    path: ["periodStart"],
  })
  .refine(
    (v) => {
      const start = new Date(`${v.periodStart}T00:00:00Z`);
      const end = new Date(`${v.periodEnd}T00:00:00Z`);
      const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
      return days > 0 && days <= MAX_PERIOD_DAYS;
    },
    {
      message: `Rentang periode harus 1–${MAX_PERIOD_DAYS} hari`,
      path: ["periodEnd"],
    }
  );

export type GeneratePayrollInput = z.infer<typeof generatePayrollSchema>;

// PUT /api/payroll/[id]/items/[itemId]/lines/[lineId] — manual line adjustment.
// Mirrors adjustInvoiceLineSchema; amount 0 clears a previous adjustment.
export const adjustPayrollLineSchema = z.object({
  adjustmentAmount: z.number().finite("Jumlah penyesuaian tidak valid"),
  adjustmentNote: z.string().trim().min(1, "Catatan penyesuaian wajib diisi"),
});

export type AdjustPayrollLineInput = z.infer<typeof adjustPayrollLineSchema>;

// Admin dialog form for the line adjustment above — the same rule, except
// `adjustmentAmount` arrives as a string from <Input type="number"> (an
// empty box means "no adjustment", matching the route's prior
// `parseFloat(adjAmount) || 0` — z.coerce.number() already turns "" into 0,
// so no separate blank case is needed here).
export const adjustPayrollLineFormSchema = adjustPayrollLineSchema.extend({
  adjustmentAmount: z.coerce.number({ message: "Jumlah penyesuaian harus berupa angka" }).finite("Jumlah penyesuaian tidak valid"),
});

// PUT /api/payroll/[id]/items/[itemId]/variables — had no schema at all
// (route read `body.overtimeHours ?? 0` etc. with no type check, and every
// field is optional — the route is called with a partial body in practice,
// e.g. the atomic-rebuild test posts only `{ overtimeHours }`). These
// counts are optional-with-default-0 in the UI (no asterisk, no minimum
// ever enforced), so a missing/blank field collapsing to 0 here is the
// *intended* behavior, matching the pre-migration `parseFloat(...) || 0`
// per-keystroke coercion and the route's own `?? 0` exactly — not the
// "required field silently defaults" trap. Decimal(5,2) bounds
// overtimeHours at the database column.
function payrollVariableField(fieldLabel: string, { integer }: { integer: boolean }) {
  const base = integer
    ? z.coerce.number({ message: `${fieldLabel} harus berupa angka` }).int(`${fieldLabel} harus bilangan bulat`)
    : z.coerce.number({ message: `${fieldLabel} harus berupa angka` }).finite(`${fieldLabel} harus berupa angka`);
  return z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : v),
    base.nonnegative(`${fieldLabel} tidak boleh negatif`),
  );
}

export const payrollVariablesSchema = z.object({
  overtimeHours: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : v),
    z.coerce
      .number({ message: "Jam lembur harus berupa angka" })
      .finite("Jam lembur harus berupa angka")
      .nonnegative("Jam lembur tidak boleh negatif")
      .max(999.99, "Jam lembur maksimal 999.99"),
  ),
  outdoorDays: payrollVariableField("Hari outdoor", { integer: true }),
  holidayWorkedDays: payrollVariableField("Hari libur kerja", { integer: true }),
  dcDays: payrollVariableField("Hari DC", { integer: true }),
});

export type PayrollVariablesInput = z.infer<typeof payrollVariablesSchema>;
