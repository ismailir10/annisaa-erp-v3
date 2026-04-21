import { z } from "zod";

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
    { message: "periodStart harus <= periodEnd", path: ["periodStart"] }
  );

export type UpdatePayrollRunInput = z.infer<typeof updatePayrollRunSchema>;
