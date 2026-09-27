import { z } from "zod";

/**
 * PUT /api/config/org — extracted from the route's previous inline
 * `orgConfigSchema`. Same fields and ranges (`gracePeriodMinutes` >= 0,
 * `payrollPeriodStartDay` 1–28, `payrollPeriodEndDay` 1–31); only the
 * messages are new (the route used to surface `parsed.error.issues[0]`,
 * i.e. whatever zod's default English message was) so the work-hours page
 * can drive its form with this same schema and show Indonesian errors.
 */
export const orgConfigSchema = z.object({
  workingDays: z.array(z.string()),
  workStartTime: z.string(),
  workEndTime: z.string(),
  gracePeriodMinutes: z.coerce
    .number({ message: "Toleransi keterlambatan harus berupa angka" })
    .int("Toleransi keterlambatan harus bilangan bulat")
    .min(0, "Toleransi keterlambatan tidak boleh negatif"),
  timezone: z.string(),
  payrollPeriodStartDay: z.coerce
    .number({ message: "Tanggal mulai gaji harus berupa angka" })
    .int("Tanggal mulai gaji harus bilangan bulat")
    .min(1, "Tanggal mulai gaji antara 1 dan 28")
    .max(28, "Tanggal mulai gaji antara 1 dan 28"),
  payrollPeriodEndDay: z.coerce
    .number({ message: "Tanggal selesai gaji harus berupa angka" })
    .int("Tanggal selesai gaji harus bilangan bulat")
    .min(1, "Tanggal selesai gaji antara 1 dan 31")
    .max(31, "Tanggal selesai gaji antara 1 dan 31"),
});

export type OrgConfigInput = z.infer<typeof orgConfigSchema>;
