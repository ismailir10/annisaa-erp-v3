import { z } from "zod";
import { ACADEMIC_YEAR_STATUSES } from "@/lib/academic-year/activate";

// AcademicYear was the only admin CRUD surface validating its POST/PUT body
// with ad-hoc `if (!name?.trim())` checks instead of a Zod schema (CRUD
// correctness audit, 2026-06-20 cycle, finding R2). This file brings it onto
// the same pattern as every other module. Status enum is sourced from the
// single canonical list in `lib/academic-year/activate.ts` so the validator
// and the activation branch logic can never drift.
//
// `name` mirrors the AcademicYear.name display convention ("2025/2026"). Dates
// are Jakarta-tz YYYY-MM-DD strings (the column type is String, not DateTime).
const ymdRegex = /^\d{4}-\d{2}-\d{2}$/;

const statusSchema = z.enum(ACADEMIC_YEAR_STATUSES);

export const createAcademicYearSchema = z.object({
  name: z.string().trim().min(1, "Nama tahun ajaran wajib diisi").max(120),
  startDate: z
    .string()
    .regex(ymdRegex, "Format tanggal mulai tidak valid (YYYY-MM-DD)"),
  endDate: z
    .string()
    .regex(ymdRegex, "Format tanggal selesai tidak valid (YYYY-MM-DD)"),
  // Optional on create — the route defaults to PLANNING when omitted.
  status: statusSchema.optional(),
});

export const updateAcademicYearSchema = z.object({
  name: z.string().trim().min(1, "Nama tahun ajaran wajib diisi").max(120).optional(),
  startDate: z
    .string()
    .regex(ymdRegex, "Format tanggal mulai tidak valid (YYYY-MM-DD)")
    .optional(),
  endDate: z
    .string()
    .regex(ymdRegex, "Format tanggal selesai tidak valid (YYYY-MM-DD)")
    .optional(),
  status: statusSchema.optional(),
});

export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;

// Client form schema (T3, 2026-09-27 admin-forms-rhf cycle). The admin
// dialog already cross-links the two DatePickers (start's `max` = the
// current end value, end's `min` = the current start value) so a user can't
// pick an inverted range through the UI — this refine is the defense-in-depth
// match for that, giving a real inline error instead of relying solely on
// the picker's min/max. It is a form-only addition: `createAcademicYearSchema`
// itself is unchanged, so the API still accepts exactly what it did before.
export const academicYearFormSchema = createAcademicYearSchema.superRefine(
  (v, ctx) => {
    if (v.startDate && v.endDate && v.endDate < v.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Tanggal selesai harus sama dengan atau setelah tanggal mulai",
      });
    }
  },
);
