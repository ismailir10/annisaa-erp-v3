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
    message: "periodStart harus <= periodEnd",
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
